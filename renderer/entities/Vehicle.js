class Vehicle {
  constructor(THREE, scene, data) {
    this.THREE = THREE;
    this.scene = scene;
    this.carId = data.carId;
    this.type = data.type || 'F1';
    this.camp = data.camp || 'blue';
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

  createLabel(text) {
    const { CSS2DObject } = require('three/examples/jsm/renderers/CSS2DRenderer.js');
    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = this.camp === 'blue' ? '#64b5f6' : '#ef5350';
    div.style.fontSize = '12px';
    div.style.fontWeight = 'bold';
    div.style.textShadow = '0 0 3px rgba(0,0,0,0.8)';
    div.style.pointerEvents = 'none';
    const label = new CSS2DObject(div);
    label.position.set(0, 5, 0);
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
    this.trajectory.push(this.group.position.clone());
    if (this.trajectory.length > this.maxTrajectory) {
      this.trajectory.shift();
    }
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
