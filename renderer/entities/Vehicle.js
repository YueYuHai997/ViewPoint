class Vehicle {
  constructor(THREE, scene, data, opts) {
    this.THREE = THREE;
    this.scene = scene;
    this.carId = data.carId;
    this.type = data.type || 'F1';
    this.camp = data.camp || 'blue';
    this.CSS2DObject = (opts && opts.CSS2DObject) || null;
    this.group = new THREE.Group();
    this.group.userData.vehicleCarId = this.carId;
    this.label = null;
    this.labelNameEl = null;
    this.labelMetaEl = null;
    this.nameSprite = null;
    this.nameSpriteCanvas = null;
    this.nameSpriteTexture = null;
    this._spriteLabelText = '';
    this.trajectory = [];
    this.maxTrajectory = 200;
    this.createNameSprite(data);
  }

  getColors() {
    if (this.camp === 'blue') {
      return { primary: 0x2196f3, light: 0x64b5f6, dark: 0x1565c0 };
    }
    return { primary: 0xf44336, light: 0xef5350, dark: 0xc62828 };
  }

  getDisplayName(data = {}) {
    const type = data.type || this.type || 'Vehicle';
    const number = data.number || this.carId;
    return `${type}-${number}`;
  }

  getLabelMeta(data = {}) {
    const type = data.type || this.type || 'Vehicle';
    const number = data.number || this.carId;
    return `ID ${this.carId} / ${type}-${number}`;
  }

  createLabel(data = {}) {
    if (!this.CSS2DObject) return;
    const color = this.camp === 'blue' ? '#64b5f6' : '#ef5350';
    const glow = this.camp === 'blue' ? 'rgba(100,181,246,0.9)' : 'rgba(239,83,80,0.9)';
    const div = document.createElement('div');
    div.style.pointerEvents = 'none';
    div.style.textAlign = 'center';
    div.style.fontFamily = 'Consolas, "Microsoft YaHei", monospace';

    const nameEl = document.createElement('div');
    nameEl.style.display = 'inline-block';
    nameEl.style.maxWidth = '180px';
    nameEl.style.padding = '2px 8px';
    nameEl.style.fontSize = '16px';
    nameEl.style.fontWeight = '700';
    nameEl.style.letterSpacing = '0';
    nameEl.style.color = color;
    nameEl.style.background = 'rgba(10,10,10,0.55)';
    nameEl.style.border = `1px solid ${color}`;
    nameEl.style.borderRadius = '3px';
    nameEl.style.textShadow = `0 0 6px ${glow}`;
    nameEl.style.boxShadow = `0 0 8px ${glow}`;
    nameEl.style.whiteSpace = 'nowrap';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';

    div.appendChild(nameEl);

    const label = new this.CSS2DObject(div);
    label.position.set(0, 6, 0);
    this.group.add(label);
    this.label = label;
    this.labelNameEl = nameEl;
    this.labelMetaEl = null;
    this.updateLabel(data);
  }

  updateLabel(data = {}) {
    const name = this.getDisplayName(data);
    if (this.labelNameEl) this.labelNameEl.textContent = name;
    this.updateNameSprite(name);
  }

  createNameSprite(data = {}) {
    if (typeof document === 'undefined') return;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;

    const texture = new this.THREE.CanvasTexture(canvas);
    texture.minFilter = this.THREE.LinearFilter;
    texture.magFilter = this.THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new this.THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    const sprite = new this.THREE.Sprite(material);
    sprite.position.set(0, 4.2, 0);
    sprite.userData.fixedPixelSize = { width: 112, height: 28 };
    sprite.renderOrder = 1000;

    this.nameSprite = sprite;
    this.nameSpriteCanvas = canvas;
    this.nameSpriteTexture = texture;
    this.group.add(sprite);
    this.updateLabel(data);
  }

  updateNameSprite(name) {
    if (!this.nameSpriteCanvas || !this.nameSpriteTexture) return;
    const labelText = `${name}|${this.camp}`;
    if (labelText === this._spriteLabelText) return;
    this._spriteLabelText = labelText;

    const canvas = this.nameSpriteCanvas;
    const ctx = canvas.getContext('2d');
    const color = this.camp === 'blue' ? '#64b5f6' : '#ff6b6b';
    const glow = this.camp === 'blue' ? 'rgba(100,181,246,0.95)' : 'rgba(255,107,107,0.95)';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '700 46px "Microsoft YaHei", Consolas, sans-serif';
    const maxTextWidth = 448;
    let displayName = String(name || '').trim();
    while (displayName.length > 1 && ctx.measureText(displayName).width > maxTextWidth) {
      displayName = displayName.slice(0, -2) + '...';
    }

    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(6, 10, 14, 0.78)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    this._roundRect(ctx, 96, 28, 320, 72, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowBlur = 10;
    ctx.fillText(displayName, 256, 64);
    ctx.restore();

    this.nameSpriteTexture.needsUpdate = true;
  }

  updateScreenSpaceLabel(camera, renderer) {
    if (!this.nameSprite || !camera || !renderer) return;

    const size = this.nameSprite.userData.fixedPixelSize || { width: 112, height: 28 };
    const viewport = renderer.getSize(new this.THREE.Vector2());
    if (!viewport.y) return;

    if (camera.isPerspectiveCamera) {
      const worldPosition = this.nameSprite.getWorldPosition(new this.THREE.Vector3());
      const viewPosition = worldPosition.clone().applyMatrix4(camera.matrixWorldInverse);
      const depth = Math.max(1, -viewPosition.z);
      const visibleHeight = 2 * Math.tan(this.THREE.MathUtils.degToRad(camera.fov) / 2) * depth;
      const worldHeight = visibleHeight * (size.height / viewport.y);
      const worldWidth = worldHeight * (size.width / size.height);
      this.nameSprite.scale.set(worldWidth, worldHeight, 1);
      return;
    }

    if (camera.isOrthographicCamera) {
      const visibleHeight = (camera.top - camera.bottom) / camera.zoom;
      const worldHeight = visibleHeight * (size.height / viewport.y);
      const worldWidth = worldHeight * (size.width / size.height);
      this.nameSprite.scale.set(worldWidth, worldHeight, 1);
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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
    this.type = data.type || this.type;
    this.camp = data.camp || this.camp;
    this.updateLabel(data);
    this.updatePosition(data.position);
    this.updateRotation(data.rotation);

    const p = this.group.position;
    // 占位点 (0,0,0) 直接跳过，避免画一根从原点到真实位置的尖刺红线
    if (p.x === 0 && p.y === 0 && p.z === 0) return;

    // 大跳变（>2km）认为是坐标系切换 / sync 接管，重置轨迹避免拖尾
    if (this.trajectory.length > 0) {
      const last = this.trajectory[this.trajectory.length - 1];
      const dx = p.x - last.x, dy = p.y - last.y, dz = p.z - last.z;
      if (dx * dx + dy * dy + dz * dz > 4_000_000) {
        this.trajectory.length = 0;
      }
    }
    this.trajectory.push(p.clone());
    if (this.trajectory.length > this.maxTrajectory) this.trajectory.shift();
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
    if (this.nameSprite) {
      this.group.remove(this.nameSprite);
      if (this.nameSprite.material) this.nameSprite.material.dispose();
      this.nameSprite = null;
    }
    if (this.nameSpriteTexture) {
      this.nameSpriteTexture.dispose();
      this.nameSpriteTexture = null;
    }
    this.removeFromScene();
  }
}

module.exports = Vehicle;
