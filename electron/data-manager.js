const Logger = require('./logger');

const log = Logger.create('DataManager');

class DataManager {
  constructor() {
    this.vehicles = new Map();
    // 服务端 raw object_id（EchoCreate.ID / NetMessage.object_id）→ 业务 CarID（Camp*10+Number 或 Camp*100+Number）
    this.rawIdToCarId = new Map();
    this.listeners = [];
  }

  // 由 Camp + Number 计算业务 CarID：
  //   1) 先把 Camp 压回单数字蓝/红 ID：1/10 → 1，2/20 → 2
  //   2) Number<10 用 ×10，Number≥10 用 ×100
  //   例：Camp=2,Number=5 → 25；Camp=2,Number=11 → 211；Camp=10,Number=11 → 111；Camp=20,Number=12 → 212
  static encodeCarId(camp, number) {
    if (!camp || !number) return null;
    const campId = camp >= 10 ? Math.floor(camp / 10) : camp;
    return number >= 10 ? campId * 100 + number : campId * 10 + number;
  }

  // 把服务端 Camp 字段（可能是 1/2/10/20）映射成 'blue'/'red'/'unknown'
  static mapCamp(rawCamp) {
    if (rawCamp === 1 || rawCamp === 10) return 'blue';
    if (rawCamp === 2 || rawCamp === 20) return 'red';
    return null;
  }

  // 从 EchoCreate.Name / Client_Entity.load_name 等字符串里识别车辆类型
  static typeFromName(name) {
    if (!name || typeof name !== 'string') return null;
    const u = name.toUpperCase();
    if (u.includes('UAV')) return 'UAV';
    if (u.includes('99A') || u.includes('A99')) return '99A';
    if (u.includes('F1')) return 'F1';
    return null;
  }

  // 登记 raw_id → 业务 CarID 映射（EchoCreate 时调用）
  registerRawId(rawId, carId) {
    if (rawId === undefined || rawId === null || !carId) return;
    if (rawId === carId) return;  // 本就一致就不需要映射
    const r = Number(rawId), c = Number(carId);
    this.rawIdToCarId.set(r, c);

    // sync 比 EchoCreate 先到时，rawId 下会有一个临时占位车辆，要迁移到正确的 carId 并通知渲染端删除孤儿
    const stale = this.vehicles.get(r);
    if (stale) {
      log.info('迁移孤儿车辆 raw:', r, '→ unified:', c);
      const target = this.vehicles.get(c);
      if (target) {
        // 已有正主 → 把 sync 写过的字段并入
        if (stale.position) target.position = stale.position;
        if (stale.rotation) target.rotation = stale.rotation;
        if (stale.speed != null) target.speed = stale.speed;
        target._syncOwned = stale._syncOwned || target._syncOwned;
      } else {
        // 还没有正主 → 直接把 stale 改名挂到 c
        stale.carId = c;
        this.vehicles.set(c, stale);
      }
      this.vehicles.delete(r);
      // 通过 notify(rawId, null) 告诉渲染端：这辆孤儿要从场景移除
      this.notify(r, null);
    }
  }

  // 把 raw object_id 解析成业务 CarID；如果没有映射就原样返回
  resolveCarId(rawIdOrCarId) {
    if (rawIdOrCarId === undefined || rawIdOrCarId === null) return null;
    const n = Number(rawIdOrCarId);
    if (this.vehicles.has(n)) return n;            // 已经是业务 CarID
    if (this.rawIdToCarId.has(n)) return this.rawIdToCarId.get(n);
    return n;                                       // 兜底：原样返回
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  notify(carId, data) {
    for (const cb of this.listeners) {
      cb(carId, data);
    }
  }

  // 高频同步数据通道：Echo99ADriver / EchoF1Driver / EchoF1AI 直接走这里
  // 仅更新位置 / 旋转 / 速度，并打上 _syncOwned 标记；之后 UploadCarInfo / EchoCreate 不会再覆写这三项
  processSyncTransform(carId, pos, rot, speed) {
    if (!carId) return;
    let existing = this.vehicles.get(carId);
    const isNew = !existing;
    if (isNew) {
      // 同步消息先到达 → 用最小信息建一个占位车辆，等 EchoCreate / UploadCarInfo 把元信息补齐
      existing = {
        carId,
        type: this.getVehicleType(carId),
        camp: this.getCamp(carId),
        number: this.getNumber(carId),
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        speed: 0,
        damage: {},
        lastUpdate: Date.now()
      };
      this.vehicles.set(carId, existing);
      log.info('新车辆(sync):', existing.type + '-' + existing.number, '(' + existing.camp + ')', 'ID:', carId);
    }

    if (pos) {
      existing.position = {
        x: (pos.x || 0) / 100,
        y: (pos.z || 0) / 100,
        z: (pos.y || 0) / 100
      };
    }
    if (rot) {
      existing.rotation = { x: 0, y: rot.y || 0, z: 0 };
    }
    if (speed !== undefined && speed !== null) {
      existing.speed = speed;
    }
    existing._syncOwned = true;
    existing.lastUpdate = Date.now();
    this.notify(carId, existing);
  }

  processUploadCarInfo(carInfo, clientInfo) {
    const carId = carInfo.CarID;
    if (!carId) return;

    const existing = this.vehicles.get(carId) || {};
    const isNew = !this.vehicles.has(carId);
    // 一旦收到过 Echo*Driver 的同步数据，位置/旋转/速度归同步通道独占，不被这里覆盖
    const syncOwned = existing._syncOwned === true;

    // type 优先级：本次 Name → 已存的 type → carId 启发式
    const nameForType = carInfo.Name || (clientInfo && clientInfo.loadName);
    const resolvedType = DataManager.typeFromName(nameForType) || existing.type || this.getVehicleType(carId);
    // camp 优先级：本次 Camp（支持 1/2/10/20）→ 已存的 camp → carId 启发式
    const resolvedCamp = DataManager.mapCamp(carInfo.Camp) || existing.camp || this.getCamp(carId);

    const vehicle = {
      ...existing,
      carId: carId,
      type: resolvedType,
      camp: resolvedCamp,
      name: nameForType || existing.name || '',
      number: carInfo.Number || this.getNumber(carId),
      position: (!syncOwned && carInfo.Coordinate) ? {
        x: (carInfo.Coordinate.x || 0) / 100,
        y: (carInfo.Coordinate.z || 0) / 100,
        z: (carInfo.Coordinate.y || 0) / 100
      } : existing.position || { x: 0, y: 0, z: 0 },
      rotation: (!syncOwned && carInfo.MoveDirection) ? {
        x: 0,
        y: carInfo.MoveDirection.y || 0,
        z: 0
      } : existing.rotation || { x: 0, y: 0, z: 0 },
      speed: syncOwned ? (existing.speed || 0) : (carInfo.MoveSpeed || 0),
      rotateSpeed: carInfo.RototeSpeed || 0,
      wheelSpeed: carInfo.WheelSpeed || 0,
      acceleration: carInfo.Acceleration || 0,
      maxSpeed: carInfo.MaxSpeed || existing.maxSpeed || 0,
      gear: carInfo.Gear || 0,
      isCrash: carInfo.IsCrash || false,
      turretH: carInfo.TurretH || 0,
      turretV: carInfo.TurretV || 0,
      maxTurretV: carInfo.MaxTurretV || existing.maxTurretV || 0,
      panoramicSightH: carInfo.PanoramicSightH || 0,
      panoramicSightV: carInfo.PanoramicSightV || 0,
      maxPanoramicSightV: carInfo.MaxPanoramicSightV || existing.maxPanoramicSightV || 0,
      damage: {
        chassis: carInfo.HitChassis || 0,
        turret: carInfo.HitTurret || 0,
        leftTrack: carInfo.HitLeftTrack || 0,
        rightTrack: carInfo.HitRightTrack || 0
      },
      bullets: carInfo.Bullets ? [...carInfo.Bullets] : (existing.bullets || []),
      bulletType: carInfo.BulletType || 0,
      mainCapacity: carInfo.MainCapacity || 0,
      smokeState: carInfo.SmokeState || 0,
      grenadeState: carInfo.GrenadeState || 0,
      gasoline: carInfo.Gasoline || 0,
      target: {
        distance: carInfo.TagDistance || 0,
        speed: carInfo.TagSpeed || 0,
        angle: carInfo.TagAngle || null
      },
      environment: {
        weather: carInfo.Weather || 0,
        windPower: carInfo.WindPoWer || 0,
        windDir: carInfo.WindDir || 0,
        terrain: carInfo.Terrain || 0
      },
      isAi: carInfo.IsAi || false,
      battleId: carInfo.battle_id || existing.battleId || 0,
      clientInfo: clientInfo ? { ...(existing.clientInfo || {}), ...clientInfo } : existing.clientInfo || null,
      lastUpdate: Date.now()
    };

    if (isNew) {
      const raw = carInfo.Coordinate;
      const rawStr = raw ? `raw(${(raw.x || 0).toFixed(1)}, ${(raw.y || 0).toFixed(1)}, ${(raw.z || 0).toFixed(1)})` : 'raw=none';
      const p = vehicle.position;
      const dispStr = `disp(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
      log.info('新车辆:', vehicle.type + '-' + vehicle.number, '(' + vehicle.camp + ')', 'ID:', carId, '|', rawStr, '→', dispStr);
    } else {
      log.debug('更新车辆:', carId, '位置:', JSON.stringify(vehicle.position));
    }

    this.vehicles.set(carId, vehicle);
    this.notify(carId, vehicle);
    return vehicle;
  }

  updateClientInfo(carId, clientInfo) {
    if (!carId || !clientInfo) return;
    const existing = this.vehicles.get(carId);
    if (!existing) return;  // 暂不为孤立的 carId 占位
    existing.clientInfo = { ...(existing.clientInfo || {}), ...clientInfo };
    existing.lastUpdate = Date.now();
    this.vehicles.set(carId, existing);
    this.notify(carId, existing);
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

  processUploadUAVInfo(uavInfo, clientInfo) {
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
      clientInfo: clientInfo ? { ...(existing.clientInfo || {}), ...clientInfo } : existing.clientInfo || null,
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

  // Name 已知时优先用名字判类型，否则按 carId 启发式
  getVehicleType(carId, name) {
    const byName = DataManager.typeFromName(name);
    if (byName) return byName;
    if (carId < 100 && (carId % 10) === 5) return '99A';      // 单数字编码下 5 号是 99A
    if (carId >= 50 && carId <= 53) return 'UAV';             // 旧的 UAV carId 区间
    return 'F1';
  }

  getCamp(carId) {
    // 业务编码：Camp<10 且 Number<10 时 CarID=Camp*10+Number；其它情况 CarID=Camp*100+Number
    const campDigit = carId >= 100 ? Math.floor(carId / 100) : Math.floor(carId / 10);
    return DataManager.mapCamp(campDigit) || 'unknown';
  }

  getNumber(carId) {
    return carId >= 100 ? carId % 100 : carId % 10;
  }

  getVehicle(carId) {
    return this.vehicles.get(carId) || null;
  }

  getAllVehicles() {
    return Array.from(this.vehicles.values());
  }

  removeVehicle(carId) {
    if (carId == null) return;
    log.info('移除车辆:', carId);
    this.vehicles.delete(carId);
    // 一并清掉指向它的 raw→synthetic 映射
    for (const [rawId, synthetic] of this.rawIdToCarId) {
      if (synthetic === carId) this.rawIdToCarId.delete(rawId);
    }
    // 通知渲染端清掉 3D 对象 / 轨迹 / 范围
    this.notify(carId, null);
  }

  clear() {
    log.info('清空所有车辆数据');
    this.vehicles.clear();
    this.rawIdToCarId.clear();
  }
}

module.exports = DataManager;
