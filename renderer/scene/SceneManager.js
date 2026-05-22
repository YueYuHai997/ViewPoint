class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.cssRenderer = null;
    this.clock = null;
    this.animationCallbacks = [];
  }

  async init(THREE) {
    this.THREE = THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(
      60,
      w / h,
      0.1,
      100000
    );
    this.camera.position.set(0, 500, 1000);
    this.camera.lookAt(0, 0, 0);

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: 'default'
      });
    } catch (e) {
      console.error('WebGL 初始化失败:', e);
      this.renderer = new THREE.WebGLRenderer({ antialias: false });
    }
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.CSS2DObject = null;
    try {
      const mod = require('three/examples/jsm/renderers/CSS2DRenderer.js');
      this.CSS2DObject = mod.CSS2DObject;
      this.cssRenderer = new mod.CSS2DRenderer();
      this.cssRenderer.setSize(w, h);
      this.cssRenderer.domElement.style.position = 'absolute';
      this.cssRenderer.domElement.style.top = '0';
      this.cssRenderer.domElement.style.pointerEvents = 'none';
      this.container.appendChild(this.cssRenderer.domElement);
    } catch (e) {
      console.error('CSS2DRenderer 初始化失败:', e);
    }

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1000, 2000, 1000);
    this.scene.add(dirLight);

    this.clock = new THREE.Clock();

    window.addEventListener('resize', () => this.onResize());

    this.animate();
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.cssRenderer) this.cssRenderer.setSize(w, h);
  }

  addAnimationCallback(cb) {
    this.animationCallbacks.push(cb);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();
    for (const cb of this.animationCallbacks) {
      cb(delta);
    }
    this.renderer.render(this.scene, this.camera);
    if (this.cssRenderer) this.cssRenderer.render(this.scene, this.camera);
  }

  add(object) {
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }
}

module.exports = SceneManager;
