class Vehicle {
  constructor(THREE, scene, data, opts) {
    this.THREE = THREE;
    this.scene = scene;
    this.carId = data.carId;
    this.type = data.type || 'F1';
    this.camp = data.camp || 'blue';
    this.CSS2DObject = (opts && opts.CSS2DObject) || null;
    this.group = new THREE.Group();
    this.label = null;
    this.trajectory = [];
    this.maxTrajectory = 200;
  }

  getColors() {
    if (this.camp === 'blue') {
      return { primary: 0x2196f3, light: 0x64b5f6, dark: 0x1565c0 };
    }
    return { primary: 0xf44336, light: 0xef5350, dark: 0xc62828 };
  }

  createLabel(subText) {
    if (!this.CSS2DObject) return;
    const color = this.camp === 'blue' ? '#64b5f6' : '#ef5350';
    const glow = this.camp === 'blue' ? 'rgba(100,181,246,0.9)' : 'rgba(239,83,80,0.9)';
    const div = document.createElement('div');
    div.style.pointerEvents = 'none';
    div.style.textAlign = 'center';
    div.style.fontFamily = 'Consolas, "Microsoft YaHei", monospace';
    div.innerHTML = `
      <div style="
        display:inline-block;
        padding:2px 8px;
        font-size:16px;
        font-weight:700;
        letter-spacing:1px;
        color:${color};
        background:rgba(10,10,10,0.55);
        border:1px solid ${color};
        border-radius:3px;
        text-shadow:0 0 6px ${glow};
        box-shadow:0 0 8px ${glow};
      ">${this.carId}</div>
      <div style="
        margin-top:2px;
        font-size:11px;
        color:${color};
        opacity:0.8;
        text-shadow:0 0 3px rgba(0,0,0,0.9);
      ">${subText}</div>
    `;
    const label = new this.CSS2DObject(div);
    label.position.set(0, 6, 0);
    this.group.add(label);
    this.label = label;
  }

  updatePosition(position) {
    if (position) {
      this.group.position.set(position.x, position.y, position.z);
    }
  }

  updateRotation(rotation) {
    if (rotation) {
      this.group.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    }
  }

  updateData(data) {
    this.updatePosition(data.position);
    this.updateRotation(data.rotation);

    const p = this.group.position;
    // 占位点 (0,0,0) 直接跳过，避免画一根从原点到真实位置的尖刺红线
    if (p.x === 0 && p.y === 0 && p.z === 0) return;

    // 大跳变（>2km）认为是坐标系切换 / sync 接管，重置轨迹避免拖尾
    if (this.trajectory.length > 0) {
      const last = this.trajectory[this.trajectory.length - 1];
      const dx = p.x - last.x, dy = p.y - last.y, dz = p.z - last.z;
      if (dx * dx + dy * dy + dz * dz > 4_000_000) {
        this.trajectory.length = 0;
      }
    }
    this.trajectory.push(p.clone());
    if (this.trajectory.length > this.maxTrajectory) this.trajectory.shift();
  }

  addToScene() {
    this.scene.add(this.group);
  }

  removeFromScene() {
    this.scene.remove(this.group);
  }

  setVisible(show) {
    this.group.visible = show;
  }

  getPosition() {
    return this.group.position.clone();
  }

  dispose() {
    this.removeFromScene();
  }
}

module.exports = Vehicle;
