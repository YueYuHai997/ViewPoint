class RangeVisualizer {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.rangeObjects = new Map();
    this.radarLines = [];
  }

  updateRanges(vehicle, config) {
    const carId = vehicle.carId;
    let ranges = this.rangeObjects.get(carId);
    if (!ranges) {
      ranges = {};
      this.rangeObjects.set(carId, ranges);
    }

    const pos = vehicle.getPosition();

    // 收集所有活跃范围，按半径从大到小排序渲染顺序
    const activeRanges = [];
    if (config.scoutRange > 0) activeRanges.push({ key: 'scout', radius: config.scoutRange });
    if (config.attackRange > 0) activeRanges.push({ key: 'attack', radius: config.attackRange });
    if (config.cameraRange > 0) activeRanges.push({ key: 'camera', radius: config.cameraRange });
    activeRanges.sort((a, b) => b.radius - a.radius);

    // 侦察范围
    this._updateSphereRange(ranges, 'scout', pos, config.scoutRange, 0x00bcd4, 0.15, activeRanges);

    // 攻击范围
    this._updateSphereRange(ranges, 'attack', pos, config.attackRange, 0xff1744, 0.12, activeRanges);

    // 雷达范围 - 圆盘 + 扫描线
    this._updateRadarRange(ranges, pos, config.radarRange);

    // 摄像头范围 - 锥型实体（锥尖在车体，朝向车头）
    this._updateCameraRange(ranges, vehicle, config.cameraRange, activeRanges);
  }

  _getRenderOrder(key, activeRanges) {
    const idx = activeRanges.findIndex(r => r.key === key);
    return idx >= 0 ? idx : 0;
  }

  _makeTransparentMat(color, opacity) {
    return new this.THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
      side: this.THREE.DoubleSide
    });
  }

  _updateSphereRange(ranges, key, pos, radius, color, opacity, activeRanges) {
    if (radius <= 0) {
      if (ranges[key]) ranges[key].visible = false;
      return;
    }
    const renderOrder = this._getRenderOrder(key, activeRanges);
    if (ranges[key]) {
      if (ranges[key]._radius !== radius) {
        ranges[key].geometry.dispose();
        ranges[key].geometry = new this.THREE.SphereGeometry(radius, 32, 32);
        ranges[key]._radius = radius;
      }
      ranges[key].position.copy(pos);
      ranges[key].visible = true;
      ranges[key].renderOrder = renderOrder;
    } else {
      const geo = new this.THREE.SphereGeometry(radius, 32, 32);
      const mat = this._makeTransparentMat(color, opacity);
      ranges[key] = new this.THREE.Mesh(geo, mat);
      ranges[key]._radius = radius;
      ranges[key].renderOrder = renderOrder;
      this.scene.add(ranges[key]);
      ranges[key].position.copy(pos);
    }
  }

  _updateRadarRange(ranges, pos, radius) {
    if (radius <= 0) {
      if (ranges.radar) ranges.radar.visible = false;
      if (ranges.radarLine) ranges.radarLine.visible = false;
      return;
    }

    // 圆盘
    if (ranges.radar) {
      if (ranges.radar._radius !== radius) {
        ranges.radar.geometry.dispose();
        ranges.radar.geometry = new this.THREE.CircleGeometry(radius, 64);
        ranges.radar._radius = radius;
      }
      ranges.radar.position.copy(pos);
      ranges.radar.position.y += 0.1;
      ranges.radar.visible = true;
    } else {
      const geo = new this.THREE.CircleGeometry(radius, 64);
      const mat = this._makeTransparentMat(0x4caf50, 0.1);
      ranges.radar = new this.THREE.Mesh(geo, mat);
      ranges.radar._radius = radius;
      ranges.radar.rotation.x = -Math.PI / 2;
      ranges.radar.renderOrder = 10;
      this.scene.add(ranges.radar);
      ranges.radar.position.copy(pos);
      ranges.radar.position.y += 0.1;
    }

    // 扫描线
    if (ranges.radarLine) {
      if (ranges.radarLine._radius !== radius) {
        ranges.radarLine.geometry.dispose();
        ranges.radarLine.geometry = new this.THREE.BufferGeometry().setFromPoints([
          new this.THREE.Vector3(0, 0, 0),
          new this.THREE.Vector3(radius, 0, 0)
        ]);
        ranges.radarLine._radius = radius;
      }
      ranges.radarLine.position.copy(pos);
      ranges.radarLine.position.y += 0.2;
      ranges.radarLine.visible = true;
      if (!this.radarLines.includes(ranges.radarLine)) {
        this.radarLines.push(ranges.radarLine);
      }
    } else {
      const lineGeo = new this.THREE.BufferGeometry().setFromPoints([
        new this.THREE.Vector3(0, 0, 0),
        new this.THREE.Vector3(radius, 0, 0)
      ]);
      const lineMat = new this.THREE.LineBasicMaterial({ color: 0x4caf50, transparent: true, depthWrite: false });
      ranges.radarLine = new this.THREE.Line(lineGeo, lineMat);
      ranges.radarLine._radius = radius;
      ranges.radarLine.rotation.x = -Math.PI / 2;
      ranges.radarLine.renderOrder = 11;
      this.scene.add(ranges.radarLine);
      ranges.radarLine.position.copy(pos);
      ranges.radarLine.position.y += 0.2;
      this.radarLines.push(ranges.radarLine);
    }
  }

  _updateCameraRange(ranges, vehicle, radius, activeRanges) {
    if (radius <= 0) {
      if (ranges.camera) ranges.camera.visible = false;
      return;
    }

    // 挂到车辆 group 下面，使其跟随车体旋转，方向以车辆 local -z（车头）为前向
    // ConeGeometry: 默认锥尖在 +y、底面在 -y
    // rotation.x = π/2 后，锥尖朝 local +z；将 mesh 沿 -z 平移 radius/2，使锥尖落在车体位置(0,2,0)，底面延伸至 (0,2,-radius)
    const targetParent = (vehicle && vehicle.group) || this.scene;
    const renderOrder = this._getRenderOrder('camera', activeRanges);

    if (ranges.camera) {
      if (ranges.camera._radius !== radius) {
        ranges.camera.geometry.dispose();
        ranges.camera.geometry = new this.THREE.ConeGeometry(radius * 0.3, radius, 16, 1, true);
        ranges.camera._radius = radius;
      }
      if (ranges.camera.parent !== targetParent) {
        if (ranges.camera.parent) ranges.camera.parent.remove(ranges.camera);
        targetParent.add(ranges.camera);
      }
      ranges.camera.position.set(0, 2, -radius / 2);
      ranges.camera.rotation.set(Math.PI / 2, 0, 0);
      ranges.camera.visible = true;
      ranges.camera.renderOrder = renderOrder;
    } else {
      const geo = new this.THREE.ConeGeometry(radius * 0.3, radius, 16, 1, true);
      const mat = this._makeTransparentMat(0xffeb3b, 0.15);
      const cone = new this.THREE.Mesh(geo, mat);
      cone._radius = radius;
      cone.renderOrder = renderOrder;
      cone.position.set(0, 2, -radius / 2);
      cone.rotation.set(Math.PI / 2, 0, 0);
      targetParent.add(cone);
      ranges.camera = cone;
    }
  }

  // 每帧调用 - 雷达扫描线持续旋转
  update() {
    for (const line of this.radarLines) {
      if (line.visible) {
        line.rotation.z += 0.03;
      }
    }
  }

  removeRanges(carId) {
    const ranges = this.rangeObjects.get(carId);
    if (!ranges) return;
    for (const key of Object.keys(ranges)) {
      if (ranges[key]) {
        // 锥型可能被挂到 vehicle.group 而非 scene 下，统一从实际 parent 移除
        if (ranges[key].parent) ranges[key].parent.remove(ranges[key]);
        if (ranges[key].geometry) ranges[key].geometry.dispose();
        if (ranges[key].material) ranges[key].material.dispose();
        if (key === 'radarLine') {
          const idx = this.radarLines.indexOf(ranges[key]);
          if (idx >= 0) this.radarLines.splice(idx, 1);
        }
      }
    }
    this.rangeObjects.delete(carId);
  }

  clear() {
    for (const carId of this.rangeObjects.keys()) {
      this.removeRanges(carId);
    }
  }
}

module.exports = RangeVisualizer;
