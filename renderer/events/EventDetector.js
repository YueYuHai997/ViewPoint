class EventDetector {
  constructor() {
    this.prev = new Map();
    this.listeners = [];
    this.recentFires = [];
    this.lastEventAt = new Map();
  }

  on(callback) {
    this.listeners.push(callback);
  }

  onUpdate(carId, data) {
    const now = Date.now();
    if (data === null || data === undefined) {
      const last = this.prev.get(carId);
      if (last && this._canEmit(`destroyed:${carId}`, now, 5000)) {
        this._emit({
          type: 'destroyed',
          severity: 'critical',
          carId,
          vehicle: last,
          attacker: this._guessAttacker(last, now),
          cause: this._inferDestroyCause(last),
          ts: now
        });
      }
      this.prev.delete(carId);
      return;
    }

    const prev = this.prev.get(carId);
    if (prev) this._diff(prev, data, now);
    this.prev.set(carId, this._snapshot(data));
    this._trimRecentFires(now);
  }

  _diff(prev, cur, now) {
    const fireDelta = this._ammoUsed(prev, cur);
    if (fireDelta > 0 && this._canEmit(`fire:${cur.carId}`, now, 900)) {
      const fire = {
        type: 'fire',
        severity: 'info',
        carId: cur.carId,
        vehicle: this._snapshot(cur),
        count: fireDelta,
        bulletType: cur.bulletType,
        ts: now
      };
      this.recentFires.push(fire);
      this._emit(fire);
    }

    const hit = this._damageIncrease(prev, cur);
    if (hit.total > 0 && this._canEmit(`hit:${cur.carId}`, now, 1200)) {
      const vehicle = this._snapshot(cur);
      const attacker = this._guessAttacker(vehicle, now);
      this._emit({
        type: 'hit',
        severity: hit.maxAfter >= 70 ? 'warning' : 'info',
        carId: cur.carId,
        vehicle,
        attacker,
        parts: hit.parts,
        amount: hit.total,
        maxDamage: hit.maxAfter,
        ts: now
      });
    }

    if (!prev.isCrash && cur.isCrash && this._canEmit(`crash:${cur.carId}`, now, 3000)) {
      this._emit({
        type: 'crashed',
        severity: 'warning',
        carId: cur.carId,
        vehicle: this._snapshot(cur),
        ts: now
      });
    }

    const prevMax = this._maxDamage(prev.damage);
    const curMax = this._maxDamage(cur.damage);
    if (prevMax < 100 && curMax >= 100 && this._canEmit(`destroyed:${cur.carId}`, now, 5000)) {
      const vehicle = this._snapshot(cur);
      this._emit({
        type: 'destroyed',
        severity: 'critical',
        carId: cur.carId,
        vehicle,
        attacker: this._guessAttacker(vehicle, now),
        cause: this._inferDestroyCause(vehicle),
        ts: now
      });
    }
  }

  _ammoUsed(prev, cur) {
    const prevMain = Number(prev.mainCapacity || 0);
    const curMain = Number(cur.mainCapacity || 0);
    if (prevMain > curMain) return prevMain - curMain;

    const prevBullets = this._sum(prev.bullets);
    const curBullets = this._sum(cur.bullets);
    return prevBullets > curBullets ? prevBullets - curBullets : 0;
  }

  _damageIncrease(prev, cur) {
    const names = {
      chassis: '底盘',
      turret: '炮塔',
      leftTrack: '左履带',
      rightTrack: '右履带'
    };
    let total = 0;
    let maxAfter = 0;
    const parts = [];
    for (const key of Object.keys(names)) {
      const before = Number((prev.damage && prev.damage[key]) || 0);
      const after = Number((cur.damage && cur.damage[key]) || 0);
      maxAfter = Math.max(maxAfter, after);
      if (after > before) {
        total += after - before;
        parts.push(names[key]);
      }
    }
    return { total, parts, maxAfter };
  }

  _guessAttacker(target, now) {
    this._trimRecentFires(now);
    for (let i = this.recentFires.length - 1; i >= 0; i--) {
      const fire = this.recentFires[i];
      if (fire.carId === target.carId) continue;
      if (fire.vehicle && target.camp && fire.vehicle.camp === target.camp) continue;
      return fire.vehicle;
    }
    return null;
  }

  _inferDestroyCause(vehicle) {
    if (!vehicle) return '被击毁';
    if (vehicle.isCrash) return '碰撞损毁';
    const damage = vehicle.damage || {};
    if ((damage.chassis || 0) >= 100) return '底盘损毁';
    if ((damage.turret || 0) >= 100) return '炮塔损毁';
    if ((damage.leftTrack || 0) >= 100) return '左履带损毁';
    if ((damage.rightTrack || 0) >= 100) return '右履带损毁';
    return '被击毁';
  }

  _snapshot(d) {
    return {
      carId: d.carId,
      type: d.type,
      camp: d.camp,
      number: d.number,
      isCrash: !!d.isCrash,
      damage: { ...(d.damage || {}) },
      bullets: Array.isArray(d.bullets) ? [...d.bullets] : [],
      bulletType: d.bulletType || 0,
      mainCapacity: d.mainCapacity || 0,
      target: d.target ? { distance: d.target.distance || 0 } : null
    };
  }

  _maxDamage(damage = {}) {
    return Math.max(
      Number(damage.chassis || 0),
      Number(damage.turret || 0),
      Number(damage.leftTrack || 0),
      Number(damage.rightTrack || 0)
    );
  }

  _sum(values) {
    if (!Array.isArray(values)) return 0;
    return values.reduce((sum, value) => sum + Number(value || 0), 0);
  }

  _trimRecentFires(now) {
    this.recentFires = this.recentFires.filter((ev) => now - ev.ts <= 5000);
  }

  _canEmit(key, now, cooldownMs) {
    const last = this.lastEventAt.get(key) || 0;
    if (now - last < cooldownMs) return false;
    this.lastEventAt.set(key, now);
    return true;
  }

  _emit(event) {
    for (const callback of this.listeners) callback(event);
  }
}

module.exports = EventDetector;
