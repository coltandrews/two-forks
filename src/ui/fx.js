// Big moments: banners, coins flying to the till, confetti.
const COLORS = { red: '#ef4b3f', green: '#2b8c45', yellow: '#d69a12', blue: '#2167c8', purple: '#9b6cf2', ink: '#2a1b12' };

export class Fx {
  constructor(root) {
    this.root = root;
    this.bannerEl = null;
  }

  banner(text, sub = '', color = 'red', ms = 2000) {
    if (this.bannerEl) this.bannerEl.remove();
    const b = document.createElement('div');
    b.className = 'banner';
    b.style.setProperty('--bc', COLORS[color] || color);
    b.innerHTML = `<div class="t"></div>${sub ? '<br><div class="s"></div>' : ''}`;
    b.querySelector('.t').textContent = text;
    if (sub) b.querySelector('.s').textContent = sub;
    this.root.appendChild(b);
    this.bannerEl = b;
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 420); }, ms);
  }

  /** Coins hop from a screen point to the cash counter. */
  coins(x, y, n = 5) {
    const target = document.querySelector('.hud-tr .cash');
    if (!target) return;
    const r = target.getBoundingClientRect();
    const tx = r.left + 16, ty = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'coin';
      c.textContent = '$';
      this.root.appendChild(c);
      const sx = x + (Math.random() - 0.5) * 40, sy = y + (Math.random() - 0.5) * 20;
      const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 160, my = Math.min(sy, ty) - 80 - Math.random() * 80;
      const anim = c.animate([
        { transform: `translate(${sx}px, ${sy}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy - 30}px) scale(1.1)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.7)`, opacity: 0.9 },
      ], { duration: 900 + i * 90, easing: 'cubic-bezier(.4,0,.6,1)', delay: i * 60, fill: 'both' });
      anim.onfinish = () => c.remove();
    }
  }

  confetti(n = 90) {
    const cols = ['#ef4b3f', '#ffc83c', '#45c463', '#3d9bff', '#ff7aa8', '#9b6cf2'];
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.background = cols[i % cols.length];
      c.style.left = '0px';
      this.root.appendChild(c);
      const x = Math.random() * w, drift = (Math.random() - 0.5) * 240;
      const anim = c.animate([
        { transform: `translate(${x}px, -30px) rotate(0deg)` },
        { transform: `translate(${x + drift}px, ${h + 40}px) rotate(${720 + Math.random() * 720}deg)` },
      ], { duration: 2200 + Math.random() * 1600, easing: 'cubic-bezier(.2,.6,.4,1)', delay: Math.random() * 500, fill: 'both' });
      anim.onfinish = () => c.remove();
    }
  }
}
