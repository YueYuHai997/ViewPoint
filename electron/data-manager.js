const Logger = require('./logger');

const log = Logger.create('DataManager');

class DataManager {
  constructor() {
    this.vehicles = new Map();
    // 服务端 raw object_id（EchoCreate.ID / NetMessage.object_id）→ 业务 CarID（Camp*10+Number 或 Camp*100+Number）
    this.rawIdToCarId = new Map();
    this.clientIdToCarIds = new Map();
    this.listeners = [];
    // 批量推送：carId → 最新 data（null 表示删除）。20ms 一次 flush。
    this._dirty = new Map();
    this._flushIntervalMs = 20;
    this._flushTimer = setInterval(() => this._flushDirty(), this._flushIntervalMs);
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
  static coordinateToPosition(coor) {
    if (!coor) return null;

    const scale = 11131955.0;
    const offset = 512000.0;
    const lon = Number(coor.x) || 0;
    const lat = Number(coor.y) || 0;
    const height = Number(coor.z) || 0;

    const xCm = lon * scale + offset;
    const yCm = offset - lat * scale;
    const zCm = height * 100.0;

    return {
      x: xCm / 100,
      y: zCm / 100,
      z: yCm / 100
    };
  }

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

  registerClientEntity(clientId, carId) {
    if (!clientId || !carId) return;
    const key = String(clientId);
    const id = Number(carId);
    const ids = this.clientIdToCarIds.get(key) || new Set();
    ids.add(id);
    this.clientIdToCarIds.set(key, ids);
  }

  resolveSyncCarId(objectId, clientId, expectedType) {
    const raw = objectId !== undefined && objectId !== null ? Number(objectId) : null;
    if (raw && this.rawIdToCarId.has(raw)) return this.rawIdToCarId.get(raw);
    if (raw && this.vehicles.has(raw)) return raw;

    if (clientId) {
      const ids = Array.from(this.clientIdToCarIds.get(String(clientId)) || []);
      if (ids.length === 1) return ids[0];
      if (expectedType && ids.length > 1) {
        const matched = ids.find(id => {
          const vehicle = this.vehicles.get(id);
          const type = (vehicle && vehicle.type) || this.getVehicleType(id);
          return type === expectedType;
        });
        if (matched) return matched;
      }
    }

    return raw || null;
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  notify(carId, data) {
    // 写入 dirty 表；同一 carId 多次更新会被合并为最新值
    this._dirty.set(carId, data);
  }

  _flushDirty() {
    if (this._dirty.size === 0) return;
    const batch = [];
    for (const [carId, data] of this._dirty) {
      batch.push({ carId, data });
    }
    this._dirty.clear();
    for (const cb of this.listeners) {
      cb(batch);
    }
  }

  dispose() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  // 高频同步数据通道：现在只保留速度等附加信息，位置以 Upload*Info.Coordinate 为准
  processSyncTransform(carId, pos, rot, speed) {
    if (!carId) return;
    const existing = this.vehicles.get(carId);
    if (!existing) return;

    if (speed !== undefined && speed !== null) {
      existing.speed = speed;
    }
    existing.lastUpdate = Date.now();
    this.notify(carId, existing);
  }

  processUploadCarInfo(carInfo, clientInfo) {
    const carId = carInfo.CarID;
    if (!carId) return;

    const existing = this.vehicles.get(carId) || {};
    const isNew = !this.vehicles.has(carId);
    // type 优先级：本次 Name → 已存的 type → carId 启发式
    const nameForType = carInfo.Name || (clientInfo && clientInfo.loadName);
    const resolvedType = DataManager.typeFromName(nameForType) || existing.type || this.getVehicleType(carId);
    // camp 优先级：本次 Camp（支持 1/2/10/20）→ 已存的 camp → carId 启发式
    const resolvedCamp = DataManager.mapCamp(carInfo.Camp) || existing.camp || this.getCamp(carId);
    const uploadPosition = DataManager.coordinateToPosition(carInfo.Coordinate);

    const vehicle = {
      ...existing,
      carId: carId,
      type: resolvedType,
      camp: resolvedCamp,
      name: nameForType || existing.name || '',
      number: carInfo.Number || this.getNumber(carId),
      position: uploadPosition || existing.position || { x: 0, y: 0, z: 0 },
      rotation: carInfo.MoveDirection ? {
        x: 0,
        y: carInfo.MoveDirection.y || 0,
        z: 0
      } : existing.rotation || { x: 0, y: 0, z: 0 },
      speed: carInfo.MoveSpeed || existing.speed || 0,
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
    const uploadPosition = DataManager.coordinateToPosition(uavInfo.Coordinate);

    const vehicle = {
      ...existing,
      carId: carId,
      type: 'UAV',
      camp: this.getCamp(carId),
      number: this.getNumber(carId),
      position: uploadPosition || existing.position || { x: 0, y: 0, z: 0 },
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
    for (const [clientId, ids] of this.clientIdToCarIds) {
      ids.delete(carId);
      if (ids.size === 0) this.clientIdToCarIds.delete(clientId);
    }
    // 通知渲染端清掉 3D 对象 / 轨迹 / 范围
    this.notify(carId, null);
  }

  clear() {
    log.info('清空所有车辆数据');
    this.vehicles.clear();
    this.rawIdToCarId.clear();
    this.clientIdToCarIds.clear();
  }
}

module.exports = DataManager;
