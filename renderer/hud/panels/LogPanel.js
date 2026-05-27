const Panel = require('../Panel');
const Logger = require('../../../electron/logger');
const { ipcRenderer } = require('electron');

const log = Logger.create('LogPanel');

class LogPanel extends Panel {
  constructor(opts = {}) {
    super('log', '日志', {
      defaultRect: { x: 8, y: window.innerHeight - 240, w: 600, h: 200 },
      minSize: { w: 360, h: 120 },
      closable: true,
      minimizable: true,
      resizable: true
    });
    this.entries = [];
    this.maxEntries = 500;
    this.autoScroll = true;
    this.filterLevel = 'DEBUG';
    this.contentEl = null;
  }

  renderBody() {
    this.bodyEl.innerHTML = `
      <div class="log-header">
        <span class="log-title">日志</span>
        <div class="log-controls">
          <select class="log-level-filter">
            <option value="DEBUG">DEBUG</option>
            <option value="INFO" selected>INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
          <button class="log-clear" title="清空日志">清空</button>
        </div>
      </div>
      <div class="log-content"></div>
    `;

    this.contentEl = this.bodyEl.querySelector('.log-content');

    this.bodyEl.querySelector('.log-level-filter').addEventListener('change', (e) => {
      this.filterLevel = e.target.value;
      this.refreshDisplay();
      ipcRenderer.invoke('set-log-level', this.filterLevel);
      log.info('日志显示等级:', this.filterLevel);
    });

    this.bodyEl.querySelector('.log-clear').addEventListener('click', () => {
      this.entries = [];
      this.contentEl.innerHTML = '';
    });

    this.bindIPC();
    this.bindLogger();
  }

  bindIPC() {
    ipcRenderer.on('log-entry', (_, entry) => {
      this.addEntry(entry);
    });
  }

  bindLogger() {
    Logger.onGlobalLog((entry) => {
      this.addEntry(entry);
    });
  }

  addEntry(entry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    if (!this.contentEl) return;

    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    if (levels[entry.level] < levels[this.filterLevel]) return;

    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="log-time">${entry.time}</span><span class="log-level" style="color:${entry.color}">[${entry.level}]</span><span class="log-module">[${entry.module}]</span><span class="log-msg">${this.escapeHtml(entry.message)}</span>`;
    this.contentEl.appendChild(line);

    while (this.contentEl.children.length > this.maxEntries) {
      this.contentEl.removeChild(this.contentEl.firstChild);
    }

    if (this.autoScroll) {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  }

  refreshDisplay() {
    if (!this.contentEl) return;
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    this.contentEl.innerHTML = '';
    for (const entry of this.entries) {
      if (levels[entry.level] < levels[this.filterLevel]) continue;
      const line = document.createElement('div');
      line.className = 'log-line';
      line.innerHTML = `<span class="log-time">${entry.time}</span><span class="log-level" style="color:${entry.color}">[${entry.level}]</span><span class="log-module">[${entry.module}]</span><span class="log-msg">${this.escapeHtml(entry.message)}</span>`;
      this.contentEl.appendChild(line);
    }
    if (this.autoScroll) {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  }

  escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = LogPanel;
