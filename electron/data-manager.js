const Logger = require('./logger');

const log = Logger.create('DataManager');

class DataManager {
  constructor() {
    this.vehicles = new Map();
    this.listeners = [];
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  notify(carId, data) {
    for (const cb of this.listeners) {
      cb(carId, data);
    }
  }

  processUploadCarInfo(carInfo) {
    const carId = carInfo.CarID;
    if (!carId) return;

    const existing = this.vehicles.get(carId) || {};
    const isNew = !this.vehicles.has(carId);

    const vehicle = {
      ...existing,
      carId: carId,
      type: this.getVehicleType(carId),
      camp: this.getCamp(carId),
      number: this.getNumber(carId),
      position: carInfo.Coordinate ? {
        x: (carInfo.Coordinate.x || 0) / 100,
        y: (carInfo.Coordinate.z || 0) / 100,
        z: (carInfo.Coordinate.y || 0) / 100
      } : existing.position || { x: 0, y: 0, z: 0 },
      rotation: carInfo.MoveDirection ? {
        x: 0,
        y: carInfo.MoveDirection.y || 0,
        z: 0
      } : existing.rotation || { x: 0, y: 0, z: 0 },
      speed: carInfo.MoveSpeed || 0,
      acceleration: carInfo.Acceleration || 0,
      turretH: carInfo.TurretH || 0,
      turretV: carInfo.TurretV || 0,
      damage: {
        chassis: carInfo.HitChassis || 0,
        turret: carInfo.HitTurret || 0,
        leftTrack: carInfo.HitLeftTrack || 0,
        rightTrack: carInfo.HitRightTrack || 0
      },
      bullets: carInfo.Bullets ? [...carInfo.Bullets] : [],
      bulletType: carInfo.BulletType || 0,
      mainCapacity: carInfo.MainCapacity || 0,
      gasoline: carInfo.Gasoline || 0,
      isAi: carInfo.IsAi || false,
      lastUpdate: Date.now()
    };

    if (isNew) {
      log.info('新车辆:', vehicle.type + '-' + vehicle.number, '(' + vehicle.camp + ')', 'ID:', carId);
    } else {
      log.debug('更新车辆:', carId, '位置:', JSON.stringify(vehicle.position));
    }

    this.vehicles.set(carId, vehicle);
    this.notify(carId, vehicle);
    return vehicle;
  }

  processUploadRadar(radarData) {
    const carId = radarData.CarID;
    if (!carId) return;

    const existing = this.vehicles.get(carId) || {};
    existing.radar = {
      points: radarData.Points || [],
      colors: radarData.Colors || []
    };
    this.vehicles.set(carId, existing);
    log.debug('更新雷达数据:', carId, '点数:', (radarData.Points || []).length / 3);
    this.notify(carId, existing);
  }

  processUploadUAVInfo(uavInfo) {
    const carId = uavInfo.CarID;
    if (!carId) return;

    const existing = this.vehicles.get(carId) || {};
    const isNew = !this.vehicles.has(carId);

    const vehicle = {
      ...existing,
      carId: carId,
      type: 'UAV',
      camp: this.getCamp(carId),
      number: this.getNumber(carId),
      position: uavInfo.Coordinate ? {
        x: (uavInfo.Coordinate.x || 0) / 100,
        y: (uavInfo.Coordinate.z || 0) / 100,
        z: (uavInfo.Coordinate.y || 0) / 100
      } : existing.position || { x: 0, y: 0, z: 0 },
      attitude: uavInfo.Attitude || { x: 0, y: 0, z: 0 },
      speed: uavInfo.Vector ? Math.sqrt(
        (uavInfo.Vector.x || 0) ** 2 + (uavInfo.Vector.y || 0) ** 2 + (uavInfo.Vector.z || 0) ** 2
      ) : 0,
      fuelPercent: uavInfo.RemainingFuelPercent || 0,
      isWorking: uavInfo.IsWorking || false,
      leftMissile: uavInfo.LeftMissileCount || 0,
      rightMissile: uavInfo.RightMissileCount || 0,
      identifiedIds: uavInfo.IdentifiedID || [],
      isAi: uavInfo.IsAIControl || false,
      lastUpdate: Date.now()
    };

    if (isNew) {
      log.info('新无人机:', 'UAV-' + vehicle.number, '(' + vehicle.camp + ')', 'ID:', carId);
    } else {
      log.debug('更新无人机:', carId);
    }

    this.vehicles.set(carId, vehicle);
    this.notify(carId, vehicle);
    return vehicle;
  }

  getVehicleType(carId) {
    const num = carId % 10;
    if (num === 5) return '99A';
    if (carId >= 50 && carId <= 53) return 'UAV';
    return 'F1';
  }

  getCamp(carId) {
    const campDigit = Math.floor(carId / 10);
    if (campDigit === 1 || campDigit === 10) return 'blue';
    if (campDigit === 2 || campDigit === 20) return 'red';
    return 'unknown';
  }

  getNumber(carId) {
    return carId % 10;
  }

  getVehicle(carId) {
    return this.vehicles.get(carId) || null;
  }

  getAllVehicles() {
    return Array.from(this.vehicles.values());
  }

  removeVehicle(carId) {
    log.info('移除车辆:', carId);
    this.vehicles.delete(carId);
  }

  clear() {
    log.info('清空所有车辆数据');
    this.vehicles.clear();
  }
}

module.exports = DataManager;
