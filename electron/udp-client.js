const dgram = require('dgram');
const EventEmitter = require('events');
const Logger = require('./logger');

const log = Logger.create('UDPClient');

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
    this.protoParser = null;
    this.heartbeatTimer = null;
  }

  async start() {
    const ProtoParser = require('./proto-parser');
    this.protoParser = new ProtoParser();
    await this.protoParser.init();

    log.info('创建 UDP Socket...');
    this.socket = dgram.createSocket('udp4');

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

    this.socket.on('error', (err) => {
      log.error('Socket 错误:', err.message);
      this.emit('error', err);
    });

    this.socket.on('close', () => {
      log.warn('Socket 已关闭');
      this.connected = false;
      this.emit('disconnected');
    });

    this.socket.bind(() => {
      log.info('Socket 已绑定, 本地端口:', this.socket.address().port);
      this.sendLogin();
    });
  }

  sendLogin() {
    const NetMessage = this.protoParser.getMessageType('NetMessage');
    const reqLogin = this.protoParser.getMessageType('req_Login');

    if (!NetMessage || !reqLogin) {
      log.error('登录所需消息类型未找到');
      return;
    }

    const loginData = {
      account: this.account,
      password: String(this.roomId)
    };

    log.info('发送登录请求, 目标:', this.serverIp + ':' + this.serverPort, '房间:', this.roomId);
    log.debug('登录数据:', JSON.stringify(loginData));

    const loginMessage = reqLogin.create(loginData);
    const loginBuffer = reqLogin.encode(loginMessage).finish();

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
    log.info('登录消息已发送, 大小:', buffer.length, 'bytes');
    this.startHeartbeat();
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), 5000);
    this.sendHeartbeat();
  }

  sendHeartbeat() {
    const NetMessage = this.protoParser.getMessageType('NetMessage');
    const reqHeart = this.protoParser.getMessageType('req_Heart');
    if (!NetMessage || !reqHeart) return;

    const heartMsg = reqHeart.create({ count: String(Date.now()) });
    const heartBuffer = reqHeart.encode(heartMsg).finish();

    const netMsg = NetMessage.create({
      client_id: 'viewpoint',
      object_id: 0,
      msg: {
        type_url: 'type.googleapis.com/netFrame.req_Heart',
        value: heartBuffer
      }
    });

    const buffer = NetMessage.encode(netMsg).finish();
    this.send(buffer);
    log.debug('心跳已发送');
  }

  send(buffer) {
    if (!this.socket) {
      log.error('发送失败: Socket 未创建');
      return;
    }
    this.socket.send(buffer, 0, buffer.length, this.serverPort, this.serverIp, (err) => {
      if (err) log.error('发送失败:', err.message);
    });
  }

  stop() {
    if (this._rxStatTimer) {
      clearInterval(this._rxStatTimer);
      this._rxStatTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.socket) {
      log.info('关闭 UDP 连接');
      this.socket.close();
      this.socket = null;
      this.connected = false;
    }
  }
}

module.exports = UDPClient;
