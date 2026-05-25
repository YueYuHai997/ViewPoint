class CameraController {
  constructor(THREE, camera, domElement) {
    this.THREE = THREE;
    this.camera = camera;
    this.domElement = domElement;

    this.target = new THREE.Vector3(0, 0, 0);
    this.rotateSpeed = 0.0018;   // 旋转灵敏度（越小越慢）
    this.zoomSpeed = 0.1;
    this.panSpeed = 0.5;
    this.damping = 0.85;          // 越接近 1，惯性越长

    this.spherical = new THREE.Spherical();
    this.sphericalDelta = new THREE.Spherical();

    this.isRotating = false;
    this.isPanning = false;
    this.lastMouse = { x: 0, y: 0 };

    // 视角过渡 tween 状态
    this.tween = null;  // { startTarget, endTarget, startSph: {r,phi,theta}, endSph, elapsed, duration }

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
    // 用户拖拽 / 缩放时打断进行中的视角过渡
    if (this.tween) this.cancelTween();
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
    if (this.tween) this.cancelTween();
    if (e.deltaY > 0) {
      this.spherical.radius *= (1 + this.zoomSpeed);
    } else {
      this.spherical.radius *= (1 - this.zoomSpeed);
    }
    this.spherical.radius = Math.max(1, Math.min(50000, this.spherical.radius));
  }

  focusOn(position) {
    this.target.set(position.x, position.y, position.z);
    this.spherical.radius = 500;
    this.spherical.phi = Math.PI / 4;
    this.spherical.theta = 0;
    this.applyUpdate();
  }

  reset() {
    this.target.set(0, 0, 0);
    this.spherical.radius = 300;
    this.spherical.phi = Math.PI / 4;
    this.spherical.theta = 0;
    this.applyUpdate();
  }

  // 顶视图：相机平滑过渡到目标正上方（默认 0.5s）
  topDownView(targetVehicles, duration = 0.5) {
    // 计算目标 target 和 radius
    let endTargetX = 0, endTargetZ = 0, endRadius = Math.max(this.spherical.radius, 2000);
    if (Array.isArray(targetVehicles) && targetVehicles.length > 0) {
      const xs = targetVehicles.map(v => v.position && v.position.x).filter(v => v !== undefined);
      const zs = targetVehicles.map(v => v.position && v.position.z).filter(v => v !== undefined);
      if (xs.length > 0 && zs.length > 0) {
        endTargetX = (Math.min(...xs) + Math.max(...xs)) / 2;
        endTargetZ = (Math.min(...zs) + Math.max(...zs)) / 2;
        const span = Math.max(
          Math.max(...xs) - Math.min(...xs),
          Math.max(...zs) - Math.min(...zs),
          200
        );
        endRadius = Math.max(500, span * 1.2);
      }
    }

    // 清掉惯性，避免动画过程中被叠加
    this.sphericalDelta.theta = 0;
    this.sphericalDelta.phi = 0;

    this._startTween({
      target: { x: endTargetX, y: 0, z: endTargetZ },
      spherical: { radius: endRadius, phi: 0.01, theta: 0 }
    }, duration);
  }

  // 启动一个相机 tween；持续 duration 秒
  _startTween(end, duration) {
    this.tween = {
      startTarget: this.target.clone(),
      endTarget: new this.THREE.Vector3(end.target.x, end.target.y, end.target.z),
      startSph: { radius: this.spherical.radius, phi: this.spherical.phi, theta: this.spherical.theta },
      endSph: { radius: end.spherical.radius, phi: end.spherical.phi, theta: end.spherical.theta },
      elapsed: 0,
      duration: Math.max(0.001, duration)
    };
  }

  isTweening() {
    return !!this.tween;
  }

  cancelTween() {
    this.tween = null;
  }

  // 获取当前相机水平朝向角（用于指南针）：theta=0 时相机在 +z 方向看向原点
  getAzimuth() {
    return this.spherical.theta;
  }

  applyUpdate() {
    const offset = new this.THREE.Vector3();
    offset.setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  update(delta) {
    // tween 优先：动画期间忽略鼠标 delta
    if (this.tween) {
      const dt = (typeof delta === 'number' && delta > 0) ? delta : 1 / 60;
      this.tween.elapsed += dt;
      const t = Math.min(1, this.tween.elapsed / this.tween.duration);
      const k = this._easeInOutCubic(t);

      this.target.lerpVectors(this.tween.startTarget, this.tween.endTarget, k);
      this.spherical.radius = this.tween.startSph.radius + (this.tween.endSph.radius - this.tween.startSph.radius) * k;
      this.spherical.phi    = this.tween.startSph.phi    + (this.tween.endSph.phi    - this.tween.startSph.phi)    * k;
      // theta 取最短路径插值
      let dTheta = this.tween.endSph.theta - this.tween.startSph.theta;
      while (dTheta > Math.PI)  dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
      this.spherical.theta  = this.tween.startSph.theta + dTheta * k;
      this.spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.spherical.phi));
      this.applyUpdate();

      if (t >= 1) this.tween = null;
      return;
    }

    this.spherical.theta += this.sphericalDelta.theta;
    this.spherical.phi += this.sphericalDelta.phi;
    this.spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.spherical.phi));

    this.applyUpdate();

    this.sphericalDelta.theta *= this.damping;
    this.sphericalDelta.phi *= this.damping;
    if (Math.abs(this.sphericalDelta.theta) < 0.0001) this.sphericalDelta.theta = 0;
    if (Math.abs(this.sphericalDelta.phi) < 0.0001) this.sphericalDelta.phi = 0;
  }

  _easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

module.exports = CameraController;
