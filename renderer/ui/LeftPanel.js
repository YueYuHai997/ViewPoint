class LeftPanel {
  constructor(container, onVehicleSelect) {
    this.container = container;
    this.onVehicleSelect = onVehicleSelect;
    this.selectedCarId = null;
    this.filterText = '';
    this.filterType = 'all';
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="panel-header">
        <h3>车辆列表</h3>
      </div>
      <div class="panel-filter">
        <input type="text" id="filter-id" placeholder="搜索 ID..." />
        <select id="filter-type">
          <option value="all">全部类型</option>
          <option value="F1">F1</option>
          <option value="99A">99A</option>
          <option value="UAV">UAV</option>
        </select>
      </div>
      <div class="panel-content" id="vehicle-list"></div>
    `;

    this.container.querySelector('#filter-id').addEventListener('input', (e) => {
      this.filterText = e.target.value;
      this.updateList();
    });

    this.container.querySelector('#filter-type').addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.updateList();
    });
  }

  updateList(vehicles = []) {
    const listEl = this.container.querySelector('#vehicle-list');
    if (!listEl) return;

    const filtered = vehicles.filter(v => {
      if (this.filterType !== 'all' && v.type !== this.filterType) return false;
      if (this.filterText && !String(v.carId).includes(this.filterText)) return false;
      return true;
    });

    const blueVehicles = filtered.filter(v => v.camp === 'blue');
    const redVehicles = filtered.filter(v => v.camp === 'red');

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
        if (this.onVehicleSelect) this.onVehicleSelect(carId);
      });
    });
  }
}

module.exports = LeftPanel;
