const F1Vehicle = require('./F1Vehicle');
const Tank99A = require('./Tank99A');
const UAVEntity = require('./UAVEntity');
const Logger = require('../../electron/logger');

const log = Logger.create('VehicleManager');

class VehicleManager {
  constructor(THREE, sceneManager) {
    this.THREE = THREE;
    this.scene = sceneManager.scene;
    this.camera = sceneManager.camera;
    this.renderer = sceneManager.renderer;
    this.CSS2DObject = sceneManager.CSS2DObject;
    this.vehicles = new Map();
  }

  createVehicle(data) {
    if (this.vehicles.has(data.carId)) {
      return this.vehicles.get(data.carId);
    }

    let vehicle;
    const opts = { CSS2DObject: this.CSS2DObject };
    switch (data.type) {
      case '99A':
        vehicle = new Tank99A(this.THREE, this.scene, data, opts);
        break;
      case 'UAV':
        vehicle = new UAVEntity(this.THREE, this.scene, data, opts);
        break;
      default:
        vehicle = new F1Vehicle(this.THREE, this.scene, data, opts);
    }

    vehicle.addToScene();
    this.vehicles.set(data.carId, vehicle);
    log.info(`创建车辆: ${data.type}-${data.number} (${data.camp})`);
    return vehicle;
  }

  updateVehicle(data) {
    let vehicle = this.vehicles.get(data.carId);
    if (!vehicle) {
      vehicle = this.createVehicle(data);
    }
    vehicle.updateData(data);
    return vehicle;
  }

  removeVehicle(carId) {
    const vehicle = this.vehicles.get(carId);
    if (vehicle) {
      vehicle.dispose();
      this.vehicles.delete(carId);
    }
  }

  getVehicle(carId) {
    return this.vehicles.get(carId) || null;
  }

  getAllVehicles() {
    return Array.from(this.vehicles.values());
  }

  getPickableObjects() {
    return Array.from(this.vehicles.values())
      .filter(vehicle => vehicle.group.visible)
      .map(vehicle => vehicle.group);
  }

  updateScreenSpaceLabels() {
    for (const vehicle of this.vehicles.values()) {
      vehicle.updateScreenSpaceLabel(this.camera, this.renderer);
    }
  }

  clear() {
    for (const vehicle of this.vehicles.values()) {
      vehicle.dispose();
    }
    this.vehicles.clear();
  }
}

module.exports = VehicleManager;
