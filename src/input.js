// Keyboard state. Movement keys are polled and can be rebound (arrow keys
// always work too); action keys fire callbacks once per press.
const DEFAULT_BINDS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
const RESERVED = new Set(['KeyE', 'KeyQ', 'KeyB', 'KeyO', 'KeyC', 'KeyH', 'Tab', 'Space', 'Enter']);
const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

export function keyName(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=' }[code] || code;
}

export class Input {
  constructor() {
    this.held = { up: false, down: false, left: false, right: false, space: false };
    this.handlers = {};
    this.enabled = true;
    this.binds = { ...DEFAULT_BINDS };
    try { Object.assign(this.binds, JSON.parse(localStorage.getItem('tf-binds') || '{}')); } catch { /* ignore */ }
    this.capture = null;
    window.addEventListener('keydown', (e) => this.down(e), true);
    window.addEventListener('keyup', (e) => this.up(e), true);
    window.addEventListener('blur', () => { for (const k of Object.keys(this.held)) this.held[k] = false; });
  }

  on(key, fn) { this.handlers[key] = fn; }

  /** Next key press rebinds a direction. Calls done(code) when set. */
  rebind(dir, done) { this.capture = { dir, done }; }

  resetBinds() {
    this.binds = { ...DEFAULT_BINDS };
    this.saveBinds();
  }

  saveBinds() { try { localStorage.setItem('tf-binds', JSON.stringify(this.binds)); } catch { /* ignore */ } }

  moveFor(code) {
    if (ARROWS[code]) return ARROWS[code];
    for (const [dir, c] of Object.entries(this.binds)) if (c === code) return dir;
    return null;
  }

  typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  down(e) {
    if (this.capture) {
      e.preventDefault();
      e.stopPropagation();
      if (RESERVED.has(e.code)) { const { done } = this.capture; this.capture = null; done(null, true); return; }
      if (e.code !== 'Escape') {
        const { dir, done } = this.capture;
        for (const [d, c] of Object.entries(this.binds)) if (c === e.code && d !== dir) this.binds[d] = this.binds[dir];
        this.binds[dir] = e.code;
        this.saveBinds();
        this.capture = null;
        done(e.code);
      } else { const { done } = this.capture; this.capture = null; done(null); }
      return;
    }
    if (this.typing(e)) return;
    const m = this.moveFor(e.code);
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
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.code === 'Escape' ? 'esc' : e.code === 'Tab' ? 'tab' : /^Digit\d$/.test(e.code) ? 'digit' : e.code.replace('Key', '').toLowerCase();
    const h = this.handlers[k];
    if (h) {
      const used = h(e.code === 'Escape' ? null : e.code.replace('Digit', ''));
      if (used !== false && (k === 'tab' || k === 'esc')) e.preventDefault();
    }
  }

  up(e) {
    const m = this.moveFor(e.code);
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
