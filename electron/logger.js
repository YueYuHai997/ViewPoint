const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
const LEVEL_COLORS = { DEBUG: '#888', INFO: '#4caf50', WARN: '#ff9800', ERROR: '#f44336' };

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

    // 控制台输出
    const fn = level === LEVELS.ERROR ? 'error' : level === LEVELS.WARN ? 'warn' : 'log';
    console[fn](prefix, ...args);

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
Logger._globalListeners = [];

module.exports = Logger;
