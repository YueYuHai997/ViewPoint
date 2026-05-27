const STORAGE_KEY = 'viewpoint.layout';
const STORAGE_VERSION = 1;

class PanelManager {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.panels = new Map();    // id → Panel
    this.zCounter = 1;
    this._dragState = null;
    this._resizeState = null;
    this._persistTimer = null;
    this._loaded = this._loadFromStorage();
    this._bindGlobalPointerEvents();
  }

  register(panel) {
    panel._manager = this;
    panel.zIndex = ++this.zCounter;
    panel.mount(this.rootEl);

    // 如有持久化布局，覆盖 default
    if (this._loaded && this._loaded.panels && this._loaded.panels[panel.id]) {
      panel.deserialize(this._loaded.panels[panel.id]);
    }

    panel.headerEl.addEventListener('pointerdown', (e) => this._startDrag(panel, e));
    panel.el.addEventListener('pointerdown', () => this.bringToFront(panel.id));
    const grip = panel.el.querySelector('.hud-panel-resize-grip');
    if (grip) grip.addEventListener('pointerdown', (e) => this._startResize(panel, e));

    this.panels.set(panel.id, panel);
    return panel;
  }

  unregister(id) {
    const p = this.panels.get(id);
    if (!p) return;
    p.unmount();
    this.panels.delete(id);
  }

  get(id) {
    return this.panels.get(id) || null;
  }

  setVisible(id, v) {
    const p = this.panels.get(id);
    if (p) p.setVisible(v);
  }

  bringToFront(id) {
    const p = this.panels.get(id);
    if (!p) return;
    p.setZ(++this.zCounter);
    this._persistSoon();
  }

  resetLayout() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    this._loaded = null;
    for (const p of this.panels.values()) {
      p.setRect({ ...p.defaultRect });
      p.minimized = false;
      p.setVisible(true);
      if (p.bodyEl) p.bodyEl.style.display = '';
      const grip = p.el && p.el.querySelector('.hud-panel-resize-grip');
      if (grip) grip.style.display = '';
    }
  }

  listPanels() {
    return Array.from(this.panels.values());
  }

  _startDrag(panel, e) {
    // 点到 actions 按钮就不进入拖拽
    if (e.target.closest('.hud-panel-actions')) return;
    e.preventDefault();
    this._dragState = {
      panel,
      startX: e.clientX,
      startY: e.clientY,
      origX: panel.rect.x,
      origY: panel.rect.y
    };
    this.bringToFront(panel.id);
  }

  _startResize(panel, e) {
    e.preventDefault();
    e.stopPropagation();
    this._resizeState = {
      panel,
      startX: e.clientX,
      startY: e.clientY,
      origW: panel.rect.w,
      origH: panel.rect.h
    };
    this.bringToFront(panel.id);
  }

  _bindGlobalPointerEvents() {
    document.addEventListener('pointermove', (e) => {
      if (this._dragState) {
        const { panel, startX, startY, origX, origY } = this._dragState;
        const nx = Math.max(0, Math.min(window.innerWidth - 40,  origX + (e.clientX - startX)));
        const ny = Math.max(0, Math.min(window.innerHeight - 40, origY + (e.clientY - startY)));
        panel.setRect({ x: nx, y: ny });
      }
      if (this._resizeState) {
        const { panel, startX, startY, origW, origH } = this._resizeState;
        const nw = Math.max(panel.minSize.w, origW + (e.clientX - startX));
        const nh = Math.max(panel.minSize.h, origH + (e.clientY - startY));
        panel.setRect({ w: nw, h: nh });
      }
    });
    document.addEventListener('pointerup', () => {
      if (this._dragState || this._resizeState) {
        this._dragState = null;
        this._resizeState = null;
        this._persistSoon();
      }
    });
  }

  _persistSoon() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => this._persistNow(), 300);
  }

  _persistNow() {
    const data = { version: STORAGE_VERSION, panels: {} };
    for (const [id, p] of this.panels) data.panels[id] = p.serialize();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // 容量满或不可用 → 忽略
    }
  }

  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== STORAGE_VERSION) return null;
      return data;
    } catch (e) {
      return null;
    }
  }
}

module.exports = PanelManager;
