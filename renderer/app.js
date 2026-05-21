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

const log = Logger.create('App');

class App {
  constructor() {
    this.vehicles = new Map();
    this.fpsFrames = 0;
    this.fpsTime = Date.now();
    this.updateCount = 0;
    this.lastUpdateRateTime = Date.now();
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

    this.vehicleManager = new VehicleManager(THREE, this.sceneManager.scene);
    this.rangeVisualizer = new RangeVisualizer(THREE, this.sceneManager.scene);
    this.trajectoryRenderer = new TrajectoryRenderer(THREE, this.sceneManager.scene);

    this.leftPanel = new LeftPanel(
      document.getElementById('left-panel'),
      (carId) => this.onVehicleSelect(carId)
    );

    this.rightPanel = new RightPanel(document.getElementById('right-panel'));
    this.rightPanel.onRangeChange = (carId, config) => {
      const vehicle = this.vehicleManager.getVehicle(carId);
      if (vehicle) {
        this.rangeVisualizer.updateRanges(vehicle, config);
      }
    };

    this.toolbar = new Toolbar(document.getElementById('toolbar'), {
      onResetView: () => {
        this.cameraController.reset();
        log.info('视角已复位');
      },
      onResetScene: () => this.resetScene()
    });

    this.toolbar.setRoomId(config.room.id);

    this.sceneManager.addAnimationCallback((delta) => this.update(delta));

    ipcRenderer.on('vehicle-update', (_, { carId, data }) => this.onVehicleUpdate(carId, data));
    ipcRenderer.on('connection-status', (_, { connected }) => {
      this.toolbar.setConnectionStatus(connected);
      log.info(connected ? '服务器已连接' : '服务器连接断开');
    });

    log.info('应用初始化完成');
  }

  onVehicleUpdate(carId, data) {
    this.vehicles.set(carId, data);
    this.updateCount++;

    const vehicle = this.vehicleManager.updateVehicle(data);
    this.trajectoryRenderer.update(vehicle);
    this.leftPanel.updateList(Array.from(this.vehicles.values()));

    if (this.leftPanel.selectedCarId === carId) {
      this.rightPanel.showVehicle(data);
    }

    this.toolbar.setVehicleCount(this.vehicles.size);
    document.getElementById('total-vehicles').textContent = `车辆总数: ${this.vehicles.size}`;
  }

  onVehicleSelect(carId) {
    const data = this.vehicles.get(carId);
    if (data) {
      this.rightPanel.showVehicle(data);
      if (data.position) {
        this.cameraController.focusOn(data.position);
        log.info('聚焦车辆:', carId);
      }
    }
  }

  update(delta) {
    this.cameraController.update();

    this.fpsFrames++;
    const now = Date.now();
    if (now - this.fpsTime >= 1000) {
      this.toolbar.setFPS(this.fpsFrames);
      this.fpsFrames = 0;
      this.fpsTime = now;
    }

    if (now - this.lastUpdateRateTime >= 1000) {
      document.getElementById('update-rate').textContent = `更新频率: ${this.updateCount}/s`;
      this.updateCount = 0;
      this.lastUpdateRateTime = now;
    }
  }

  resetScene() {
    this.vehicleManager.clear();
    this.rangeVisualizer.clear();
    this.trajectoryRenderer.clear();
    this.vehicles.clear();
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
