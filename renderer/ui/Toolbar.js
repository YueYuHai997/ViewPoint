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
        <button id="btn-top-view" title="切换到顶视图">顶视图</button>
        <button id="btn-heatmap" title="切换战场热力图">热力图</button>
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

    this.container.querySelector('#btn-top-view').addEventListener('click', () => {
      if (this.callbacks.onTopView) this.callbacks.onTopView();
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
  }

  setHeatmapActive(on) {
    const el = this.container.querySelector('#btn-heatmap');
    if (el) el.classList.toggle('active', on);
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
