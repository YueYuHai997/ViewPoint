class AxisHelper {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.gridHelper = null;
  }

  create() {
    this.gridHelper = new this.THREE.GridHelper(20000, 200, 0x333333, 0x1a1a1a);
    this.scene.add(this.gridHelper);

    const axisLength = 5000;
    const createLine = (start, end, color) => {
      const geometry = new this.THREE.BufferGeometry().setFromPoints([
        new this.THREE.Vector3(...start),
        new this.THREE.Vector3(...end)
      ]);
      const material = new this.THREE.LineBasicMaterial({ color });
      return new this.THREE.Line(geometry, material);
    };

    this.scene.add(createLine([0, 0, 0], [axisLength, 0, 0], 0xff0000));
    this.scene.add(createLine([0, 0, 0], [0, axisLength, 0], 0x00ff00));
    this.scene.add(createLine([0, 0, 0], [0, 0, axisLength], 0x0000ff));
  }

  setVisible(show) {
    if (this.gridHelper) this.gridHelper.visible = show;
  }
}

module.exports = AxisHelper;
