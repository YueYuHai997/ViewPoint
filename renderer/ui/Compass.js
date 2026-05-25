// 右下角小罗盘 HUD：
// - 外圈刻度跟随相机方位角旋转
// - N/E/S/W 字符位于外圈固定位置（相对于世界），表示世界北 = -Z
// - 中央指针固定向上（=相机正前方）
class Compass {
  constructor(container) {
    this.container = container;
    this.el = null;
    this.ring = null;
    this.render();
  }

  render() {
    const wrap = document.createElement('div');
    wrap.className = 'compass';
    wrap.innerHTML = `
      <div class="compass-bg">
        <div class="compass-ring">
          <span class="dir n">N</span>
          <span class="dir e">E</span>
          <span class="dir s">S</span>
          <span class="dir w">W</span>
          <div class="tick t0"></div>
          <div class="tick t1"></div>
          <div class="tick t2"></div>
          <div class="tick t3"></div>
          <div class="tick t4"></div>
          <div class="tick t5"></div>
          <div class="tick t6"></div>
          <div class="tick t7"></div>
        </div>
        <div class="compass-needle"></div>
        <div class="compass-center"></div>
      </div>
    `;
    this.container.appendChild(wrap);
    this.el = wrap;
    this.ring = wrap.querySelector('.compass-ring');
  }

  // azimuth: 相机水平方位角（Three.js Spherical.theta），单位弧度
  // 约定：theta=0 时相机望向 -Z（即北），随 theta 增大向 +X 方向（西）旋转
  update(azimuth) {
    if (!this.ring) return;
    const deg = azimuth * 180 / Math.PI;
    this.ring.style.transform = `rotate(${deg}deg)`;
  }
}

module.exports = Compass;
