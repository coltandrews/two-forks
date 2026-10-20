// Wires everything together: lobby, session (host / client / solo), the
// local chef's movement, the 3D view, HUD, office and sound.
import { CFG } from './config.js';
import { spawnPoints } from './data/layout.js';
import { areaObjects, movementMultiplier } from './data/alley.js';
import { newState, deserialize, encodeSave } from './sim/state.js';
import { collide } from './sim/world.js';
import { describe } from './sim/kitchen.js';
import { View } from './view/scene.js';
import { Overlay } from './ui/overlay.js';
import { Hud } from './ui/hud.js';
import { Fx } from './ui/fx.js';
import { Office } from './ui/office.js';
import { Lobby, loadProfile, saveProfile, writeSave } from './ui/lobby.js';
import { Session } from './net/session.js';
import { makeCode } from './net/net.js';
import { Input } from './input.js';
import { ChatBox, cleanChat } from './ui/chat.js';
import { sfx, unlockAudio, startMusic, setCrowd, setStation, setMuffled } from './audio.js';
import { radioStation, radioPlace, isRadio, RADIO_OFF } from './data/radio.js';

class App {
  constructor() {
    this.root = document.getElementById('app');
    this.view = new View(this.root);
    this.overlay = new Overlay(document.getElementById('markers'), this.view);
    this.hud = new Hud(this);
    this.fx = new Fx(this.root);
    this.office = new Office(this);
    this.lobby = new Lobby(this);
    this.input = new Input();
    this.chat = new ChatBox(this.root, (text) => this.sendChat(text));
    this.profile = loadProfile();
    this.session = null;
    this.demo = newState({ cuisine: 'southern', name: 'Two Forks' });
    this.local = { x: 0, z: 0, rot: Math.PI, vx: 0, vz: 0 };
    this.last = performance.now();
    this.saveTimer = 0;
    this.bindKeys();
    this.hookModalClose();
    const canvas = this.view.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => this.canvasPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.canvasPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.canvasPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.canvasPointerUp(e, true));
    window.addEventListener('wheel', (e) => {
      if (!this.session || !this.lobby.root.hidden || this.office.open || this.hud.modalOpen) return;
      if (e.target.closest('.rail, .keys, .morning')) return;
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.view.zoomBy(Math.max(-0.25, Math.min(0.25, d * (e.ctrlKey ? 0.01 : 0.0018))));
    }, { passive: false });
    window.addEventListener('beforeunload', () => this.autosave());
    document.getElementById('boot').remove();
    if (document.fonts && document.fonts.load) document.fonts.load('80px "Lilita One"').then(() => { this.view.roomKey = ''; }).catch(() => {});
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
    if (this.lobby.starting) return;
    unlockAudio();
    if (loaded) {
      try { state = deserialize(state); } catch (e) { alert('That save could not be loaded: ' + e.message); return; }
    }
    this.saveId = saveId;
    this.code = mode === 'host' ? makeCode() : null;
    this.lobby.setStarting(true);
    try {
      this.session = await Session.host(state, this.profile, this.code, mode === 'host');
    } catch (e) {
      alert('The kitchen could not open: ' + e.message);
      return;
    } finally {
      this.lobby.setStarting(false);
    }
    this.lobby.hide();
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
    s.on('partner', (p, leftName) => {
      if (p) { this.hud.toast(`${p.name} joined the kitchen!`, 'good'); sfx('door'); }
      else this.hud.toast(`${leftName || 'A chef'} left the kitchen.`, 'warn');
    });
    s.on('lost', () => this.hud.toast('Lost connection to the host. Trying to reconnect…', 'bad', 6000));
    s.on('back', () => this.hud.toast('Reconnected!', 'good'));
    s.on('chat', (pid, text) => {
      const line = cleanChat(text);
      if (!line) return;
      this.overlay.say(pid, line);
      if (pid !== this.selfPid) sfx('chat');
    });
  }

  sendChat(text) {
    if (!this.session || !this.session.chat(text)) this.hud.toast('Nobody else is in the kitchen yet.', 'warn');
    this.focusGame();
  }

  enterGame() {
    const st = this.session.state;
    const me = st.players[this.selfPid];
    const sp = me || spawnPoints(st)[0];
    this.local = { x: sp.x, z: sp.z, rot: sp.rot ?? Math.PI, vx: 0, vz: 0, area: sp.area || 'restaurant', areaRev: sp.areaRev || 0 };
    this.lastPhase = st.phase;
    this.view.clear();
    this.overlay.clear();
    this.hud.show(true);
    this.view.setInsetLeft(232);
    this.view.setCameraMode('follow');
    startMusic();
    if (st.phase === 'office') this.office.show(st, 'report');
    this.focusGame();
  }

  leave() {
    this.chat.close();
    this.autosave();
    if (this.session) this.session.close();
    this.session = null;
    this.hud.closeModal();
    this.hud.show(false);
    this.view.setInsetLeft(0);
    this.view.zoomTarget = 0;
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
    const area = st.players[this.selfPid]?.area || 'restaurant';
    switch (e.type) {
      case 'sfx': if (e.x == null || area === (e.area || 'restaurant')) sfx(e.name); break;
      case 'areaChanged': this.syncLocalArea(st); break;
      case 'toast': this.hud.toast(e.text, e.kind); if (e.kind === 'bad') sfx('bad'); break;
      case 'picker': if (!this.hud.modalOpen || this.hud.modalKind === 'picker') this.hud.openPicker(st, e.store, e.obj); break;
      case 'float': {
        if (area !== (e.area || 'restaurant')) break;
        let a = null;
        if (e.party) {
          const p = st.parties.find((q) => q.id === e.party);
          const t = p && st.objects.find((o) => o.id === p.table);
          if (t) a = { x: t.x + (t.seats === 4 ? 1 : 1.5), y: 1.8, z: t.z + (t.seats === 4 ? 1.5 : 0.5) };
        } else if (e.x != null) a = { x: e.x, y: 1.6, z: e.z };
        if (a) {
          const money = e.text.startsWith('+$');
          this.overlay.float(e.text, a.x, a.y, a.z, money ? 'money' : '');
          if (money) { const sp = this.view.toScreen(a.x, a.y, a.z); this.fx.coins(sp.x, sp.y, 6); }
        }
        break;
      }
      case 'served': if (area === 'restaurant') this.overlay.float(e.cold ? 'cold…' : e.great ? '♥ yum!' : '♥', e.x, 1.7, e.z, e.cold ? '' : 'heart'); break;
      case 'banner': this.fx.banner(e.text, e.sub, e.color, e.ms); break;
      case 'review': {
        const r = e.review;
        if (e.x != null && area === 'restaurant') this.overlay.float('★'.repeat(r.stars), e.x, 2.1, e.z, 'star');
        if (r.stars >= 5 || r.stars <= 1 || r.critic) this.hud.toast(`${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}  "${r.text}"`, r.stars >= 4 ? 'good' : 'bad', 4200);
        break;
      }
      case 'chapter': this.hud.showStoryCard(e); break;
      case 'chefLevelUp': this.hud.showLevelUp(e); this.fx.confetti(); break;
      case 'levelUp': this.hud.levelUp(e.level, e.dishes); this.fx.confetti(); break;
      case 'dayEnd': {
        this.hud.closeModal();
        const r = e.report;
        this.fx.banner('CLOSED!', `Day ${r.day} · ${r.net >= 0 ? 'profit' : 'loss'} ${(r.net < 0 ? '−$' : '$') + Math.abs(r.net).toFixed(2)}`, r.net >= 0 ? 'green' : 'red', 2200);
        this.office.show(st, 'report');
        if (r.net > 0) setTimeout(() => this.fx.confetti(60), 300);
        break;
      }
      case 'morning': this.office.hide(); break;
      case 'save': if (this.session.role !== 'client') setTimeout(() => this.autosave(), 50); break;
    }
  }

  // ------------------------------------------------------------ input

  bindKeys() {
    const inGame = () => this.session && this.lobby.root.hidden;
    const canAct = () => inGame() && !this.office.open && !(this.hud.modalOpen && this.hud.modalKind !== 'picker');
    this.input.on('e', () => { if (!canAct()) return; if (this.hud.modalKind === 'picker') this.hud.closeModal(); this.session.press('e'); this.turnToTarget = 0.35; });
    // At the radio, a tap changes station and a hold (0.5 s) turns it off.
    // Everywhere else Q acts on press, as before.
    this.input.on('q', () => {
      if (!canAct()) return;
      const atRadio = isRadio(this.session.state, this.aimTarget);
      if (!atRadio || radioStation(this.session.state) === RADIO_OFF) { this.session.press('q'); return; }
      clearTimeout(this.qHold);
      this.qHold = setTimeout(() => { this.qHold = null; this.command({ c: 'radioOff' }); }, 500);
    });
    this.input.on('qup', () => {
      if (!this.qHold) return;
      clearTimeout(this.qHold);
      this.qHold = null;
      if (canAct()) this.session.press('q');
    });
    this.input.on('b', () => {
      if (!inGame() || this.office.open) return;
      if (this.hud.modalKind === 'cookbook') this.hud.closeModal(); else this.hud.openCookbook(this.session.state);
    });
    this.input.on('o', () => {
      if (!inGame() || this.office.open) return;
      if ((this.session.state.players[this.selfPid]?.area || 'restaurant') !== 'restaurant') return;
      if (this.hud.modalKind === 'picker' && this.hud.pickerState == null) this.hud.closeModal(); else this.hud.openRush(this.session.state);
    });
    this.input.on('c', () => {
      if (!inGame()) return;
      this.view.setCameraMode((this.view.zoomTarget || 0) > 0.15 ? 'overview' : 'follow');
    });
    this.input.on('tab', () => {
      if (!inGame()) return false;
      const st = this.session.state;
      if (st.phase === 'morning') { if (this.office.open) this.closeOffice(); else this.openOffice(); }
      return true;
    });
    this.input.on('digit', (d) => { if (inGame()) this.hud.pickerKey(d); });
    const openChat = () => {
      if (!canAct() || !this.session.canChat) return;
      for (const k of Object.keys(this.input.held)) this.input.held[k] = false;
      // Next tick: the Enter that opened the box must not also submit it.
      setTimeout(() => this.chat.show(), 0);
    };
    this.input.on('enter', openChat);
    this.input.on('numpadenter', openChat);
    this.input.on('h', () => { if (inGame()) this.hud.toggleKeys(); });
    this.input.on('u', () => { if (inGame()) this.hud.toggleMinimal(); });
    this.input.on('esc', () => {
      if (this.chat.open) { this.chat.close(); this.focusGame(); return; }
      if (this.hud.modalKind === 'options') { this.hud.closeModal(); return; }
      if (!this.session) return;
      if (!this.lobby.root.hidden) return;
      if (this.office.layoutMode) { this.office.stopLayout(); return; }
      if (this.hud.modalOpen) { this.hud.closeModal(); return; }
      if (this.office.open && this.session.state.phase === 'morning') { this.closeOffice(); return; }
      this.openPause();
    });
    this.input.on('move', () => {
      if (this.hud.modalKind === 'picker') this.hud.closeModal();
      if (this.hud.root.contains(document.activeElement)) this.focusGame();
    });
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
    if ((this.session.state.players[this.selfPid]?.area || 'restaurant') !== 'restaurant') {
      this.hud.toast('Go inside to open the office.', 'warn');
      return;
    }
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
      <div class="sub">Use Host → Import a save code on another device.${this.session.state.phase === 'service' || this.session.state.phase === 'closing' ? ' Resumes from this morning.' : ''}</div>
      <textarea class="code" readonly>${code}</textarea><div class="stack"><button class="btn primary" data-act="copy">Copy</button></div>`);
    const ta = this.hud.modal.querySelector('textarea');
    ta.select();
    this.hud.modal.querySelector('[data-act=copy]').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(code); this.hud.toast('Save code copied', 'good'); };
  }

  canvasPointerDown(e) {
    unlockAudio();
    if (!this.session || !this.office.layoutMode) return;
    const p = this.view.floorAt(e.clientX, e.clientY);
    if (!p || !this.office.floorPointerDown(p.x, p.z, e.pointerId)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add('layout-dragging');
  }

  canvasPointerMove(e) {
    if (!this.session || !this.office.layoutMode) return;
    const p = this.view.floorAt(e.clientX, e.clientY);
    if (p) this.office.floorPointerMove(p.x, p.z, e.pointerId);
  }

  canvasPointerUp(e, cancelled = false) {
    if (!this.session || !this.office.layoutMode) return;
    const p = this.view.floorAt(e.clientX, e.clientY);
    if (p) this.office.floorPointerUp(p.x, p.z, e.pointerId, cancelled);
    e.currentTarget.classList.remove('layout-dragging');
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // ------------------------------------------------------------ frame loop

  syncLocalArea(st) {
    const p = st.players[this.selfPid];
    if (!p) return;
    const area = p.area || 'restaurant', areaRev = p.areaRev || 0;
    if (this.local.area === area && this.local.areaRev === areaRev) return;
    Object.assign(this.local, { x: p.x, z: p.z, rot: p.rot, vx: 0, vz: 0, area, areaRev });
    this.turnToTarget = 0;
    this.aimTarget = null;
    if (this.hud.modalKind === 'picker') this.hud.closeModal();
    this.overlay.clear();
  }

  moveLocal(dt, st) {
    const L = this.local;
    const grid = this.session.gridFor();
    const M = CFG.move;
    const frozen = st.phase === 'office' || st.paused || this.office.open || (this.hud.modalOpen && this.hud.modalKind !== 'picker') || !this.lobby.root.hidden;
    const ax = frozen ? { x: 0, z: 0 } : this.input.axis();
    const speed = M.speed * movementMultiplier(st, st.players[this.selfPid]);
    const tvx = ax.x * speed, tvz = ax.z * speed;
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
    if (!ax.x && !ax.z && (space || this.turnToTarget > 0) && this.aimTarget) {
      this.turnToTarget = Math.max(0, (this.turnToTarget || 0) - dt);
      const o = this.aimTarget;
      const w = o.type === 'table' ? (o.seats === 4 ? 2 : 3) : (o.w || 1), h = o.type === 'table' ? (o.seats === 4 ? 3 : 1) : (o.h || 1);
      const cx = Math.max(o.x, Math.min(L.x, o.x + w)), cz = Math.max(o.z, Math.min(L.z, o.z + h));
      if (Math.hypot(cx - L.x, cz - L.z) > 0.05) {
        const want = Math.atan2(cx - L.x, cz - L.z);
        let d = (want - L.rot) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        L.rot += d * Math.min(1, dt * 14);
      }
    }
    this.session.setPose(L.x, L.z, L.rot, space, L.area, L.areaRev);
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
        const sp = spawnPoints(st0)[me ? me.slot : 0];
        Object.assign(this.local, { x: sp.x, z: sp.z, rot: Math.PI, vx: 0, vz: 0 });
      }
      if (st0.phase === 'office' && !this.office.open) this.office.show(st0, 'report');
      if (st0.phase !== 'office' && this.office.open && this.lastPhase === 'office') this.office.hide();
      this.lastPhase = st0.phase;
    }
    this.syncLocalArea(st0);
    this.moveLocal(dt, st0);
    s.update(dt);
    const st = s.state;
    this.syncLocalArea(st);
    const area = st.players[this.selfPid]?.area || 'restaurant';
    const grid = s.gridFor();
    const ctx = s.role === 'client' ? { state: st, grid, emit() {}, time: st.t } : s.sim;
    let info = null;
    try { info = describe(ctx, this.selfPid); } catch (err) { info = null; }
    const { poses, guests } = s.poses();
    const allPoses = { ...(poses || {}) };
    allPoses[this.selfPid] = { x: this.local.x, z: this.local.z, rot: this.local.rot, area, areaRev: this.local.areaRev };
    this.view.sync(st, dt, { self: this.selfPid, area, poses: allPoses, guestPoses: guests });
    this.overlay.update(st, { extra: s.role === 'client' && !st.paused ? Math.min(s.since, 0.3) : 0, dt, self: this.selfPid, area, target: info && (info.e || info.space || info.q) ? info.target : null });
    this.aimTarget = info && info.target ? areaObjects(st, area).find((o) => o.id === info.target) : null;
    this.hud.update(st, { describe: info, self: this.selfPid, role: s.role, crew: s.role === 'host' ? s.crewNames : null, lost: s.lost }, dt);
    this.office.update(st);
    this.view.render();
    let guestsIn = 0;
    for (const p of st.parties) guestsIn += p.guests.length;
    setCrowd(area === 'restaurant' && (st.phase === 'service' || st.phase === 'closing') ? guestsIn : 0);
    const station = radioStation(st);
    setStation(station);
    setMuffled(area === 'alley');
    // A musical note drifts up from the radio now and then.
    this.noteIn = (this.noteIn ?? 1.5) - dt;
    if (this.noteIn <= 0) {
      this.noteIn = 1.6 + Math.random() * 1.4;
      const rc = station !== RADIO_OFF && area === 'restaurant' ? radioPlace(st) : null;
      if (rc) this.overlay.float(Math.random() < 0.5 ? '♪' : '♫', rc.x + 0.5, rc.wall ? 1.5 : 1.35, rc.z + 0.5, 'note');
    }
  }
}

window.twoForks = new App();
