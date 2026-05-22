const protobuf = require('protobufjs');
const path = require('path');
const Logger = require('./logger');

const log = Logger.create('ProtoParser');

class ProtoParser {
  constructor() {
    this.root = null;
    this.messageTypes = {};
  }

  async init() {
    const protoDir = path.join(__dirname, '..', 'proto');
    log.info('加载 Proto 文件...');
    log.debug('Proto 目录:', protoDir);

    this.root = await protobuf.load([
      path.join(protoDir, 'net_frame.proto'),
      path.join(protoDir, 'net_info.proto'),
      path.join(protoDir, 'net.proto')
    ]);

    const typeNames = [
      'NetMessage', 'MsgCombineSend', 'req_Login', 'req_ClientInit',
      'UploadClientDataReq', 'req_Room_State', 'req_Heart', 'req_Disconnect',
      'UploadCarInfo', 'UploadRadar', 'UploadUAVInfo',
      'EchoCreate', 'EchoDestroy', 'SyncBase', 'Base',
      'Echo99ADriver', 'Echo99AGunner', 'EchoF1Driver', 'EchoF1Gunner',
      'EchoF1AI', 'EchoFire', 'EchoHit', 'UpHit',
      'Client_Info', 'Client_Entity', 'Login_Info', 'Init_Info', 'EntityInfo', 'Room_Control'
    ];

    // 同名不同包的消息需要显式指定全限定名，避免 lookupType 命中错误版本
    const explicitAliases = {
      MsgCombineSend: 'netFrame.MsgCombineSend'
    };

    for (const name of typeNames) {
      const lookupName = explicitAliases[name] || name;
      try {
        const type = this.root.lookupType(lookupName);
        if (type) this.messageTypes[name] = type;
      } catch (err) {
        log.warn('消息类型未找到:', lookupName);
      }
    }

    log.info('初始化完成，已加载', Object.keys(this.messageTypes).length, '个消息类型');
    log.debug('消息类型:', Object.keys(this.messageTypes).join(', '));
  }

  decodeMessage(buffer) {
    try {
      const NetMessage = this.messageTypes['NetMessage'];
      if (!NetMessage) {
        log.error('NetMessage 类型未加载');
        return null;
      }
      return NetMessage.decode(buffer);
    } catch (err) {
      log.error('解码NetMessage失败:', err.message);
      return null;
    }
  }

  decodeAny(typeUrl, value) {
    if (!typeUrl || !value) return null;

    const fullName = typeUrl.split('/').pop();
    const typeName = fullName.includes('.') ? fullName.split('.').pop() : fullName;

    // 优先用全限定名查找，避免不同包下同名消息（如 netFrame.MsgCombineSend / NetProt.MsgCombineSend）的歧义
    let type = null;
    if (fullName.includes('.')) {
      try { type = this.root.lookupType(fullName); } catch (_) {}
    }
    if (!type) type = this.messageTypes[typeName] || this.messageTypes[fullName] || null;

    if (!type) {
      log.warn('未知消息类型:', fullName);
      return null;
    }

    try {
      return { type: typeName, data: type.decode(value) };
    } catch (err) {
      log.error('解码', typeName, '失败:', err.message);
      return null;
    }
  }

  encodeMessage(typeName, data) {
    const type = this.messageTypes[typeName];
    if (!type) {
      log.error('未找到消息类型:', typeName);
      return null;
    }
    try {
      const message = type.create(data);
      return type.encode(message).finish();
    } catch (err) {
      log.error('编码', typeName, '失败:', err.message);
      return null;
    }
  }

  getMessageType(name) {
    return this.messageTypes[name] || null;
  }
}

module.exports = ProtoParser;
