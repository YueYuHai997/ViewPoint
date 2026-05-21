# ViewPoint 三维战场可视化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建基于 Electron + Three.js 的三维战场信息可视化桌面应用，实时接收 UDP Proto 数据，渲染车辆实体与态势范围。

**Architecture:** Electron 主进程处理 UDP 通信和 Proto 解析，通过 IPC 将数据推送到渲染进程。渲染进程使用 Three.js 渲染三维场景，HTML/CSS 构建左右面板 UI。

**Tech Stack:** Electron 28+, Three.js, protobufjs, Node.js dgram, HTML/CSS/原生 JS

---

## 文件结构总览

```
ViewPoint/
├── package.json
├── config/
│   └── default.json
├── proto/
│   ├── net.proto (已有)
│   ├── net_frame.proto (已有)
│   └── net_info.proto (已有)
├── electron/
│   ├── main.js
│   ├── preload.js
│   ├── udp-client.js
│   ├── proto-parser.js
│   └── data-manager.js
└── renderer/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── scene/
    │   ├── SceneManager.js
    │   ├── CameraController.js
    │   └── AxisHelper.js
    ├── entities/
    │   ├── Vehicle.js
    │   ├── F1Vehicle.js
    │   ├── Tank99A.js
    │   ├── UAVEntity.js
    │   └── VehicleManager.js
    ├── visualization/
    │   ├── RangeVisualizer.js
    │   └── TrajectoryRenderer.js
    └── ui/
        ├── LeftPanel.js
        ├── RightPanel.js
        └── Toolbar.js
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `config/default.json`
- Create: `electron/preload.js`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "viewpoint",
  "version": "1.0.0",
  "description": "三维战场信息可视化软件",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev"
  },
  "dependencies": {
    "electron": "^28.0.0",
    "protobufjs": "^7.2.5",
    "three": "^0.160.0"
  }
}
```

- [ ] **Step 2: 创建配置文件 config/default.json**

```json
{
  "server": {
    "ip": "192.10.10.80",
    "port": 20003
  },
  "room": {
    "id": 1
  },
  "login": {
    "account": "root",
    "password": "1"
  },
  "display": {
    "showGrid": true,
    "showAxis": true,
    "showTrajectory": true
  }
}
```

- [ ] **Step 3: 创建 preload.js**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onVehicleUpdate: (callback) => ipcRenderer.on('vehicle-update', (_, data) => callback(data)),
  onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (_, status) => callback(status)),
  sendCommand: (channel, data) => ipcRenderer.send(channel, data),
  getConfig: () => ipcRenderer.invoke('get-config')
});
```

- [ ] **Step 4: 安装依赖并验证**

Run: `cd D:\GoGameServer-1.0\ViewPoint && npm install`
Expected: node_modules 目录创建成功，无报错

- [ ] **Step 5: Commit**

```bash
git add package.json config/default.json electron/preload.js
git commit -m "feat: 项目脚手架初始化"
```

---

### Task 2: Proto 解析模块

**Files:**
- Create: `electron/proto-parser.js`

- [ ] **Step 1: 创建 proto-parser.js**

```javascript
const protobuf = require('protobufjs');
const path = require('path');

class ProtoParser {
  constructor() {
    this.root = null;
    this.messageTypes = {};
  }

  async init() {
    const protoDir = path.join(__dirname, '..', 'proto');
    this.root = await protobuf.load([
      path.join(protoDir, 'net_frame.proto'),
      path.join(protoDir, 'net_info.proto'),
      path.join(protoDir, 'net.proto')
    ]);

    // 预加载常用消息类型
    const typeNames = [
      'NetMessage', 'MsgCombineSend', 'req_Login',
      'UploadCarInfo', 'UploadRadar', 'UploadUAVInfo',
      'EchoCreate', 'SyncBase', 'Base',
      'Echo99ADriver', 'Echo99AGunner', 'EchoF1Driver', 'EchoF1Gunner',
      'EchoF1AI', 'EchoFire', 'EchoHit', 'UpHit'
    ];

    for (const name of typeNames) {
      const type = this.root.lookupType(name);
      if (type) {
        this.messageTypes[name] = type;
      }
    }

    console.log('[ProtoParser] 初始化完成，已加载消息类型:', Object.keys(this.messageTypes).join(', '));
  }

  decodeMessage(buffer) {
    try {
      const NetMessage = this.messageTypes['NetMessage'];
      if (!NetMessage) return null;
      return NetMessage.decode(buffer);
    } catch (err) {
      console.error('[ProtoParser] 解码NetMessage失败:', err.message);
      return null;
    }
  }

  decodeAny(typeUrl, value) {
    if (!typeUrl || !value) return null;

    // typeUrl 格式: "type.googleapis.com/package.MessageName"
    const typeName = typeUrl.split('/').pop();
    const type = this.messageTypes[typeName] || this.root.lookupType(typeName);

    if (!type) {
      console.warn('[ProtoParser] 未知消息类型:', typeName);
      return null;
    }

    try {
      return { type: typeName, data: type.decode(value) };
    } catch (err) {
      console.error('[ProtoParser] 解码', typeName, '失败:', err.message);
      return null;
    }
  }

  encodeMessage(typeName, data) {
    const type = this.messageTypes[typeName];
    if (!type) {
      console.error('[ProtoParser] 未找到消息类型:', typeName);
      return null;
    }
    try {
      const message = type.create(data);
      return type.encode(message).finish();
    } catch (err) {
      console.error('[ProtoParser] 编码', typeName, '失败:', err.message);
      return null;
    }
  }

  getMessageType(name) {
    return this.messageTypes[name] || null;
  }
}

module.exports = ProtoParser;
```

- [ ] **Step 2: 验证 Proto 加载**

在项目根目录创建临时测试脚本 `test-proto.js`:

```javascript
const ProtoParser = require('./electron/proto-parser');

async function test() {
  const parser = new ProtoParser();
  await parser.init();
  console.log('测试编码 req_Login:');
  const encoded = parser.encodeMessage('req_Login', { account: 'root', password: '1' });
  console.log('编码结果:', Buffer.from(encoded).toString('hex'));
  console.log('Proto 解析模块测试通过');
}

test().catch(console.error);
```

Run: `node test-proto.js`
Expected: 输出已加载消息类型列表，编码结果为 hex 字符串，无报错

- [ ] **Step 3: 清理测试文件并 Commit**

```bash
rm test-proto.js
git add electron/proto-parser.js
git commit -m "feat: Proto 解析模块，支持动态加载 proto 文件编解码"
```

---

### Task 3: UDP 客户端模块

**Files:**
- Create: `electron/udp-client.js`

- [ ] **Step 1: 创建 udp-client.js**

```javascript
const dgram = require('dgram');
const EventEmitter = require('events');

class UDPClient extends EventEmitter {
  constructor(config) {
    super();
    this.serverIp = config.server.ip;
    this.serverPort = config.server.port;
    this.roomId = config.room.id;
    this.account = config.login.account;
    this.password = config.login.password;
    this.socket = null;
    this.connected = false;
  }

  start() {
    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg, rinfo) => {
      this.emit('data', msg, rinfo);
    });

    this.socket.on('error', (err) => {
      console.error('[UDPClient] Socket 错误:', err);
      this.emit('error', err);
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.emit('disconnected');
    });

    // 绑定本地端口
    this.socket.bind(() => {
      console.log('[UDPClient] Socket 已绑定，本地端口:', this.socket.address().port);
      this.sendLogin();
    });
  }

  sendLogin() {
    const ProtoParser = require('./proto-parser');
    const parser = new ProtoParser();

    parser.init().then(() => {
      // 构造 req_Login 消息
      const loginData = {
        account: this.account,
        password: String(this.roomId)
      };

      const NetMessage = parser.getMessageType('NetMessage');
      const reqLogin = parser.getMessageType('req_Login');

      if (!NetMessage || !reqLogin) {
        console.error('[UDPClient] 消息类型未找到');
        return;
      }

      // 创建 LoginInfo (Any 包裹)
      const loginMessage = reqLogin.create(loginData);
      const loginBuffer = reqLogin.encode(loginMessage).finish();

      // 创建 NetMessage
      const netMsg = NetMessage.create({
        client_id: 'viewpoint',
        object_id: 0,
        msg: {
          type_url: 'type.googleapis.com/netFrame.req_Login',
          value: loginBuffer
        }
      });

      const buffer = NetMessage.encode(netMsg).finish();
      this.send(buffer);
      this.connected = true;
      this.emit('connected');
      console.log('[UDPClient] 登录消息已发送至', this.serverIp + ':' + this.serverPort);
    }).catch(err => {
      console.error('[UDPClient] 登录失败:', err);
    });
  }

  send(buffer) {
    if (!this.socket) return;
    this.socket.send(buffer, 0, buffer.length, this.serverPort, this.serverIp, (err) => {
      if (err) console.error('[UDPClient] 发送失败:', err);
    });
  }

  stop() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connected = false;
    }
  }
}

module.exports = UDPClient;
```

- [ ] **Step 2: Commit**

```bash
git add electron/udp-client.js
git commit -m "feat: UDP 客户端模块，支持登录和数据收发"
```

---

### Task 4: 数据管理模块

**Files:**
- Create: `electron/data-manager.js`

- [ ] **Step 1: 创建 data-manager.js**

```javascript
class DataManager {
  constructor() {
    this.vehicles = new Map(); // CarID -> vehicle data
    this.listeners = [];
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  notify(carId, data) {
    for (const cb of this.listeners) {
      cb(carId, data);
    }
  }

  processUploadCarInfo(carInfo) {
    const carId = carInfo.CarID;
    if (!carId) return;

    const existing = this.vehicles.get(carId) || {};

    const vehicle = {
      ...existing,
      carId: carId,
      type: this.getVehicleType(carId),
      camp: this.getCamp(carId),
      number: this.getNumber(carId),
      position: carInfo.Coordinate ? {
        x: (carInfo.Coordinate.x || 0) / 100,
        y: (carInfo.Coordinate.z || 0) / 100,  // Proto Y -> Three.js Z (高度)
        z: (carInfo.Coordinate.y || 0) / 100   // Proto Z -> Three.js Y
      } : existing.position || { x: 0, y: 0, z: 0 },
      rotation: carInfo.MoveDirection ? {
        x: 0,
        y: carInfo.MoveDirection.y || 0,
        z: 0
      } : existing.rotation || { x: 0, y: 0, z: 0 },
      speed: carInfo.MoveSpeed || 0,
      acceleration: carInfo.Acceleration || 0,
      turretH: carInfo.TurretH || 0,
      turretV: carInfo.TurretV || 0,
      damage: {
        chassis: carInfo.HitChassis || 0,
        turret: carInfo.HitTurret || 0,
        leftTrack: carInfo.HitLeftTrack || 0,
        rightTrack: carInfo.HitRightTrack || 0
      },
      bullets: carInfo.Bullets ? [...carInfo.Bullets] : [],
      bulletType: carInfo.BulletType || 0,
      mainCapacity: carInfo.MainCapacity || 0,
      gasoline: carInfo.Gasoline || 0,
      isAi: carInfo.IsAi || false,
      lastUpdate: Date.now()
    };

    this.vehicles.set(carId, vehicle);
    this.notify(carId, vehicle);
    return vehicle;
  }

  processUploadRadar(radarData) {
    const carId = radarData.CarID;
    if (!carId) return;

    const existing = this.vehicles.get(carId) || {};
    existing.radar = {
      points: radarData.Points || [],
      colors: radarData.Colors || []
    };
    this.vehicles.set(carId, existing);
    this.notify(carId, existing);
  }

  processUploadUAVInfo(uavInfo) {
    const carId = uavInfo.CarID;
    if (!carId) return;

    const existing = this.vehicles.get(carId) || {};
    const vehicle = {
      ...existing,
      carId: carId,
      type: 'UAV',
      camp: this.getCamp(carId),
      number: this.getNumber(carId),
      position: uavInfo.Coordinate ? {
        x: (uavInfo.Coordinate.x || 0) / 100,
        y: (uavInfo.Coordinate.z || 0) / 100,
        z: (uavInfo.Coordinate.y || 0) / 100
      } : existing.position || { x: 0, y: 0, z: 0 },
      attitude: uavInfo.Attitude || { x: 0, y: 0, z: 0 },
      speed: uavInfo.Vector ? Math.sqrt(
        (uavInfo.Vector.x || 0) ** 2 + (uavInfo.Vector.y || 0) ** 2 + (uavInfo.Vector.z || 0) ** 2
      ) : 0,
      fuelPercent: uavInfo.RemainingFuelPercent || 0,
      isWorking: uavInfo.IsWorking || false,
      leftMissile: uavInfo.LeftMissileCount || 0,
      rightMissile: uavInfo.RightMissileCount || 0,
      identifiedIds: uavInfo.IdentifiedID || [],
      isAi: uavInfo.IsAIControl || false,
      lastUpdate: Date.now()
    };

    this.vehicles.set(carId, vehicle);
    this.notify(carId, vehicle);
    return vehicle;
  }

  getVehicleType(carId) {
    // CarID 编码: 阵营(十位) + 序号(个位), 序号5=99A
    const num = carId % 10;
    if (num === 5) return '99A';
    if (carId >= 50 && carId <= 53) return 'UAV';
    return 'F1';
  }

  getCamp(carId) {
    const campDigit = Math.floor(carId / 10);
    if (campDigit === 1 || campDigit === 10) return 'blue';
    if (campDigit === 2 || campDigit === 20) return 'red';
    return 'unknown';
  }

  getNumber(carId) {
    return carId % 10;
  }

  getVehicle(carId) {
    return this.vehicles.get(carId) || null;
  }

  getAllVehicles() {
    return Array.from(this.vehicles.values());
  }

  removeVehicle(carId) {
    this.vehicles.delete(carId);
  }

  clear() {
    this.vehicles.clear();
  }
}

module.exports = DataManager;
```

- [ ] **Step 2: Commit**

```bash
git add electron/data-manager.js
git commit -m "feat: 数据管理模块，车辆状态缓存与坐标转换"
```

---

### Task 5: Electron 主进程

**Files:**
- Create: `electron/main.js`

- [ ] **Step 1: 创建 electron/main.js**

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ProtoParser = require('./proto-parser');
const UDPClient = require('./udp-client');
const DataManager = require('./data-manager');

let mainWindow = null;
let protoParser = null;
let udpClient = null;
let dataManager = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    title: 'ViewPoint - 三维战场态势',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

async function initServices() {
  // 加载配置
  const config = require('../config/default.json');

  // 初始化 Proto 解析器
  protoParser = new ProtoParser();
  await protoParser.init();

  // 初始化数据管理器
  dataManager = new DataManager();
  dataManager.onUpdate((carId, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vehicle-update', { carId, data });
    }
  });

  // 初始化 UDP 客户端
  udpClient = new UDPClient(config);

  udpClient.on('data', (buffer) => {
    handleUDPData(buffer);
  });

  udpClient.on('connected', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connection-status', { connected: true });
    }
  });

  udpClient.on('disconnected', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connection-status', { connected: false });
    }
  });

  udpClient.start();
}

function handleUDPData(buffer) {
  try {
    const netMsg = protoParser.decodeMessage(buffer);
    if (!netMsg || !netMsg.msg) return;

    const decoded = protoParser.decodeAny(netMsg.msg.type_url, netMsg.msg.value);
    if (!decoded) return;

    switch (decoded.type) {
      case 'MsgCombineSend': {
        // 批量消息
        const msgs = decoded.data.msgs || [];
        for (const anyMsg of msgs) {
          const inner = protoParser.decodeAny(anyMsg.type_url, anyMsg.value);
          if (inner) processMessage(inner);
        }
        break;
      }
      default:
        processMessage(decoded);
    }
  } catch (err) {
    console.error('[Main] 处理 UDP 数据失败:', err);
  }
}

function processMessage(decoded) {
  switch (decoded.type) {
    case 'UploadCarInfo':
      dataManager.processUploadCarInfo(decoded.data);
      break;
    case 'UploadRadar':
      dataManager.processUploadRadar(decoded.data);
      break;
    case 'UploadUAVInfo':
      dataManager.processUploadUAVInfo(decoded.data);
      break;
    case 'EchoCreate':
      console.log('[Main] 车辆创建:', decoded.data);
      break;
    case 'EchoDestroy':
      console.log('[Main] 车辆销毁:', decoded.data);
      break;
    default:
      // 其他消息类型暂不处理
      break;
  }
}

// IPC 处理
ipcMain.handle('get-config', () => {
  return require('../config/default.json');
});

ipcMain.handle('get-vehicles', () => {
  return dataManager ? dataManager.getAllVehicles() : [];
});

app.whenReady().then(async () => {
  await createWindow();
  await initServices();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (udpClient) udpClient.stop();
  app.quit();
});
```

- [ ] **Step 2: 验证 Electron 能启动**

Run: `npm start`
Expected: Electron 窗口打开，控制台输出 Proto 初始化和 UDP 绑定日志（可能连接失败因为服务器不在，但不应崩溃）

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: Electron 主进程，UDP/Proto/IPC 完整数据流"
```

---

### Task 6: 三维场景基础

**Files:**
- Create: `renderer/scene/SceneManager.js`
- Create: `renderer/scene/CameraController.js`
- Create: `renderer/scene/AxisHelper.js`

- [ ] **Step 1: 创建 SceneManager.js**

```javascript
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

  init(THREE) {
    this.THREE = THREE;

    // 场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    // 相机
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      100000
    );
    this.camera.position.set(0, 200, 300);
    this.camera.lookAt(0, 0, 0);

    // WebGL 渲染器
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // CSS2D 渲染器（用于标签）
    const { CSS2DRenderer } = require('three/examples/jsm/renderers/CSS2DRenderer.js');
    this.cssRenderer = new CSS2DRenderer();
    this.cssRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.cssRenderer.domElement.style.position = 'absolute';
    this.cssRenderer.domElement.style.top = '0';
    this.cssRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.cssRenderer.domElement);

    // 光源
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(100, 200, 100);
    this.scene.add(dirLight);

    // 时钟
    this.clock = new THREE.Clock();

    // 窗口大小变化
    window.addEventListener('resize', () => this.onResize());

    this.animate();
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.cssRenderer.setSize(w, h);
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
    this.cssRenderer.render(this.scene, this.camera);
  }

  add(object) {
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }
}

module.exports = SceneManager;
```

- [ ] **Step 2: 创建 CameraController.js**

```javascript
class CameraController {
  constructor(THREE, camera, domElement) {
    this.THREE = THREE;
    this.camera = camera;
    this.domElement = domElement;

    this.target = new THREE.Vector3(0, 0, 0);
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.1;
    this.panSpeed = 0.5;

    this.spherical = new THREE.Spherical();
    this.sphericalDelta = new THREE.Spherical();
    this.panOffset = new THREE.Vector3();

    this.isRotating = false;
    this.isPanning = false;
    this.lastMouse = { x: 0, y: 0 };

    this.bindEvents();
    this.updateSpherical();
  }

  updateSpherical() {
    const offset = new this.THREE.Vector3().copy(this.camera.position).sub(this.target);
    this.spherical.setFromVector3(offset);
  }

  bindEvents() {
    this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.domElement.addEventListener('mouseup', () => this.onMouseUp());
    this.domElement.addEventListener('wheel', (e) => this.onWheel(e));
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') {
        this.reset();
      }
    });
  }

  onMouseDown(e) {
    if (e.button === 0) {
      this.isRotating = true;
    } else if (e.button === 2) {
      this.isPanning = true;
    }
    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;
  }

  onMouseMove(e) {
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;

    if (this.isRotating) {
      this.sphericalDelta.theta -= dx * this.rotateSpeed;
      this.sphericalDelta.phi -= dy * this.rotateSpeed;
    }

    if (this.isPanning) {
      const offset = new this.THREE.Vector3();
      const right = new this.THREE.Vector3();
      const up = new this.THREE.Vector3();

      right.setFromMatrixColumn(this.camera.matrix, 0);
      up.setFromMatrixColumn(this.camera.matrix, 1);

      offset.copy(right).multiplyScalar(-dx * this.panSpeed);
      offset.add(up.copy(up).multiplyScalar(dy * this.panSpeed));

      this.target.add(offset);
    }

    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;
  }

  onMouseUp() {
    this.isRotating = false;
    this.isPanning = false;
  }

  onWheel(e) {
    e.preventDefault();
    if (e.deltaY > 0) {
      this.spherical.radius *= (1 + this.zoomSpeed);
    } else {
      this.spherical.radius *= (1 - this.zoomSpeed);
    }
    this.spherical.radius = Math.max(1, Math.min(50000, this.spherical.radius));
  }

  focusOn(position) {
    this.target.set(position.x, position.y, position.z);
    this.spherical.radius = 50;
    this.applyUpdate();
  }

  reset() {
    this.target.set(0, 0, 0);
    this.spherical.radius = 300;
    this.spherical.phi = Math.PI / 4;
    this.spherical.theta = 0;
    this.applyUpdate();
  }

  applyUpdate() {
    const offset = new this.THREE.Vector3();
    offset.setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  update() {
    this.spherical.theta += this.sphericalDelta.theta;
    this.spherical.phi += this.sphericalDelta.phi;
    this.spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.spherical.phi));

    this.applyUpdate();

    this.sphericalDelta.theta *= 0.9;
    this.sphericalDelta.phi *= 0.9;
    if (Math.abs(this.sphericalDelta.theta) < 0.0001) this.sphericalDelta.theta = 0;
    if (Math.abs(this.sphericalDelta.phi) < 0.0001) this.sphericalDelta.phi = 0;
  }
}

module.exports = CameraController;
```

- [ ] **Step 3: 创建 AxisHelper.js**

```javascript
class AxisHelper {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.gridHelper = null;
    this.axisLines = null;
  }

  create() {
    // 网格地面
    this.gridHelper = new this.THREE.GridHelper(2000, 100, 0x333333, 0x1a1a1a);
    this.scene.add(this.gridHelper);

    // 坐标轴线
    const axisLength = 500;
    const createLine = (start, end, color) => {
      const geometry = new this.THREE.BufferGeometry().setFromPoints([
        new this.THREE.Vector3(...start),
        new this.THREE.Vector3(...end)
      ]);
      const material = new this.THREE.LineBasicMaterial({ color });
      return new this.THREE.Line(geometry, material);
    };

    // X 轴 - 红色
    this.scene.add(createLine([0, 0, 0], [axisLength, 0, 0], 0xff0000));
    // Y 轴 - 绿色 (Three.js Y = 上)
    this.scene.add(createLine([0, 0, 0], [0, axisLength, 0], 0x00ff00));
    // Z 轴 - 蓝色
    this.scene.add(createLine([0, 0, 0], [0, 0, axisLength], 0x0000ff));
  }

  setVisible(show) {
    if (this.gridHelper) this.gridHelper.visible = show;
  }
}

module.exports = AxisHelper;
```

- [ ] **Step 4: Commit**

```bash
git add renderer/scene/
git commit -m "feat: Three.js 场景管理、相机控制、坐标轴辅助"
```

---

### Task 7: 车辆实体基类与类型

**Files:**
- Create: `renderer/entities/Vehicle.js`
- Create: `renderer/entities/F1Vehicle.js`
- Create: `renderer/entities/Tank99A.js`
- Create: `renderer/entities/UAVEntity.js`

- [ ] **Step 1: 创建 Vehicle.js (基类)**

```javascript
class Vehicle {
  constructor(THREE, scene, data) {
    this.THREE = THREE;
    this.scene = scene;
    this.carId = data.carId;
    this.type = data.type || 'F1';
    this.camp = data.camp || 'blue';
    this.group = new THREE.Group();
    this.label = null;
    this.ranges = {};
    this.trajectory = [];
    this.maxTrajectory = 200;
  }

  getColors() {
    if (this.camp === 'blue') {
      return { primary: 0x2196f3, light: 0x64b5f6, dark: 0x1565c0 };
    }
    return { primary: 0xf44336, light: 0xef5350, dark: 0xc62828 };
  }

  createLabel(text) {
    const { CSS2DObject } = require('three/examples/jsm/renderers/CSS2DRenderer.js');
    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = this.camp === 'blue' ? '#64b5f6' : '#ef5350';
    div.style.fontSize = '12px';
    div.style.fontWeight = 'bold';
    div.style.textShadow = '0 0 3px rgba(0,0,0,0.8)';
    div.style.pointerEvents = 'none';
    const label = new CSS2DObject(div);
    label.position.set(0, 5, 0);
    this.group.add(label);
    this.label = label;
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
    this.updatePosition(data.position);
    this.updateRotation(data.rotation);
    this.trajectory.push(this.group.position.clone());
    if (this.trajectory.length > this.maxTrajectory) {
      this.trajectory.shift();
    }
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
    this.removeFromScene();
  }
}

module.exports = Vehicle;
```

- [ ] **Step 2: 创建 F1Vehicle.js**

```javascript
const Vehicle = require('./Vehicle');

class F1Vehicle extends Vehicle {
  constructor(THREE, scene, data) {
    super(THREE, scene, data);
    this.type = 'F1';
    this.build();
    this.createLabel('F1-' + data.number);
  }

  build() {
    const colors = this.getColors();

    // 车体
    const bodyGeo = new this.THREE.BoxGeometry(3, 1.2, 5);
    const bodyMat = new this.THREE.MeshLambertMaterial({ color: colors.primary });
    const body = new this.THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    this.group.add(body);

    // 炮塔
    const turretGeo = new this.THREE.CylinderGeometry(0.6, 0.8, 0.8, 8);
    const turretMat = new this.THREE.MeshLambertMaterial({ color: colors.dark });
    this.turret = new this.THREE.Mesh(turretGeo, turretMat);
    this.turret.position.set(0, 1.8, -0.5);
    this.group.add(this.turret);

    // 炮管
    const barrelGeo = new this.THREE.CylinderGeometry(0.1, 0.1, 3, 6);
    const barrelMat = new this.THREE.MeshLambertMaterial({ color: 0x555555 });
    this.barrel = new this.THREE.Mesh(barrelGeo, barrelMat);
    this.barrel.rotation.x = Math.PI / 2;
    this.barrel.position.set(0, 0, -2);
    this.turret.add(this.barrel);
  }

  updateData(data) {
    super.updateData(data);
    if (data.turretH !== undefined && this.turret) {
      this.turret.rotation.y = data.turretH;
    }
    if (data.turretV !== undefined && this.barrel) {
      this.barrel.rotation.x = Math.PI / 2 + data.turretV;
    }
  }
}

module.exports = F1Vehicle;
```

- [ ] **Step 3: 创建 Tank99A.js**

```javascript
const Vehicle = require('./Vehicle');

class Tank99A extends Vehicle {
  constructor(THREE, scene, data) {
    super(THREE, scene, data);
    this.type = '99A';
    this.build();
    this.createLabel('99A-' + data.number);
  }

  build() {
    const colors = this.getColors();

    // 车体（比F1大）
    const bodyGeo = new this.THREE.BoxGeometry(4, 1.5, 7);
    const bodyMat = new this.THREE.MeshLambertMaterial({ color: colors.primary });
    const body = new this.THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    this.group.add(body);

    // 炮塔
    const turretGeo = new this.THREE.CylinderGeometry(1, 1.2, 1, 8);
    const turretMat = new this.THREE.MeshLambertMaterial({ color: colors.dark });
    this.turret = new this.THREE.Mesh(turretGeo, turretMat);
    this.turret.position.set(0, 2.2, -0.5);
    this.group.add(this.turret);

    // 炮管
    const barrelGeo = new this.THREE.CylinderGeometry(0.15, 0.15, 4, 6);
    const barrelMat = new this.THREE.MeshLambertMaterial({ color: 0x555555 });
    this.barrel = new this.THREE.Mesh(barrelGeo, barrelMat);
    this.barrel.rotation.x = Math.PI / 2;
    this.barrel.position.set(0, 0, -2.5);
    this.turret.add(this.barrel);
  }

  updateData(data) {
    super.updateData(data);
    if (data.turretH !== undefined && this.turret) {
      this.turret.rotation.y = data.turretH;
    }
    if (data.turretV !== undefined && this.barrel) {
      this.barrel.rotation.x = Math.PI / 2 + data.turretV;
    }
  }
}

module.exports = Tank99A;
```

- [ ] **Step 4: 创建 UAVEntity.js**

```javascript
const Vehicle = require('./Vehicle');

class UAVEntity extends Vehicle {
  constructor(THREE, scene, data) {
    super(THREE, scene, data);
    this.type = 'UAV';
    this.build();
    this.createLabel('UAV-' + data.number);
  }

  build() {
    const colors = this.getColors();

    // 机身
    const bodyGeo = new this.THREE.BoxGeometry(1.5, 0.3, 1.5);
    const bodyMat = new this.THREE.MeshLambertMaterial({ color: colors.primary });
    const body = new this.THREE.Mesh(bodyGeo, bodyMat);
    this.group.add(body);

    // 四个旋翼臂
    const armPositions = [
      [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [1, 0, 1]
    ];
    this.rotors = [];
    for (const pos of armPositions) {
      // 臂
      const armGeo = new this.THREE.CylinderGeometry(0.05, 0.05, 1.5, 4);
      const armMat = new this.THREE.MeshLambertMaterial({ color: 0x888888 });
      const arm = new this.THREE.Mesh(armGeo, armMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(pos[0] * 0.7, 0, pos[2] * 0.7);
      this.group.add(arm);

      // 旋翼
      const rotorGeo = new this.THREE.CircleGeometry(0.5, 8);
      const rotorMat = new this.THREE.MeshLambertMaterial({
        color: colors.light,
        side: this.THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      });
      const rotor = new this.THREE.Mesh(rotorGeo, rotorMat);
      rotor.rotation.x = -Math.PI / 2;
      rotor.position.set(pos[0] * 0.7, 0.2, pos[2] * 0.7);
      this.group.add(rotor);
      this.rotors.push(rotor);
    }
  }

  updateData(data) {
    super.updateData(data);
    // 旋翼旋转动画
    if (this.rotors) {
      for (let i = 0; i < this.rotors.length; i++) {
        this.rotors[i].rotation.y += 0.3;
      }
    }
  }
}

module.exports = UAVEntity;
```

- [ ] **Step 5: Commit**

```bash
git add renderer/entities/
git commit -m "feat: 车辆实体基类及 F1/99A/UAV 三种类型"
```

---

### Task 8: 车辆管理器

**Files:**
- Create: `renderer/entities/VehicleManager.js`

- [ ] **Step 1: 创建 VehicleManager.js**

```javascript
const F1Vehicle = require('./F1Vehicle');
const Tank99A = require('./Tank99A');
const UAVEntity = require('./UAVEntity');

class VehicleManager {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.vehicles = new Map(); // carId -> Vehicle instance
  }

  createVehicle(data) {
    if (this.vehicles.has(data.carId)) {
      return this.vehicles.get(data.carId);
    }

    let vehicle;
    switch (data.type) {
      case '99A':
        vehicle = new Tank99A(this.THREE, this.scene, data);
        break;
      case 'UAV':
        vehicle = new UAVEntity(this.THREE, this.scene, data);
        break;
      default:
        vehicle = new F1Vehicle(this.THREE, this.scene, data);
    }

    vehicle.addToScene();
    this.vehicles.set(data.carId, vehicle);
    console.log(`[VehicleManager] 创建车辆: ${data.type}-${data.number} (${data.camp})`);
    return vehicle;
  }

  updateVehicle(data) {
    let vehicle = this.vehicles.get(data.carId);
    if (!vehicle) {
      vehicle = this.createVehicle(data);
    }
    vehicle.updateData(data);
    return vehicle;
  }

  removeVehicle(carId) {
    const vehicle = this.vehicles.get(carId);
    if (vehicle) {
      vehicle.dispose();
      this.vehicles.delete(carId);
    }
  }

  getVehicle(carId) {
    return this.vehicles.get(carId) || null;
  }

  getAllVehicles() {
    return Array.from(this.vehicles.values());
  }

  clear() {
    for (const vehicle of this.vehicles.values()) {
      vehicle.dispose();
    }
    this.vehicles.clear();
  }
}

module.exports = VehicleManager;
```

- [ ] **Step 2: Commit**

```bash
git add renderer/entities/VehicleManager.js
git commit -m "feat: 车辆管理器，自动创建/更新/销毁车辆实体"
```

---

### Task 9: 态势范围可视化

**Files:**
- Create: `renderer/visualization/RangeVisualizer.js`

- [ ] **Step 1: 创建 RangeVisualizer.js**

```javascript
class RangeVisualizer {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.rangeObjects = new Map(); // carId -> { scout, attack, radar, camera }
  }

  updateRanges(vehicle, config) {
    const carId = vehicle.carId;
    let ranges = this.rangeObjects.get(carId);
    if (!ranges) {
      ranges = {};
      this.rangeObjects.set(carId, ranges);
    }

    const pos = vehicle.getPosition();

    // 侦察范围 - 青色半透明球体
    if (config.scoutRange > 0) {
      if (!ranges.scout) {
        const geo = new this.THREE.SphereGeometry(config.scoutRange, 16, 16);
        const mat = new this.THREE.MeshBasicMaterial({
          color: 0x00bcd4,
          transparent: true,
          opacity: 0.15,
          wireframe: false
        });
        ranges.scout = new this.THREE.Mesh(geo, mat);
        this.scene.add(ranges.scout);
      }
      ranges.scout.position.copy(pos);
      ranges.scout.visible = true;
    } else if (ranges.scout) {
      ranges.scout.visible = false;
    }

    // 攻击范围 - 红色半透明球体
    if (config.attackRange > 0) {
      if (!ranges.attack) {
        const geo = new this.THREE.SphereGeometry(config.attackRange, 16, 16);
        const mat = new this.THREE.MeshBasicMaterial({
          color: 0xff1744,
          transparent: true,
          opacity: 0.12,
          wireframe: false
        });
        ranges.attack = new this.THREE.Mesh(geo, mat);
        this.scene.add(ranges.attack);
      }
      ranges.attack.position.copy(pos);
      ranges.attack.visible = true;
    } else if (ranges.attack) {
      ranges.attack.visible = false;
    }

    // 雷达范围 - 绿色半透明圆盘 + 扫描线
    if (config.radarRange > 0) {
      if (!ranges.radar) {
        const geo = new this.THREE.CircleGeometry(config.radarRange, 32);
        const mat = new this.THREE.MeshBasicMaterial({
          color: 0x4caf50,
          transparent: true,
          opacity: 0.1,
          side: this.THREE.DoubleSide
        });
        ranges.radar = new this.THREE.Mesh(geo, mat);
        ranges.radar.rotation.x = -Math.PI / 2;
        this.scene.add(ranges.radar);

        // 扫描线
        const lineGeo = new this.THREE.BufferGeometry().setFromPoints([
          new this.THREE.Vector3(0, 0, 0),
          new this.THREE.Vector3(config.radarRange, 0, 0)
        ]);
        const lineMat = new this.THREE.LineBasicMaterial({ color: 0x4caf50 });
        ranges.radarLine = new this.THREE.Line(lineGeo, lineMat);
        ranges.radarLine.rotation.x = -Math.PI / 2;
        this.scene.add(ranges.radarLine);
      }
      ranges.radar.position.copy(pos);
      ranges.radar.position.y += 0.1;
      ranges.radarLine.position.copy(pos);
      ranges.radarLine.position.y += 0.2;
      ranges.radar.visible = true;
      ranges.radarLine.visible = true;

      // 扫描动画
      if (ranges.radarLine) {
        ranges.radarLine.rotation.z += 0.02;
      }
    } else if (ranges.radar) {
      ranges.radar.visible = false;
      if (ranges.radarLine) ranges.radarLine.visible = false;
    }

    // 摄像头范围 - 黄色视锥体线框
    if (config.cameraRange > 0) {
      if (!ranges.camera) {
        const geo = new this.THREE.ConeGeometry(
          config.cameraRange * 0.5,
          config.cameraRange,
          4,
          1,
          true
        );
        const edges = new this.THREE.EdgesGeometry(geo);
        const mat = new this.THREE.LineBasicMaterial({ color: 0xffeb3b });
        ranges.camera = new this.THREE.LineSegments(edges, mat);
        this.scene.add(ranges.camera);
      }
      ranges.camera.position.copy(pos);
      ranges.camera.position.y += 2;
      ranges.camera.rotation.x = Math.PI / 2;
      ranges.camera.visible = true;
    } else if (ranges.camera) {
      ranges.camera.visible = false;
    }
  }

  removeRanges(carId) {
    const ranges = this.rangeObjects.get(carId);
    if (!ranges) return;
    for (const key of Object.keys(ranges)) {
      if (ranges[key]) {
        this.scene.remove(ranges[key]);
        if (ranges[key].geometry) ranges[key].geometry.dispose();
        if (ranges[key].material) ranges[key].material.dispose();
      }
    }
    this.rangeObjects.delete(carId);
  }

  clear() {
    for (const carId of this.rangeObjects.keys()) {
      this.removeRanges(carId);
    }
  }
}

module.exports = RangeVisualizer;
```

- [ ] **Step 2: Commit**

```bash
git add renderer/visualization/RangeVisualizer.js
git commit -m "feat: 态势范围可视化（侦察/攻击/雷达/摄像头）"
```

---

### Task 10: 轨迹渲染器

**Files:**
- Create: `renderer/visualization/TrajectoryRenderer.js`

- [ ] **Step 1: 创建 TrajectoryRenderer.js**

```javascript
class TrajectoryRenderer {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.trajectoryLines = new Map(); // carId -> Line
  }

  update(vehicle) {
    const carId = vehicle.carId;
    const points = vehicle.trajectory;
    if (!points || points.length < 2) return;

    let line = this.trajectoryLines.get(carId);
    if (line) {
      line.geometry.dispose();
      line.geometry = new this.THREE.BufferGeometry().setFromPoints(points);
    } else {
      const color = vehicle.camp === 'blue' ? 0x2196f3 : 0xf44336;
      const geo = new this.THREE.BufferGeometry().setFromPoints(points);
      const mat = new this.THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6
      });
      line = new this.THREE.Line(geo, mat);
      this.scene.add(line);
      this.trajectoryLines.set(carId, line);
    }
  }

  remove(carId) {
    const line = this.trajectoryLines.get(carId);
    if (line) {
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
      this.trajectoryLines.delete(carId);
    }
  }

  clear() {
    for (const carId of this.trajectoryLines.keys()) {
      this.remove(carId);
    }
  }
}

module.exports = TrajectoryRenderer;
```

- [ ] **Step 2: Commit**

```bash
git add renderer/visualization/TrajectoryRenderer.js
git commit -m "feat: 车辆运动轨迹渲染"
```

---

### Task 11: UI 面板

**Files:**
- Create: `renderer/ui/LeftPanel.js`
- Create: `renderer/ui/RightPanel.js`
- Create: `renderer/ui/Toolbar.js`

- [ ] **Step 1: 创建 LeftPanel.js**

```javascript
class LeftPanel {
  constructor(container, onVehicleSelect) {
    this.container = container;
    this.onVehicleSelect = onVehicleSelect;
    this.selectedCarId = null;
    this.filterText = '';
    this.filterType = 'all';
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="panel-header">
        <h3>车辆列表</h3>
      </div>
      <div class="panel-filter">
        <input type="text" id="filter-id" placeholder="搜索 ID..." />
        <select id="filter-type">
          <option value="all">全部类型</option>
          <option value="F1">F1</option>
          <option value="99A">99A</option>
          <option value="UAV">UAV</option>
        </select>
      </div>
      <div class="panel-content" id="vehicle-list"></div>
    `;

    this.container.querySelector('#filter-id').addEventListener('input', (e) => {
      this.filterText = e.target.value;
      this.updateList();
    });

    this.container.querySelector('#filter-type').addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.updateList();
    });
  }

  updateList(vehicles = []) {
    const listEl = this.container.querySelector('#vehicle-list');
    if (!listEl) return;

    const filtered = vehicles.filter(v => {
      if (this.filterType !== 'all' && v.type !== this.filterType) return false;
      if (this.filterText && !String(v.carId).includes(this.filterText)) return false;
      return true;
    });

    const blueVehicles = filtered.filter(v => v.camp === 'blue');
    const redVehicles = filtered.filter(v => v.camp === 'red');

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

    // 绑定点击事件
    listEl.querySelectorAll('.vehicle-item').forEach(el => {
      el.addEventListener('click', () => {
        const carId = parseInt(el.dataset.carid);
        this.selectedCarId = carId;
        this.updateList(vehicles);
        if (this.onVehicleSelect) this.onVehicleSelect(carId);
      });
    });
  }
}

module.exports = LeftPanel;
```

- [ ] **Step 2: 创建 RightPanel.js**

```javascript
class RightPanel {
  constructor(container) {
    this.container = container;
    this.selectedVehicle = null;
    this.rangeConfig = {
      scoutRange: 0,
      attackRange: 0,
      radarRange: 0,
      cameraRange: 0
    };
    this.onRangeChange = null;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="panel-header">
        <h3>车辆信息</h3>
      </div>
      <div class="panel-content" id="vehicle-info">
        <div class="empty-hint">选择一辆车辆查看详情</div>
      </div>
    `;
  }

  showVehicle(vehicle) {
    this.selectedVehicle = vehicle;
    const infoEl = this.container.querySelector('#vehicle-info');
    if (!infoEl || !vehicle) return;

    const pos = vehicle.position || { x: 0, y: 0, z: 0 };
    const damage = vehicle.damage || {};

    infoEl.innerHTML = `
      <div class="info-section">
        <h4>基本信息</h4>
        <div class="info-row"><label>车辆ID:</label><span>${vehicle.carId}</span></div>
        <div class="info-row"><label>类型:</label><span>${vehicle.type}</span></div>
        <div class="info-row"><label>阵营:</label><span class="${vehicle.camp}">${vehicle.camp === 'blue' ? '蓝方' : '红方'}</span></div>
        <div class="info-row"><label>AI控制:</label><span>${vehicle.isAi ? '是' : '否'}</span></div>
      </div>
      <div class="info-section">
        <h4>位置信息</h4>
        <div class="info-row"><label>X:</label><span>${pos.x.toFixed(1)}</span></div>
        <div class="info-row"><label>Y:</label><span>${pos.y.toFixed(1)}</span></div>
        <div class="info-row"><label>Z:</label><span>${pos.z.toFixed(1)}</span></div>
      </div>
      <div class="info-section">
        <h4>运动状态</h4>
        <div class="info-row"><label>速度:</label><span>${(vehicle.speed || 0).toFixed(1)} m/s</span></div>
        <div class="info-row"><label>加速度:</label><span>${(vehicle.acceleration || 0).toFixed(2)}</span></div>
        <div class="info-row"><label>炮塔方位:</label><span>${((vehicle.turretH || 0) * 180 / Math.PI).toFixed(1)}</span></div>
        <div class="info-row"><label>炮塔俯仰:</label><span>${((vehicle.turretV || 0) * 180 / Math.PI).toFixed(1)}</span></div>
      </div>
      <div class="info-section">
        <h4>损伤状态</h4>
        ${this.renderDamageBar('底盘', damage.chassis || 0)}
        ${this.renderDamageBar('炮塔', damage.turret || 0)}
        ${this.renderDamageBar('左履带', damage.leftTrack || 0)}
        ${this.renderDamageBar('右履带', damage.rightTrack || 0)}
      </div>
      <div class="info-section">
        <h4>态势范围</h4>
        <div class="range-control">
          <label>侦察范围 (m):</label>
          <input type="range" id="range-scout" min="0" max="500" value="${this.rangeConfig.scoutRange}" />
          <span id="range-scout-val">${this.rangeConfig.scoutRange}</span>
        </div>
        <div class="range-control">
          <label>攻击范围 (m):</label>
          <input type="range" id="range-attack" min="0" max="300" value="${this.rangeConfig.attackRange}" />
          <span id="range-attack-val">${this.rangeConfig.attackRange}</span>
        </div>
        <div class="range-control">
          <label>雷达范围 (m):</label>
          <input type="range" id="range-radar" min="0" max="800" value="${this.rangeConfig.radarRange}" />
          <span id="range-radar-val">${this.rangeConfig.radarRange}</span>
        </div>
        <div class="range-control">
          <label>摄像头范围 (m):</label>
          <input type="range" id="range-camera" min="0" max="200" value="${this.rangeConfig.cameraRange}" />
          <span id="range-camera-val">${this.rangeConfig.cameraRange}</span>
        </div>
      </div>
    `;

    // 绑定范围滑块事件
    const rangeTypes = ['scout', 'attack', 'radar', 'camera'];
    for (const type of rangeTypes) {
      const slider = infoEl.querySelector(`#range-${type}`);
      const valSpan = infoEl.querySelector(`#range-${type}-val`);
      if (slider) {
        slider.addEventListener('input', () => {
          const val = parseInt(slider.value);
          this.rangeConfig[type + 'Range'] = val;
          valSpan.textContent = val;
          if (this.onRangeChange) this.onRangeChange(vehicle.carId, this.rangeConfig);
        });
      }
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

- [ ] **Step 3: 创建 Toolbar.js**

```javascript
class Toolbar {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.connected = false;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="toolbar-left">
        <button id="btn-reset-view" title="复位视角 (R)">视角复位</button>
        <button id="btn-reset-scene" title="重置场景">场景重置</button>
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

    this.container.querySelector('#btn-reset-scene').addEventListener('click', () => {
      if (this.callbacks.onResetScene) this.callbacks.onResetScene();
    });
  }

  setConnectionStatus(connected) {
    this.connected = connected;
    const el = this.container.querySelector('#connection-status');
    if (el) {
      el.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
      el.textContent = connected ? '已连接' : '未连接';
    }
  }

  setRoomId(id) {
    const el = this.container.querySelector('#room-info');
    if (el) el.textContent = `房间: ${id}`;
  }

  setVehicleCount(count) {
    const el = this.container.querySelector('#vehicle-count');
    if (el) el.textContent = `车辆: ${count}`;
  }

  setFPS(fps) {
    const el = this.container.querySelector('#fps-display');
    if (el) el.textContent = `FPS: ${fps}`;
  }
}

module.exports = Toolbar;
```

- [ ] **Step 4: Commit**

```bash
git add renderer/ui/
git commit -m "feat: UI 面板（车辆列表、信息面板、工具栏）"
```

---

### Task 12: 主页面与样式

**Files:**
- Create: `renderer/index.html`
- Create: `renderer/styles.css`

- [ ] **Step 1: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ViewPoint - 三维战场态势</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <div id="toolbar"></div>
    <div id="main-content">
      <div id="left-panel"></div>
      <div id="scene-container"></div>
      <div id="right-panel"></div>
    </div>
    <div id="status-bar">
      <span id="update-rate">更新频率: --</span>
      <span id="total-vehicles">车辆总数: 0</span>
    </div>
  </div>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 styles.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Microsoft YaHei', sans-serif;
  background: #0a0a0a;
  color: #e0e0e0;
  overflow: hidden;
  height: 100vh;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* 工具栏 */
#toolbar {
  height: 40px;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.toolbar-left, .toolbar-center, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-left { flex: 1; }
.toolbar-center { flex: 2; justify-content: center; }
.toolbar-right { flex: 1; justify-content: flex-end; }

.toolbar-title {
  font-size: 14px;
  color: #888;
}

#toolbar button {
  background: #2a2a2a;
  color: #e0e0e0;
  border: 1px solid #444;
  padding: 4px 12px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
}

#toolbar button:hover {
  background: #3a3a3a;
}

.status-dot {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-dot.connected {
  background: #1b5e20;
  color: #4caf50;
}

.status-dot.disconnected {
  background: #4a1010;
  color: #f44336;
}

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

.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid #333;
}

.panel-header h3 {
  font-size: 14px;
  color: #aaa;
}

.panel-filter {
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.panel-filter input,
.panel-filter select {
  background: #1a1a1a;
  color: #e0e0e0;
  border: 1px solid #333;
  padding: 6px 8px;
  border-radius: 3px;
  font-size: 12px;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.camp-group {
  margin-bottom: 8px;
}

.camp-header {
  padding: 4px 8px;
  font-size: 12px;
  font-weight: bold;
  border-radius: 3px;
  margin-bottom: 4px;
}

.camp-header.blue {
  background: rgba(33, 150, 243, 0.2);
  color: #64b5f6;
}

.camp-header.red {
  background: rgba(244, 67, 54, 0.2);
  color: #ef5350;
}

.vehicle-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
}

.vehicle-item:hover {
  background: #222;
}

.vehicle-item.selected {
  background: #2a2a2a;
  border-left: 3px solid #2196f3;
}

.camp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.camp-dot.blue { background: #2196f3; }
.camp-dot.red { background: #f44336; }

.speed {
  margin-left: auto;
  color: #888;
  font-size: 11px;
}

/* 场景容器 */
#scene-container {
  flex: 1;
  position: relative;
  background: #000;
}

/* 右侧面板 */
#right-panel {
  width: 300px;
  background: #111;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
}

.info-section {
  padding: 12px 16px;
  border-bottom: 1px solid #222;
}

.info-section h4 {
  font-size: 13px;
  color: #888;
  margin-bottom: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 12px;
}

.info-row label {
  color: #888;
}

.damage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
}

.damage-row label {
  width: 60px;
  color: #888;
}

.damage-bar {
  flex: 1;
  height: 8px;
  background: #222;
  border-radius: 4px;
  overflow: hidden;
}

.damage-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.range-control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.range-control label {
  width: 100px;
  color: #888;
}

.range-control input[type="range"] {
  flex: 1;
  height: 4px;
}

.range-control span {
  width: 30px;
  text-align: right;
}

/* 底部状态栏 */
#status-bar {
  height: 24px;
  background: #1a1a1a;
  border-top: 1px solid #333;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 24px;
  font-size: 11px;
  color: #666;
}

.empty-hint {
  text-align: center;
  color: #555;
  padding: 20px;
  font-size: 13px;
}

/* 滚动条 */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: #111;
}

::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #444;
}
```

- [ ] **Step 3: Commit**

```bash
git add renderer/index.html renderer/styles.css
git commit -m "feat: 主页面布局与暗色主题样式"
```

---

### Task 13: 渲染进程入口与集成

**Files:**
- Create: `renderer/app.js`

- [ ] **Step 1: 创建 renderer/app.js**

```javascript
const THREE = require('three');
const SceneManager = require('./scene/SceneManager');
const CameraController = require('./scene/CameraController');
const AxisHelper = require('./scene/AxisHelper');
const VehicleManager = require('./entities/VehicleManager');
const RangeVisualizer = require('./visualization/RangeVisualizer');
const TrajectoryRenderer = require('./visualization/TrajectoryRenderer');
const LeftPanel = require('./ui/LeftPanel');
const RightPanel = require('./ui/RightPanel');
const Toolbar = require('./ui/Toolbar');

class App {
  constructor() {
    this.vehicles = new Map(); // carId -> vehicle data
    this.fpsFrames = 0;
    this.fpsTime = Date.now();
    this.updateCount = 0;
    this.lastUpdateRateTime = Date.now();
  }

  async init() {
    // 初始化场景
    const sceneContainer = document.getElementById('scene-container');
    this.sceneManager = new SceneManager(sceneContainer);
    this.sceneManager.init(THREE);

    // 相机控制
    this.cameraController = new CameraController(
      THREE,
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement
    );

    // 坐标轴
    this.axisHelper = new AxisHelper(THREE, this.sceneManager.scene);
    this.axisHelper.create();

    // 车辆管理
    this.vehicleManager = new VehicleManager(THREE, this.sceneManager.scene);

    // 态势范围
    this.rangeVisualizer = new RangeVisualizer(THREE, this.sceneManager.scene);

    // 轨迹
    this.trajectoryRenderer = new TrajectoryRenderer(THREE, this.sceneManager.scene);

    // UI 面板
    this.leftPanel = new LeftPanel(
      document.getElementById('left-panel'),
      (carId) => this.onVehicleSelect(carId)
    );

    this.rightPanel = new RightPanel(document.getElementById('right-panel'));
    this.rightPanel.onRangeChange = (carId, config) => {
      const vehicle = this.vehicleManager.getVehicle(carId);
      if (vehicle) {
        this.rangeVisualizer.updateRanges(vehicle, config);
      }
    };

    this.toolbar = new Toolbar(document.getElementById('toolbar'), {
      onResetView: () => this.cameraController.reset(),
      onResetScene: () => this.resetScene()
    });

    // 获取配置
    const config = await window.api.getConfig();
    this.toolbar.setRoomId(config.room.id);

    // 注册动画回调
    this.sceneManager.addAnimationCallback((delta) => this.update(delta));

    // 监听 IPC 数据
    window.api.onVehicleUpdate(({ carId, data }) => this.onVehicleUpdate(carId, data));
    window.api.onConnectionStatus(({ connected }) => {
      this.toolbar.setConnectionStatus(connected);
    });

    console.log('[App] 初始化完成');
  }

  onVehicleUpdate(carId, data) {
    this.vehicles.set(carId, data);
    this.updateCount++;

    // 更新三维实体
    const vehicle = this.vehicleManager.updateVehicle(data);

    // 更新轨迹
    this.trajectoryRenderer.update(vehicle);

    // 更新 UI 列表
    this.leftPanel.updateList(Array.from(this.vehicles.values()));

    // 更新右侧面板（如果选中的是这辆车）
    if (this.leftPanel.selectedCarId === carId) {
      this.rightPanel.showVehicle(data);
    }

    // 更新车辆计数
    this.toolbar.setVehicleCount(this.vehicles.size);
    document.getElementById('total-vehicles').textContent = `车辆总数: ${this.vehicles.size}`;
  }

  onVehicleSelect(carId) {
    const data = this.vehicles.get(carId);
    if (data) {
      this.rightPanel.showVehicle(data);
      // 相机聚焦
      if (data.position) {
        this.cameraController.focusOn(data.position);
      }
    }
  }

  update(delta) {
    // 相机更新
    this.cameraController.update();

    // FPS 计算
    this.fpsFrames++;
    const now = Date.now();
    if (now - this.fpsTime >= 1000) {
      this.toolbar.setFPS(this.fpsFrames);
      this.fpsFrames = 0;
      this.fpsTime = now;
    }

    // 更新频率
    if (now - this.lastUpdateRateTime >= 1000) {
      document.getElementById('update-rate').textContent = `更新频率: ${this.updateCount}/s`;
      this.updateCount = 0;
      this.lastUpdateRateTime = now;
    }
  }

  resetScene() {
    this.vehicleManager.clear();
    this.rangeVisualizer.clear();
    this.trajectoryRenderer.clear();
    this.vehicles.clear();
    this.leftPanel.updateList([]);
    this.rightPanel.render();
    this.cameraController.reset();
  }
}

// 启动应用
const app = new App();
app.init().catch(err => {
  console.error('应用启动失败:', err);
});
```

- [ ] **Step 2: 验证完整应用**

Run: `npm start`
Expected: Electron 窗口打开，显示三维场景（黑色背景+坐标轴+网格）、左侧车辆列表面板、右侧信息面板、顶部工具栏。界面布局正确，无 JS 报错。

- [ ] **Step 3: Commit**

```bash
git add renderer/app.js
git commit -m "feat: 渲染进程入口，集成场景/车辆/UI 完整数据流"
```

---

### Task 14: 最终验证与清理

- [ ] **Step 1: 验证项目结构完整性**

Run: 在项目根目录检查所有文件是否存在
Expected: 所有文件与设计文档中的目录结构一致

- [ ] **Step 2: 运行应用测试**

Run: `npm start`
Expected:
- 窗口标题为 "ViewPoint - 三维战场态势"
- 左侧面板显示车辆列表（空状态有提示）
- 中央三维场景显示黑色背景+坐标轴+网格
- 右侧面板显示车辆信息（空状态有提示）
- 顶部工具栏显示按钮和连接状态
- 底部状态栏显示更新频率和车辆总数
- 鼠标左键拖拽可旋转视角
- 鼠标滚轮可缩放
- 鼠标右键拖拽可平移
- R 键可复位视角

- [ ] **Step 3: 确认 Proto 文件加载**

Run: `npm start`，观察控制台
Expected: 输出 `[ProtoParser] 初始化完成，已加载消息类型: NetMessage, MsgCombineSend, ...`

- [ ] **Step 4: Final Commit**

```bash
git add .
git commit -m "feat: ViewPoint 三维战场可视化 v1.0 完整功能"
```

---

## 验证清单

| 需求 | 对应任务 | 验证方式 |
|------|----------|----------|
| Proto 协议解析 | Task 2, 5 | 控制台输出消息类型 |
| UDP 实时连接 | Task 3, 5 | 连接状态指示灯 |
| 暗色三维场景 | Task 6, 12 | 黑色背景+坐标轴 |
| 自由视角控制 | Task 6 | 左键旋转/滚轮缩放/右键平移/R复位 |
| 车辆实体渲染 | Task 7, 8 | 几何体显示+ID标签 |
| 态势范围可视化 | Task 9 | 滑块控制范围显示 |
| 车辆列表面板 | Task 11 | 列表+筛选+点击聚焦 |
| 车辆信息面板 | Task 11 | 详情+损伤+弹药 |
| 工具栏 | Task 11 | 复位/重置/状态显示 |
| 坐标转换 | Task 4 | 厘米→米转换 |
| 中文界面 | Task 12 | 所有文字中文 |
