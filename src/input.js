// Keyboard state. Movement keys are polled; action keys fire callbacks once
// per press (no key repeat).
const MOVE = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};

export class Input {
  constructor() {
    this.held = { up: false, down: false, left: false, right: false, space: false };
    this.handlers = {};
    this.enabled = true;
    window.addEventListener('keydown', (e) => this.down(e));
    window.addEventListener('keyup', (e) => this.up(e));
    window.addEventListener('blur', () => { for (const k of Object.keys(this.held)) this.held[k] = false; });
  }

  on(key, fn) { this.handlers[key] = fn; }

  typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  down(e) {
    if (this.typing(e)) return;
    const m = MOVE[e.code];
    if (m) {
      if (this.enabled) { this.held[m] = true; e.preventDefault(); }
      if (this.handlers.move) this.handlers.move();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.enabled) this.held.space = true;
      return;
    }
    if (e.repeat) return;
    const k = e.code === 'Escape' ? 'esc' : e.code === 'Tab' ? 'tab' : /^Digit\d$/.test(e.code) ? 'digit' : e.code.replace('Key', '').toLowerCase();
    const h = this.handlers[k];
    if (h) {
      const used = h(e.code === 'Escape' ? null : e.code.replace('Digit', ''));
      if (used !== false && (k === 'tab' || k === 'esc')) e.preventDefault();
    }
  }

  up(e) {
    const m = MOVE[e.code];
    if (m) this.held[m] = false;
    if (e.code === 'Space') this.held.space = false;
  }

  axis() {
    if (!this.enabled) return { x: 0, z: 0 };
    let x = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    let z = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0);
    const l = Math.hypot(x, z);
    if (l > 0) { x /= l; z /= l; }
    return { x, z };
  }
}
