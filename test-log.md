# 渲染进程崩溃调试日志

## 环境
- OS: Windows 10 IoT Enterprise LTSC 2021 (10.0.19044)
- GPU: NVIDIA GeForce RTX 4090, Driver 32.0.15.9159
- 分辨率: 3414x1440, scale=1.5

## 测试结果 (Electron 28.3.3)

| # | 测试内容 | 结果 | 备注 |
|---|---------|------|------|
| 1 | 空HTML + `<h1>Hello</h1>` | ✅ 通过 | |
| 2 | CSS + HTML结构 + 无script | ✅ 通过 | |
| 3 | `require('three')` | ✅ 通过 | |
| 4 | WebGLRenderer 创建 (800x600) | ✅ 通过 | |
| 5 | SceneManager 初始化 | ❌ 崩溃 | CSS2DRenderer动态import触发崩溃 |
| 6 | `require('./app.js')` 完整加载 | ❌ 崩溃 | |
| 7 | CSS + HTML + 空script | ✅ 通过 | |
| 8 | CSS + HTML + `require('./app.js')` | ❌ 崩溃 | |

## 关键发现
- WebGLRenderer 本身可以正常创建
- SceneManager 的 `await import('three/examples/jsm/renderers/CSS2DRenderer.js')` 动态import可能触发GPU进程崩溃
- 无 GPU 缓存错误（自定义 userData 目录已解决）
- 崩溃发生在页面渲染阶段，不是JS执行阶段

## 根因确认
**动态 `import()` 导致 GPU 进程崩溃**

SceneManager.js 中的 `await import('three/examples/jsm/renderers/CSS2DRenderer.js')` 触发了 Chromium GPU 进程崩溃。
改为静态 `require()` 后问题解决。

## 修复
- `SceneManager.js`: `await import(...)` → `require(...)` ← **关键修复**
- `main.js`: 添加自定义 userData 目录（避免 AppData 权限问题）
- `styles.css`: `#scene-container` 添加 min-width/min-height
- Electron 版本升级到 28.3.3

## 验证结果
✅ 应用正常启动，无崩溃
✅ Proto 加载完成（23 个消息类型）
✅ UDP 连接成功（192.1.0.80:8889）
✅ CSS2DObject 通过参数链传递，避免 ES Module require 错误

## 修改文件清单
1. `renderer/scene/SceneManager.js` - import→require, 存储 CSS2DObject
2. `renderer/entities/Vehicle.js` - 接收 CSS2DObject 参数，移除 require
3. `renderer/entities/F1Vehicle.js` - 传递 opts 参数
4. `renderer/entities/Tank99A.js` - 传递 opts 参数
5. `renderer/entities/UAVEntity.js` - 传递 opts 参数
6. `renderer/entities/VehicleManager.js` - 接收 sceneManager，传递 CSS2DObject
7. `renderer/app.js` - 传递 sceneManager 给 VehicleManager
8. `electron/main.js` - 自定义 userData 目录
9. `renderer/styles.css` - scene-container min-width/min-height
10. `package.json` - Electron 28.3.3

## 场景可见性修复 (2026-05-22)

### 问题
车辆位置在 (3478, 22, 2577)，但场景全黑无参考物。原因：
- GridHelper 只有 2000x2000，车辆在网格外
- 相机 focusOn 半径仅 200，视角太近
- 灯光位置 (100, 200, 100) 照不到远处车辆

### 修复
1. `renderer/scene/AxisHelper.js` - GridHelper 2000→20000, 轴线 500→5000
2. `renderer/scene/CameraController.js` - focusOn 半径 200→500, 重置 phi/theta
3. `renderer/scene/SceneManager.js` - 初始相机 (0,500,1000), 添加半球光, 方向光移到 (1000,2000,1000)

### 验证
✅ 应用正常启动，无崩溃
✅ 无新的渲染错误

## 态势范围可视化修复 (2026-05-22)

### 问题
1. 范围大小固定，不随数值变化
2. 雷达扫描线不动（只在调整数值时旋转）
3. 摄像头范围是线框，不是实体锥形
4. 滑块最大值需要调整

### 修复
1. `renderer/visualization/RangeVisualizer.js`:
   - 范围随数值实时调整大小（geometry 重建），0 时隐藏
   - 雷达扫描线加入 `update()` 每帧旋转
   - 摄像头范围改为半透明锥体实体（ConeGeometry + MeshBasicMaterial）
2. `renderer/ui/RightPanel.js` - 滑块最大值: 侦察 2000, 攻击 500, 雷达 100, 摄像头 1700
3. `renderer/app.js` - 动画循环调用 `rangeVisualizer.update()`

### 验证
✅ 应用正常启动，无崩溃
