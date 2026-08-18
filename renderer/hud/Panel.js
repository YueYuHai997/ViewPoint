class Panel {
  constructor(id, title, opts = {}) {
    this.id = id;
    this.title = title;
    this.defaultRect = opts.defaultRect || { x: 100, y: 100, w: 280, h: 360 };
    this.minSize = opts.minSize || { w: 160, h: 80 };
    this.resizable = opts.resizable !== false;
    this.fixed = opts.fixed === true;
    this.draggable = opts.draggable !== false && !this.fixed;
    this.closable = opts.closable !== false;
    this.minimizable = opts.minimizable !== false;
    this.visible = true;
    this.minimized = false;
    this.rect = this._resolveDefaultRect();
    this.zIndex = 1;
    this.el = null;
    this.bodyEl = null;
    this.headerEl = null;
    this._manager = null;  // PanelManager.register 时回填
  }

  mount(rootEl) {
    this.el = document.createElement('div');
    this.el.className = `hud-panel${this.fixed ? ' fixed' : ''}`;
    this.el.dataset.panelId = this.id;
    this.el.innerHTML = `
      <div class="hud-panel-header">
        <span class="hud-panel-title">${this._escape(this.title)}</span>
        <div class="hud-panel-actions">
          ${this.minimizable ? '<button class="hud-panel-min" title="最小化">－</button>' : ''}
          ${this.closable ? '<button class="hud-panel-close" title="关闭">×</button>' : ''}
        </div>
      </div>
      <div class="hud-panel-body"></div>
      ${this.resizable ? '<div class="hud-panel-resize-grip"></div>' : ''}
    `;
    this.headerEl = this.el.querySelector('.hud-panel-header');
    this.bodyEl = this.el.querySelector('.hud-panel-body');
    this._applyRect();
    this._applyZ();
    rootEl.appendChild(this.el);

    if (this.minimizable) {
      this.el.querySelector('.hud-panel-min').addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMinimize();
      });
    }
    if (this.closable) {
      this.el.querySelector('.hud-panel-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.setVisible(false);
      });
    }

    this.renderBody();
    return this;
  }

  unmount() {
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
    this.bodyEl = null;
    this.headerEl = null;
  }

  // 子类填充 bodyEl 内容
  renderBody() {}

  setVisible(v) {
    this.visible = v;
    if (this.el) this.el.style.display = v ? '' : 'none';
    if (this._manager) this._manager._persistSoon();
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
    if (this.el) {
      this.bodyEl.style.display = this.minimized ? 'none' : '';
      const grip = this.el.querySelector('.hud-panel-resize-grip');
      if (grip) grip.style.display = this.minimized ? 'none' : '';
    }
    if (this._manager) this._manager._persistSoon();
  }

  setRect(rect) {
    Object.assign(this.rect, rect);
    if (this.el) this._applyRect();
  }

  resetToDefault() {
    this.setRect(this._resolveDefaultRect());
  }

  _resolveDefaultRect() {
    return typeof this.defaultRect === 'function'
      ? { ...this.defaultRect() }
      : { ...this.defaultRect };
  }

  _applyRect() {
    const { x, y, w, h } = this.rect;
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.el.style.width = w + 'px';
    this.el.style.height = h + 'px';
  }

  setZ(z) {
    this.zIndex = z;
    if (this.el) this._applyZ();
  }

  _applyZ() {
    this.el.style.zIndex = String(this.zIndex);
  }

  serialize() {
    return {
      id: this.id,
      x: this.rect.x, y: this.rect.y, w: this.rect.w, h: this.rect.h,
      visible: this.visible, minimized: this.minimized, z: this.zIndex
    };
  }

  deserialize(state) {
    if (!state) return;
    this.rect.x = state.x !== undefined ? state.x : this.rect.x;
    this.rect.y = state.y !== undefined ? state.y : this.rect.y;
    this.rect.w = state.w !== undefined ? state.w : this.rect.w;
    this.rect.h = state.h !== undefined ? state.h : this.rect.h;
    this.visible = state.visible !== undefined ? state.visible : this.visible;
    this.minimized = state.minimized !== undefined ? state.minimized : this.minimized;
    this.zIndex = state.z !== undefined ? state.z : this.zIndex;
    if (this.el) {
      this._applyRect();
      this._applyZ();
      this.el.style.display = this.visible ? '' : 'none';
      if (this.bodyEl) this.bodyEl.style.display = this.minimized ? 'none' : '';
      const grip = this.el.querySelector('.hud-panel-resize-grip');
      if (grip) grip.style.display = this.minimized ? 'none' : '';
    }
  }

  _escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = Panel;
