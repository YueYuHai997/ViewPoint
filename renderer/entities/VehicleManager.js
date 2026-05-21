const F1Vehicle = require('./F1Vehicle');
const Tank99A = require('./Tank99A');
const UAVEntity = require('./UAVEntity');
const Logger = require('../../electron/logger');

const log = Logger.create('VehicleManager');

class VehicleManager {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.vehicles = new Map();
  }

  createVehicle(data) {
    if (this.vehicles.has(data.carId)) {
      return this.vehicles.get(data.carId);
    }

    let vehicle;
    switch (data.type) {
      case '99A':
        vehicle = new Tank99A(this.THREE, this.scene, data);
        break;
      case 'UAV':
        vehicle = new UAVEntity(this.THREE, this.scene, data);
        break;
      default:
        vehicle = new F1Vehicle(this.THREE, this.scene, data);
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

  clear() {
    for (const vehicle of this.vehicles.values()) {
      vehicle.dispose();
    }
    this.vehicles.clear();
  }
}

module.exports = VehicleManager;
