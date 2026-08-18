const { ipcRenderer } = require('electron');
const THREE = require('three');
const Logger = require('../electron/logger');
const SceneManager = require('./scene/SceneManager');
const CameraController = require('./scene/CameraController');
const AxisHelper = require('./scene/AxisHelper');
const VehicleManager = require('./entities/VehicleManager');
const RangeVisualizer = require('./visualization/RangeVisualizer');
const TrajectoryRenderer = require('./visualization/TrajectoryRenderer');
const PanelManager = require('./hud/PanelManager');
const LeftPanel = require('./hud/panels/LeftPanel');
const RightPanel = require('./hud/panels/RightPanel');
const LogPanel = require('./hud/panels/LogPanel');
const Toolbar = require('./ui/Toolbar');
const Compass = require('./ui/Compass');
const HeatmapVisualizer = require('./visualization/HeatmapVisualizer');
const EventDetector = require('./events/EventDetector');
const ToastQueue = require('./ui/ToastQueue');

const log = Logger.create('App');

class App {
  constructor() {
    this.vehicles = new Map();
    this.fpsFrames = 0;
    this.fpsTime = Date.now();
    this.updateCount = 0;
    this.lastUpdateRateTime = Date.now();
    this.hasFocused = false;
    // 范围显示模式：'all' 所有车辆 / 'selected' 仅选中 / 'none' 全部关闭
    this.rangeMode = 'selected';
    this.rangeModeCycle = ['selected', 'all', 'none'];
    this.campDisplayFilter = 'all';
    // 表格节流：脏标志 + 上次刷新时间
    this._listDirty = false;
    this._detailDirty = false;
    this._lastTableFlushTime = 0;
    this._tableFlushIntervalMs = 100;  // 10Hz 表格刷新
    this._pickStart = null;
    this._initialFocusTimer = null;
    this.focusedVehicleId = null;
    // 缓存常用 DOM
    this._elTotalVehicles = null;
    this._elUpdateRate = null;
  }

  async init() {
    log.info('应用启动中...');

    // 获取配置并设置日志等级
    const config = await ipcRenderer.invoke('get-config');
    const logLevel = (config.log && config.log.level) || 'INFO';
    Logger.setGlobalLevel(logLevel);
    log.info('日志等级:', logLevel);

    // 初始化 HUD 面板系统
    this.panelManager = new PanelManager(document.getElementById('hud-root'));
    this.logPanel = new LogPanel();
    this.panelManager.register(this.logPanel);

    // 初始化场景
    log.info('初始化三维场景...');
    const sceneContainer = document.getElementById('scene-container');
    this.sceneManager = new SceneManager(sceneContainer);
    await this.sceneManager.init(THREE);

    this.cameraController = new CameraController(
      THREE,
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement,
      {
        onReset: () => this.resetView(),
        onManualPan: () => { this.focusedVehicleId = null; }
      }
    );

    this.axisHelper = new AxisHelper(THREE, this.sceneManager.scene);
    this.axisHelper.create();

    this.vehicleManager = new VehicleManager(THREE, this.sceneManager);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.rangeVisualizer = new RangeVisualizer(THREE, this.sceneManager.scene);
    this.trajectoryRenderer = new TrajectoryRenderer(THREE, this.sceneManager.scene);
    this.heatmap = new HeatmapVisualizer(THREE, this.sceneManager.scene);
    this.compass = new Compass(sceneContainer);
    this.toastQueue = new ToastQueue(document.getElementById('hud-root'));
    this.eventDetector = new EventDetector();
    this.eventDetector.on((event) => this.toastQueue.push(event));
    this.heatmapTickCounter = 0;

    this.leftPanel = new LeftPanel({
      onVehicleSelect: (carId) => this.onVehicleSelect(carId)
    });
    this.panelManager.register(this.leftPanel);

    this.rightPanel = new RightPanel({
      onRangeChange: (carId, config) => {
        if (this.rangeMode === 'none') return;
        if (this.rangeMode === 'all') {
          for (const v of this.getDisplayedVehicleEntities()) {
            this.rangeVisualizer.updateRanges(v, config);
          }
          return;
        }
        const vehicle = this.vehicleManager.getVehicle(carId);
        if (vehicle) this.rangeVisualizer.updateRanges(vehicle, config);
      }
    });
    this.panelManager.register(this.rightPanel);

    this.toolbar = new Toolbar(document.getElementById('toolbar'), {
      onResetView: () => {
        this.resetView();
        log.info('视角已复位');
      },
      onTopView: () => {
        this.focusedVehicleId = null;
        this.cameraController.clearMotion();
        const list = this.getDisplayedVehicles().filter(v => v.position && Number.isFinite(v.position.x) && Number.isFinite(v.position.z));
        this.cameraController.topDownView(list);
        log.info('切换到顶视图，覆盖车辆数:', list.length);
      },
      onCampDisplayFilterChange: (camp) => this.setCampDisplayFilter(camp),
      onCycleRangeMode: () => {
        const idx = this.rangeModeCycle.indexOf(this.rangeMode);
        const next = this.rangeModeCycle[(idx + 1) % this.rangeModeCycle.length];
        this.setRangeMode(next);
        return this.rangeMode;
      },
      onToggleHeatmap: () => {
        const on = this.heatmap.toggle();
        if (on) this.heatmap.update(this.getDisplayedVehicles());
        log.info('热力图:', on ? '开启' : '关闭');
        return on;
      },
      onResetScene: () => this.resetScene(),
      panelManager: this.panelManager
    });
    this.toolbar.setRangeMode(this.rangeMode);
    this.toolbar.setCampDisplayFilter(this.campDisplayFilter);

    this.toolbar.setRoomId(config.room.id);

    this.sceneManager.addAnimationCallback((delta) => this.update(delta));
    this.bindVehiclePicking();

    ipcRenderer.on('vehicle-update-batch', (_, batch) => {
      for (const item of batch) {
        this.onVehicleUpdate(item.carId, item.data);
      }
    });
    ipcRenderer.on('connection-status', (_, { connected }) => {
      this.toolbar.setConnectionStatus(connected);
      log.info(connected ? '服务器已连接' : '服务器连接断开');
    });

    this._elTotalVehicles = document.getElementById('total-vehicles');
    this._elUpdateRate = document.getElementById('update-rate');

    log.info('应用初始化完成');
    ipcRenderer.send('renderer-ready');
  }

  onVehicleUpdate(carId, data) {
    if (this.eventDetector) this.eventDetector.onUpdate(carId, data);

    // data=null 表示该 carId 被移除（孤儿迁移、EchoDestroy 等）
    if (data === null || data === undefined) {
      this.vehicles.delete(carId);
      this.vehicleManager.removeVehicle(carId);
      this.trajectoryRenderer.remove(carId);
      if (this.rangeVisualizer && this.rangeVisualizer.removeRanges) this.rangeVisualizer.removeRanges(carId);
      this._listDirty = true;
      // 移除事件视为"重要变化"，立即刷一次
      this._flushTablesIfDirty(true);
      log.info('清除车辆:', carId);
      return;
    }

    const isNew = !this.vehicles.has(carId);
    this.vehicles.set(carId, data);
    this.updateCount++;

    const vehicle = this.vehicleManager.updateVehicle(data);
    this.trajectoryRenderer.update(vehicle);
    this._applyVehicleDisplay(carId, data);

    // 首次收到车辆时自动聚焦
    if (!this.hasFocused && data.position && this._isVehicleDisplayed(data)) {
      this._scheduleInitialActivityFocus();
    }

    // 新车辆按当前范围模式决定要不要立即显示范围
    if (isNew) this._applyRangeForVehicle(carId, vehicle);

    // 标脏，等 rAF 循环节流刷新
    this._listDirty = true;
    if (this.leftPanel.selectedCarId === carId) this._detailDirty = true;
    // 新车要立刻在列表里显示，避免视觉延迟
    if (isNew) this._flushTablesIfDirty(true);
  }

  _flushTablesIfDirty(force = false) {
    const now = Date.now();
    if (!force && now - this._lastTableFlushTime < this._tableFlushIntervalMs) return;
    if (!this._listDirty && !this._detailDirty) return;

    if (this._listDirty) {
      const displayed = this.getDisplayedVehicles();
      this.leftPanel.updateList(displayed);
      this.toolbar.setVehicleCount(displayed.length);
      if (this._elTotalVehicles) {
        this._elTotalVehicles.textContent = this.campDisplayFilter === 'all'
          ? `车辆总数: ${this.vehicles.size}`
          : `车辆总数: ${displayed.length}/${this.vehicles.size}`;
      }
      this._listDirty = false;
    }
    if (this._detailDirty) {
      const sel = this.leftPanel.selectedCarId;
      const data = sel != null ? this.vehicles.get(sel) : null;
      if (data) this.rightPanel.showVehicle(data);
      this._detailDirty = false;
    }
    this._lastTableFlushTime = now;
  }

  onVehicleSelect(carId) {
    const data = this.vehicles.get(carId);
    if (data) {
      if (!this._isVehicleDisplayed(data)) return;
      if (this.leftPanel.selectedCarId !== carId) {
        this.leftPanel.selectedCarId = carId;
        this.leftPanel.updateList(this.getDisplayedVehicles());
      }
      // 'selected' 模式下切换车辆时，先清掉之前那辆的范围
      if (this.rangeMode === 'selected') {
        for (const otherId of Array.from(this.rangeVisualizer.rangeObjects.keys())) {
          if (otherId !== carId) this.rangeVisualizer.removeRanges(otherId);
        }
        const v = this.vehicleManager.getVehicle(carId);
        if (v) this.rangeVisualizer.updateRanges(v, this.rightPanel.rangeConfig);
      }
      this._detailDirty = false;  // 即将立刻刷新，先清脏标志
      this.rightPanel.showVehicle(data);
      if (data.position) {
        this.focusedVehicleId = carId;
        this.cameraController.focusOn(data.position, { radius: 150, phi: Math.PI / 4, theta: 0 });
        log.info('聚焦车辆:', carId);
      }
    }
  }

  resetView() {
    this.focusedVehicleId = null;
    const focused = this.cameraController.focusOnVehicles(this.getDisplayedVehicles(), {
      animate: true,
      duration: 0.45,
      phi: Math.PI / 4,
      theta: 0,
      padding: 1.45,
      minRadius: 320
    });
    if (!focused) this.cameraController.reset();
  }

  _scheduleInitialActivityFocus() {
    if (this.hasFocused || this._initialFocusTimer) return;
    this._initialFocusTimer = setTimeout(() => {
      this._initialFocusTimer = null;
      if (this.hasFocused) return;
      const focused = this.cameraController.focusOnVehicles(this.getDisplayedVehicles(), {
        animate: true,
        duration: 0.35,
        phi: Math.PI / 4,
        theta: 0,
        padding: 1.45,
        minRadius: 320
      });
      if (focused) {
        this.hasFocused = true;
        log.info('自动聚焦到车辆活动区域');
      }
    }, 250);
  }

  bindVehiclePicking() {
    const dom = this.sceneManager && this.sceneManager.renderer && this.sceneManager.renderer.domElement;
    if (!dom) return;

    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this._pickStart = { x: e.clientX, y: e.clientY };
    });

    dom.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this._pickStart) return;
      const dx = e.clientX - this._pickStart.x;
      const dy = e.clientY - this._pickStart.y;
      this._pickStart = null;
      if (dx * dx + dy * dy > 25) return;

      const carId = this.pickVehicleAt(e.clientX, e.clientY);
      if (carId != null) this.onVehicleSelect(carId);
    });
  }

  pickVehicleAt(clientX, clientY) {
    const dom = this.sceneManager.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    const hits = this.raycaster.intersectObjects(this.vehicleManager.getPickableObjects(), true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj) {
        if (obj.userData && obj.userData.vehicleCarId != null) {
          return obj.userData.vehicleCarId;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  getDisplayedVehicles() {
    return Array.from(this.vehicles.values()).filter(v => this._isVehicleDisplayed(v));
  }

  getDisplayedVehicleEntities() {
    return this.vehicleManager.getAllVehicles().filter(v => {
      const data = this.vehicles.get(v.carId);
      return data && this._isVehicleDisplayed(data);
    });
  }

  _isVehicleDisplayed(vehicle) {
    return this.campDisplayFilter === 'all' || vehicle.camp === this.campDisplayFilter;
  }

  _applyVehicleDisplay(carId, data) {
    const visible = data ? this._isVehicleDisplayed(data) : false;
    const entity = this.vehicleManager.getVehicle(carId);
    if (entity) entity.setVisible(visible);
    this.trajectoryRenderer.setVisible(carId, visible);
  }

  setCampDisplayFilter(camp) {
    if (!['all', 'blue', 'red'].includes(camp)) return;
    this.campDisplayFilter = camp;
    this.toolbar.setCampDisplayFilter(camp);

    for (const [carId, data] of this.vehicles) {
      this._applyVehicleDisplay(carId, data);
    }

    const selected = this.leftPanel.selectedCarId;
    if (selected != null) {
      const selectedData = this.vehicles.get(selected);
      if (!selectedData || !this._isVehicleDisplayed(selectedData)) {
        this.leftPanel.selectedCarId = null;
        this.focusedVehicleId = null;
        this.rightPanel.clearVehicle();
        if (this.rangeMode === 'selected') this.rangeVisualizer.clear();
      }
    }

    this._listDirty = true;
    this._flushTablesIfDirty(true);
    if (this.heatmap && this.heatmap.enabled) this.heatmap.update(this.getDisplayedVehicles());
    if (this.rangeMode !== 'none') this.setRangeMode(this.rangeMode);
    log.info('车辆阵营显示过滤:', camp);
  }

  // 按当前 rangeMode 给单辆车决定是否显示范围
  _applyRangeForVehicle(carId, vehicleEntity) {
    const data = this.vehicles.get(carId);
    if (!data || !this._isVehicleDisplayed(data)) return;
    if (this.rangeMode === 'none') return;
    if (this.rangeMode === 'selected' && this.leftPanel.selectedCarId !== carId) return;
    this.rangeVisualizer.updateRanges(vehicleEntity, this.rightPanel.rangeConfig);
  }

  setRangeMode(mode) {
    if (!['all', 'selected', 'none'].includes(mode)) return;
    this.rangeMode = mode;
    log.info('范围显示模式:', mode);
    this.toolbar.setRangeMode(mode);

    if (mode === 'none') {
      this.rangeVisualizer.clear();
      return;
    }

    if (mode === 'all') {
      for (const v of this.getDisplayedVehicleEntities()) {
        this.rangeVisualizer.updateRanges(v, this.rightPanel.rangeConfig);
      }
      return;
    }

    // 'selected'：清掉非选中的，给当前选中刷一次
    const sel = this.leftPanel.selectedCarId;
    for (const otherId of Array.from(this.rangeVisualizer.rangeObjects.keys())) {
      if (otherId !== sel) this.rangeVisualizer.removeRanges(otherId);
    }
    if (sel != null) {
      const data = this.vehicles.get(sel);
      if (!data || !this._isVehicleDisplayed(data)) return;
      const v = this.vehicleManager.getVehicle(sel);
      if (v) this.rangeVisualizer.updateRanges(v, this.rightPanel.rangeConfig);
    }
  }

  update(delta) {
    if (this.focusedVehicleId != null && !this.cameraController.isTweening()) {
      const focused = this.vehicles.get(this.focusedVehicleId);
      if (focused && focused.position && this._isVehicleDisplayed(focused)) {
        this.cameraController.setTarget(focused.position);
      } else {
        this.focusedVehicleId = null;
      }
    }
    this.cameraController.update(delta);
    this.vehicleManager.updateScreenSpaceLabels();
    // 节流刷新两个表格
    this._flushTablesIfDirty(false);
    this.rangeVisualizer.update();

    // 罗盘跟随相机方位角
    if (this.compass) this.compass.update(this.cameraController.getAzimuth());

    // 热力图每 ~6 帧刷一次（约 10Hz），降低 canvas 重绘成本
    if (this.heatmap && this.heatmap.enabled) {
      this.heatmapTickCounter = (this.heatmapTickCounter + 1) % 6;
      if (this.heatmapTickCounter === 0) {
        this.heatmap.update(this.getDisplayedVehicles());
      }
    }

    this.fpsFrames++;
    const now = Date.now();
    if (now - this.fpsTime >= 1000) {
      this.toolbar.setFPS(this.fpsFrames);
      this.fpsFrames = 0;
      this.fpsTime = now;
    }

    if (now - this.lastUpdateRateTime >= 1000) {
      if (this._elUpdateRate) {
        this._elUpdateRate.textContent = `更新频率: ${this.updateCount}/s`;
      }
      this.updateCount = 0;
      this.lastUpdateRateTime = now;
    }
  }

  resetScene() {
    if (this._initialFocusTimer) {
      clearTimeout(this._initialFocusTimer);
      this._initialFocusTimer = null;
    }
    this.hasFocused = false;
    this.focusedVehicleId = null;
    this.vehicleManager.clear();
    this.rangeVisualizer.clear();
    this.trajectoryRenderer.clear();
    this.vehicles.clear();
    if (this.heatmap) this.heatmap.update([]);
    this.leftPanel.updateList([]);
    this.rightPanel.selectedVehicle = null;
    if (this.rightPanel.bodyEl) {
      this.rightPanel.bodyEl.innerHTML = `<div class="panel-content vehicle-info"><div class="empty-hint">选择一辆车辆查看详情</div></div>`;
    }
    this.cameraController.reset();
    log.info('场景已重置');
  }
}

const app = new App();
app.init().catch(err => {
  log.error('应用启动失败:', err.message);
});
