const CAMP_TEXT = {
  blue: '蓝方',
  red: '红方'
};

const BULLET_TYPE_TEXT = {
  0: '弹药',
  1: '高炮',
  2: '破甲弹',
  3: '穿甲弹',
  4: '导弹',
  5: '机枪',
  6: '雷',
  7: '左火箭',
  8: '右火箭',
  9: '上导弹',
  10: '下导弹'
};

class ToastQueue {
  constructor(rootEl, opts = {}) {
    this.rootEl = rootEl;
    this.maxItems = opts.maxItems || 5;
    this.durationMs = opts.durationMs || 5200;
    this.el = document.createElement('div');
    this.el.className = 'toast-queue';
    this.rootEl.appendChild(this.el);
  }

  push(event) {
    const toast = document.createElement('div');
    toast.className = `battle-toast ${event.severity || 'info'} ${event.type || ''}`;
    const message = this._format(event);
    toast.innerHTML = `
      <div class="battle-toast-kicker">${message.kicker}</div>
      <div class="battle-toast-main">${message.main}</div>
      <div class="battle-toast-meta">${message.meta}</div>
    `;
    this.el.prepend(toast);

    while (this.el.children.length > this.maxItems) {
      this.el.lastElementChild.remove();
    }

    window.setTimeout(() => {
      toast.classList.add('leaving');
      window.setTimeout(() => toast.remove(), 260);
    }, this.durationMs);
  }

  _format(event) {
    const vehicle = event.vehicle || {};
    const target = this._vehicleName(vehicle);
    const attacker = event.attacker ? this._vehicleName(event.attacker) : '';
    const time = new Date(event.ts || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });

    if (event.type === 'fire') {
      const bullet = BULLET_TYPE_TEXT[event.bulletType] || '弹药';
      return {
        kicker: 'FIRE',
        main: `${target} 开火`,
        meta: `${bullet}${event.count > 1 ? ` x${event.count}` : ''} · ${time}`
      };
    }

    if (event.type === 'hit') {
      return {
        kicker: event.severity === 'warning' ? 'HEAVY HIT' : 'HIT',
        main: attacker ? `疑似 ${attacker} 命中 ${target}` : `${target} 被击中`,
        meta: `${(event.parts || []).join(' / ') || '装甲'} 损伤 +${Math.round(event.amount || 0)}% · ${time}`
      };
    }

    if (event.type === 'destroyed') {
      return {
        kicker: 'DESTROYED',
        main: attacker ? `疑似 ${attacker} 击毁 ${target}` : `${target} 被击毁`,
        meta: `${event.cause || '战斗损毁'} · ${time}`
      };
    }

    if (event.type === 'crashed') {
      return {
        kicker: 'CRASH',
        main: `${target} 发生碰撞`,
        meta: `车辆状态异常 · ${time}`
      };
    }

    return {
      kicker: 'EVENT',
      main: `${target} 出现关键状态`,
      meta: time
    };
  }

  _vehicleName(vehicle) {
    if (!vehicle) return '未知车辆';
    const camp = CAMP_TEXT[vehicle.camp] || '未知阵营';
    const type = vehicle.type || 'Vehicle';
    const number = vehicle.number !== undefined && vehicle.number !== null ? vehicle.number : vehicle.carId;
    return `${type}-${number} (${camp})`;
  }
}

module.exports = ToastQueue;
