class TrajectoryRenderer {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    // carId → { line, positions, capacity }
    this.entries = new Map();
    // 与 Vehicle.maxTrajectory 对齐，留余量
    this.maxPoints = 256;
  }

  update(vehicle) {
    const carId = vehicle.carId;
    const points = vehicle.trajectory;
    if (!points || points.length < 2) return;

    let entry = this.entries.get(carId);
    if (!entry) {
      const capacity = this.maxPoints;
      const positions = new Float32Array(capacity * 3);
      const geo = new this.THREE.BufferGeometry();
      const attr = new this.THREE.BufferAttribute(positions, 3);
      attr.setUsage(this.THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      geo.setDrawRange(0, 0);
      // 轨迹线不参与严格的视锥剔除，跳过包围球重算
      geo.computeBoundingSphere = noop;
      const color = vehicle.camp === 'blue' ? 0x2196f3 : 0xf44336;
      const mat = new this.THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
      const line = new this.THREE.Line(geo, mat);
      this.scene.add(line);
      entry = { line, positions, capacity };
      this.entries.set(carId, entry);
    }

    const count = Math.min(points.length, entry.capacity);
    const arr = entry.positions;
    for (let i = 0; i < count; i++) {
      const p = points[i];
      const base = i * 3;
      arr[base]     = p.x;
      arr[base + 1] = p.y;
      arr[base + 2] = p.z;
    }
    const attr = entry.line.geometry.attributes.position;
    attr.needsUpdate = true;
    entry.line.geometry.setDrawRange(0, count);
  }

  remove(carId) {
    const entry = this.entries.get(carId);
    if (entry) {
      this.scene.remove(entry.line);
      entry.line.geometry.dispose();
      entry.line.material.dispose();
      this.entries.delete(carId);
    }
  }

  clear() {
    for (const carId of Array.from(this.entries.keys())) {
      this.remove(carId);
    }
  }
}

function noop() {}

module.exports = TrajectoryRenderer;
