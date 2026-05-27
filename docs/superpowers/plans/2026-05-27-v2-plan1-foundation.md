# ViewPoint v2 Plan 1：HUD Foundation 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可拖动浮窗 HUD 系统，并把现有的 LeftPanel / RightPanel / LogPanel 迁移到这套系统上——界面外观与行为不变，但全部面板可拖、可调大小、可隐藏、可重置布局，位置持久化到 localStorage。

**Architecture:** 新增 `renderer/hud/` 目录，包含 `Panel` 基类（DOM 骨架 / 序列化 / 显示控制）与 `PanelManager`（拖拽 / resize / z-order / localStorage 持久化）。现有 3 个 UI 模块从 `renderer/ui/` 迁移到 `renderer/hud/panels/`，改为继承 `Panel`，业务逻辑（updateList / showVehicle / addEntry 等）不变。`index.html` 移除固定栏位 div，改为单一 `#hud-root` 容器；`styles.css` 移除老的固定栏位 CSS、新增 `.hud-panel*` 系列。

**Tech Stack:** Electron 28 renderer, vanilla JS / DOM, no extra deps。

**Verification Strategy:** 无自动化测试基础设施（依旧）。每个 Task 结束做 `node --check` 语法验证 + git diff review；Phase 1 末尾跑 `npm start` 完成端到端人工验证。

**对应 Spec：** [`docs/superpowers/specs/2026-05-27-viewpoint-v2-floating-hud-design.md`](../specs/2026-05-27-viewpoint-v2-floating-hud-design.md) §3 PanelManager 与 Panel 基类、§5.1-5.3 现有 panel 改造。

---

## 文件结构（Plan 1 范围）

**新建：**
```
renderer/hud/Panel.js              — 基类
renderer/hud/PanelManager.js       — 管理器（拖拽 / resize / 持久化 / z-order）
renderer/hud/panels/LeftPanel.js   — 迁移自 renderer/ui/LeftPanel.js
renderer/hud/panels/RightPanel.js  — 迁移自 renderer/ui/RightPanel.js
renderer/hud/panels/LogPanel.js    — 迁移自 renderer/ui/LogPanel.js
```

**修改：**
```
renderer/index.html                — 删除 #left-panel/#right-panel/#log-panel div，加 #hud-root
renderer/styles.css                — 删除固定栏位 CSS，加 .hud-panel* CSS
renderer/app.js                    — 用 PanelManager 注册 3 个迁移后的 panel；改 require 路径
renderer/ui/Toolbar.js             — 加 "HUD ▾" 下拉（panel 显示开关 + 重置布局）
```

**删除（迁移完后）：**
```
renderer/ui/LeftPanel.js
renderer/ui/RightPanel.js
renderer/ui/LogPanel.js
```

---

## CSS 命名约定（避免冲突）

现有 `styles.css` 已用了 `.panel-header`、`.panel-filter`、`.panel-content` 等。新系统全部用 `.hud-` 前缀：
- `.hud-panel` / `.hud-panel-header` / `.hud-panel-title` / `.hud-panel-actions`
- `.hud-panel-body` / `.hud-panel-resize-grip`

迁移后的 LeftPanel 内部不再渲染 `<div class="panel-header"><h3>车辆列表</h3></div>`（标题已由 Panel 基类提供）。`.panel-filter` 与 `.panel-content` 这些内部 class 保留可用。

---

## Task 1: HUD 容器与基础 CSS

**Files:**
- Modify: `renderer/index.html`
- Modify: `renderer/styles.css`

- [ ] **Step 1.1：在 index.html 加 `#hud-root` 容器，删除固定栏位 div**

打开 `renderer/index.html`，把第 10-22 行的 `#app` 块整体替换。

原：

```html
  <div id="app">
    <div id="toolbar"></div>
    <div id="main-content">
      <div id="left-panel"></div>
      <div id="scene-container"></div>
      <div id="right-panel"></div>
    </div>
    <div id="log-panel"></div>
    <div id="status-bar">
      <span id="update-rate">更新频率: --</span>
      <span id="total-vehicles">车辆总数: 0</span>
    </div>
  </div>
```

改为：

```html
  <div id="app">
    <div id="toolbar"></div>
    <div id="main-content">
      <div id="scene-container"></div>
    </div>
    <div id="status-bar">
      <span id="update-rate">更新频率: --</span>
      <span id="total-vehicles">车辆总数: 0</span>
    </div>
    <div id="hud-root"></div>
  </div>
```

- [ ] **Step 1.2：在 styles.css 末尾追加 HUD CSS**

打开 `renderer/styles.css`，在文件末尾（第 484 行之后）追加：

```css

/* ===== HUD 浮窗系统 ===== */
#hud-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 100;
}

.hud-panel {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: rgba(15, 15, 15, 0.92);
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.6);
  pointer-events: auto;
  user-select: none;
  overflow: hidden;
}

.hud-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  padding: 0 10px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  cursor: move;
  flex-shrink: 0;
}

.hud-panel-title {
  font-size: 12px;
  color: #aaa;
  font-weight: bold;
}

.hud-panel-actions {
  display: flex;
  gap: 4px;
}

.hud-panel-actions button {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
}

.hud-panel-actions button:hover {
  color: #fff;
}

.hud-panel-body {
  flex: 1;
  overflow: auto;
  user-select: text;
}

.hud-panel-resize-grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, #555 50%, #555 62%, transparent 62%, transparent 72%, #555 72%, #555 84%, transparent 84%);
}
```

- [ ] **Step 1.3：删除老的固定栏位 CSS**

在 `renderer/styles.css` 删除以下整段（第 76-91 行 + 第 191-198 行 + 第 271-279 行）：

```css
/* 主内容区 */
#main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 左侧面板 */
#left-panel {
  width: 250px;
  background: #111;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
}
```

替换为：

```css
/* 主内容区（全屏 3D） */
#main-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}
```

继续删除 `#right-panel` 块：

```css
/* 右侧面板 */
#right-panel {
  width: 300px;
  background: #111;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
}
```

整段删除（不替换）。

继续删除 `#log-panel` 块：

```css
/* 日志面板 */
#log-panel {
  background: #0d0d0d;
  border-top: 1px solid #333;
  display: flex;
  flex-direction: column;
  max-height: 200px;
}
```

整段删除（不替换）。

`.log-header`、`.log-content` 等 log 相关 class **保留**（迁移后的 LogPanel 内部还在用）。

`.panel-header`、`.panel-filter`、`.panel-content` **保留**（仍被部分内部内容引用，比如 RightPanel 的 `.info-section`）。

- [ ] **Step 1.4：提交**

```bash
git add renderer/index.html renderer/styles.css
git commit -m "feat(hud): add hud-root container and base panel CSS, remove fixed layout"
```

---

## Task 2: Panel 基类

**Files:**
- Create: `renderer/hud/Panel.js`

- [ ] **Step 2.1：创建目录结构**

```bash
mkdir -p renderer/hud/panels
```

- [ ] **Step 2.2：创建 Panel 基类**

写文件 `renderer/hud/Panel.js`：

```javascript
class Panel {
  constructor(id, title, opts = {}) {
    this.id = id;
    this.title = title;
    this.defaultRect = opts.defaultRect || { x: 100, y: 100, w: 280, h: 360 };
    this.minSize = opts.minSize || { w: 160, h: 80 };
    this.resizable = opts.resizable !== false;
    this.closable = opts.closable !== false;
    this.minimizable = opts.minimizable !== false;
    this.visible = true;
    this.minimized = false;
    this.rect = { ...this.defaultRect };
    this.zIndex = 1;
    this.el = null;
    this.bodyEl = null;
    this.headerEl = null;
    this._manager = null;  // PanelManager.register 时回填
  }

  mount(rootEl) {
    this.el = document.createElement('div');
    this.el.className = 'hud-panel';
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
```

- [ ] **Step 2.3：语法检查**

```bash
node --check renderer/hud/Panel.js
```

预期：无输出（通过）。

- [ ] **Step 2.4：提交**

```bash
git add renderer/hud/Panel.js
git commit -m "feat(hud): add Panel base class with mount/serialize/visible"
```

---

## Task 3: PanelManager（含拖拽 + resize + 持久化 + z-order）

**Files:**
- Create: `renderer/hud/PanelManager.js`

- [ ] **Step 3.1：创建 PanelManager**

写文件 `renderer/hud/PanelManager.js`：

```javascript
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
```

- [ ] **Step 3.2：语法检查**

```bash
node --check renderer/hud/PanelManager.js
```

预期：无输出（通过）。

- [ ] **Step 3.3：提交**

```bash
git add renderer/hud/PanelManager.js
git commit -m "feat(hud): add PanelManager with drag/resize/z-order/localStorage persistence"
```

---

## Task 4: 迁移 LeftPanel 到 hud/panels/

**Files:**
- Create: `renderer/hud/panels/LeftPanel.js`
- Delete: `renderer/ui/LeftPanel.js`（迁移完后）

- [ ] **Step 4.1：创建迁移后的 LeftPanel**

写文件 `renderer/hud/panels/LeftPanel.js`：

```javascript
const Panel = require('../Panel');

class LeftPanel extends Panel {
  constructor(opts = {}) {
    super('left', '车辆列表', {
      defaultRect: { x: 8, y: 60, w: 240, h: 600 },
      minSize: { w: 200, h: 200 },
      closable: true,
      minimizable: true,
      resizable: true
    });
    this.onVehicleSelect = opts.onVehicleSelect || (() => {});
    this.selectedCarId = null;
    this.filterText = '';
    this.filterType = 'all';
    this._lastVehicles = [];
  }

  renderBody() {
    this.bodyEl.innerHTML = `
      <div class="panel-filter">
        <input type="text" class="filter-id" placeholder="搜索 ID..." />
        <select class="filter-type">
          <option value="all">全部类型</option>
          <option value="F1">F1</option>
          <option value="99A">99A</option>
          <option value="UAV">UAV</option>
        </select>
      </div>
      <div class="panel-content vehicle-list"></div>
    `;

    this.bodyEl.querySelector('.filter-id').addEventListener('input', (e) => {
      this.filterText = e.target.value;
      this.updateList(this._lastVehicles);
    });

    this.bodyEl.querySelector('.filter-type').addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.updateList(this._lastVehicles);
    });
  }

  updateList(vehicles = []) {
    this._lastVehicles = vehicles;
    const listEl = this.bodyEl && this.bodyEl.querySelector('.vehicle-list');
    if (!listEl) return;

    const filtered = vehicles.filter(v => {
      if (this.filterType !== 'all' && v.type !== this.filterType) return false;
      if (this.filterText && !String(v.carId).includes(this.filterText)) return false;
      return true;
    });

    const blueVehicles = filtered.filter(v => v.camp === 'blue');
    const redVehicles  = filtered.filter(v => v.camp === 'red');

    let html = '';

    if (blueVehicles.length > 0) {
      html += '<div class="camp-group"><div class="camp-header blue">蓝方</div>';
      for (const v of blueVehicles) {
        const selected = v.carId === this.selectedCarId ? 'selected' : '';
        html += `<div class="vehicle-item ${selected}" data-carid="${v.carId}">
          <span class="camp-dot blue"></span>
          <span>${v.type}-${v.number}</span>
          <span class="speed">${(v.speed || 0).toFixed(1)} m/s</span>
        </div>`;
      }
      html += '</div>';
    }

    if (redVehicles.length > 0) {
      html += '<div class="camp-group"><div class="camp-header red">红方</div>';
      for (const v of redVehicles) {
        const selected = v.carId === this.selectedCarId ? 'selected' : '';
        html += `<div class="vehicle-item ${selected}" data-carid="${v.carId}">
          <span class="camp-dot red"></span>
          <span>${v.type}-${v.number}</span>
          <span class="speed">${(v.speed || 0).toFixed(1)} m/s</span>
        </div>`;
      }
      html += '</div>';
    }

    if (filtered.length === 0) {
      html = '<div class="empty-hint">暂无车辆数据</div>';
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.vehicle-item').forEach(el => {
      el.addEventListener('click', () => {
        const carId = parseInt(el.dataset.carid);
        this.selectedCarId = carId;
        this.updateList(vehicles);
        this.onVehicleSelect(carId);
      });
    });
  }
}

module.exports = LeftPanel;
```

- [ ] **Step 4.2：语法检查**

```bash
node --check renderer/hud/panels/LeftPanel.js
```

预期：无输出（通过）。

- [ ] **Step 4.3：删除旧文件**

```bash
git rm renderer/ui/LeftPanel.js
```

- [ ] **Step 4.4：提交**

```bash
git add renderer/hud/panels/LeftPanel.js
git commit -m "refactor(hud): migrate LeftPanel to Panel base class under hud/panels/"
```

---

## Task 5: 迁移 RightPanel 到 hud/panels/

**Files:**
- Create: `renderer/hud/panels/RightPanel.js`
- Delete: `renderer/ui/RightPanel.js`

- [ ] **Step 5.1：创建迁移后的 RightPanel**

写文件 `renderer/hud/panels/RightPanel.js`：

```javascript
const Panel = require('../Panel');

const CLIENT_STATE_TEXT = {
  0: '未知', 1: '等待中', 2: '加载中', 3: '加载完毕', 4: '游戏中'
};
const CONTROL_MODE_TEXT = {
  0: '未知', 1: '键鼠', 2: '实装', 3: '智能体', 4: 'AI'
};
const BULLET_TYPE_TEXT = {
  0: '无', 1: '高炮', 2: '破甲弹', 3: '穿甲弹', 4: '导弹',
  5: '机枪', 6: '雷', 7: '左火箭', 8: '右火箭', 9: '上导弹', 10: '下导弹'
};
const GEAR_TEXT = {
  0: '无', 1: 'D', 2: 'H', 3: 'N', 4: 'R1', 5: 'R2', 6: 'PT',
  7: '遥控', 8: '自动', 9: '跟随', 10: '空挡', 11: '前进', 12: '后退', 13: '中心转向'
};
const WEATHER_TEXT = {
  0: '无', 1: '晴天', 2: '多云', 3: '阴雨', 4: '雪天', 5: '大雾',
  6: '雷阵雨', 7: '暴风雪', 8: '沙尘暴', 9: '雨夹雪'
};
const TERRAIN_TEXT = {
  0: '未知', 1: '道路', 2: '草地', 3: '土路', 4: '雪地', 5: '石路'
};

function fmtNum(v, digits = 1) {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return Number(v).toFixed(digits);
}
function fmtPct(v) {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return Number(v).toFixed(1) + '%';
}
function fmtDeg(rad) {
  if (rad === undefined || rad === null || isNaN(rad)) return '-';
  return (rad * 180 / Math.PI).toFixed(1) + '°';
}
function row(label, value) {
  return `<div class="info-row"><label>${label}:</label><span>${value}</span></div>`;
}

class RightPanel extends Panel {
  constructor(opts = {}) {
    super('right', '车辆信息', {
      defaultRect: { x: window.innerWidth - 308, y: 60, w: 300, h: 600 },
      minSize: { w: 260, h: 240 },
      closable: true,
      minimizable: true,
      resizable: true
    });
    this.selectedVehicle = null;
    this.rangeConfig = {
      scoutRange: 1500,
      attackRange: 500,
      radarRange: 100,
      cameraRange: 1500
    };
    this.onRangeChange = opts.onRangeChange || null;
  }

  renderBody() {
    this.bodyEl.innerHTML = `<div class="panel-content" id="vehicle-info-${this.id}">
      <div class="empty-hint">选择一辆车辆查看详情</div>
    </div>`;
  }

  showVehicle(vehicle) {
    const isNewSelection = !this.selectedVehicle || this.selectedVehicle.carId !== vehicle.carId;
    this.selectedVehicle = vehicle;
    const infoEl = this.bodyEl && this.bodyEl.querySelector(`#vehicle-info-${this.id}`);
    if (!infoEl || !vehicle) return;

    const pos = vehicle.position || { x: 0, y: 0, z: 0 };
    const damage = vehicle.damage || {};
    const target = vehicle.target || {};
    const env = vehicle.environment || {};
    const client = vehicle.clientInfo || null;
    const bullets = vehicle.bullets || [];

    infoEl.innerHTML = `
      <div class="info-section">
        <h4>基本信息</h4>
        ${row('车辆ID', vehicle.carId)}
        ${row('类型', vehicle.type)}
        <div class="info-row"><label>阵营:</label><span class="${vehicle.camp}">${vehicle.camp === 'blue' ? '蓝方' : vehicle.camp === 'red' ? '红方' : '未知'}</span></div>
        ${row('AI控制', vehicle.isAi ? '是' : '否')}
        ${client ? row('加载名称', client.loadName || '-') : ''}
        ${client ? row('控制方式', CONTROL_MODE_TEXT[client.controlMode] || client.controlMode || '-') : ''}
        ${vehicle.battleId ? row('对局ID', vehicle.battleId) : ''}
      </div>

      <div class="info-section">
        <h4>位置信息</h4>
        ${row('X', fmtNum(pos.x))}
        ${row('Y', fmtNum(pos.y))}
        ${row('Z', fmtNum(pos.z))}
      </div>

      <div class="info-section">
        <h4>运动状态</h4>
        ${row('前进速度', fmtNum(vehicle.speed) + ' m/s')}
        ${row('最大速度', fmtNum(vehicle.maxSpeed) + ' m/s')}
        ${row('旋转速度', fmtNum(vehicle.rotateSpeed, 2))}
        ${row('加速度', fmtNum(vehicle.acceleration, 2))}
        ${row('档位', GEAR_TEXT[vehicle.gear] || '-')}
        ${row('撞车', vehicle.isCrash ? '是' : '否')}
      </div>

      <div class="info-section">
        <h4>炮塔/瞄准</h4>
        ${row('炮塔方位', fmtDeg(vehicle.turretH))}
        ${row('炮塔俯仰', fmtDeg(vehicle.turretV))}
        ${vehicle.maxTurretV ? row('炮塔最大俯仰', fmtDeg(vehicle.maxTurretV)) : ''}
        ${row('全景方位', fmtDeg(vehicle.panoramicSightH))}
        ${row('全景俯仰', fmtDeg(vehicle.panoramicSightV))}
        ${vehicle.maxPanoramicSightV ? row('全景最大俯仰', fmtDeg(vehicle.maxPanoramicSightV)) : ''}
      </div>

      <div class="info-section">
        <h4>目标信息</h4>
        ${row('目标距离', fmtNum(target.distance) + ' m')}
        ${row('目标速度', fmtNum(target.speed) + ' m/s')}
      </div>

      <div class="info-section">
        <h4>弹药装备</h4>
        ${row('当前弹种', BULLET_TYPE_TEXT[vehicle.bulletType] || '-')}
        ${row('主炮余弹', vehicle.mainCapacity || 0)}
        ${row('弹药数组', bullets.length ? bullets.join(' / ') : '-')}
        ${row('烟幕状态', '0b' + (vehicle.smokeState || 0).toString(2).padStart(8, '0'))}
        ${row('榴弹状态', '0b' + (vehicle.grenadeState || 0).toString(2).padStart(2, '0'))}
        ${row('剩余油量', fmtNum(vehicle.gasoline))}
      </div>

      <div class="info-section">
        <h4>环境信息</h4>
        ${row('天气', WEATHER_TEXT[env.weather] || '-')}
        ${row('风力', env.windPower || 0)}
        ${row('风向', (env.windDir || 0) + '°')}
        ${row('地形', TERRAIN_TEXT[env.terrain] || '-')}
      </div>

      <div class="info-section">
        <h4>损伤状态</h4>
        ${this.renderDamageBar('底盘', damage.chassis || 0)}
        ${this.renderDamageBar('炮塔', damage.turret || 0)}
        ${this.renderDamageBar('左履带', damage.leftTrack || 0)}
        ${this.renderDamageBar('右履带', damage.rightTrack || 0)}
      </div>

      ${client ? `
      <div class="info-section">
        <h4>客户端信息</h4>
        ${row('IP', client.ip || '-')}
        ${row('端口', client.port || '-')}
        ${row('类型', client.clientType || '-')}
        ${client.groupLeadId ? row('组长ID', client.groupLeadId) : ''}
        ${row('状态', CLIENT_STATE_TEXT[client.clientState] || '-')}
      </div>

      <div class="info-section">
        <h4>资源占用</h4>
        ${row('CPU', fmtPct(client.cpu))}
        ${row('GPU', fmtPct(client.gpu))}
        ${row('内存', fmtPct(client.memory))}
        ${row('FPS', client.fps || 0)}
      </div>
      ` : ''}

      <div class="info-section">
        <h4>态势范围</h4>
        <div class="range-control">
          <label>侦察范围 (m):</label>
          <input type="range" class="range-scout" min="0" max="2000" value="${this.rangeConfig.scoutRange}" />
          <span class="range-scout-val">${this.rangeConfig.scoutRange}</span>
        </div>
        <div class="range-control">
          <label>攻击范围 (m):</label>
          <input type="range" class="range-attack" min="0" max="500" value="${this.rangeConfig.attackRange}" />
          <span class="range-attack-val">${this.rangeConfig.attackRange}</span>
        </div>
        <div class="range-control">
          <label>雷达范围 (m):</label>
          <input type="range" class="range-radar" min="0" max="100" value="${this.rangeConfig.radarRange}" />
          <span class="range-radar-val">${this.rangeConfig.radarRange}</span>
        </div>
        <div class="range-control">
          <label>摄像头范围 (m):</label>
          <input type="range" class="range-camera" min="0" max="1700" value="${this.rangeConfig.cameraRange}" />
          <span class="range-camera-val">${this.rangeConfig.cameraRange}</span>
        </div>
      </div>
    `;

    const rangeTypes = ['scout', 'attack', 'radar', 'camera'];
    for (const type of rangeTypes) {
      const slider = infoEl.querySelector(`.range-${type}`);
      const valSpan = infoEl.querySelector(`.range-${type}-val`);
      if (slider) {
        slider.addEventListener('input', () => {
          const val = parseInt(slider.value);
          this.rangeConfig[type + 'Range'] = val;
          valSpan.textContent = val;
          if (this.onRangeChange) this.onRangeChange(vehicle.carId, this.rangeConfig);
        });
      }
    }

    if (isNewSelection && this.onRangeChange) {
      this.onRangeChange(vehicle.carId, this.rangeConfig);
    }
  }

  renderDamageBar(label, value) {
    const color = value > 70 ? '#f44336' : value > 30 ? '#ff9800' : '#4caf50';
    return `
      <div class="damage-row">
        <label>${label}:</label>
        <div class="damage-bar">
          <div class="damage-fill" style="width:${value}%; background:${color}"></div>
        </div>
        <span>${value.toFixed(0)}%</span>
      </div>
    `;
  }
}

module.exports = RightPanel;
```

**注意：** 原 RightPanel 用 `id` 选择器（`#range-scout` 等），多 panel 实例时会冲突。迁移后改为 class 选择器（`.range-scout`）并通过 `infoEl.querySelector` 限定作用域。

- [ ] **Step 5.2：语法检查**

```bash
node --check renderer/hud/panels/RightPanel.js
```

预期：无输出。

- [ ] **Step 5.3：删除旧文件**

```bash
git rm renderer/ui/RightPanel.js
```

- [ ] **Step 5.4：提交**

```bash
git add renderer/hud/panels/RightPanel.js
git commit -m "refactor(hud): migrate RightPanel to Panel base class, use class selectors for sliders"
```

---

## Task 6: 迁移 LogPanel 到 hud/panels/

**Files:**
- Create: `renderer/hud/panels/LogPanel.js`
- Delete: `renderer/ui/LogPanel.js`

- [ ] **Step 6.1：创建迁移后的 LogPanel**

写文件 `renderer/hud/panels/LogPanel.js`：

```javascript
const Panel = require('../Panel');
const Logger = require('../../../electron/logger');
const { ipcRenderer } = require('electron');

const log = Logger.create('LogPanel');

class LogPanel extends Panel {
  constructor(opts = {}) {
    super('log', '日志', {
      defaultRect: { x: 8, y: window.innerHeight - 240, w: 600, h: 200 },
      minSize: { w: 360, h: 120 },
      closable: true,
      minimizable: true,
      resizable: true
    });
    this.entries = [];
    this.maxEntries = 500;
    this.autoScroll = true;
    this.filterLevel = 'DEBUG';
    this.contentEl = null;
  }

  renderBody() {
    this.bodyEl.innerHTML = `
      <div class="log-header">
        <span class="log-title">日志</span>
        <div class="log-controls">
          <select class="log-level-filter">
            <option value="DEBUG">DEBUG</option>
            <option value="INFO" selected>INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
          <button class="log-clear" title="清空日志">清空</button>
        </div>
      </div>
      <div class="log-content"></div>
    `;

    this.contentEl = this.bodyEl.querySelector('.log-content');

    this.bodyEl.querySelector('.log-level-filter').addEventListener('change', (e) => {
      this.filterLevel = e.target.value;
      this.refreshDisplay();
      ipcRenderer.invoke('set-log-level', this.filterLevel);
      log.info('日志显示等级:', this.filterLevel);
    });

    this.bodyEl.querySelector('.log-clear').addEventListener('click', () => {
      this.entries = [];
      this.contentEl.innerHTML = '';
    });

    this.bindIPC();
    this.bindLogger();
  }

  bindIPC() {
    ipcRenderer.on('log-entry', (_, entry) => {
      this.addEntry(entry);
    });
  }

  bindLogger() {
    Logger.onGlobalLog((entry) => {
      this.addEntry(entry);
    });
  }

  addEntry(entry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    if (!this.contentEl) return;

    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    if (levels[entry.level] < levels[this.filterLevel]) return;

    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="log-time">${entry.time}</span><span class="log-level" style="color:${entry.color}">[${entry.level}]</span><span class="log-module">[${entry.module}]</span><span class="log-msg">${this.escapeHtml(entry.message)}</span>`;
    this.contentEl.appendChild(line);

    while (this.contentEl.children.length > this.maxEntries) {
      this.contentEl.removeChild(this.contentEl.firstChild);
    }

    if (this.autoScroll) {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  }

  refreshDisplay() {
    if (!this.contentEl) return;
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    this.contentEl.innerHTML = '';
    for (const entry of this.entries) {
      if (levels[entry.level] < levels[this.filterLevel]) continue;
      const line = document.createElement('div');
      line.className = 'log-line';
      line.innerHTML = `<span class="log-time">${entry.time}</span><span class="log-level" style="color:${entry.color}">[${entry.level}]</span><span class="log-module">[${entry.module}]</span><span class="log-msg">${this.escapeHtml(entry.message)}</span>`;
      this.contentEl.appendChild(line);
    }
    if (this.autoScroll) {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  }

  escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = LogPanel;
```

**注意：** Logger.js 的相对路径变化——原 `renderer/ui/LogPanel.js` 写 `require('../../electron/logger')`；新位置 `renderer/hud/panels/LogPanel.js` 要写 `require('../../../electron/logger')`。

- [ ] **Step 6.2：语法检查**

```bash
node --check renderer/hud/panels/LogPanel.js
```

预期：无输出。

- [ ] **Step 6.3：删除旧文件**

```bash
git rm renderer/ui/LogPanel.js
```

- [ ] **Step 6.4：提交**

```bash
git add renderer/hud/panels/LogPanel.js
git commit -m "refactor(hud): migrate LogPanel to Panel base class with adjusted require path"
```

---

## Task 7: 改 app.js — 用 PanelManager 注册 3 个 panel

**Files:**
- Modify: `renderer/app.js`

- [ ] **Step 7.1：更新 import**

打开 `renderer/app.js`，找到第 10-13 行：

```javascript
const LeftPanel = require('./ui/LeftPanel');
const RightPanel = require('./ui/RightPanel');
const Toolbar = require('./ui/Toolbar');
const LogPanel = require('./ui/LogPanel');
```

替换为：

```javascript
const PanelManager = require('./hud/PanelManager');
const LeftPanel = require('./hud/panels/LeftPanel');
const RightPanel = require('./hud/panels/RightPanel');
const LogPanel = require('./hud/panels/LogPanel');
const Toolbar = require('./ui/Toolbar');
```

- [ ] **Step 7.2：替换 LogPanel 初始化**

找到 `init()` 中（约第 42 行）：

```javascript
    // 初始化日志面板
    this.logPanel = new LogPanel(document.getElementById('log-panel'));
```

替换为：

```javascript
    // 初始化 HUD 面板系统
    this.panelManager = new PanelManager(document.getElementById('hud-root'));
    this.logPanel = new LogPanel();
    this.panelManager.register(this.logPanel);
```

- [ ] **Step 7.3：替换 LeftPanel 初始化**

找到（约第 66-69 行）：

```javascript
    this.leftPanel = new LeftPanel(
      document.getElementById('left-panel'),
      (carId) => this.onVehicleSelect(carId)
    );
```

替换为：

```javascript
    this.leftPanel = new LeftPanel({
      onVehicleSelect: (carId) => this.onVehicleSelect(carId)
    });
    this.panelManager.register(this.leftPanel);
```

- [ ] **Step 7.4：替换 RightPanel 初始化**

找到（约第 71-84 行）：

```javascript
    this.rightPanel = new RightPanel(document.getElementById('right-panel'));
    this.rightPanel.onRangeChange = (carId, config) => {
      if (this.rangeMode === 'none') return;
      if (this.rangeMode === 'all') {
        // 滑块变化时所有车辆同步刷新
        for (const v of this.vehicleManager.getAllVehicles()) {
          this.rangeVisualizer.updateRanges(v, config);
        }
        return;
      }
      // 'selected' 模式：只更新当前选中
      const vehicle = this.vehicleManager.getVehicle(carId);
      if (vehicle) this.rangeVisualizer.updateRanges(vehicle, config);
    };
```

替换为：

```javascript
    this.rightPanel = new RightPanel({
      onRangeChange: (carId, config) => {
        if (this.rangeMode === 'none') return;
        if (this.rangeMode === 'all') {
          for (const v of this.vehicleManager.getAllVehicles()) {
            this.rangeVisualizer.updateRanges(v, config);
          }
          return;
        }
        const vehicle = this.vehicleManager.getVehicle(carId);
        if (vehicle) this.rangeVisualizer.updateRanges(vehicle, config);
      }
    });
    this.panelManager.register(this.rightPanel);
```

- [ ] **Step 7.5：检查 resetScene() 里的 `rightPanel.render()` 调用**

找到 `resetScene()` 方法（约第 252-262 行）：

```javascript
    this.rightPanel.render();
```

替换为：

```javascript
    this.rightPanel.selectedVehicle = null;
    if (this.rightPanel.bodyEl) {
      this.rightPanel.bodyEl.innerHTML = `<div class="panel-content"><div class="empty-hint">选择一辆车辆查看详情</div></div>`;
    }
```

（迁移后 RightPanel 没 `render()` 公共方法了，`renderBody()` 由 Panel 基类调用一次。reset 需要把 body 内容拍回空态。）

- [ ] **Step 7.6：语法检查**

```bash
node --check renderer/app.js
```

预期：无输出。

- [ ] **Step 7.7：提交**

```bash
git add renderer/app.js
git commit -m "feat(hud): wire PanelManager into App, replace direct panel constructions"
```

---

## Task 8: Toolbar 加 "HUD ▾" 下拉（显示/隐藏 + 重置布局）

**Files:**
- Modify: `renderer/ui/Toolbar.js`
- Modify: `renderer/app.js`（把 panelManager 传给 Toolbar）

当前 `Toolbar` 类签名 `constructor(container, callbacks)`，render 用 innerHTML 一次性写 toolbar-left/center/right 三段；每个按钮用 `id="btn-xxx"` 选择器绑定。新加按钮放在 `toolbar-left` 末尾，菜单 DOM 放在 `toolbar-right` 前面便于浮出。

- [ ] **Step 8.1：替换 `Toolbar` 整个 constructor 与 render**

打开 `renderer/ui/Toolbar.js`，把第 1-54 行整段（constructor + render）替换为：

```javascript
class Toolbar {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks || {};
    this.panelManager = (callbacks && callbacks.panelManager) || null;
    this.connected = false;
    this.render();
    // 点其它地方关闭 HUD 菜单
    this._docClickHandler = (e) => {
      if (!this.container.contains(e.target)) {
        const m = this.container.querySelector('.hud-menu');
        if (m) m.style.display = 'none';
      }
    };
    document.addEventListener('click', this._docClickHandler);
  }

  render() {
    this.container.innerHTML = `
      <div class="toolbar-left">
        <button id="btn-reset-view" title="复位视角 (R)">视角复位</button>
        <button id="btn-top-view" title="切换到顶视图">顶视图</button>
        <button id="btn-range-mode" title="切换范围显示模式">范围: 仅选中</button>
        <button id="btn-heatmap" title="切换战场热力图">热力图</button>
        <button id="btn-reset-scene" title="重置场景">场景重置</button>
        <div class="hud-menu-wrap" style="position:relative; display:inline-block">
          <button class="hud-menu-btn" id="btn-hud-menu" title="HUD 面板控制">HUD ▾</button>
          <div class="hud-menu" style="display:none; position:absolute; left:0; top:100%; margin-top:4px; background:#1a1a1a; border:1px solid #333; padding:6px 0; min-width:180px; z-index:200; border-radius:3px; box-shadow:0 4px 12px rgba(0,0,0,0.6)"></div>
        </div>
      </div>
      <div class="toolbar-center">
        <span class="toolbar-title">ViewPoint - 三维战场态势</span>
      </div>
      <div class="toolbar-right">
        <span id="connection-status" class="status-dot disconnected">未连接</span>
        <span id="room-info">房间: --</span>
        <span id="vehicle-count">车辆: 0</span>
        <span id="fps-display">FPS: --</span>
      </div>
    `;

    this.container.querySelector('#btn-reset-view').addEventListener('click', () => {
      if (this.callbacks.onResetView) this.callbacks.onResetView();
    });

    this.container.querySelector('#btn-top-view').addEventListener('click', () => {
      if (this.callbacks.onTopView) this.callbacks.onTopView();
    });

    this.container.querySelector('#btn-range-mode').addEventListener('click', () => {
      if (this.callbacks.onCycleRangeMode) {
        const mode = this.callbacks.onCycleRangeMode();
        this.setRangeMode(mode);
      }
    });

    this.container.querySelector('#btn-heatmap').addEventListener('click', () => {
      if (this.callbacks.onToggleHeatmap) {
        const on = this.callbacks.onToggleHeatmap();
        this.setHeatmapActive(!!on);
      }
    });

    this.container.querySelector('#btn-reset-scene').addEventListener('click', () => {
      if (this.callbacks.onResetScene) this.callbacks.onResetScene();
    });

    this.container.querySelector('#btn-hud-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleHudMenu();
    });
  }
```

注意：原文件后续方法（setRangeMode / setHeatmapActive / setConnectionStatus / setRoomId / setVehicleCount / setFPS）保留，不动。

- [ ] **Step 8.2：在 Toolbar 类内追加 `_toggleHudMenu` 与 `_escape` 方法**

`renderer/ui/Toolbar.js` 在 `setFPS` 方法（约文件末尾的最后一个方法）之后、class 结束 `}` 之前插入：

```javascript
  _toggleHudMenu() {
    const menuEl = this.container.querySelector('.hud-menu');
    if (!menuEl) return;
    if (!this.panelManager) {
      menuEl.style.display = 'none';
      return;
    }
    if (menuEl.style.display === 'block') {
      menuEl.style.display = 'none';
      return;
    }
    let html = '';
    for (const p of this.panelManager.listPanels()) {
      const checked = p.visible ? 'checked' : '';
      html += `<label style="display:block; padding:4px 12px; font-size:12px; color:#ccc; cursor:pointer">
        <input type="checkbox" data-panel-id="${p.id}" ${checked} style="margin-right:6px"/>${this._escape(p.title)}
      </label>`;
    }
    html += '<hr style="border:none; border-top:1px solid #333; margin:6px 0"/>';
    html += '<button class="reset-layout-btn" style="display:block; width:100%; text-align:left; padding:4px 12px; font-size:12px; color:#f44; background:transparent; border:none; cursor:pointer">重置布局</button>';
    menuEl.innerHTML = html;
    menuEl.style.display = 'block';

    menuEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        this.panelManager.setVisible(cb.dataset.panelId, cb.checked);
      });
    });
    menuEl.querySelector('.reset-layout-btn').addEventListener('click', () => {
      if (confirm('确定重置 HUD 布局到默认？')) {
        this.panelManager.resetLayout();
        menuEl.style.display = 'none';
      }
    });
  }

  _escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
```

- [ ] **Step 8.3：在 app.js 把 panelManager 传给 Toolbar**

打开 `renderer/app.js`，找到现有的 `new Toolbar(...)` 调用块（Task 7 之前是这样的）：

```javascript
    this.toolbar = new Toolbar(document.getElementById('toolbar'), {
      onResetView: () => {
        this.cameraController.reset();
        log.info('视角已复位');
      },
      onTopView: () => {
        const list = Array.from(this.vehicles.values());
        this.cameraController.topDownView(list);
        log.info('切换到顶视图，覆盖车辆数:', list.length);
      },
      onCycleRangeMode: () => {
        const idx = this.rangeModeCycle.indexOf(this.rangeMode);
        const next = this.rangeModeCycle[(idx + 1) % this.rangeModeCycle.length];
        this.setRangeMode(next);
        return this.rangeMode;
      },
      onToggleHeatmap: () => {
        const on = this.heatmap.toggle();
        if (on) this.heatmap.update(Array.from(this.vehicles.values()));
        log.info('热力图:', on ? '开启' : '关闭');
        return on;
      },
      onResetScene: () => this.resetScene()
    });
```

把 callbacks 对象的最后一行 `onResetScene: () => this.resetScene()` 改为：

```javascript
      onResetScene: () => this.resetScene(),
      panelManager: this.panelManager
```

**顺序确认：** `this.panelManager = new PanelManager(...)` 在 Task 7 Step 7.2 已经移到了 leftPanel/rightPanel/logPanel 初始化之前。Toolbar 初始化在 `init()` 里位于这些之后（原本约第 86 行），所以 `this.panelManager` 此时已就绪。

- [ ] **Step 8.4：语法检查**

```bash
node --check renderer/ui/Toolbar.js && node --check renderer/app.js
```

预期：无输出。

- [ ] **Step 8.5：提交**

```bash
git add renderer/ui/Toolbar.js renderer/app.js
git commit -m "feat(hud): add HUD menu with panel visibility toggles and reset layout button"
```

---

## Task 9: 端到端人工验证

**Files:** 无修改

- [ ] **Step 9.1：启动应用**

```bash
npm start
```

- [ ] **Step 9.2：跑验证 checklist**

逐项检查、对照预期：

| 验证项 | 预期 |
| --- | --- |
| 启动后能看到 3 个浮窗：车辆列表（左上）、车辆信息（右上）、日志（左下）；3D 场景占满中间 | ✓ |
| 用鼠标按住任一 panel 标题栏，拖到屏幕另一处 | panel 跟随光标移动 |
| 拖动 panel 时其它操作（3D orbit）不响应 | 仅 panel 移动 |
| 把 panel 拖出屏幕边缘 | 受限制（最多到屏外 40px） |
| 用右下角 grip 拖拽 resize panel | panel 改变大小 |
| resize 到极小 | 不小于 minSize（160×80） |
| 在 panel 标题栏按 `－` | body 折叠，仅剩标题栏 |
| 再按一次 `－` | body 恢复 |
| 在 panel 标题栏按 `×` | panel 隐藏 |
| 点击工具栏 "HUD ▾" | 弹出下拉，3 个 panel 都列出，可勾选 |
| 在下拉勾选已隐藏 panel 的 checkbox | panel 重新出现在上次位置 |
| 在下拉点击 "重置布局" → 确认 | 所有 panel 回到 default 位置和大小 |
| 关闭应用、再启动 | panel 位置/大小/可见性 保留 |
| 关闭应用、用 DevTools 控制台执行 `localStorage.removeItem('viewpoint.layout')` 后再启动 | panel 回到 default |
| 收到 vehicle-update 数据 | 车辆列表正常更新（说明 LeftPanel.updateList 工作正常） |
| 点击列表中某车辆 | 右侧详情面板显示该车数据（说明 RightPanel.showVehicle 工作正常） |
| 拖动右侧详情面板的"侦察范围"滑块 | 3D 场景中范围圈跟随变化（说明 onRangeChange 回调链路通） |
| 顶部"重置场景" | 3D 清空，详情面板回到 "选择一辆车辆查看详情" |

- [ ] **Step 9.3：报告**

无 Step 9.3 commit——这一步只确认验证全过。

任何一项不过：
- 停下来诊断，**不要**为了通过验证而软改 checklist
- 修复后重跑 9.2

全过则 Plan 1 完成，回告"Plan 1 全过，可以写 Plan 2"。

---

## 范围之外（明确不做）

本计划范围**严格**为 Spec §3 + §5.1-5.3：

- **不实现** OverviewPanel / KillFeedPanel / MinimapPanel / EventLogPanel → Plan 2
- **不实现** EventDetector / Toast → Plan 2
- **不实现** CameraPreset / DemoMode → Plan 3
- **不引入** 自动化测试基础设施（jest 等）→ 永远不做，除非用户明确要

## 已知风险

- **拖到屏外**：clamp 到 `[0, viewport-40]`，不会完全丢；但用户 resize 窗口后位置可能不再合理 → 用 "重置布局" 解决。
- **panel 在 3D canvas 之上挡住鼠标**：因 `#hud-root { pointer-events:none }` + `.hud-panel { pointer-events:auto }`，panel 之间空隙的事件会穿透到 3D，符合预期。
- **localStorage 容量**：layout JSON 大约 1KB，不构成压力。
- **panel header 拖拽时选中文字**：通过 `.hud-panel { user-select:none }` 解决；但 body 内仍 `user-select:text`，可正常复制内容。
