// 战场热力图：
// - 在 y=0.5 处铺一张大平面，纹理是由车辆位置生成的 Canvas
// - Canvas 用 'lighter' 合成模式累加白色高斯斑块；密度越高 alpha 越高
// - 自定义 ShaderMaterial 把 alpha 经 jet 颜色表映射成 蓝→青→绿→黄→红
class HeatmapVisualizer {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.textureSize = 512;
    this.worldSize = 20000;            // 与 GridHelper 等大
    this.blobAlpha = 0.18;             // 单辆车贡献的 alpha；越小越需要密集才发红
    this.blobRadiusPx = 26;            // 单个高斯斑半径（像素）

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.textureSize;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;

    const geo = new THREE.PlaneGeometry(this.worldSize, this.worldSize);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uHeat: { value: this.texture },
        uOpacity: { value: 0.7 }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uHeat;
        uniform float uOpacity;
        varying vec2 vUv;
        // 类 jet 颜色表：0 蓝 -> 0.25 青 -> 0.5 绿 -> 0.75 黄 -> 1 红
        vec3 jet(float t) {
          t = clamp(t, 0.0, 1.0);
          float r = clamp(1.5 - abs(4.0 * t - 3.0), 0.0, 1.0);
          float g = clamp(1.5 - abs(4.0 * t - 2.0), 0.0, 1.0);
          float b = clamp(1.5 - abs(4.0 * t - 1.0), 0.0, 1.0);
          return vec3(r, g, b);
        }
        void main() {
          float intensity = texture2D(uHeat, vUv).a;
          if (intensity < 0.04) discard;
          vec3 color = jet(intensity);
          gl_FragColor = vec4(color, intensity * uOpacity);
        }
      `
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.5;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.enabled = false;
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.mesh.visible = this.enabled;
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  // vehicles: 含 { position: {x, z} } 的对象数组
  update(vehicles) {
    if (!this.enabled || !vehicles) return;
    const ctx = this.ctx;
    const s = this.textureSize;
    const half = this.worldSize / 2;
    const r = this.blobRadiusPx;
    const a = this.blobAlpha;

    ctx.clearRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'lighter';

    for (const v of vehicles) {
      const p = v && v.position;
      if (!p) continue;
      // 世界 (x, z) ∈ [-half, +half] → 像素 (0, s)
      // 把世界 -z 作"北"放在 canvas 上方，所以 cy 用 (-z+half)/world
      const cx = ((p.x + half) / this.worldSize) * s;
      const cy = ((-p.z + half) / this.worldSize) * s;
      if (cx < -r || cx > s + r) continue;
      if (cy < -r || cy > s + r) continue;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.5, `rgba(255,255,255,${a * 0.4})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    ctx.globalCompositeOperation = 'source-over';
    this.texture.needsUpdate = true;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    if (this.texture) this.texture.dispose();
  }
}

module.exports = HeatmapVisualizer;
