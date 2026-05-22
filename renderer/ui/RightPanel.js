class RightPanel {
  constructor(container) {
    this.container = container;
    this.selectedVehicle = null;
    this.rangeConfig = {
      scoutRange: 0,
      attackRange: 0,
      radarRange: 0,
      cameraRange: 0
    };
    this.onRangeChange = null;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="panel-header">
        <h3>车辆信息</h3>
      </div>
      <div class="panel-content" id="vehicle-info">
        <div class="empty-hint">选择一辆车辆查看详情</div>
      </div>
    `;
  }

  showVehicle(vehicle) {
    this.selectedVehicle = vehicle;
    const infoEl = this.container.querySelector('#vehicle-info');
    if (!infoEl || !vehicle) return;

    const pos = vehicle.position || { x: 0, y: 0, z: 0 };
    const damage = vehicle.damage || {};

    infoEl.innerHTML = `
      <div class="info-section">
        <h4>基本信息</h4>
        <div class="info-row"><label>车辆ID:</label><span>${vehicle.carId}</span></div>
        <div class="info-row"><label>类型:</label><span>${vehicle.type}</span></div>
        <div class="info-row"><label>阵营:</label><span class="${vehicle.camp}">${vehicle.camp === 'blue' ? '蓝方' : '红方'}</span></div>
        <div class="info-row"><label>AI控制:</label><span>${vehicle.isAi ? '是' : '否'}</span></div>
      </div>
      <div class="info-section">
        <h4>位置信息</h4>
        <div class="info-row"><label>X:</label><span>${pos.x.toFixed(1)}</span></div>
        <div class="info-row"><label>Y:</label><span>${pos.y.toFixed(1)}</span></div>
        <div class="info-row"><label>Z:</label><span>${pos.z.toFixed(1)}</span></div>
      </div>
      <div class="info-section">
        <h4>运动状态</h4>
        <div class="info-row"><label>速度:</label><span>${(vehicle.speed || 0).toFixed(1)} m/s</span></div>
        <div class="info-row"><label>加速度:</label><span>${(vehicle.acceleration || 0).toFixed(2)}</span></div>
        <div class="info-row"><label>炮塔方位:</label><span>${((vehicle.turretH || 0) * 180 / Math.PI).toFixed(1)}</span></div>
        <div class="info-row"><label>炮塔俯仰:</label><span>${((vehicle.turretV || 0) * 180 / Math.PI).toFixed(1)}</span></div>
      </div>
      <div class="info-section">
        <h4>损伤状态</h4>
        ${this.renderDamageBar('底盘', damage.chassis || 0)}
        ${this.renderDamageBar('炮塔', damage.turret || 0)}
        ${this.renderDamageBar('左履带', damage.leftTrack || 0)}
        ${this.renderDamageBar('右履带', damage.rightTrack || 0)}
      </div>
      <div class="info-section">
        <h4>态势范围</h4>
        <div class="range-control">
          <label>侦察范围 (m):</label>
          <input type="range" id="range-scout" min="0" max="2000" value="${this.rangeConfig.scoutRange}" />
          <span id="range-scout-val">${this.rangeConfig.scoutRange}</span>
        </div>
        <div class="range-control">
          <label>攻击范围 (m):</label>
          <input type="range" id="range-attack" min="0" max="500" value="${this.rangeConfig.attackRange}" />
          <span id="range-attack-val">${this.rangeConfig.attackRange}</span>
        </div>
        <div class="range-control">
          <label>雷达范围 (m):</label>
          <input type="range" id="range-radar" min="0" max="100" value="${this.rangeConfig.radarRange}" />
          <span id="range-radar-val">${this.rangeConfig.radarRange}</span>
        </div>
        <div class="range-control">
          <label>摄像头范围 (m):</label>
          <input type="range" id="range-camera" min="0" max="1700" value="${this.rangeConfig.cameraRange}" />
          <span id="range-camera-val">${this.rangeConfig.cameraRange}</span>
        </div>
      </div>
    `;

    const rangeTypes = ['scout', 'attack', 'radar', 'camera'];
    for (const type of rangeTypes) {
      const slider = infoEl.querySelector(`#range-${type}`);
      const valSpan = infoEl.querySelector(`#range-${type}-val`);
      if (slider) {
        slider.addEventListener('input', () => {
          const val = parseInt(slider.value);
          this.rangeConfig[type + 'Range'] = val;
          valSpan.textContent = val;
          if (this.onRangeChange) this.onRangeChange(vehicle.carId, this.rangeConfig);
        });
      }
    }
  }

  renderDamageBar(label, value) {
    const color = value > 70 ? '#f44336' : value > 30 ? '#ff9800' : '#4caf50';
    return `
      <div class="damage-row">
        <label>${label}:</label>
        <div class="damage-bar">
          <div class="damage-fill" style="width:${value}%; background:${color}"></div>
        </div>
        <span>${value.toFixed(0)}%</span>
      </div>
    `;
  }
}

module.exports = RightPanel;
