// Wires everything together: lobby, session (host / client / solo), the
// local chef's movement, the 3D view, HUD, office and sound.
import { CFG } from './config.js';
import { SPAWN_POINTS } from './data/layout.js';
import { newState, deserialize, encodeSave } from './sim/state.js';
import { collide } from './sim/world.js';
import { describe } from './sim/kitchen.js';
import { View } from './view/scene.js';
import { Overlay } from './ui/overlay.js';
import { Hud } from './ui/hud.js';
import { Office } from './ui/office.js';
import { Lobby, loadProfile, saveProfile, writeSave } from './ui/lobby.js';
import { Session } from './net/session.js';
import { makeCode } from './net/net.js';
import { Input } from './input.js';
import { sfx, unlockAudio, startMusic, setCrowd } from './audio.js';

class App {
  constructor() {
    this.root = document.getElementById('app');
    this.view = new View(this.root);
    this.overlay = new Overlay(document.getElementById('markers'), this.view);
    this.hud = new Hud(this);
    this.office = new Office(this);
    this.lobby = new Lobby(this);
    this.input = new Input();
    this.profile = loadProfile();
    this.session = null;
    this.demo = newState({ cuisine: 'southern', name: 'Two Forks' });
    this.local = { x: 0, z: 0, rot: Math.PI, vx: 0, vz: 0 };
    this.last = performance.now();
    this.saveTimer = 0;
    this.bindKeys();
    this.hookModalClose();
    this.view.renderer.domElement.addEventListener('pointerdown', (e) => this.canvasClick(e));
    window.addEventListener('beforeunload', () => this.autosave());
    document.getElementById('boot').remove();
    this.lobby.show(this.profile && this.profile.name ? 'title' : 'title');
    requestAnimationFrame(() => this.frame());
  }

  get selfPid() { return this.session ? this.session.selfPid : null; }

  setProfile(p) {
    this.profile = p;
    saveProfile(p);
    if (this.session) this.command({ c: 'profile', name: p.name, look: p.look });
  }

  // ------------------------------------------------------------ starting and leaving

  async start({ mode, state, saveId, loaded }) {
    unlockAudio();
    if (loaded) {
      try { state = deserialize(state); } catch (e) { alert('That save could not be loaded: ' + e.message); return; }
    }
    this.saveId = saveId;
    this.code = mode === 'host' ? makeCode() : null;
    this.lobby.hide();
    this.session = await Session.host(state, this.profile, this.code, mode === 'host');
    if (this.session.netError) { this.hud.toast(this.session.netError, 'warn', 6000); this.code = null; }
    this.wireSession();
    this.enterGame();
    if (!loaded) writeSave(saveId, this.session.saveable());
  }

  async join(code) {
    unlockAudio();
    const s = await Session.join(code, this.profile);
    this.session = s;
    this.code = code;
    this.saveId = null;
    this.wireSession();
    this.lobby.hide();
    this.enterGame();
  }

  wireSession() {
    const s = this.session;
    s.on('event', (e) => this.onEvent(e));
    s.on('partner', (p) => {
      if (p) { this.hud.toast(`${p.name} joined the kitchen!`, 'good'); sfx('door'); }
      else this.hud.toast('Your partner left. The kitchen is yours.', 'warn');
    });
    s.on('lost', () => this.hud.toast('Lost connection to the host. Trying to reconnect…', 'bad', 6000));
    s.on('back', () => this.hud.toast('Reconnected!', 'good'));
  }

  enterGame() {
    const st = this.session.state;
    const me = st.players[this.selfPid];
    const sp = me || SPAWN_POINTS[0];
    this.local = { x: sp.x, z: sp.z, rot: Math.PI, vx: 0, vz: 0 };
    this.lastPhase = st.phase;
    this.view.clear();
    this.overlay.clear();
    this.hud.show(true);
    startMusic();
    if (st.phase === 'office') this.office.show(st, 'report');
    this.focusGame();
  }

  leave() {
    this.autosave();
    if (this.session) this.session.close();
    this.session = null;
    this.hud.closeModal();
    this.hud.show(false);
    this.office.hide();
    this.overlay.clear();
    this.view.clear();
    this.code = null;
    this.lobby.show('title');
  }

  autosave() {
    const s = this.session;
    if (!s || s.role === 'client' || !this.saveId) return;
    const st = s.state;
    if (st.phase === 'morning' || st.phase === 'office') writeSave(this.saveId, s.saveable());
  }

  command(c) {
    if (!this.session) return null;
    return this.session.command(c);
  }

  toastSoon(text) { setTimeout(() => this.hud.toast(text, 'good'), 200); }

  focusGame() {
    const a = document.activeElement;
    if (a && a !== document.body && !this.lobby.root.contains(a) && !this.office.root.contains(a)) a.blur();
  }

  // ------------------------------------------------------------ events from the sim

  onEvent(e) {
    const st = this.session && this.session.state;
    if (!st) return;
    if (e.to && e.to !== this.selfPid) return;
    switch (e.type) {
      case 'sfx': sfx(e.name); break;
      case 'toast': this.hud.toast(e.text, e.kind); if (e.kind === 'bad') sfx('bad'); break;
      case 'picker': if (!this.hud.modalOpen || this.hud.modalKind === 'picker') this.hud.openPicker(st, e.store, e.obj); break;
      case 'float': {
        let a = null;
        if (e.party) {
          const p = st.parties.find((q) => q.id === e.party);
          const t = p && st.objects.find((o) => o.id === p.table);
          if (t) a = { x: t.x + (t.seats === 4 ? 1 : 1.5), y: 1.8, z: t.z + (t.seats === 4 ? 1.5 : 0.5) };
        } else if (e.x != null) a = { x: e.x, y: 1.6, z: e.z };
        if (a) this.overlay.float(e.text, a.x, a.y, a.z, e.text.startsWith('+$') ? 'money' : '');
        break;
      }
      case 'review': if (e.review.stars >= 5 || e.review.stars <= 1 || e.review.critic) this.hud.toast(`${'★'.repeat(e.review.stars)}${'☆'.repeat(5 - e.review.stars)}  "${e.review.text}"`, e.review.stars >= 4 ? 'good' : 'bad', 4200); break;
      case 'levelUp': this.hud.levelUp(e.level, e.dishes); break;
      case 'dayEnd': this.hud.closeModal(); this.office.show(st, 'report'); break;
      case 'morning': this.office.hide(); break;
      case 'save': if (this.session.role !== 'client') setTimeout(() => this.autosave(), 50); break;
    }
  }

  // ------------------------------------------------------------ input

  bindKeys() {
    const inGame = () => this.session && this.lobby.root.hidden;
    const canAct = () => inGame() && !this.office.open && !(this.hud.modalOpen && this.hud.modalKind !== 'picker');
    this.input.on('e', () => { if (!canAct()) return; if (this.hud.modalKind === 'picker') this.hud.closeModal(); this.session.press('e'); });
    this.input.on('q', () => { if (canAct()) this.session.press('q'); });
    this.input.on('b', () => {
      if (!inGame() || this.office.open) return;
      if (this.hud.modalKind === 'cookbook') this.hud.closeModal(); else this.hud.openCookbook(this.session.state);
    });
    this.input.on('o', () => {
      if (!inGame() || this.office.open) return;
      if (this.hud.modalKind === 'picker' && this.hud.pickerState == null) this.hud.closeModal(); else this.hud.openRush(this.session.state);
    });
    this.input.on('c', () => {
      if (!inGame()) return;
      this.view.setCameraMode(this.view.camMode === 'overview' ? 'follow' : 'overview');
      this.hud.toast(this.view.camMode === 'follow' ? 'Close-up camera (C to switch back)' : 'Whole-room camera', '', 1500);
    });
    this.input.on('tab', () => {
      if (!inGame()) return false;
      const st = this.session.state;
      if (st.phase === 'morning') { if (this.office.open) this.closeOffice(); else this.openOffice(); }
      return true;
    });
    this.input.on('digit', (d) => { if (inGame()) this.hud.pickerKey(d); });
    this.input.on('esc', () => {
      if (!this.session) return;
      if (!this.lobby.root.hidden) return;
      if (this.office.layoutMode) { this.office.layoutMode = false; this.office.root.classList.remove('layout-mode'); this.layoutSel = null; this.office.render(this.session.state, true); return; }
      if (this.hud.modalOpen) { this.hud.closeModal(); return; }
      if (this.office.open && this.session.state.phase === 'morning') { this.closeOffice(); return; }
      this.openPause();
    });
    this.input.on('move', () => { if (this.hud.modalKind === 'picker') this.hud.closeModal(); });
  }

  hookModalClose() {
    const close = this.hud.closeModal.bind(this.hud);
    this.hud.closeModal = () => {
      const was = this.hud.modalKind;
      close();
      if (was === 'pause' && this.session && this.session.role !== 'client') this.command({ c: 'pause', on: false });
    };
  }

  openPause() {
    const st = this.session.state;
    if (this.session.role !== 'client') this.command({ c: 'pause', on: true });
    this.hud.openPause(st, { role: this.session.role });
  }

  openOffice() {
    if (!this.session) return;
    this.hud.closeModal();
    this.office.show(this.session.state, this.session.state.phase === 'morning' ? 'menu' : 'report');
  }

  closeOffice() { this.office.hide(); this.focusGame(); }

  editChef() {
    this.hud.closeModal();
    this.lobby.openChef(() => this.lobby.hide(), true);
  }

  async showSaveCode() {
    if (!this.session || this.session.role === 'client') return;
    const code = await encodeSave(this.session.state);
    this.hud.openSheet('pause', `<button class="icon-btn close" aria-label="Close">✕</button><h2>Save code</h2>
      <div class="sub">Copy this somewhere safe. Paste it under Host → Import a save code on any laptop to continue from ${this.session.state.phase === 'service' || this.session.state.phase === 'closing' ? 'this morning' : 'here'}.</div>
      <textarea class="code" readonly>${code}</textarea><div class="stack"><button class="btn primary" data-act="copy">Copy</button></div>`);
    const ta = this.hud.modal.querySelector('textarea');
    ta.select();
    this.hud.modal.querySelector('[data-act=copy]').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(code); this.hud.toast('Save code copied', 'good'); };
  }

  canvasClick(e) {
    unlockAudio();
    if (!this.session || !this.office.layoutMode) return;
    const p = this.view.floorAt(e.clientX, e.clientY);
    if (p) this.office.floorClick(p.x, p.z);
  }

  // ------------------------------------------------------------ frame loop

  moveLocal(dt, st) {
    const L = this.local;
    const grid = this.session.gridFor();
    const M = CFG.move;
    const frozen = st.phase === 'office' || st.paused || this.office.open || (this.hud.modalOpen && this.hud.modalKind !== 'picker') || !this.lobby.root.hidden;
    const ax = frozen ? { x: 0, z: 0 } : this.input.axis();
    const tvx = ax.x * M.speed, tvz = ax.z * M.speed;
    const k = Math.min(1, M.accel * dt / M.speed);
    L.vx += (tvx - L.vx) * k;
    L.vz += (tvz - L.vz) * k;
    L.x += L.vx * dt;
    L.z += L.vz * dt;
    collide(grid, L, M.radius);
    if (ax.x || ax.z) {
      const want = Math.atan2(ax.x, ax.z);
      let d = (want - L.rot) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      L.rot += d * Math.min(1, dt * 18);
    }
    const space = !frozen && this.input.held.space;
    this.session.setPose(L.x, L.z, L.rot, space);
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = this.session;
    if (!s) {
      this.view.sync(this.demo, dt, {});
      this.view.render();
      return;
    }
    const st0 = s.state;
    if (st0.phase !== this.lastPhase) {
      // The host moves everyone back to the start at the end of each day.
      if (st0.phase === 'office' || st0.phase === 'morning') {
        const me = st0.players[this.selfPid];
        const sp = SPAWN_POINTS[me ? me.slot : 0];
        Object.assign(this.local, { x: sp.x, z: sp.z, rot: Math.PI, vx: 0, vz: 0 });
      }
      if (st0.phase === 'office' && !this.office.open) this.office.show(st0, 'report');
      if (st0.phase !== 'office' && this.office.open && this.lastPhase === 'office') this.office.hide();
      this.lastPhase = st0.phase;
    }
    this.moveLocal(dt, st0);
    s.update(dt);
    const st = s.state;
    const grid = s.gridFor();
    const ctx = s.role === 'client' ? { state: st, grid, emit() {}, time: st.t } : s.sim;
    let info = null;
    try { info = describe(ctx, this.selfPid); } catch (err) { info = null; }
    const { poses, guests } = s.poses();
    const allPoses = { ...(poses || {}) };
    allPoses[this.selfPid] = { x: this.local.x, z: this.local.z, rot: this.local.rot };
    this.view.sync(st, dt, { self: this.selfPid, poses: allPoses, guestPoses: guests });
    this.overlay.update(st, { extra: s.role === 'client' && !st.paused ? Math.min(s.since, 0.3) : 0, dt });
    this.hud.update(st, { describe: info, self: this.selfPid, role: s.role, partner: s.partner && s.role === 'host' ? s.partner.name : null, lost: s.lost }, dt);
    this.office.update(st);
    this.view.render();
    let guestsIn = 0;
    for (const p of st.parties) guestsIn += p.guests.length;
    setCrowd(st.phase === 'service' || st.phase === 'closing' ? guestsIn : 0);
  }
}

window.twoForks = new App();
