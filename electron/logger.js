const fs = require('fs');
const path = require('path');

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
const LEVEL_COLORS = { DEBUG: '#888', INFO: '#4caf50', WARN: '#ff9800', ERROR: '#f44336' };

const LOG_DIR = path.join(__dirname, '..', 'logs');

class Logger {
  constructor(module = 'App') {
    this.module = module;
    this.level = LEVELS.INFO;
    this.listeners = [];
  }

  static setGlobalLevel(level) {
    if (typeof level === 'string') {
      level = LEVELS[level.toUpperCase()] ?? LEVELS.INFO;
    }
    Logger._globalLevel = level;
  }

  static getGlobalLevel() {
    return Logger._globalLevel ?? LEVELS.INFO;
  }

  setLevel(level) {
    if (typeof level === 'string') {
      level = LEVELS[level.toUpperCase()] ?? LEVELS.INFO;
    }
    this.level = level;
  }

  getEffectiveLevel() {
    return Math.max(this.level, Logger.getGlobalLevel());
  }

  onLog(callback) {
    this.listeners.push(callback);
  }

  _log(level, args) {
    if (level < this.getEffectiveLevel()) return;

    const time = new Date();
    const timeStr = time.toTimeString().split(' ')[0] + '.' + String(time.getMilliseconds()).padStart(3, '0');
    const levelName = LEVEL_NAMES[level];
    const prefix = `[${timeStr}][${levelName}][${this.module}]`;

    const entry = {
      time: timeStr,
      level: levelName,
      module: this.module,
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
      color: LEVEL_COLORS[levelName],
      timestamp: time.getTime()
    };

    // 文件日志（UTF-8，全量记录）
    Logger._writeFile(`${prefix} ${entry.message}`);

    // 控制台只输出 WARN 及以上
    if (level >= Logger._consoleLevel) {
      const fn = level === LEVELS.ERROR ? 'error' : level === LEVELS.WARN ? 'warn' : 'log';
      console[fn](prefix, ...args);
    }

    // 通知监听器
    for (const cb of this.listeners) {
      cb(entry);
    }

    // 全局监听器
    if (Logger._globalListeners) {
      for (const cb of Logger._globalListeners) {
        cb(entry);
      }
    }
  }

  debug(...args) { this._log(LEVELS.DEBUG, args); }
  info(...args) { this._log(LEVELS.INFO, args); }
  warn(...args) { this._log(LEVELS.WARN, args); }
  error(...args) { this._log(LEVELS.ERROR, args); }

  static onGlobalLog(callback) {
    if (!Logger._globalListeners) Logger._globalListeners = [];
    Logger._globalListeners.push(callback);
  }

  static create(module) {
    return new Logger(module);
  }
}

Logger._globalLevel = LEVELS.INFO;
Logger._consoleLevel = LEVELS.WARN; // 控制台只输出 WARN 及以上
Logger._globalListeners = [];
Logger._logFile = null;

Logger.initFileLog = function () {
  if (Logger._logFile) return;
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    Logger._logFile = path.join(LOG_DIR, `${date}.log`);
  } catch (e) {
    console.error('[Logger] 创建日志文件失败:', e.message);
  }
};

Logger._writeFile = function (line) {
  if (Logger._logFile) {
    try {
      fs.appendFileSync(Logger._logFile, line + '\n', 'utf-8');
    } catch {}
  }
};

module.exports = Logger;
