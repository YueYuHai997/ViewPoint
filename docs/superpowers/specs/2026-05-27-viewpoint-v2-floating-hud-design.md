# ViewPoint v2：可拖动浮窗 HUD 设计

> **Status:** Approved（口头），待 spec review
> **Date:** 2026-05-27
> **Scope:** v2 一次性打包发布
> **Target scenarios:** 实时监控 + 外部展示

## 1. 目标与边界

### 1.1 v2 解决的问题

现有 UI 是固定的左右双列 + 顶部工具栏 + 黑色 3D 主视图，缺乏：
- **战场态势感知**：没有事件流（击毁/撞车/低血/接战），用户只能盯着每辆车的数字。
- **宏观走势**：没有双方总览、没有小地图，多车场景看不过来。
- **演示能力**：FPS、更新频率、日志面板这些调试信息对外展示不专业；缺少镜头预设和自动轮播。
- **布局调整能力**：固定栏位无法按使用习惯调整。

### 1.2 v2 不解决的问题（明确出局）

- **凶手归因**——server 的 EchoDestroy 只给被击毁方 ID，无 attacker 字段；要做需解析 bullet/damage 消息反推，单独项目。
- **真实地形 / HDRI 光影 / 天气粒子**——需要 asset pipeline 与美术资源。
- **分屏 split-view**。
- **音效**——本期纯视觉。
- **数据导出 / 回放**——本工具定位实时监控，replay 是另一个项目。

## 2. 架构总览

```
┌─────────────────── Electron 渲染进程 ────────────────────┐
│                                                          │
│   App                                                    │
│    ├─ SceneManager (Three.js, 已有)                       │
│    ├─ DataManager 已通过 IPC 接收                          │
│    │                                                     │
│    ├─ EventDetector (新)                                  │
│    │    diff(prev, cur) → 事件流                          │
│    │    └─ PubSub → KillFeed / EventLog / Toast 订阅      │
│    │                                                     │
│    ├─ PanelManager (新)                                   │
│    │    ├─ 维护 panel 列表 + z-order                      │
│    │    ├─ 拖拽 / resize / 持久化 (localStorage)           │
│    │    ├─ "重置布局" + "演示模式预设"                     │
│    │    │                                                │
│    │    └─ Panels:                                        │
│    │         ├─ LeftPanel (改造现有)                       │
│    │         ├─ RightPanel (改造现有)                      │
│    │         ├─ LogPanel (改造现有)                        │
│    │         ├─ OverviewPanel (新)                        │
│    │         ├─ KillFeedPanel (新)                        │
│    │         ├─ MinimapPanel (新)                         │
│    │         └─ EventLogPanel (新)                        │
│    │                                                     │
│    ├─ CameraPresetController (新)                         │
│    │    扩展现有 CameraController, 5 个预设               │
│    │                                                     │
│    └─ DemoMode (新)                                       │
│         状态机：开/关，开启时切换 panel 可见性、放大标签、  │
│         触发 CameraPresetController 自动轮播              │
└──────────────────────────────────────────────────────────┘
```

## 3. PanelManager 与 Panel 基类

### 3.1 PanelManager

新文件：`renderer/hud/PanelManager.js`

职责：
- 持有一个 root 容器（`<div id="hud-root">`），所有 panel mount 到这里
- 维护 `panels: Map<panelId, Panel>` + `zOrder: panelId[]`
- 拖拽控制：在某个 panel 的 header 上 `pointerdown` → 监听 document 的 `pointermove/pointerup` → 更新该 panel 的 `style.left/top`
- Resize 控制：右下角 grip `pointerdown` → 监听 → 更新 `style.width/height`
- z-order：任何 panel 被 `pointerdown` 时 `bringToFront(panelId)`
- 持久化：每次拖拽 / resize 完成时 debounce 300ms 写 `localStorage["viewpoint.layout"]`
- 公共 API：
  - `register(panel)` / `unregister(panelId)`
  - `setVisible(panelId, bool)`
  - `applyPreset(presetName)`  — 加载预定义布局
  - `resetLayout()` — 清 localStorage + 回 default
  - `getDefaultLayout()` — 返回首次启动用的硬编码 layout

### 3.2 Panel 基类

新文件：`renderer/hud/Panel.js`

```javascript
class Panel {
  constructor(id, title, opts = {}) {
    this.id = id;
    this.title = title;
    this.defaultRect = opts.defaultRect; // {x, y, w, h}
    this.minSize = opts.minSize || { w: 160, h: 80 };
    this.resizable = opts.resizable !== false;
    this.closable = opts.closable !== false;
    this.visible = true;
    this.el = null;        // 整个 panel 根 DOM
    this.bodyEl = null;    // body 内部 DOM（子类填充内容）
  }

  // 子类实现：填充 bodyEl 内容
  renderBody() { /* override */ }

  // 子类实现：每次外部数据变化时调用（PanelManager 不调度，App 显式调用）
  update(data) { /* override */ }

  // 基类提供：构造 DOM 骨架
  mount(container) { ... }
  unmount() { ... }

  setVisible(b) { ... }
  setRect({x, y, w, h}) { ... }
  bringToFront() { ... }

  serialize() { return { id, x, y, w, h, visible, z }; }
  deserialize(state) { ... }
}
```

### 3.3 DOM / CSS 结构

```html
<div id="hud-root">  <!-- absolute fill, pointer-events:none -->
  <div class="panel" id="panel-left">  <!-- absolute, pointer-events:auto -->
    <div class="panel-header">         <!-- cursor:move, drag handle -->
      <span class="panel-title">车辆列表</span>
      <button class="panel-min">－</button>
      <button class="panel-close">×</button>
    </div>
    <div class="panel-body">...</div>
    <div class="panel-resize-grip"></div>  <!-- 右下角 12×12 grip -->
  </div>
  ...
</div>
```

CSS 关键点：
- `#hud-root { position:absolute; inset:0; pointer-events:none; }`
- `.panel { position:absolute; pointer-events:auto; background:rgba(10,10,10,0.85); border:1px solid #2a2a2a; }`
- `.panel-header { cursor:move; }`
- `.panel-resize-grip { position:absolute; right:0; bottom:0; width:12px; height:12px; cursor:nwse-resize; }`

3D scene canvas 在 `#hud-root` 之下；因为 root 是 `pointer-events:none`，3D 的 orbit/zoom 不受影响；panel 自身设 `pointer-events:auto` 拦截点击。

### 3.4 持久化格式

`localStorage["viewpoint.layout"]`：

```json
{
  "version": 1,
  "panels": {
    "left":     { "x": 8,    "y": 60,  "w": 240, "h": 600, "visible": true,  "z": 1 },
    "right":    { "x": 1352, "y": 60,  "w": 240, "h": 480, "visible": true,  "z": 2 },
    "overview": { "x": 270,  "y": 60,  "w": 380, "h": 110, "visible": true,  "z": 3 },
    "killfeed": { "x": 1100, "y": 60,  "w": 240, "h": 200, "visible": true,  "z": 4 },
    "minimap":  { "x": 1352, "y": 550, "w": 240, "h": 240, "visible": true,  "z": 5 },
    "eventlog": { "x": 270,  "y": 580, "w": 400, "h": 200, "visible": false, "z": 6 },
    "log":      { "x": 8,    "y": 670, "w": 600, "h": 180, "visible": false, "z": 7 }
  },
  "demoMode": false
}
```

未来加字段时 `version` 升 +1，旧版数据 → 回 default。

## 4. EventDetector

新文件：`renderer/events/EventDetector.js`

订阅 `onVehicleUpdate`，状态机：

```javascript
class EventDetector {
  constructor() {
    this.prev = new Map();  // carId → 上一帧 vehicle 快照
    this.listeners = [];
  }

  onUpdate(carId, data) {
    if (data == null) {
      const last = this.prev.get(carId);
      this._emit({
        type: 'destroyed',
        severity: 'critical',
        carId, vehicle: last,
        cause: this._inferCause(last),
        ts: Date.now()
      });
      this.prev.delete(carId);
      return;
    }
    const prev = this.prev.get(carId);
    if (prev) this._diff(prev, data);
    this.prev.set(carId, this._snapshot(data));
  }

  _diff(prev, cur) {
    // crashed
    if (!prev.isCrash && cur.isCrash) this._emit({type:'crashed', severity:'warning', carId:cur.carId, ts:Date.now()});
    // lowHp（最大 damage 上穿 70%）
    const prevMax = Math.max(prev.damage.chassis, prev.damage.turret, prev.damage.leftTrack, prev.damage.rightTrack);
    const curMax  = Math.max(cur.damage.chassis,  cur.damage.turret,  cur.damage.leftTrack,  cur.damage.rightTrack);
    if (prevMax < 70 && curMax >= 70) this._emit({type:'lowHp', severity:'warning', carId:cur.carId, ts:Date.now()});
    // outOfAmmo
    if (prev.mainCapacity > 0 && cur.mainCapacity === 0) this._emit({type:'outOfAmmo', severity:'info', carId:cur.carId, ts:Date.now()});
    // engaged / disengaged
    const wasFar = !prev.target || prev.target.distance > 500 || prev.target.distance === 0;
    const isNear = cur.target && cur.target.distance > 0 && cur.target.distance <= 500;
    if (wasFar && isNear) this._emit({type:'engaged', severity:'info', carId:cur.carId, ts:Date.now()});
    if (!wasFar && !isNear) this._emit({type:'disengaged', severity:'debug', carId:cur.carId, ts:Date.now()});
  }

  _inferCause(last) {
    if (!last) return '被击毁';
    if (last.isCrash) return '碰撞撞毁';
    if (last.damage && last.damage.chassis >= 100) return '底盘损毁';
    if (last.damage && last.damage.turret  >= 100) return '炮塔损毁';
    return '被击毁';
  }

  _snapshot(d) {
    return {
      isCrash: d.isCrash,
      damage: { ...(d.damage || {}) },
      mainCapacity: d.mainCapacity,
      target: d.target ? { distance: d.target.distance } : null,
      carId: d.carId,
      type: d.type, camp: d.camp, number: d.number
    };
  }

  on(cb) { this.listeners.push(cb); }
  _emit(ev) { for (const cb of this.listeners) cb(ev); }
}
```

集成点：在 `App.onVehicleUpdate` 当前调用 `this.vehicleManager.updateVehicle(data)` 旁边，加 `this.eventDetector.onUpdate(carId, data)`。

## 5. 各 Panel 内容

### 5.1 LeftPanel（改造）

不改内容，只改 mounting：从 `#left-panel` 改为继承 Panel，注入 bodyEl。`updateList` 行为不变。

### 5.2 RightPanel（改造）

同 LeftPanel，body 内容不变。

### 5.3 LogPanel（改造）

同上。演示模式下默认隐藏。

### 5.4 OverviewPanel（新）

`renderer/hud/panels/OverviewPanel.js`

数据：每次 `_flushTablesIfDirty` 时（已在 app.js）顺带触发 `overviewPanel.update(this.vehicles)`。

内部聚合：

```javascript
function aggregate(vehiclesMap) {
  const stats = {
    blue: { alive: 0, totalHp: 0, engaged: 0, hits: 0, uavWorking: 0 },
    red:  { alive: 0, totalHp: 0, engaged: 0, hits: 0, uavWorking: 0 }
  };
  for (const v of vehiclesMap.values()) {
    const s = stats[v.camp]; if (!s) continue;
    s.alive++;
    const maxDmg = Math.max(v.damage?.chassis||0, v.damage?.turret||0, v.damage?.leftTrack||0, v.damage?.rightTrack||0);
    s.totalHp += Math.max(0, 100 - maxDmg);
    if (v.target?.distance > 0 && v.target.distance <= 500) s.engaged++;
    if (maxDmg > 0) s.hits++;
    if (v.type === 'UAV' && v.isWorking) s.uavWorking++;
  }
  return stats;
}
```

UI：5 行 × 3 列（指标 / 蓝 / 红）的小表，标题 "战场总览"。蓝/红列分别背景轻色调（rgba(33,150,243,0.08) / rgba(244,67,54,0.08)）。

### 5.5 KillFeedPanel（新）

`renderer/hud/panels/KillFeedPanel.js`

订阅 EventDetector，只收 `severity === 'critical'` 与 `severity === 'warning'`，每条形如：

```
🔥 F1-3 (蓝方) 被击毁 · 底盘损毁    13:42:15
⚠️ T-99A-2 (红方) 严重损伤           13:41:50
💥 UAV-5 (蓝方) 高速碰撞             13:41:32
```

数据结构：`this.feed = []`，最大 20 条。每条带 `ts` 与 `fadeAt`。

- 接入新事件 → unshift 到列表头
- 渲染时按 currentTime 计算 opacity：`if (now > fadeAt) opacity = max(0, 1 - (now - fadeAt) / 2000)`，超过 fadeAt+2000ms 从列表移除
- `fadeAt = ts + 6000`（critical）/ `ts + 4000`（warning）
- 每次新事件触发刷新；另外挂 rAF 让淡出动画顺滑（用 transform/opacity，不重排）

### 5.6 MinimapPanel（新）

`renderer/hud/panels/MinimapPanel.js`

Canvas 2D 实现：
- 创建 `<canvas width="240" height="240">` 在 panel body
- `update(vehicles, camera)` 在 `App.update(delta)` 节流到 10Hz 调用：
  1. 计算所有车辆 x/z 包络（bounding box），留 10% padding
  2. 清 canvas，画背景网格（暗色，每 100m 一线）
  3. 每车一个 4px 圆点，蓝方 #2196f3 / 红方 #f44336；选中车辆白边 + 半径 6px
  4. 主相机视锥（取 camera 位置 + lookAt + fov），投影到俯视 2D，画白色半透梯形
- 鼠标点击 canvas：
  - `getBoundingClientRect()` + 反推世界坐标
  - 找最近车辆（半径阈值 30 世界单位），调用 `onVehicleSelect(carId)`

性能：10Hz 重绘 240×240 canvas，几乎零成本。

### 5.7 EventLogPanel（新）

`renderer/hud/panels/EventLogPanel.js`

订阅 EventDetector 所有事件（不过滤 severity）。
内部 `events: Event[]`，最大 200 条，超出 FIFO。
UI：
- 顶部一行过滤复选框：[ ] 击毁  [ ] 受击  [ ] 撞车  [ ] 弹药  [ ] 接战
- 列表按时间倒序
- 默认 visible=false（在演示模式与首次启动均隐藏，需要用户主动开）

## 6. CameraPreset 与演示模式

### 6.1 CameraPresetController

新文件：`renderer/scene/CameraPresetController.js`

5 个预设：

| 名称 | 行为 |
| --- | --- |
| `overhead`   | 俯视全场，包络所有车辆 + 20% padding；复用现有 `topDownView` |
| `followSelected` | 跟随 `leftPanel.selectedCarId`；相机偏移 (0, 30, -40)，平滑跟踪 |
| `followBlue` | 跟随蓝方车辆质心；偏移同上 |
| `followRed`  | 跟随红方车辆质心 |
| `cinematic`  | 跟随选中车的后方贴身视角，偏移 (0, 8, -15)，相机略低，有电影感 |

实现：在 `App.update(delta)` 里每帧根据当前 preset 计算 target position，`CameraController.smoothMoveTo(target, lookAt, easing=0.08)`。**前置工作**：现有 `CameraController` 是否已有 `smoothMoveTo` 由 Phase 4 第一步审计——不存在则在该 Phase 内补齐为一个公共方法（lerp position + slerp 朝向）。

API：
- `set(presetName, opts)` — 切换预设，opts 可携带 `{ duration: 1500 }` 用于过渡
- `cycle(list, intervalMs)` — 在多个预设间自动轮换，演示模式用
- `stop()` — 退出 follow，恢复 orbit 自由控制

### 6.2 DemoMode

新文件：`renderer/hud/DemoMode.js`

状态：`enabled: bool`，全局单例。

`toggle()`：
- enabled = true：
  - 保存当前 layout 到 `savedLayoutBeforeDemo`
  - panelManager.applyPreset('demo')：仅显示 `overview / killfeed / minimap`，按 demo 布局摆放
  - 隐藏 toolbar 中 FPS / 更新频率 / 总数 文字（仍保留按钮）
  - 车辆 label fontSize：现有 `Vehicle.createLabel` 用 inline `font-size:16px`；DemoMode 实现时把 inline 改为 CSS class（`.vehicle-label`），并在 `body.demo-mode .vehicle-label { font-size:22px }` 覆盖。一次性把所有车辆标签的 inline font-size 去掉。
  - 启动 `cameraPresetController.cycle(['overhead', 'followBlue', 'followRed', 'followSelected'], 15000)`
- enabled = false：
  - panelManager 恢复 `savedLayoutBeforeDemo`
  - cameraPresetController.stop()
  - 移除 `.demo-mode`

触发：
- 工具栏新按钮 "演示模式" (toggle button)
- 快捷键 `Ctrl+D`

Demo 布局 preset：
```json
{
  "overview": { "x": 24, "y": 24, "w": 480, "h": 140, "visible": true, "z": 1 },
  "killfeed": { "x": 24, "y": 180, "w": 480, "h": 280, "visible": true, "z": 2 },
  "minimap":  { "x": 1376, "y": 520, "w": 220, "h": 220, "visible": true, "z": 3 }
}
```

其他 panel `visible: false`。

## 7. Toolbar 改造

工具栏（顶部，不浮窗化）新增按钮：

- **镜头 ▾**：弹出 5 个预设的下拉
- **演示模式**（toggle）
- **HUD ▾**：列出所有 panel，每行 checkbox 控制 visible
- **重置布局**（在 HUD 菜单尾部）

原有按钮（连接状态、复位视角、范围模式等）保留。

## 8. 集成到 App

`renderer/app.js` 改动：

1. `init()` 中：
   - `this.panelManager = new PanelManager(document.getElementById('hud-root'));`
   - 把 leftPanel/rightPanel/logPanel 改为新建 Panel 子类实例并 `panelManager.register(...)`
   - 新建 overviewPanel / killFeedPanel / minimapPanel / eventLogPanel 并注册
   - `this.eventDetector = new EventDetector(); this.eventDetector.on(ev => { killFeed.push(ev); eventLog.push(ev); if (ev.severity==='critical') toast(ev); });`
   - `this.cameraPresetController = new CameraPresetController(this.cameraController);`
   - `this.demoMode = new DemoMode(this.panelManager, this.cameraPresetController, this.toolbar);`
   - 读取 `localStorage["viewpoint.layout"]` 或 fallback default
2. `onVehicleUpdate(carId, data)` 在现有逻辑后追加 `this.eventDetector.onUpdate(carId, data);`
3. `_flushTablesIfDirty()` 追加：`this.overviewPanel.update(this.vehicles); this.minimapPanel.update(this.vehicles, this.sceneManager.camera);`
4. `update(delta)` 追加：`this.cameraPresetController.update(delta);`

## 9. 文件结构

新增：

```
renderer/
  hud/
    PanelManager.js
    Panel.js
    DemoMode.js
    Toast.js               # 单例 toast 工具
    panels/
      OverviewPanel.js
      KillFeedPanel.js
      MinimapPanel.js
      EventLogPanel.js
      LeftPanel.js         # 从 ui/ 迁移并改造
      RightPanel.js        # 同上
      LogPanel.js          # 同上
  events/
    EventDetector.js
  scene/
    CameraPresetController.js
```

废弃（保留兼容期一周后删）：
- `renderer/ui/LeftPanel.js` → 迁移到 `hud/panels/`
- `renderer/ui/RightPanel.js`
- `renderer/ui/LogPanel.js`

`renderer/ui/Toolbar.js` 保留位置但内容扩展。

## 10. 性能与已知风险

- **拖拽 60fps**：每次 pointermove 更新 `style.left/top`，触发 layout。对小数量 panel（≤8）无问题。
- **EventDetector diff 开销**：每次 onVehicleUpdate 做一次 shallow diff，开销 O(车辆数)，可忽略。
- **MinimapPanel 包络计算**：每次 update 遍历所有车辆求 bbox，O(N)，N=车辆数。10Hz 调用，零压力。
- **CameraPresetController cycle 切换**：演示模式每 15s 切一次，过渡 1.5s easing，无压力。
- **风险：localStorage 损坏 / version 不匹配**：fallback 到 default layout。
- **风险：panel 拖出屏幕边界**：mount 时 clamp 到 `[0, window.innerWidth - 40]` 等；window resize 时不强制 reflow（保留用户布局），但工具栏暴露 "重置布局"。
- **风险：3D 与 panel 鼠标事件穿透**：通过 root `pointer-events:none` + panel `pointer-events:auto` 解决；事件冒泡时阻止 default。

## 11. 验证

无自动化测试基础设施。验证流程：

### 11.1 单元级（手工）
- EventDetector：构造假 vehicle 数据序列 inject 入口，console 打印事件流，对照预期。
- aggregate(vehiclesMap)：构造假 Map，console 打印 stats。

### 11.2 集成级（运行 npm start）
- 拖动每个 panel，刷新窗口后位置保留
- Resize 每个 panel，下限符合 minSize
- 关闭 panel 后 HUD 菜单里可重新打开
- 重置布局回 default
- 演示模式开/关，layout 切换 + 标签变大 + 镜头轮播
- 击毁车辆 → Kill Feed 出现 + Toast 弹出 + EventLog 出现
- 撞车 → Kill Feed 出现（warning）
- 损伤上穿 70% → Kill Feed 出现
- 弹药耗尽 → EventLog 出现（不上 Kill Feed）
- 小地图点击 dot → 选中对应车辆
- 镜头预设每个走一遍

## 12. 实施分解（writing-plans 阶段细化）

预估 6 阶段：

1. **Phase 0**：基础设施 — Panel 基类 + PanelManager + CSS 框架 + 持久化
2. **Phase 1**：现有 panel 迁移 — LeftPanel / RightPanel / LogPanel 改成 Panel 子类
3. **Phase 2**：EventDetector + Toast
4. **Phase 3**：4 个新 Panel（Overview / KillFeed / Minimap / EventLog）
5. **Phase 4**：CameraPresetController + 工具栏镜头菜单
6. **Phase 5**：DemoMode + 工具栏开关 + 快捷键 + Demo 布局 preset

每个 Phase 一次提交，独立可验证。

具体 task / step 由 `writing-plans` 阶段产出。
