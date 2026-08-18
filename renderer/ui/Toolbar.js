class Toolbar {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks || {};
    this.panelManager = (callbacks && callbacks.panelManager) || null;
    this.connected = false;
    this.render();
    // 点其它地方关闭 HUD 菜单
    this._docClickHandler = (e) => {
      if (!this.container.contains(e.target)) {
        const m = this.container.querySelector('.hud-menu');
        if (m) m.style.display = 'none';
      }
    };
    document.addEventListener('click', this._docClickHandler);
  }

  render() {
    this.container.innerHTML = `
      <div class="toolbar-brand">
        <span class="toolbar-brand-main">ViewPoint</span>
        <span class="toolbar-brand-sub">三维战场态势</span>
      </div>
      <div class="toolbar-controls">
        <button id="btn-reset-view" title="复位视角 (R)">视角复位</button>
        <button id="btn-top-view" title="切换到顶视图">顶视图</button>
        <select id="camp-display-filter" class="toolbar-select" title="显示指定阵营车辆">
          <option value="all">显示: 全部</option>
          <option value="blue">显示: 蓝方</option>
          <option value="red">显示: 红方</option>
        </select>
        <button id="btn-range-mode" title="切换范围显示模式">范围: 仅选中</button>
        <button id="btn-heatmap" title="切换战场热力图">热力图</button>
        <button id="btn-reset-scene" title="重置场景">场景重置</button>
        <div class="hud-menu-wrap" style="position:relative; display:inline-block">
          <button class="hud-menu-btn" id="btn-hud-menu" title="HUD 面板控制">HUD ▾</button>
          <div class="hud-menu" style="display:none; position:absolute; left:0; top:100%; margin-top:4px; background:#1a1a1a; border:1px solid #333; padding:6px 0; min-width:180px; z-index:200; border-radius:3px; box-shadow:0 4px 12px rgba(0,0,0,0.6)"></div>
        </div>
      </div>
      <div class="toolbar-status">
        <span id="connection-status" class="status-dot disconnected">未连接</span>
        <span id="room-info">房间: --</span>
        <span id="vehicle-count">车辆: 0</span>
        <span id="fps-display">FPS: --</span>
        <div class="tb-clock-wrap">
          <span id="sys-clock">--:--:--</span>
          <span id="mission-timer">任务 T+00:00:00</span>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-reset-view').addEventListener('click', () => {
      if (this.callbacks.onResetView) this.callbacks.onResetView();
    });

    this.container.querySelector('#btn-top-view').addEventListener('click', () => {
      if (this.callbacks.onTopView) this.callbacks.onTopView();
    });

    this.container.querySelector('#camp-display-filter').addEventListener('change', (e) => {
      if (this.callbacks.onCampDisplayFilterChange) {
        this.callbacks.onCampDisplayFilterChange(e.target.value);
      }
    });

    this.container.querySelector('#btn-range-mode').addEventListener('click', () => {
      if (this.callbacks.onCycleRangeMode) {
        const mode = this.callbacks.onCycleRangeMode();
        this.setRangeMode(mode);
      }
    });

    this.container.querySelector('#btn-heatmap').addEventListener('click', () => {
      if (this.callbacks.onToggleHeatmap) {
        const on = this.callbacks.onToggleHeatmap();
        this.setHeatmapActive(!!on);
      }
    });

    this.container.querySelector('#btn-reset-scene').addEventListener('click', () => {
      if (this.callbacks.onResetScene) this.callbacks.onResetScene();
    });

    this.container.querySelector('#btn-hud-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleHudMenu();
    });

    this._missionStart = Date.now();
    this._startClock();
  }

  setRangeMode(mode) {
    const el = this.container.querySelector('#btn-range-mode');
    if (!el) return;
    const label = mode === 'all' ? '范围: 全部'
                : mode === 'none' ? '范围: 关闭'
                : '范围: 仅选中';
    el.textContent = label;
    el.classList.toggle('active', mode !== 'none');
  }

  setHeatmapActive(on) {
    const el = this.container.querySelector('#btn-heatmap');
    if (el) el.classList.toggle('active', on);
  }

  setCampDisplayFilter(camp) {
    const el = this.container.querySelector('#camp-display-filter');
    if (el) el.value = camp;
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

  _startClock() {
    if (this._clockTimer) clearInterval(this._clockTimer);
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const now = new Date();
      const clockEl = this.container.querySelector('#sys-clock');
      const missionEl = this.container.querySelector('#mission-timer');
      if (clockEl) {
        clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      }
      if (missionEl) {
        const seconds = Math.floor((Date.now() - this._missionStart) / 1000);
        missionEl.textContent = `任务 T+${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
      }
    };
    tick();
    this._clockTimer = setInterval(tick, 1000);
  }

  _stopClock() {
    if (this._clockTimer) clearInterval(this._clockTimer);
    this._clockTimer = null;
  }

  _toggleHudMenu() {
    const menuEl = this.container.querySelector('.hud-menu');
    if (!menuEl) return;
    if (!this.panelManager) {
      menuEl.style.display = 'none';
      return;
    }
    if (menuEl.style.display === 'block') {
      menuEl.style.display = 'none';
      return;
    }
    let html = '';
    for (const p of this.panelManager.listPanels()) {
      const checked = p.visible ? 'checked' : '';
      html += `<label style="display:block; padding:4px 12px; font-size:12px; color:#ccc; cursor:pointer">
        <input type="checkbox" data-panel-id="${p.id}" ${checked} style="margin-right:6px"/>${this._escape(p.title)}
      </label>`;
    }
    html += '<hr style="border:none; border-top:1px solid #333; margin:6px 0"/>';
    html += '<button class="reset-layout-btn" style="display:block; width:100%; text-align:left; padding:4px 12px; font-size:12px; color:#f44; background:transparent; border:none; cursor:pointer">重置布局</button>';
    menuEl.innerHTML = html;
    menuEl.style.display = 'block';

    menuEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        this.panelManager.setVisible(cb.dataset.panelId, cb.checked);
      });
    });
    menuEl.querySelector('.reset-layout-btn').addEventListener('click', () => {
      if (confirm('确定重置 HUD 布局到默认？')) {
        this.panelManager.resetLayout();
        menuEl.style.display = 'none';
      }
    });
  }

  _escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = Toolbar;
