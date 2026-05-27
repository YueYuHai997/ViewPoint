const Panel = require('../Panel');

class LeftPanel extends Panel {
  constructor(opts = {}) {
    super('left', '车辆列表', {
      defaultRect: { x: 8, y: 60, w: 240, h: 600 },
      minSize: { w: 200, h: 200 },
      closable: true,
      minimizable: true,
      resizable: true
    });
    this.onVehicleSelect = opts.onVehicleSelect || (() => {});
    this.selectedCarId = null;
    this.filterText = '';
    this.filterType = 'all';
    this._lastVehicles = [];
  }

  renderBody() {
    this.bodyEl.innerHTML = `
      <div class="panel-filter">
        <input type="text" class="filter-id" placeholder="搜索 ID..." />
        <select class="filter-type">
          <option value="all">全部类型</option>
          <option value="F1">F1</option>
          <option value="99A">99A</option>
          <option value="UAV">UAV</option>
        </select>
      </div>
      <div class="panel-content vehicle-list"></div>
    `;

    this.bodyEl.querySelector('.filter-id').addEventListener('input', (e) => {
      this.filterText = e.target.value;
      this.updateList(this._lastVehicles);
    });

    this.bodyEl.querySelector('.filter-type').addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.updateList(this._lastVehicles);
    });
  }

  updateList(vehicles = []) {
    this._lastVehicles = vehicles;
    const listEl = this.bodyEl && this.bodyEl.querySelector('.vehicle-list');
    if (!listEl) return;

    const filtered = vehicles.filter(v => {
      if (this.filterType !== 'all' && v.type !== this.filterType) return false;
      if (this.filterText && !String(v.carId).includes(this.filterText)) return false;
      return true;
    });

    const blueVehicles = filtered.filter(v => v.camp === 'blue');
    const redVehicles  = filtered.filter(v => v.camp === 'red');

    let html = '';

    if (blueVehicles.length > 0) {
      html += '<div class="camp-group"><div class="camp-header blue">蓝方</div>';
      for (const v of blueVehicles) {
        const selected = v.carId === this.selectedCarId ? 'selected' : '';
        html += `<div class="vehicle-item ${selected}" data-carid="${v.carId}">
          <span class="camp-dot blue"></span>
          <span>${v.type}-${v.number}</span>
          <span class="speed">${(v.speed || 0).toFixed(1)} m/s</span>
        </div>`;
      }
      html += '</div>';
    }

    if (redVehicles.length > 0) {
      html += '<div class="camp-group"><div class="camp-header red">红方</div>';
      for (const v of redVehicles) {
        const selected = v.carId === this.selectedCarId ? 'selected' : '';
        html += `<div class="vehicle-item ${selected}" data-carid="${v.carId}">
          <span class="camp-dot red"></span>
          <span>${v.type}-${v.number}</span>
          <span class="speed">${(v.speed || 0).toFixed(1)} m/s</span>
        </div>`;
      }
      html += '</div>';
    }

    if (filtered.length === 0) {
      html = '<div class="empty-hint">暂无车辆数据</div>';
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.vehicle-item').forEach(el => {
      el.addEventListener('click', () => {
        const carId = parseInt(el.dataset.carid);
        this.selectedCarId = carId;
        this.updateList(vehicles);
        this.onVehicleSelect(carId);
      });
    });
  }
}

module.exports = LeftPanel;
