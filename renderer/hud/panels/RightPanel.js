const Panel = require('../Panel');

const CLIENT_STATE_TEXT = {
  0: '未知', 1: '等待中', 2: '加载中', 3: '加载完毕', 4: '游戏中'
};
const CONTROL_MODE_TEXT = {
  0: '未知', 1: '键鼠', 2: '实装', 3: '智能体', 4: 'AI'
};
const BULLET_TYPE_TEXT = {
  0: '无', 1: '高炮', 2: '破甲弹', 3: '穿甲弹', 4: '导弹',
  5: '机枪', 6: '雷', 7: '左火箭', 8: '右火箭', 9: '上导弹', 10: '下导弹'
};
const GEAR_TEXT = {
  0: '无', 1: 'D', 2: 'H', 3: 'N', 4: 'R1', 5: 'R2', 6: 'PT',
  7: '遥控', 8: '自动', 9: '跟随', 10: '空挡', 11: '前进', 12: '后退', 13: '中心转向'
};
const WEATHER_TEXT = {
  0: '无', 1: '晴天', 2: '多云', 3: '阴雨', 4: '雪天', 5: '大雾',
  6: '雷阵雨', 7: '暴风雪', 8: '沙尘暴', 9: '雨夹雪'
};
const TERRAIN_TEXT = {
  0: '未知', 1: '道路', 2: '草地', 3: '土路', 4: '雪地', 5: '石路'
};

function fmtNum(v, digits = 1) {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return Number(v).toFixed(digits);
}
function fmtPct(v) {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return Number(v).toFixed(1) + '%';
}
function fmtDeg(rad) {
  if (rad === undefined || rad === null || isNaN(rad)) return '-';
  return (rad * 180 / Math.PI).toFixed(1) + '°';
}
function row(label, value) {
  return `<div class="info-row"><label>${label}:</label><span>${value}</span></div>`;
}

class RightPanel extends Panel {
  constructor(opts = {}) {
    super('right', '车辆信息', {
      defaultRect: { x: window.innerWidth - 308, y: 60, w: 300, h: 600 },
      minSize: { w: 260, h: 240 },
      closable: true,
      minimizable: true,
      resizable: true
    });
    this.selectedVehicle = null;
    this.rangeConfig = {
      scoutRange: 1500,
      attackRange: 500,
      radarRange: 100,
      cameraRange: 1500
    };
    this.onRangeChange = opts.onRangeChange || null;
  }

  renderBody() {
    this.bodyEl.innerHTML = `<div class="panel-content vehicle-info">
      <div class="empty-hint">选择一辆车辆查看详情</div>
    </div>`;
  }

  showVehicle(vehicle) {
    const isNewSelection = !this.selectedVehicle || this.selectedVehicle.carId !== vehicle.carId;
    this.selectedVehicle = vehicle;
    const infoEl = this.bodyEl && this.bodyEl.querySelector('.vehicle-info');
    if (!infoEl || !vehicle) return;

    const pos = vehicle.position || { x: 0, y: 0, z: 0 };
    const damage = vehicle.damage || {};
    const target = vehicle.target || {};
    const env = vehicle.environment || {};
    const client = vehicle.clientInfo || null;
    const bullets = vehicle.bullets || [];

    infoEl.innerHTML = `
      <div class="info-section">
        <h4>基本信息</h4>
        ${row('车辆ID', vehicle.carId)}
        ${row('类型', vehicle.type)}
        <div class="info-row"><label>阵营:</label><span class="${vehicle.camp}">${vehicle.camp === 'blue' ? '蓝方' : vehicle.camp === 'red' ? '红方' : '未知'}</span></div>
        ${row('AI控制', vehicle.isAi ? '是' : '否')}
        ${client ? row('加载名称', client.loadName || '-') : ''}
        ${client ? row('控制方式', CONTROL_MODE_TEXT[client.controlMode] || client.controlMode || '-') : ''}
        ${vehicle.battleId ? row('对局ID', vehicle.battleId) : ''}
      </div>

      <div class="info-section">
        <h4>位置信息</h4>
        ${row('X', fmtNum(pos.x))}
        ${row('Y', fmtNum(pos.y))}
        ${row('Z', fmtNum(pos.z))}
      </div>

      <div class="info-section">
        <h4>运动状态</h4>
        ${row('前进速度', fmtNum(vehicle.speed) + ' m/s')}
        ${row('最大速度', fmtNum(vehicle.maxSpeed) + ' m/s')}
        ${row('旋转速度', fmtNum(vehicle.rotateSpeed, 2))}
        ${row('加速度', fmtNum(vehicle.acceleration, 2))}
        ${row('档位', GEAR_TEXT[vehicle.gear] || '-')}
        ${row('撞车', vehicle.isCrash ? '是' : '否')}
      </div>

      <div class="info-section">
        <h4>炮塔/瞄准</h4>
        ${row('炮塔方位', fmtDeg(vehicle.turretH))}
        ${row('炮塔俯仰', fmtDeg(vehicle.turretV))}
        ${vehicle.maxTurretV ? row('炮塔最大俯仰', fmtDeg(vehicle.maxTurretV)) : ''}
        ${row('全景方位', fmtDeg(vehicle.panoramicSightH))}
        ${row('全景俯仰', fmtDeg(vehicle.panoramicSightV))}
        ${vehicle.maxPanoramicSightV ? row('全景最大俯仰', fmtDeg(vehicle.maxPanoramicSightV)) : ''}
      </div>

      <div class="info-section">
        <h4>目标信息</h4>
        ${row('目标距离', fmtNum(target.distance) + ' m')}
        ${row('目标速度', fmtNum(target.speed) + ' m/s')}
      </div>

      <div class="info-section">
        <h4>弹药装备</h4>
        ${row('当前弹种', BULLET_TYPE_TEXT[vehicle.bulletType] || '-')}
        ${row('主炮余弹', vehicle.mainCapacity || 0)}
        ${row('弹药数组', bullets.length ? bullets.join(' / ') : '-')}
        ${row('烟幕状态', '0b' + (vehicle.smokeState || 0).toString(2).padStart(8, '0'))}
        ${row('榴弹状态', '0b' + (vehicle.grenadeState || 0).toString(2).padStart(2, '0'))}
        ${row('剩余油量', fmtNum(vehicle.gasoline))}
      </div>

      <div class="info-section">
        <h4>环境信息</h4>
        ${row('天气', WEATHER_TEXT[env.weather] || '-')}
        ${row('风力', env.windPower || 0)}
        ${row('风向', (env.windDir || 0) + '°')}
        ${row('地形', TERRAIN_TEXT[env.terrain] || '-')}
      </div>

      <div class="info-section">
        <h4>损伤状态</h4>
        ${this.renderDamageBar('底盘', damage.chassis || 0)}
        ${this.renderDamageBar('炮塔', damage.turret || 0)}
        ${this.renderDamageBar('左履带', damage.leftTrack || 0)}
        ${this.renderDamageBar('右履带', damage.rightTrack || 0)}
      </div>

      ${client ? `
      <div class="info-section">
        <h4>客户端信息</h4>
        ${row('IP', client.ip || '-')}
        ${row('端口', client.port || '-')}
        ${row('类型', client.clientType || '-')}
        ${client.groupLeadId ? row('组长ID', client.groupLeadId) : ''}
        ${row('状态', CLIENT_STATE_TEXT[client.clientState] || '-')}
      </div>

      <div class="info-section">
        <h4>资源占用</h4>
        ${row('CPU', fmtPct(client.cpu))}
        ${row('GPU', fmtPct(client.gpu))}
        ${row('内存', fmtPct(client.memory))}
        ${row('FPS', client.fps || 0)}
      </div>
      ` : ''}

      <div class="info-section">
        <h4>态势范围</h4>
        <div class="range-control">
          <label>侦察范围 (m):</label>
          <input type="range" class="range-scout" min="0" max="2000" value="${this.rangeConfig.scoutRange}" />
          <span class="range-scout-val">${this.rangeConfig.scoutRange}</span>
        </div>
        <div class="range-control">
          <label>攻击范围 (m):</label>
          <input type="range" class="range-attack" min="0" max="500" value="${this.rangeConfig.attackRange}" />
          <span class="range-attack-val">${this.rangeConfig.attackRange}</span>
        </div>
        <div class="range-control">
          <label>雷达范围 (m):</label>
          <input type="range" class="range-radar" min="0" max="100" value="${this.rangeConfig.radarRange}" />
          <span class="range-radar-val">${this.rangeConfig.radarRange}</span>
        </div>
        <div class="range-control">
          <label>摄像头范围 (m):</label>
          <input type="range" class="range-camera" min="0" max="1700" value="${this.rangeConfig.cameraRange}" />
          <span class="range-camera-val">${this.rangeConfig.cameraRange}</span>
        </div>
      </div>
    `;

    const rangeTypes = ['scout', 'attack', 'radar', 'camera'];
    for (const type of rangeTypes) {
      const slider = infoEl.querySelector(`.range-${type}`);
      const valSpan = infoEl.querySelector(`.range-${type}-val`);
      if (slider) {
        slider.addEventListener('input', () => {
          const val = parseInt(slider.value);
          this.rangeConfig[type + 'Range'] = val;
          valSpan.textContent = val;
          if (this.onRangeChange) this.onRangeChange(vehicle.carId, this.rangeConfig);
        });
      }
    }

    if (isNewSelection && this.onRangeChange) {
      this.onRangeChange(vehicle.carId, this.rangeConfig);
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
