const Vehicle = require('./Vehicle');

class F1Vehicle extends Vehicle {
  constructor(THREE, scene, data, opts) {
    super(THREE, scene, data, opts);
    this.type = 'F1';
    this.build();
    this.createLabel(data);
  }

  build() {
    const colors = this.getColors();

    const bodyGeo = new this.THREE.BoxGeometry(3, 1.2, 5);
    const bodyMat = new this.THREE.MeshLambertMaterial({ color: colors.primary });
    const body = new this.THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    this.group.add(body);

    const turretGeo = new this.THREE.CylinderGeometry(0.6, 0.8, 0.8, 8);
    const turretMat = new this.THREE.MeshLambertMaterial({ color: colors.dark });
    this.turret = new this.THREE.Mesh(turretGeo, turretMat);
    this.turret.position.set(0, 1.8, -0.5);
    this.group.add(this.turret);

    const barrelGeo = new this.THREE.CylinderGeometry(0.1, 0.1, 3, 6);
    const barrelMat = new this.THREE.MeshLambertMaterial({ color: 0x555555 });
    this.barrel = new this.THREE.Mesh(barrelGeo, barrelMat);
    this.barrel.rotation.x = Math.PI / 2;
    this.barrel.position.set(0, 0, -2);
    this.turret.add(this.barrel);
  }

  updateData(data) {
    super.updateData(data);
    if (data.turretH !== undefined && this.turret) {
      this.turret.rotation.y = data.turretH;
    }
    if (data.turretV !== undefined && this.barrel) {
      this.barrel.rotation.x = Math.PI / 2 + data.turretV;
    }
  }
}

module.exports = F1Vehicle;
