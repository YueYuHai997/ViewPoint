const Vehicle = require('./Vehicle');

class Tank99A extends Vehicle {
  constructor(THREE, scene, data, opts) {
    super(THREE, scene, data, opts);
    this.type = '99A';
    this.build();
    this.createLabel(data);
  }

  build() {
    const colors = this.getColors();

    const bodyGeo = new this.THREE.BoxGeometry(4, 1.5, 7);
    const bodyMat = new this.THREE.MeshLambertMaterial({ color: colors.primary });
    const body = new this.THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    this.group.add(body);

    const turretGeo = new this.THREE.CylinderGeometry(1, 1.2, 1, 8);
    const turretMat = new this.THREE.MeshLambertMaterial({ color: colors.dark });
    this.turret = new this.THREE.Mesh(turretGeo, turretMat);
    this.turret.position.set(0, 2.2, -0.5);
    this.group.add(this.turret);

    const barrelGeo = new this.THREE.CylinderGeometry(0.15, 0.15, 4, 6);
    const barrelMat = new this.THREE.MeshLambertMaterial({ color: 0x555555 });
    this.barrel = new this.THREE.Mesh(barrelGeo, barrelMat);
    this.barrel.rotation.x = Math.PI / 2;
    this.barrel.position.set(0, 0, -2.5);
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

module.exports = Tank99A;
