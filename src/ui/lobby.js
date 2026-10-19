// Title screen, saves, picking a cuisine, joining by code, and the chef
// customizer with a live 3D preview.
import * as THREE from 'three';
import { CUISINES, CUISINE_ORDER } from '../data/cuisines.js';
import { newState, decodeSave, WEEKDAYS } from '../sim/state.js';
import { sanitizeLook } from '../sim/sim.js';
import { makePerson, animatePerson } from '../view/models.js';
import { cleanCode } from '../net/net.js';
import { esc } from './overlay.js';
import { money0 } from './hud.js';
import { sfx, unlockAudio } from '../audio.js';

export const HAT_COLORS = ['#ffffff', '#222222', '#c8282e', '#22365e', '#3f7a4a', '#e0a82e', '#f08cb0', '#9a7ad0'];
export const APRON_COLORS = ['#ffffff', '#3a6ea8', '#2a2a2e', '#c8282e', '#4a8a5a', '#e0a83a', '#c8643c', '#f08cb0'];
export const SHIRT_COLORS = ['#f6f3ec', '#2a2a2e', '#22365e', '#7a9a7a', '#7a2a3a', '#7ab8d8', '#c8a878'];
export const SKIN = ['#f3d2b8', '#e8b894', '#d09a70', '#a8714a', '#7a4e30', '#5a3820'];
export const HAIR = ['#2a1e16', '#4a3020', '#8a5a2a', '#d8b060', '#b04a24', '#8a8a8a', '#1a1a22', '#e8e0d0'];
const HAIR_STYLES = ['Short', 'Long', 'Bun', 'Bald'];

// ------------------------------------------------------------ storage

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export function loadProfile() {
  const p = store.get('tf-chef', null);
  return p ? { name: p.name || '', look: sanitizeLook(p.look) } : null;
}
export function saveProfile(p) { store.set('tf-chef', p); }

export function listSaves() { return store.get('tf-saves', []).sort((a, b) => b.updated - a.updated); }

export function writeSave(id, state) {
  const ok = store.set('tf-save-' + id, state);
  const list = store.get('tf-saves', []).filter((s) => s.id !== id);
  list.push({ id, name: state.name, cuisine: state.cuisine, mode: state.mode === 'story' ? 'story' : 'arcade', day: state.day, cash: state.cash, phase: state.phase, updated: Date.now() });
  store.set('tf-saves', list);
  return ok;
}

export function readSave(id) { return store.get('tf-save-' + id, null); }

function deleteSave(id) {
  store.del('tf-save-' + id);
  store.set('tf-saves', store.get('tf-saves', []).filter((s) => s.id !== id));
}

// ------------------------------------------------------------ lobby

export class Lobby {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('lobby');
    this.card = document.createElement('div');
    this.card.className = 'lobby-card';
    this.root.replaceChildren(this.card);
    this.screen = 'title';
    this.mode = 'host';
    this.pick = 'southern';
    this.pickName = CUISINES.southern.name;
    this.gameMode = 'story';
    this.startCash = 3000;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-in=code]')) this.join();
      if (e.key === 'Enter' && e.target.matches('[data-in=rname]')) this.create();
    });
  }

  show(screen = 'title') {
    this.root.hidden = false;
    this.go(screen);
  }

  hide() { this.root.hidden = true; this.stopPreview(); }

  setStarting(on) {
    this.starting = on;
    this.root.setAttribute('aria-busy', String(on));
    if (!this.root.hidden) this.render();
  }

  go(screen) {
    this.screen = screen;
    this.err = '';
    this.render();
    this.card.scrollTop = 0;
  }

  render() {
    let h = '';
    const prof = this.app.profile;
    switch (this.screen) {
      case 'title':
        h = `<div class="title"><h1>Two <span class="amp">Forks</span></h1></div>
        <div class="choices">
          <button class="choice" data-act="host"><h3>Host a restaurant</h3><p>Saved on this device.</p></button>
          <button class="choice" data-act="joinscr"><h3>Join a restaurant</h3><p>Use the host's room code.</p></button>
          <button class="choice" data-act="solo"><h3>Play solo</h3><p>Fewer guests.</p></button>
        </div>
        <div class="lobby-foot"><div class="me">${prof && prof.name ? `<b>${esc(prof.name)}</b>` : ''} <button class="btn small" data-act="chef">${prof && prof.name ? 'Change chef' : 'Create chef'}</button></div></div>`;
        break;
      case 'saves': {
        const saves = listSaves();
        h = `<button class="btn small ghost back" data-act="title">← Back</button><div class="title"><h1 class="small">${this.mode === 'solo' ? 'Play solo' : 'Host a restaurant'}</h1></div>
        <div class="saves">${saves.map((s) => {
          const c = CUISINES[s.cuisine];
          return `<button class="save" data-act="load" data-id="${s.id}"><span class="sw" style="background:${c.palette.ui}"></span><span><b>${esc(s.name)} <small class="mode-badge ${s.mode === 'story' ? 'story' : ''}">${s.mode === 'story' ? 'STORY' : 'ARCADE'}</small></b><span>${c.style} · Day ${s.day} (${WEEKDAYS[(s.day - 1) % 7]}) · ${money0(s.cash)} · saved ${new Date(s.updated).toLocaleString()}</span></span><span class="icon-btn del" data-act="del" data-id="${s.id}" title="Delete save">🗑</span></button>`;
        }).join('') || '<div class="hint-line">No saved restaurants.</div>'}</div>
        <div class="lobby-foot"><button class="btn primary" data-act="new">Open a new restaurant</button><button class="btn ghost" data-act="importscr">Import a save code</button></div>`;
        break;
      }
      case 'new': {
        const c = CUISINES[this.pick];
        h = `<button class="btn small ghost back" data-act="saves">← Back</button><div class="title"><h1 class="small">New restaurant</h1><p>Cuisine cannot be changed later.</p></div>
        <div class="mode-choices" aria-label="Game mode">
          <button class="mode-choice ${this.gameMode === 'story' ? 'sel' : ''}" data-act="gameMode" data-id="story" aria-pressed="${this.gameMode === 'story'}"><b>Story</b><span>Start small with $600. Unlock recipes, equipment, and floor space.</span></button>
          <button class="mode-choice ${this.gameMode === 'arcade' ? 'sel' : ''}" data-act="gameMode" data-id="arcade" aria-pressed="${this.gameMode === 'arcade'}"><b>Arcade</b><span>Full floor space and all recipes unlocked.</span></button>
        </div>
        ${this.gameMode === 'arcade' ? `<div class="field arcade-cash"><label>Starting cash</label><div class="seg">${[[5000, 'Relaxed'], [3000, 'Normal'], [1500, 'Tight']].map(([cash, name]) => `<button class="${this.startCash === cash ? 'on' : ''}" data-act="startCash" data-cash="${cash}" aria-pressed="${this.startCash === cash}">${name} · ${money0(cash)}</button>`).join('')}</div></div>` : ''}
        <div class="cuisines">${CUISINE_ORDER.map((id) => {
          const z = CUISINES[id];
          const p = z.palette;
          const sw = [p.wall, p.floorA, p.counter, p.accent, p.accent2].map((x) => `<i style="background:#${x.toString(16).padStart(6, '0')}"></i>`).join('');
          return `<button class="cuisine ${this.pick === id ? 'sel' : ''}" data-act="cuisine" data-id="${id}"><div class="sw">${sw}</div><div class="tx"><b>${esc(z.style)}</b></div></button>`;
        }).join('')}</div>
        <div class="field"><label>Restaurant name</label><input data-in="rname" maxlength="32" value="${esc(this.pickName)}"></div>
        <div class="lobby-foot"><button class="btn primary" data-act="create">Open ${esc(this.pickName || c.name)}</button></div>`;
        break;
      }
      case 'join':
        h = `<button class="btn small ghost back" data-act="title">← Back</button><div class="title"><h1 class="small">Join a restaurant</h1><p>The room code is at the bottom-right of the host's screen.</p></div>
        <div class="field" style="max-width:360px;margin:16px auto"><input class="codein" data-in="code" maxlength="4" placeholder="ABCD" autocomplete="off" spellcheck="false" value="${esc(this.code || '')}"></div>
        <div style="text-align:center"><button class="btn primary" data-act="join" ${this.joining ? 'disabled' : ''}>${this.joining ? '<span class="spinner"></span>Joining…' : 'Join'}</button><p class="err">${esc(this.err || '')}</p></div>`;
        break;
      case 'import':
        h = `<button class="btn small ghost back" data-act="saves">← Back</button><div class="title"><h1 class="small">Import a save code</h1><p>Paste a code from the Restaurant tab or the pause menu.</p></div>
        <textarea class="code" data-in="import" placeholder="TF1.…"></textarea><p class="err">${esc(this.err || '')}</p>
        <div class="lobby-foot"><button class="btn primary" data-act="doimport">Load it</button></div>`;
        break;
      case 'chef':
        h = this.chefHtml();
        break;
    }
    if (this.screen === 'chef' && this.preview) {
      // Keep the canvas and its WebGL context when the editor changes.
      const content = document.createElement('div');
      content.innerHTML = h;
      this.card.querySelector('.opts').replaceWith(content.querySelector('.opts'));
    } else {
      this.stopPreview();
      this.card.innerHTML = h;
      if (this.screen === 'chef') this.startPreview();
    }
    if (this.starting) {
      for (const control of this.card.querySelectorAll('button, input, textarea')) control.disabled = true;
      const status = document.createElement('p');
      status.className = 'hint-line';
      status.setAttribute('role', 'status');
      status.textContent = 'Opening the kitchen…';
      this.card.appendChild(status);
    }
    const ci = this.root.querySelector('[data-in=code]');
    if (ci) ci.focus();
  }

  chefHtml() {
    const p = this.chefDraft;
    const L = p.look;
    const sw = (key, list) => `<div class="swatches">${list.map((c) => `<button class="swatch ${L[key] === c ? 'sel' : ''}" style="background:${c}" data-act="look" data-k="${key}" data-v="${c}" aria-label="${c}"></button>`).join('')}</div>`;
    const onoff = (key) => `<span class="seg"><button class="${L[key] ? 'on' : ''}" data-act="look" data-k="${key}" data-v="1">On</button><button class="${!L[key] ? 'on' : ''}" data-act="look" data-k="${key}" data-v="0">Off</button></span>`;
    return `${this.chefBack ? '<button class="btn small ghost back" data-act="chefcancel">← Back</button>' : ''}<div class="title"><h1 class="small">${this.firstChef ? 'Create chef' : 'Your chef'}</h1></div>
      <div class="chef-ed"><div class="chef-prev" id="chef-prev"></div><div class="opts">
        <div class="field" style="margin-top:0"><label>Chef name</label><input data-in="cname" maxlength="16" value="${esc(p.name)}" placeholder="Your name"></div>
        <div class="opt"><label>Chef hat ${onoff('hat')}</label>${L.hat ? sw('hatColor', HAT_COLORS) : ''}</div>
        <div class="opt"><label>Apron ${onoff('apron')}</label>${L.apron ? sw('apronColor', APRON_COLORS) : ''}</div>
        <div class="opt"><label>Jacket</label>${sw('shirt', SHIRT_COLORS)}</div>
        <div class="opt"><label>Skin</label>${sw('skin', SKIN)}</div>
        <div class="opt"><label>Hair <span class="seg">${HAIR_STYLES.map((n, i) => `<button class="${L.hairStyle === i ? 'on' : ''}" data-act="look" data-k="hairStyle" data-v="${i}">${n}</button>`).join('')}</span></label>${L.hairStyle !== 3 ? sw('hair', HAIR) : ''}</div>
        <button class="btn primary" data-act="chefsave">${this.firstChef ? "Let's cook" : 'Save chef'}</button><span class="err" style="margin-left:10px">${esc(this.err || '')}</span>
      </div></div>`;
  }

  openChef(after, back = true) {
    const p = this.app.profile || { name: '', look: sanitizeLook({ hatColor: HAT_COLORS[0], apronColor: APRON_COLORS[(Math.random() * 8) | 0], shirt: SHIRT_COLORS[0], skin: SKIN[(Math.random() * 6) | 0], hair: HAIR[(Math.random() * 8) | 0], hairStyle: (Math.random() * 3) | 0 }) };
    this.chefDraft = JSON.parse(JSON.stringify(p));
    this.afterChef = after;
    this.chefBack = back;
    this.firstChef = !this.app.profile;
    this.root.hidden = false;
    this.go('chef');
  }

  startPreview() {
    const host = this.root.querySelector('#chef-prev');
    if (!host) return;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    r.setSize(260, 320);
    r.toneMapping = THREE.NeutralToneMapping;
    host.appendChild(r.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e4, 0x8a6a50, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.0);
    d.position.set(2, 4, 3);
    scene.add(d);
    const cam = new THREE.PerspectiveCamera(30, 260 / 320, 0.1, 50);
    cam.position.set(0, 1.55, 4.6);
    cam.lookAt(0, 1.05, 0);
    const pv = { r, scene, cam, model: null, key: '', t: 0, alive: true };
    this.preview = pv;
    const loop = () => {
      if (!pv.alive) return;
      const key = JSON.stringify(this.chefDraft.look);
      if (key !== pv.key) {
        if (pv.model) { scene.remove(pv.model.root); disposePreviewModel(pv.model); }
        pv.model = makePerson(this.chefDraft.look, true);
        scene.add(pv.model.root);
        pv.key = key;
      }
      pv.t += 0.016;
      pv.model.root.rotation.y = Math.sin(pv.t * 0.6) * 0.7 + 0.3;
      animatePerson(pv.model, { speed: 0, dt: 0.016, t: pv.t });
      r.render(scene, cam);
      requestAnimationFrame(loop);
    };
    loop();
  }

  stopPreview() {
    if (!this.preview) return;
    this.preview.alive = false;
    if (this.preview.model) disposePreviewModel(this.preview.model);
    this.preview.r.dispose();
    this.preview.r.forceContextLoss();
    this.preview = null;
  }

  needChef(next) {
    if (this.app.profile && this.app.profile.name) { next(); return; }
    this.openChef(next, true);
  }

  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    unlockAudio();
    const a = b.dataset.act;
    if (a !== 'look') sfx('ui');
    switch (a) {
      case 'title': this.go('title'); break;
      case 'host': this.needChef(() => { this.mode = 'host'; this.go('saves'); }); break;
      case 'solo': this.needChef(() => { this.mode = 'solo'; this.go('saves'); }); break;
      case 'joinscr': this.needChef(() => this.go('join')); break;
      case 'saves': this.go('saves'); break;
      case 'new': this.go('new'); break;
      case 'gameMode': this.gameMode = b.dataset.id === 'arcade' ? 'arcade' : 'story'; this.render(); break;
      case 'startCash': this.startCash = +b.dataset.cash; this.render(); break;
      case 'importscr': this.go('import'); break;
      case 'cuisine': {
        const was = CUISINES[this.pick].name;
        this.pick = b.dataset.id;
        if (!this.pickName || this.pickName === was) this.pickName = CUISINES[this.pick].name;
        this.render();
        break;
      }
      case 'create': this.create(); break;
      case 'load': {
        if (e.target.closest('[data-act=del]')) return;
        const s = readSave(b.dataset.id);
        if (!s) { this.err = 'That save could not be read.'; this.render(); return; }
        this.app.start({ mode: this.mode, state: s, saveId: b.dataset.id, loaded: true });
        break;
      }
      case 'del':
        e.stopPropagation();
        if (confirm('Delete this restaurant for good?')) { deleteSave(b.dataset.id); this.render(); }
        break;
      case 'join': this.join(); break;
      case 'doimport': this.doImport(); break;
      case 'chef': this.openChef(() => this.go('title'), true); break;
      case 'chefcancel': if (this.afterChef && this.app.profile) this.afterChef(true); else this.go('title'); break;
      case 'look': {
        const k = b.dataset.k;
        let v = b.dataset.v;
        if (k === 'hat' || k === 'apron') v = v === '1';
        if (k === 'hairStyle') v = +v;
        this.chefDraft.look[k] = v;
        sfx('pick');
        const name = this.root.querySelector('[data-in=cname]');
        if (name) this.chefDraft.name = name.value;
        this.render();
        break;
      }
      case 'chefsave': {
        const name = (this.root.querySelector('[data-in=cname]').value || '').trim();
        if (!name) { this.err = 'Give your chef a name.'; this.render(); return; }
        this.chefDraft.name = name;
        this.app.setProfile({ name, look: sanitizeLook(this.chefDraft.look) });
        const next = this.afterChef;
        this.afterChef = null;
        if (next) next(); else this.go('title');
        break;
      }
    }
  }

  onInput(e) {
    const t = e.target;
    if (t.dataset.in === 'rname') {
      this.pickName = t.value;
      const btn = this.root.querySelector('[data-act=create]');
      if (btn) btn.textContent = 'Open ' + (t.value || CUISINES[this.pick].name);
    }
    if (t.dataset.in === 'code') { t.value = cleanCode(t.value); this.code = t.value; }
    if (t.dataset.in === 'cname' && this.chefDraft) this.chefDraft.name = t.value;
  }

  create() {
    const name = (this.pickName || '').trim() || CUISINES[this.pick].name;
    const state = newState({ cuisine: this.pick, name, mode: this.gameMode, cash: this.startCash });
    this.app.start({ mode: this.mode, state, saveId: 's' + Date.now().toString(36), loaded: false });
  }

  async join() {
    const code = cleanCode(this.code);
    if (code.length !== 4) { this.err = 'Codes are four letters.'; this.render(); return; }
    this.joining = true;
    this.err = '';
    this.render();
    try {
      await this.app.join(code);
    } catch (err) {
      this.err = err.message || 'Could not join.';
    }
    this.joining = false;
    if (!this.root.hidden) this.render();
  }

  async doImport() {
    const text = this.root.querySelector('[data-in=import]').value;
    try {
      const s = await decodeSave(text);
      const id = 's' + Date.now().toString(36);
      writeSave(id, s);
      this.app.start({ mode: this.mode, state: s, saveId: id, loaded: true });
    } catch (err) {
      this.err = "That code didn't work: " + (err.message || 'unreadable');
      this.render();
    }
  }
}

function disposePreviewModel(model) {
  model.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  model.material.dispose();
}
