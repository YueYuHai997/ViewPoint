class TrajectoryRenderer {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.trajectoryLines = new Map();
  }

  update(vehicle) {
    const carId = vehicle.carId;
    const points = vehicle.trajectory;
    if (!points || points.length < 2) return;

    let line = this.trajectoryLines.get(carId);
    if (line) {
      line.geometry.dispose();
      line.geometry = new this.THREE.BufferGeometry().setFromPoints(points);
    } else {
      const color = vehicle.camp === 'blue' ? 0x2196f3 : 0xf44336;
      const geo = new this.THREE.BufferGeometry().setFromPoints(points);
      const mat = new this.THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
      line = new this.THREE.Line(geo, mat);
      this.scene.add(line);
      this.trajectoryLines.set(carId, line);
    }
  }

  remove(carId) {
    const line = this.trajectoryLines.get(carId);
    if (line) {
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
      this.trajectoryLines.delete(carId);
    }
  }

  clear() {
    for (const carId of this.trajectoryLines.keys()) {
      this.remove(carId);
    }
  }
}

module.exports = TrajectoryRenderer;
