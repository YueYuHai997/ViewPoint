class CameraController {
  constructor(THREE, camera, domElement) {
    this.THREE = THREE;
    this.camera = camera;
    this.domElement = domElement;

    this.target = new THREE.Vector3(0, 0, 0);
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.1;
    this.panSpeed = 0.5;

    this.spherical = new THREE.Spherical();
    this.sphericalDelta = new THREE.Spherical();

    this.isRotating = false;
    this.isPanning = false;
    this.lastMouse = { x: 0, y: 0 };

    this.bindEvents();
    this.updateSpherical();
  }

  updateSpherical() {
    const offset = new this.THREE.Vector3().copy(this.camera.position).sub(this.target);
    this.spherical.setFromVector3(offset);
  }

  bindEvents() {
    this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.domElement.addEventListener('mouseup', () => this.onMouseUp());
    this.domElement.addEventListener('wheel', (e) => this.onWheel(e));
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') {
        this.reset();
      }
    });
  }

  onMouseDown(e) {
    if (e.button === 0) {
      this.isRotating = true;
    } else if (e.button === 2) {
      this.isPanning = true;
    }
    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;
  }

  onMouseMove(e) {
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;

    if (this.isRotating) {
      this.sphericalDelta.theta -= dx * this.rotateSpeed;
      this.sphericalDelta.phi -= dy * this.rotateSpeed;
    }

    if (this.isPanning) {
      const right = new this.THREE.Vector3();
      const up = new this.THREE.Vector3();

      right.setFromMatrixColumn(this.camera.matrix, 0);
      up.setFromMatrixColumn(this.camera.matrix, 1);

      const offset = new this.THREE.Vector3();
      offset.copy(right).multiplyScalar(-dx * this.panSpeed);
      offset.add(up.clone().multiplyScalar(dy * this.panSpeed));

      this.target.add(offset);
    }

    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;
  }

  onMouseUp() {
    this.isRotating = false;
    this.isPanning = false;
  }

  onWheel(e) {
    e.preventDefault();
    if (e.deltaY > 0) {
      this.spherical.radius *= (1 + this.zoomSpeed);
    } else {
      this.spherical.radius *= (1 - this.zoomSpeed);
    }
    this.spherical.radius = Math.max(1, Math.min(50000, this.spherical.radius));
  }

  focusOn(position) {
    this.target.set(position.x, position.y, position.z);
    this.spherical.radius = 50;
    this.applyUpdate();
  }

  reset() {
    this.target.set(0, 0, 0);
    this.spherical.radius = 300;
    this.spherical.phi = Math.PI / 4;
    this.spherical.theta = 0;
    this.applyUpdate();
  }

  applyUpdate() {
    const offset = new this.THREE.Vector3();
    offset.setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  update() {
    this.spherical.theta += this.sphericalDelta.theta;
    this.spherical.phi += this.sphericalDelta.phi;
    this.spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.spherical.phi));

    this.applyUpdate();

    this.sphericalDelta.theta *= 0.9;
    this.sphericalDelta.phi *= 0.9;
    if (Math.abs(this.sphericalDelta.theta) < 0.0001) this.sphericalDelta.theta = 0;
    if (Math.abs(this.sphericalDelta.phi) < 0.0001) this.sphericalDelta.phi = 0;
  }
}

module.exports = CameraController;
