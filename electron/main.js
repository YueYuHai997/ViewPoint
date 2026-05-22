const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 设置用户数据目录到项目内，避免 AppData 权限问题
const userDataDir = path.join(__dirname, '..', '.userdata');
if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
app.setPath('userData', userDataDir);

app.commandLine.appendSwitch('no-sandbox');

const Logger = require('./logger');
const ProtoParser = require('./proto-parser');
const UDPClient = require('./udp-client');
const DataManager = require('./data-manager');

Logger.initFileLog();
const log = Logger.create('Main');

let mainWindow = null;
let protoParser = null;
let udpClient = null;
let dataManager = null;

// 主进程日志转发到渲染进程
Logger.onGlobalLog((entry) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log-entry', entry);
    }
  } catch {}
});

async function createWindow() {
  log.info('创建窗口...');
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    title: 'ViewPoint - 三维战场态势',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    log.error('页面加载失败:', code, desc);
  });
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    log.error('渲染进程崩溃:', details.reason);
  });
  mainWindow.on('unresponsive', () => {
    log.warn('窗口无响应');
  });

  log.info('窗口已创建');
}

async function initServices() {
  const config = require('../config/default.json');

  // 设置日志等级
  const logLevel = (config.log && config.log.level) || 'INFO';
  Logger.setGlobalLevel(logLevel);
  log.info('日志等级:', logLevel);

  protoParser = new ProtoParser();
  await protoParser.init();

  dataManager = new DataManager();
  dataManager.onUpdate((carId, data) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('vehicle-update', { carId, data });
      }
    } catch {}
  });

  log.info('初始化 UDP 客户端, 服务器:', config.server.ip + ':' + config.server.port);
  udpClient = new UDPClient(config);

  udpClient.on('data', (buffer) => {
    log.debug('收到 UDP 数据, 大小:', buffer.length);
    handleUDPData(buffer);
  });

  udpClient.on('connected', () => {
    log.info('UDP 连接成功');
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('connection-status', { connected: true });
      }
    } catch {}
  });

  udpClient.on('disconnected', () => {
    log.warn('UDP 连接断开');
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('connection-status', { connected: false });
      }
    } catch {}
  });

  await udpClient.start();
  log.info('所有服务初始化完成');
}

function handleUDPData(buffer) {
  try {
    const netMsg = protoParser.decodeMessage(buffer);
    if (!netMsg || !netMsg.msg) {
      log.warn('数据包解析为空');
      return;
    }

    const decoded = protoParser.decodeAny(netMsg.msg.type_url, netMsg.msg.value);
    if (!decoded) {
      log.warn('无法解码消息类型:', netMsg.msg.type_url);
      return;
    }

    log.info('收到消息:', decoded.type);

    switch (decoded.type) {
      case 'NetMessage': {
        // 外层 NetMessage，内部 msg 才是真正的业务消息
        if (decoded.data.msg) {
          const real = protoParser.decodeAny(decoded.data.msg.type_url, decoded.data.msg.value);
          if (real) {
            log.info('实际消息:', real.type);
            processMessage(real, decoded.data.object_id);
          }
        }
        break;
      }
      case 'MsgCombineSend': {
        const msgs = decoded.data.msgs || [];
        log.info('批量消息, 数量:', msgs.length);
        for (let i = 0; i < msgs.length; i++) {
          const anyMsg = msgs[i];
          const inner = protoParser.decodeAny(anyMsg.type_url, anyMsg.value);
          if (inner) {
            // MsgCombineSend 里的子消息是 NetMessage，需要再解一层
            if (inner.type === 'NetMessage' && inner.data.msg) {
              const real = protoParser.decodeAny(inner.data.msg.type_url, inner.data.msg.value);
              if (real) {
                log.info('  子消息[' + i + ']:', real.type);
                processMessage(real, inner.data.object_id);
              } else {
                log.warn('  子消息[' + i + '] 内层解码失败:', inner.data.msg.type_url);
              }
            } else {
              log.info('  子消息[' + i + ']:', inner.type);
              processMessage(inner);
            }
          } else {
            log.warn('  子消息[' + i + '] 解码失败:', anyMsg.type_url);
          }
        }
        break;
      }
      default:
        processMessage(decoded);
    }
  } catch (err) {
    log.error('处理 UDP 数据失败:', err.message);
  }
}

function processMessage(decoded, objectId) {
  switch (decoded.type) {
    case 'req_Login': {
      const status = decoded.data.account || '';
      if (status === 'ok') {
        log.info('登录成功');
      } else {
        log.warn('登录失败:', status);
      }
      break;
    }
    case 'UploadCarInfo':
      dataManager.processUploadCarInfo(decoded.data);
      break;
    case 'UploadRadar':
      dataManager.processUploadRadar(decoded.data);
      break;
    case 'UploadUAVInfo':
      dataManager.processUploadUAVInfo(decoded.data);
      break;
    case 'Echo99ADriver':
    case 'EchoF1Driver':
    case 'EchoF1AI': {
      if (!objectId) break;
      const trans = decoded.data.translate;
      const pos = trans && trans.Pos;
      const rot = trans && trans.Rot;
      const driveData = decoded.data.DriveData;
      const vehicleData = {
        CarID: objectId,
        Coordinate: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
        MoveDirection: rot ? { x: rot.x, y: rot.y, z: rot.z } : null,
        MoveSpeed: (driveData && driveData.Speed) || decoded.data.Speed || 0,
      };
      dataManager.processUploadCarInfo(vehicleData);
      break;
    }
    case 'Echo99AGunner':
    case 'EchoF1Gunner': {
      if (!objectId) break;
      const existing = dataManager.getVehicle(objectId);
      if (existing) {
        existing.turretH = decoded.data.TurretRot || 0;
        existing.turretV = decoded.data.CannonRotx || 0;
        dataManager.notify(objectId, existing);
      }
      break;
    }
    case 'EchoCreate': {
      const d = decoded.data;
      const carId = d.ID || objectId;
      if (carId) {
        const pos = d.Cteatetrans && d.Cteatetrans.Pos;
        const rot = d.Cteatetrans && d.Cteatetrans.Rot;
        dataManager.processUploadCarInfo({
          CarID: carId,
          Camp: d.Camp,
          Number: d.Number,
          Name: d.Name,
          Coordinate: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
          MoveDirection: rot ? { x: rot.x, y: rot.y, z: rot.z } : null,
        });
        log.info('车辆创建:', d.Name || '', 'ID:', carId, '阵营:', d.Camp, '编号:', d.Number);
      }
      break;
    }
    case 'EchoDestroy': {
      const destroyId = (decoded.data && decoded.data.Value1) || objectId;
      if (destroyId) {
        dataManager.removeVehicle(Number(destroyId));
        log.info('车辆销毁, ID:', destroyId);
      }
      break;
    }
    case 'UploadClientDataReq': {
      const d = decoded.data;
      const clientMetrics = {
        clientState: d.client_state || 0,
        cpu: d.cpu_usage || 0,
        gpu: d.gpu_usage || 0,
        memory: d.memory_usage || 0,
        fps: d.fps || 0
      };

      // 解码内层 Client_Info（NetProt.V3.Client_Info）
      let clientInfo = null;
      const ci = d.Client_Info;
      if (ci && ci.type_url) {
        const inner = protoParser.decodeAny(ci.type_url, ci.value);
        if (inner && inner.type === 'Client_Info') {
          clientInfo = inner.data;
        } else {
          log.warn('UploadClientDataReq: Client_Info 解码失败:', ci.type_url);
        }
      }

      if (!clientInfo) {
        log.debug('UploadClientDataReq 无 Client_Info, 指标:', JSON.stringify(clientMetrics));
        break;
      }

      const entities = clientInfo.entitys || [];
      log.debug('UploadClientDataReq 客户端:', clientInfo.ip, clientInfo.client_type, '实体数:', entities.length);

      for (const ent of entities) {
        const carId = ent.CarID;
        if (!carId) continue;

        const clientPayload = {
          ip: clientInfo.ip || '',
          port: clientInfo.port || '',
          clientType: clientInfo.client_type || '',
          groupLeadId: clientInfo.group_lead_client_id || '',
          loadName: ent.load_name || '',
          controlMode: ent.control_mode || 0,
          ...clientMetrics
        };

        // 解码 ZhiKongInfo → 通常是 UploadCarInfo（无人机时是 UploadUAVInfo）
        const zk = ent.ZhiKongInfo;
        let detail = null;
        if (zk && zk.type_url) {
          detail = protoParser.decodeAny(zk.type_url, zk.value);
        }

        if (detail && detail.type === 'UploadCarInfo') {
          // 确保 CarID 一致后再分发
          if (!detail.data.CarID) detail.data.CarID = carId;
          dataManager.processUploadCarInfo(detail.data, clientPayload);
        } else if (detail && detail.type === 'UploadUAVInfo') {
          if (!detail.data.CarID) detail.data.CarID = carId;
          dataManager.processUploadUAVInfo(detail.data, clientPayload);
        } else {
          // 没有详细数据，只更新客户端元信息
          dataManager.updateClientInfo(carId, clientPayload);
        }
      }
      break;
    }
    default:
      log.info('未处理的消息类型:', decoded.type);
      break;
  }
}

ipcMain.handle('renderer-error', (_, msg) => {
  log.error('渲染进程错误:', msg);
});

ipcMain.handle('get-config', () => {
  return require('../config/default.json');
});

ipcMain.handle('get-vehicles', () => {
  return dataManager ? dataManager.getAllVehicles() : [];
});

ipcMain.handle('set-log-level', (_, level) => {
  Logger.setGlobalLevel(level);
  log.info('日志等级已切换为:', level);
  return true;
});

app.whenReady().then(async () => {
  await createWindow();

  // 等待渲染进程就绪
  await new Promise((resolve) => {
    ipcMain.once('renderer-ready', () => {
      log.info('渲染进程已就绪');
      resolve();
    });
    // 超时保护
    setTimeout(() => {
      log.warn('等待渲染进程超时，继续启动');
      resolve();
    }, 10000);
  });

  await initServices();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  log.info('应用退出');
  if (udpClient) udpClient.stop();
  app.quit();
});
