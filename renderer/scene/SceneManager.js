class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.composer = null;
    this.bloomPass = null;
    this.cssRenderer = null;
    this.clock = null;
    this.animationCallbacks = [];
  }

  async init(THREE) {
    this.THREE = THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.Fog(0x05070d, 8000, 30000);

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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // ----- 后处理：Bloom 辉光 -----
    try {
      const { EffectComposer } = require('three/examples/jsm/postprocessing/EffectComposer.js');
      const { RenderPass } = require('three/examples/jsm/postprocessing/RenderPass.js');
      const { UnrealBloomPass } = require('three/examples/jsm/postprocessing/UnrealBloomPass.js');
      const { OutputPass } = require('three/examples/jsm/postprocessing/OutputPass.js');

      this.composer = new EffectComposer(this.renderer);
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      // strength / radius / threshold —— 阈值低一点让范围/网格线也吃到光晕
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.55, 0.5);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    } catch (e) {
      console.error('Bloom 后处理初始化失败，将退回普通渲染:', e);
      this.composer = null;
    }

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
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloomPass) this.bloomPass.setSize(w, h);
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
    if (this.composer) {
      this.composer.render(delta);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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
