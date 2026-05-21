const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
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
      case 'MsgCombineSend': {
        const msgs = decoded.data.msgs || [];
        log.info('批量消息, 数量:', msgs.length);
        for (let i = 0; i < msgs.length; i++) {
          const anyMsg = msgs[i];
          if (Buffer.isBuffer(anyMsg)) {
            log.info('  子消息[' + i + '] 是 raw bytes, 尝试直接解码');
            const inner = protoParser.decodeMessage(anyMsg);
            if (inner && inner.msg) {
              const innerDecoded = protoParser.decodeAny(inner.msg.type_url, inner.msg.value);
              if (innerDecoded) {
                log.info('  解码成功:', innerDecoded.type);
                processMessage(innerDecoded);
              }
            }
          } else {
            log.info('  子消息[' + i + '] type_url:', anyMsg.type_url || 'null');
            const inner = protoParser.decodeAny(anyMsg.type_url, anyMsg.value);
            if (inner) {
              log.info('  解码成功:', inner.type);
              processMessage(inner);
            } else {
              log.warn('  解码失败:', anyMsg.type_url);
            }
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
      log.info('车辆创建事件:', JSON.stringify(decoded.data));
      break;
    case 'EchoDestroy':
      log.info('车辆销毁事件:', JSON.stringify(decoded.data));
      break;
    default:
      log.info('未处理的消息类型:', decoded.type);
      break;
  }
}

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
