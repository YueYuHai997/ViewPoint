const Logger = require('../../electron/logger');
const { ipcRenderer } = require('electron');

const log = Logger.create('LogPanel');

class LogPanel {
  constructor(container) {
    this.container = container;
    this.entries = [];
    this.maxEntries = 500;
    this.autoScroll = true;
    this.filterLevel = 'DEBUG';
    this.visible = true;
    this.render();
    this.bindIPC();
    this.bindLogger();
  }

  render() {
    this.container.innerHTML = `
      <div class="log-header">
        <span class="log-title">日志</span>
        <div class="log-controls">
          <select id="log-level-filter">
            <option value="DEBUG">DEBUG</option>
            <option value="INFO" selected>INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
          <button id="log-clear" title="清空日志">清空</button>
          <button id="log-toggle" title="折叠/展开">收起</button>
        </div>
      </div>
      <div class="log-content" id="log-content"></div>
    `;

    this.contentEl = this.container.querySelector('#log-content');

    this.container.querySelector('#log-level-filter').addEventListener('change', (e) => {
      this.filterLevel = e.target.value;
      this.refreshDisplay();
      // 同步设置主进程日志等级
      ipcRenderer.invoke('set-log-level', this.filterLevel);
      log.info('日志显示等级:', this.filterLevel);
    });

    this.container.querySelector('#log-clear').addEventListener('click', () => {
      this.entries = [];
      this.contentEl.innerHTML = '';
    });

    this.container.querySelector('#log-toggle').addEventListener('click', () => {
      this.visible = !this.visible;
      this.contentEl.style.display = this.visible ? 'block' : 'none';
      this.container.querySelector('#log-toggle').textContent = this.visible ? '收起' : '展开';
    });
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
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    if (levels[entry.level] < levels[this.filterLevel]) return;

    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="log-time">${entry.time}</span><span class="log-level" style="color:${entry.color}">[${entry.level}]</span><span class="log-module">[${entry.module}]</span><span class="log-msg">${this.escapeHtml(entry.message)}</span>`;

    this.contentEl.appendChild(line);

    // 限制 DOM 节点数量
    while (this.contentEl.children.length > this.maxEntries) {
      this.contentEl.removeChild(this.contentEl.firstChild);
    }

    if (this.autoScroll) {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  }

  refreshDisplay() {
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
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = LogPanel;
