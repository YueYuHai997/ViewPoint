const Vehicle = require('./Vehicle');

class UAVEntity extends Vehicle {
  constructor(THREE, scene, data, opts) {
    super(THREE, scene, data, opts);
    this.type = 'UAV';
    this.build();
    this.createLabel('UAV-' + data.number);
  }

  build() {
    const colors = this.getColors();

    const bodyGeo = new this.THREE.BoxGeometry(1.5, 0.3, 1.5);
    const bodyMat = new this.THREE.MeshLambertMaterial({ color: colors.primary });
    const body = new this.THREE.Mesh(bodyGeo, bodyMat);
    this.group.add(body);

    const armPositions = [[-1, 0, -1], [1, 0, -1], [-1, 0, 1], [1, 0, 1]];
    this.rotors = [];
    for (const pos of armPositions) {
      const armGeo = new this.THREE.CylinderGeometry(0.05, 0.05, 1.5, 4);
      const armMat = new this.THREE.MeshLambertMaterial({ color: 0x888888 });
      const arm = new this.THREE.Mesh(armGeo, armMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(pos[0] * 0.7, 0, pos[2] * 0.7);
      this.group.add(arm);

      const rotorGeo = new this.THREE.CircleGeometry(0.5, 8);
      const rotorMat = new this.THREE.MeshLambertMaterial({
        color: colors.light,
        side: this.THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      });
      const rotor = new this.THREE.Mesh(rotorGeo, rotorMat);
      rotor.rotation.x = -Math.PI / 2;
      rotor.position.set(pos[0] * 0.7, 0.2, pos[2] * 0.7);
      this.group.add(rotor);
      this.rotors.push(rotor);
    }
  }

  updateData(data) {
    super.updateData(data);
    if (this.rotors) {
      for (let i = 0; i < this.rotors.length; i++) {
        this.rotors[i].rotation.y += 0.3;
      }
    }
  }
}

module.exports = UAVEntity;
