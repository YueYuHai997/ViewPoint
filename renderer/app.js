const { ipcRenderer } = require('electron');
const THREE = require('three');
const Logger = require('../electron/logger');
const SceneManager = require('./scene/SceneManager');
const CameraController = require('./scene/CameraController');
const AxisHelper = require('./scene/AxisHelper');
const VehicleManager = require('./entities/VehicleManager');
const RangeVisualizer = require('./visualization/RangeVisualizer');
const TrajectoryRenderer = require('./visualization/TrajectoryRenderer');
const LeftPanel = require('./ui/LeftPanel');
const RightPanel = require('./ui/RightPanel');
const Toolbar = require('./ui/Toolbar');
const LogPanel = require('./ui/LogPanel');
const Compass = require('./ui/Compass');
const HeatmapVisualizer = require('./visualization/HeatmapVisualizer');

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
    // 表格节流：脏标志 + 上次刷新时间
    this._listDirty = false;
    this._detailDirty = false;
    this._lastTableFlushTime = 0;
    this._tableFlushIntervalMs = 100;  // 10Hz 表格刷新
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

    // 初始化日志面板
    this.logPanel = new LogPanel(document.getElementById('log-panel'));

    // 初始化场景
    log.info('初始化三维场景...');
    const sceneContainer = document.getElementById('scene-container');
    this.sceneManager = new SceneManager(sceneContainer);
    await this.sceneManager.init(THREE);

    this.cameraController = new CameraController(
      THREE,
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement
    );

    this.axisHelper = new AxisHelper(THREE, this.sceneManager.scene);
    this.axisHelper.create();

    this.vehicleManager = new VehicleManager(THREE, this.sceneManager);
    this.rangeVisualizer = new RangeVisualizer(THREE, this.sceneManager.scene);
    this.trajectoryRenderer = new TrajectoryRenderer(THREE, this.sceneManager.scene);
    this.heatmap = new HeatmapVisualizer(THREE, this.sceneManager.scene);
    this.compass = new Compass(sceneContainer);
    this.heatmapTickCounter = 0;

    this.leftPanel = new LeftPanel(
      document.getElementById('left-panel'),
      (carId) => this.onVehicleSelect(carId)
    );

    this.rightPanel = new RightPanel(document.getElementById('right-panel'));
    this.rightPanel.onRangeChange = (carId, config) => {
      if (this.rangeMode === 'none') return;
      if (this.rangeMode === 'all') {
        // 滑块变化时所有车辆同步刷新
        for (const v of this.vehicleManager.getAllVehicles()) {
          this.rangeVisualizer.updateRanges(v, config);
        }
        return;
      }
      // 'selected' 模式：只更新当前选中
      const vehicle = this.vehicleManager.getVehicle(carId);
      if (vehicle) this.rangeVisualizer.updateRanges(vehicle, config);
    };

    this.toolbar = new Toolbar(document.getElementById('toolbar'), {
      onResetView: () => {
        this.cameraController.reset();
        log.info('视角已复位');
      },
      onTopView: () => {
        const list = Array.from(this.vehicles.values());
        this.cameraController.topDownView(list);
        log.info('切换到顶视图，覆盖车辆数:', list.length);
      },
      onCycleRangeMode: () => {
        const idx = this.rangeModeCycle.indexOf(this.rangeMode);
        const next = this.rangeModeCycle[(idx + 1) % this.rangeModeCycle.length];
        this.setRangeMode(next);
        return this.rangeMode;
      },
      onToggleHeatmap: () => {
        const on = this.heatmap.toggle();
        if (on) this.heatmap.update(Array.from(this.vehicles.values()));
        log.info('热力图:', on ? '开启' : '关闭');
        return on;
      },
      onResetScene: () => this.resetScene()
    });
    this.toolbar.setRangeMode(this.rangeMode);

    this.toolbar.setRoomId(config.room.id);

    this.sceneManager.addAnimationCallback((delta) => this.update(delta));

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

    // 首次收到车辆时自动聚焦
    if (!this.hasFocused && data.position) {
      this.hasFocused = true;
      this.cameraController.focusOn(data.position);
      log.info('自动聚焦到车辆:', carId);
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
      this.leftPanel.updateList(Array.from(this.vehicles.values()));
      this.toolbar.setVehicleCount(this.vehicles.size);
      if (this._elTotalVehicles) {
        this._elTotalVehicles.textContent = `车辆总数: ${this.vehicles.size}`;
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
        this.cameraController.focusOn(data.position);
        log.info('聚焦车辆:', carId);
      }
    }
  }

  // 按当前 rangeMode 给单辆车决定是否显示范围
  _applyRangeForVehicle(carId, vehicleEntity) {
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
      for (const v of this.vehicleManager.getAllVehicles()) {
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
      const v = this.vehicleManager.getVehicle(sel);
      if (v) this.rangeVisualizer.updateRanges(v, this.rightPanel.rangeConfig);
    }
  }

  update(delta) {
    this.cameraController.update(delta);
    // 节流刷新两个表格
    this._flushTablesIfDirty(false);
    this.rangeVisualizer.update();

    // 罗盘跟随相机方位角
    if (this.compass) this.compass.update(this.cameraController.getAzimuth());

    // 热力图每 ~6 帧刷一次（约 10Hz），降低 canvas 重绘成本
    if (this.heatmap && this.heatmap.enabled) {
      this.heatmapTickCounter = (this.heatmapTickCounter + 1) % 6;
      if (this.heatmapTickCounter === 0) {
        this.heatmap.update(Array.from(this.vehicles.values()));
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
    this.vehicleManager.clear();
    this.rangeVisualizer.clear();
    this.trajectoryRenderer.clear();
    this.vehicles.clear();
    if (this.heatmap) this.heatmap.update([]);
    this.leftPanel.updateList([]);
    this.rightPanel.render();
    this.cameraController.reset();
    log.info('场景已重置');
  }
}

const app = new App();
app.init().catch(err => {
  log.error('应用启动失败:', err.message);
});
