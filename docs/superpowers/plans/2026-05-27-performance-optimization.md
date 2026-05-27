# 渲染延迟根治：P0 性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 250Hz 数据流下的渲染延迟与 GC 压力降下来，让表格刷新与场景渲染都不再被 UDP 接收速率耦合拖死。

**Architecture:**
- 主进程 `DataManager` 用 dirty Map 累积更新，定时（20ms）批量 IPC 发给渲染端。
- 渲染端收到批包后立即写入数据存储 + 3D 实体；表格刷新通过脏标志 + 已有 rAF 循环节流到 ~10Hz。
- `TrajectoryRenderer` 改用预分配 `Float32Array` + `DynamicDrawUsage`，避免每次重建 `BufferGeometry`。
- 热路径日志（每条消息）从 `info` 降到 `debug`，主进程默认 INFO 级日志将不再被淹没。

**Tech Stack:** Electron 28, Node.js, Three.js 0.160, protobufjs。无现有测试框架——验证以"运行 + 观察 FPS/更新频率显示 + 日志"为主。

**Verification Strategy:** 由于项目没有自动化测试基础设施，每个任务结束都通过 `npm start` 启动应用，对照 UI 上既有的「FPS」「更新频率」「车辆总数」三个指标 + 主进程 / 渲染端日志面板做人工验证。

---

## Preflight: 处理工作区现有未提交改动

当前 `renderer/app.js`、`renderer/ui/Toolbar.js`、`renderer/visualization/HeatmapVisualizer.js` 有未提交改动（共 +89/-5 行），与本计划 Task 2 会冲突。

- [ ] **Step 0.1: 让用户确认 baseline**

执行 `git status` 与 `git diff --stat HEAD` 确认改动范围。
默认策略：把现有改动作为基线先 commit（一条 `chore: baseline before perf optimization`），再开始本计划。
如果用户希望 stash，按需调整。

- [ ] **Step 0.2: 创建 baseline 提交**

```bash
git -C /d/GoGameServer-1.0/Other add renderer/app.js renderer/ui/Toolbar.js renderer/visualization/HeatmapVisualizer.js
git -C /d/GoGameServer-1.0/Other commit -m "chore: baseline before perf optimization"
```

预期：工作树干净，`git status` 显示 nothing to commit。

---

## Task 1: 降低热路径日志等级

**目的：** 让后续步骤的人工验证不被日志淹没。这一步独立、零风险，先做。

**Files:**
- Modify: `electron/main.js:127`
- Modify: `electron/main.js:142`
- Modify: `electron/udp-client.js:30`
- Modify: `electron/data-manager.js:210`（已是 debug，确认即可）

- [ ] **Step 1.1: 修改 `electron/main.js:127` 把 "收到消息" 降为 debug**

打开 `electron/main.js`，找到第 127 行：

```javascript
    log.info('收到消息:', decoded.type);
```

改为：

```javascript
    log.debug('收到消息:', decoded.type);
```

- [ ] **Step 1.2: 修改 `electron/main.js:142` 把 "批量消息" 降为 debug**

第 142 行：

```javascript
        log.info('批量消息, 数量:', msgs.length);
```

改为：

```javascript
        log.debug('批量消息, 数量:', msgs.length);
```

同时把第 152 行 `log.info('  子消息[' + i + ']:', real.type);` 与第 158 行 `log.info('  子消息[' + i + ']:', inner.type);` 都改成 `log.debug(...)`。

- [ ] **Step 1.3: 把 `udp-client.js:30` 的每包 debug 改为「按秒汇总」**

第 29-32 行原本：

```javascript
    this.socket.on('message', (msg, rinfo) => {
      log.debug('收到数据包, 来源:', rinfo.address + ':' + rinfo.port, '大小:', msg.length, 'bytes');
      this.emit('data', msg, rinfo);
    });
```

改为：

```javascript
    this._rxCount = 0;
    this._rxBytes = 0;
    this._rxStatTimer = setInterval(() => {
      if (this._rxCount > 0) {
        log.debug('UDP rx:', this._rxCount, 'pkts', this._rxBytes, 'B/s');
        this._rxCount = 0;
        this._rxBytes = 0;
      }
    }, 1000);
    this.socket.on('message', (msg, rinfo) => {
      this._rxCount++;
      this._rxBytes += msg.length;
      this.emit('data', msg, rinfo);
    });
```

同时在 `stop()` 方法里清掉这个 timer：

打开 `electron/udp-client.js`，在 `stop()` 函数体内最前面加一行（紧挨着 `if (this.heartbeatTimer)` 之前）：

```javascript
    if (this._rxStatTimer) {
      clearInterval(this._rxStatTimer);
      this._rxStatTimer = null;
    }
```

- [ ] **Step 1.4: 启动应用人工验证**

运行：

```bash
npm start
```

预期：
- 应用正常启动、能连接服务器、能看到车辆。
- 主日志面板里不再每 4ms 出现 "收到消息: Echo99ADriver" 这类。
- 把配置 `config/default.json` 的 `log.level` 临时改成 `DEBUG` 时能看到每秒一行 "UDP rx: N pkts X B/s" 汇总。验证完改回 `INFO`。

- [ ] **Step 1.5: 提交**

```bash
git add electron/main.js electron/udp-client.js
git commit -m "perf: demote hot-path message logs to debug, aggregate udp rx stats per second"
```

---

## Task 2: 渲染端表格按脏标志节流刷新

**目的：** 解决用户反馈的核心问题——表格不再被 250Hz 数据驱动，改为按 ~10Hz 刷新。3D 场景与数据存储继续保持高频，不影响精度。

**Files:**
- Modify: `renderer/app.js:32-269`（多处）

- [ ] **Step 2.1: 在 constructor 中加入节流相关状态**

打开 `renderer/app.js`，找到第 20-30 行的 constructor：

```javascript
class App {
  constructor() {
    this.vehicles = new Map();
    this.fpsFrames = 0;
    this.fpsTime = Date.now();
    this.updateCount = 0;
    this.lastUpdateRateTime = Date.now();
    this.hasFocused = false;
    // 范围显示模式：'all' 所有车辆 / 'selected' 仅选中 / 'none' 全部关闭
    this.rangeMode = 'selected';
    this.rangeModeCycle = ['selected', 'all', 'none'];
  }
```

改为：

```javascript
class App {
  constructor() {
    this.vehicles = new Map();
    this.fpsFrames = 0;
    this.fpsTime = Date.now();
    this.updateCount = 0;
    this.lastUpdateRateTime = Date.now();
    this.hasFocused = false;
    // 范围显示模式：'all' 所有车辆 / 'selected' 仅选中 / 'none' 全部关闭
    this.rangeMode = 'selected';
    this.rangeModeCycle = ['selected', 'all', 'none'];
    // 表格节流：脏标志 + 上次刷新时间
    this._listDirty = false;
    this._detailDirty = false;
    this._lastTableFlushTime = 0;
    this._tableFlushIntervalMs = 100;  // 10Hz 表格刷新
    // 缓存常用 DOM
    this._elTotalVehicles = null;
    this._elUpdateRate = null;
  }
```

- [ ] **Step 2.2: 在 `init()` 末尾缓存 DOM 引用**

`renderer/app.js:122-124`，`init()` 末尾原本：

```javascript
    log.info('应用初始化完成');
    ipcRenderer.send('renderer-ready');
  }
```

在 `log.info('应用初始化完成');` 之前插入：

```javascript
    this._elTotalVehicles = document.getElementById('total-vehicles');
    this._elUpdateRate = document.getElementById('update-rate');
```

- [ ] **Step 2.3: 改写 `onVehicleUpdate`，去掉对表格的同步刷新**

`renderer/app.js:126-165`，整个 `onVehicleUpdate` 方法替换为：

```javascript
  onVehicleUpdate(carId, data) {
    // data=null 表示该 carId 被移除（孤儿迁移、EchoDestroy 等）
    if (data === null || data === undefined) {
      this.vehicles.delete(carId);
      this.vehicleManager.removeVehicle(carId);
      this.trajectoryRenderer.remove(carId);
      if (this.rangeVisualizer && this.rangeVisualizer.removeRanges) this.rangeVisualizer.removeRanges(carId);
      this._listDirty = true;
      // 移除事件视为"重要变化"，立即刷一次
      this._flushTablesIfDirty(true);
      log.info('清除车辆:', carId);
      return;
    }

    const isNew = !this.vehicles.has(carId);
    this.vehicles.set(carId, data);
    this.updateCount++;

    const vehicle = this.vehicleManager.updateVehicle(data);
    this.trajectoryRenderer.update(vehicle);

    // 首次收到车辆时自动聚焦
    if (!this.hasFocused && data.position) {
      this.hasFocused = true;
      this.cameraController.focusOn(data.position);
      log.info('自动聚焦到车辆:', carId);
    }

    // 新车辆按当前范围模式决定要不要立即显示范围
    if (isNew) this._applyRangeForVehicle(carId, vehicle);

    // 标脏，等 rAF 循环节流刷新
    this._listDirty = true;
    if (this.leftPanel.selectedCarId === carId) this._detailDirty = true;
    // 新车要立刻在列表里显示，避免视觉延迟
    if (isNew) this._flushTablesIfDirty(true);
  }
```

- [ ] **Step 2.4: 加入 `_flushTablesIfDirty` 方法**

在 `_applyRangeForVehicle` 方法（约第 187 行）**前面**插入新方法：

```javascript
  _flushTablesIfDirty(force = false) {
    const now = Date.now();
    if (!force && now - this._lastTableFlushTime < this._tableFlushIntervalMs) return;
    if (!this._listDirty && !this._detailDirty) return;

    if (this._listDirty) {
      this.leftPanel.updateList(Array.from(this.vehicles.values()));
      this.toolbar.setVehicleCount(this.vehicles.size);
      if (this._elTotalVehicles) {
        this._elTotalVehicles.textContent = `车辆总数: ${this.vehicles.size}`;
      }
      this._listDirty = false;
    }
    if (this._detailDirty) {
      const sel = this.leftPanel.selectedCarId;
      const data = sel != null ? this.vehicles.get(sel) : null;
      if (data) this.rightPanel.showVehicle(data);
      this._detailDirty = false;
    }
    this._lastTableFlushTime = now;
  }
```

- [ ] **Step 2.5: 在 `update(delta)` 里挂上节流刷新调用**

`renderer/app.js:222-250` 是 `update(delta)`。在 `this.cameraController.update(delta);` 后面、`this.rangeVisualizer.update();` 前面插入：

```javascript
    // 节流刷新两个表格
    this._flushTablesIfDirty(false);
```

同时把 `update(delta)` 里最后两段统计代码里的：

```javascript
      document.getElementById('update-rate').textContent = `更新频率: ${this.updateCount}/s`;
```

替换为：

```javascript
      if (this._elUpdateRate) {
        this._elUpdateRate.textContent = `更新频率: ${this.updateCount}/s`;
      }
```

- [ ] **Step 2.6: 修复 `onVehicleSelect` —— 选中切换要立即刷新详情**

`renderer/app.js:167-184` 原本：

```javascript
      this.rightPanel.showVehicle(data);
```

这一行**之前**插入：

```javascript
      this._detailDirty = false;  // 即将立刻刷新，先清脏标志
```

并把 `this.rightPanel.showVehicle(data);` 保留（这里要立即显示）。

- [ ] **Step 2.7: 修复 `resetScene` 与 `setRangeMode` 中对表格的直接操作**

`resetScene` 内部已经 `this.leftPanel.updateList([])` 与 `this.rightPanel.render()`，这两处保留不变（是用户主动行为，立即刷新合理）。

`setRangeMode` 不动表格，跳过。

- [ ] **Step 2.8: 启动应用人工验证**

运行：

```bash
npm start
```

预期：
- 应用正常启动；UI 左侧车辆列表、右侧详情正常显示。
- 顶部 "更新频率" 仍接近真实接收速率（说明数据并未丢失，只是 DOM 节流）。
- 拖动右侧详情滑块、点击切换选中车辆都即时响应。
- 长时间运行（>2 分钟）后没有出现明显的"延迟越来越大"现象——通过对照「数据时间戳 vs 当前时间」或者主观感受。
- 列表里数字变化看起来是 ~10Hz 而不是 ~250Hz 的闪烁。

- [ ] **Step 2.9: 提交**

```bash
git add renderer/app.js
git commit -m "perf: throttle vehicle-list / detail panel refresh to ~10Hz via dirty flags"
```

---

## Task 3: 主进程批量 IPC

**目的：** 即使渲染端表格已节流，主进程仍然每条数据一次 `webContents.send`。批量化可以省掉 60-80% 的 IPC 序列化开销，并消除 IPC 队列堆积导致的额外延迟。

**Files:**
- Modify: `electron/data-manager.js:78-86`
- Modify: `electron/data-manager.js`（class 末尾加 dispose 方法）
- Modify: `electron/main.js:74-82`
- Modify: `renderer/app.js:116`（新增 batch 监听）

- [ ] **Step 3.1: `DataManager` 改 `notify` 为入 dirty 表 + 定时 flush**

打开 `electron/data-manager.js`。

在 constructor（第 6-11 行）末尾增加：

```javascript
    // 批量推送：carId → 最新 data（null 表示删除）。20ms 一次 flush。
    this._dirty = new Map();
    this._flushIntervalMs = 20;
    this._flushTimer = setInterval(() => this._flushDirty(), this._flushIntervalMs);
```

替换 `notify(carId, data)` 方法（第 82-86 行）：

```javascript
  notify(carId, data) {
    // 写入 dirty 表；同一 carId 多次更新会被合并为最新值
    this._dirty.set(carId, data);
  }

  _flushDirty() {
    if (this._dirty.size === 0) return;
    const batch = [];
    for (const [carId, data] of this._dirty) {
      batch.push({ carId, data });
    }
    this._dirty.clear();
    for (const cb of this.listeners) {
      cb(batch);
    }
  }

  dispose() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }
```

注意：`notify(carId, null)` 用于删除事件，仍然会作为 batch 里的一项 `{carId, data: null}` 传出去，渲染端按 null 处理。

- [ ] **Step 3.2: `main.js` 监听批量回调并改成单次 IPC**

`electron/main.js:74-82`：

```javascript
  dataManager = new DataManager();
  dataManager.onUpdate((carId, data) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('vehicle-update', { carId, data });
      }
    } catch {}
  });
```

替换为：

```javascript
  dataManager = new DataManager();
  dataManager.onUpdate((batch) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && batch.length > 0) {
        mainWindow.webContents.send('vehicle-update-batch', batch);
      }
    } catch {}
  });
```

并在 `app.on('window-all-closed', ...)` 里（第 366 行附近）调用 `dataManager.dispose()`：

原代码：

```javascript
app.on('window-all-closed', () => {
  log.info('应用退出');
  if (udpClient) udpClient.stop();
  app.quit();
});
```

改为：

```javascript
app.on('window-all-closed', () => {
  log.info('应用退出');
  if (udpClient) udpClient.stop();
  if (dataManager) dataManager.dispose();
  app.quit();
});
```

- [ ] **Step 3.3: 渲染端 `app.js` 改监听 batch 事件**

`renderer/app.js:116`：

```javascript
    ipcRenderer.on('vehicle-update', (_, { carId, data }) => this.onVehicleUpdate(carId, data));
```

替换为：

```javascript
    ipcRenderer.on('vehicle-update-batch', (_, batch) => {
      for (const item of batch) {
        this.onVehicleUpdate(item.carId, item.data);
      }
    });
```

`onVehicleUpdate` 方法本身不需要再改——它已经是单条入口。

- [ ] **Step 3.4: 启动应用人工验证**

运行：

```bash
npm start
```

预期：
- 应用正常工作，车辆出现/移动/删除都正常。
- UI 顶部「更新频率」仍接近 250 × N 车（说明 batch 里包含的条目数没丢）。
- 主进程日志面板里不再每 4ms 触发一次 IPC（这一点最直观的对比是任务管理器里 electron 主进程的 CPU 占用应明显下降）。
- 多车场景（>10 辆车）长时间运行，UI 不再有可感知的延迟累积。

- [ ] **Step 3.5: 提交**

```bash
git add electron/data-manager.js electron/main.js renderer/app.js
git commit -m "perf: batch vehicle updates from main to renderer (20ms aggregation)"
```

---

## Task 4: 轨迹渲染改环形 BufferGeometry

**目的：** 消除 `TrajectoryRenderer` 每次更新都 `new BufferGeometry().setFromPoints(...)` 的分配；改为预分配 `Float32Array` 复用，配合 `setDrawRange` 与 `needsUpdate`。

**Files:**
- Modify: `renderer/visualization/TrajectoryRenderer.js`（整文件改）

- [ ] **Step 4.1: 重写 `TrajectoryRenderer.js`**

打开 `renderer/visualization/TrajectoryRenderer.js`，整文件替换为：

```javascript
class TrajectoryRenderer {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    // carId → { line, positions, capacity }
    this.entries = new Map();
    // 与 Vehicle.maxTrajectory 对齐，避免越界拷贝
    this.maxPoints = 256;
  }

  update(vehicle) {
    const carId = vehicle.carId;
    const points = vehicle.trajectory;
    if (!points || points.length < 2) return;

    let entry = this.entries.get(carId);
    if (!entry) {
      const capacity = this.maxPoints;
      const positions = new Float32Array(capacity * 3);
      const geo = new this.THREE.BufferGeometry();
      const attr = new this.THREE.BufferAttribute(positions, 3);
      attr.setUsage(this.THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      geo.setDrawRange(0, 0);
      const color = vehicle.camp === 'blue' ? 0x2196f3 : 0xf44336;
      const mat = new this.THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
      const line = new this.THREE.Line(geo, mat);
      this.scene.add(line);
      entry = { line, positions, capacity };
      this.entries.set(carId, entry);
    }

    const count = Math.min(points.length, entry.capacity);
    const arr = entry.positions;
    for (let i = 0; i < count; i++) {
      const p = points[i];
      const base = i * 3;
      arr[base]     = p.x;
      arr[base + 1] = p.y;
      arr[base + 2] = p.z;
    }
    const attr = entry.line.geometry.attributes.position;
    attr.needsUpdate = true;
    entry.line.geometry.setDrawRange(0, count);
    // 包围盒只在偶尔需要时重算；轨迹线一般不参与 frustum culling 严格判定
    entry.line.geometry.computeBoundingSphere = noop;
  }

  remove(carId) {
    const entry = this.entries.get(carId);
    if (entry) {
      this.scene.remove(entry.line);
      entry.line.geometry.dispose();
      entry.line.material.dispose();
      this.entries.delete(carId);
    }
  }

  clear() {
    for (const carId of Array.from(this.entries.keys())) {
      this.remove(carId);
    }
  }
}

function noop() {}

module.exports = TrajectoryRenderer;
```

**注意：** `Vehicle.js` 里 `this.maxTrajectory = 200`，本任务里把 capacity 设为 256 留出余量。如果 `Vehicle.maxTrajectory` 被改大，要同步调整这里的 `this.maxPoints`。

- [ ] **Step 4.2: 启动应用人工验证**

运行：

```bash
npm start
```

预期：
- 车辆移动后能看到正常轨迹线。
- 长时间运行（>5 分钟）下，浏览器/Electron 内存增长曲线明显比之前平缓（开发者工具 → Performance 或任务管理器）。
- 切换/删除车辆时轨迹被正确清理（旋转一下视角看是否还有残留线段）。
- FPS 显著或至少不再恶化。

- [ ] **Step 4.3: 提交**

```bash
git add renderer/visualization/TrajectoryRenderer.js
git commit -m "perf: reuse preallocated Float32Array for trajectory geometry (no per-frame allocation)"
```

---

## 总验证

四个任务都完成后，做一次综合验证：

- [ ] **Step F.1: 长时间运行测试**

启动应用，连接到真实/模拟服务器，运行 ≥ 10 分钟（多车，>10 辆）。

观察指标：
- FPS 稳定在 ≥ 50（视硬件）。
- "更新频率" 数值与服务器实际发送频率一致（验证数据未丢）。
- 主观无延迟累积——切换选中车辆时右侧详情立即更新，地图上车辆位置无肉眼可见的滞后。
- 任务管理器中 Electron 进程内存增长 < 100MB / 10 分钟。

- [ ] **Step F.2: 异常路径回归**

- 服务器停掉后，UI 的"未连接"状态正确展示（不依赖于本次改动，但顺手验证）。
- 单辆车 EchoDestroy 时，3D 实体 + 列表项 + 轨迹线都被清理。
- 大量车辆同时出现（用户手动 reset scene 再连接）时无卡顿。

---

## 范围之外（明确不做）

- 不修改 LeftPanel / RightPanel 内部 `innerHTML` 重建逻辑（P2-9，下一阶段）。
- 不引入 preload.js / contextIsolation（P3-13）。
- 不补单元测试基础设施（P3-14）。
- 不改 CarID 编码启发式（P2-8）。
