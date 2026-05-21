class RangeVisualizer {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.rangeObjects = new Map();
  }

  updateRanges(vehicle, config) {
    const carId = vehicle.carId;
    let ranges = this.rangeObjects.get(carId);
    if (!ranges) {
      ranges = {};
      this.rangeObjects.set(carId, ranges);
    }

    const pos = vehicle.getPosition();

    if (config.scoutRange > 0) {
      if (!ranges.scout) {
        const geo = new this.THREE.SphereGeometry(config.scoutRange, 16, 16);
        const mat = new this.THREE.MeshBasicMaterial({
          color: 0x00bcd4, transparent: true, opacity: 0.15
        });
        ranges.scout = new this.THREE.Mesh(geo, mat);
        this.scene.add(ranges.scout);
      }
      ranges.scout.position.copy(pos);
      ranges.scout.visible = true;
    } else if (ranges.scout) {
      ranges.scout.visible = false;
    }

    if (config.attackRange > 0) {
      if (!ranges.attack) {
        const geo = new this.THREE.SphereGeometry(config.attackRange, 16, 16);
        const mat = new this.THREE.MeshBasicMaterial({
          color: 0xff1744, transparent: true, opacity: 0.12
        });
        ranges.attack = new this.THREE.Mesh(geo, mat);
        this.scene.add(ranges.attack);
      }
      ranges.attack.position.copy(pos);
      ranges.attack.visible = true;
    } else if (ranges.attack) {
      ranges.attack.visible = false;
    }

    if (config.radarRange > 0) {
      if (!ranges.radar) {
        const geo = new this.THREE.CircleGeometry(config.radarRange, 32);
        const mat = new this.THREE.MeshBasicMaterial({
          color: 0x4caf50, transparent: true, opacity: 0.1, side: this.THREE.DoubleSide
        });
        ranges.radar = new this.THREE.Mesh(geo, mat);
        ranges.radar.rotation.x = -Math.PI / 2;
        this.scene.add(ranges.radar);

        const lineGeo = new this.THREE.BufferGeometry().setFromPoints([
          new this.THREE.Vector3(0, 0, 0),
          new this.THREE.Vector3(config.radarRange, 0, 0)
        ]);
        const lineMat = new this.THREE.LineBasicMaterial({ color: 0x4caf50 });
        ranges.radarLine = new this.THREE.Line(lineGeo, lineMat);
        ranges.radarLine.rotation.x = -Math.PI / 2;
        this.scene.add(ranges.radarLine);
      }
      ranges.radar.position.copy(pos);
      ranges.radar.position.y += 0.1;
      ranges.radarLine.position.copy(pos);
      ranges.radarLine.position.y += 0.2;
      ranges.radar.visible = true;
      ranges.radarLine.visible = true;
      ranges.radarLine.rotation.z += 0.02;
    } else if (ranges.radar) {
      ranges.radar.visible = false;
      if (ranges.radarLine) ranges.radarLine.visible = false;
    }

    if (config.cameraRange > 0) {
      if (!ranges.camera) {
        const geo = new this.THREE.ConeGeometry(config.cameraRange * 0.5, config.cameraRange, 4, 1, true);
        const edges = new this.THREE.EdgesGeometry(geo);
        const mat = new this.THREE.LineBasicMaterial({ color: 0xffeb3b });
        ranges.camera = new this.THREE.LineSegments(edges, mat);
        this.scene.add(ranges.camera);
      }
      ranges.camera.position.copy(pos);
      ranges.camera.position.y += 2;
      ranges.camera.rotation.x = Math.PI / 2;
      ranges.camera.visible = true;
    } else if (ranges.camera) {
      ranges.camera.visible = false;
    }
  }

  removeRanges(carId) {
    const ranges = this.rangeObjects.get(carId);
    if (!ranges) return;
    for (const key of Object.keys(ranges)) {
      if (ranges[key]) {
        this.scene.remove(ranges[key]);
        if (ranges[key].geometry) ranges[key].geometry.dispose();
        if (ranges[key].material) ranges[key].material.dispose();
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
