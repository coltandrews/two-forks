// Synthesized sound: no audio files. Short effects, dining-room chatter that
// grows with the crowd, and the kitchen radio (see data/radio.js).
import { SONGS, RADIO_OFF } from './data/radio.js';

let ctx = null, master, sfxBus, musicBus, ambBus, noiseBuf, muffle;
const vol = { sfx: 0.8, music: 0.45 };

try {
  const v = JSON.parse(localStorage.getItem('tf-volume') || 'null');
  if (v) Object.assign(vol, v);
} catch { /* storage blocked */ }

export function volumes() { return { ...vol }; }

export function setVolume(kind, v) {
  vol[kind] = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('tf-volume', JSON.stringify(vol)); } catch { /* ignore */ }
  if (!ctx) return;
  sfxBus.gain.value = vol.sfx;
  musicBus.gain.value = vol.music * 0.5;
  ambBus.gain.value = vol.sfx * 0.5;
}

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
  muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 18000; muffle.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = vol.music * 0.5; musicBus.connect(muffle);
  ambBus = ctx.createGain(); ambBus.gain.value = vol.sfx * 0.5; ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startAmbience();
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(freq, dur, type = 'sine', peak = 0.2, delay = 0, bus = sfxBus, attack = 0.005) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, attack, peak, dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
  return o;
}

function noise(dur, filterType, freq, peak = 0.2, delay = 0, q = 1, bus = sfxBus) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.005, peak, dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random());
  src.stop(t + dur + 0.1);
  return { src, f, g };
}

// A sizzle as soft scattered crackles instead of a hiss.
function crackle(dur, n, peak) {
  for (let i = 0; i < n; i++) noise(0.012, 'bandpass', 2500 + Math.random() * 3500, peak * (0.4 + Math.random() * 0.6), Math.random() * dur, 2);
}

// A small rising blip, like a bubble popping.
function bubble(freq, delay, peak) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 1.8, t + 0.04);
  env(g, t, 0.003, peak, 0.05);
  o.connect(g).connect(sfxBus);
  o.start(t); o.stop(t + 0.1);
}

const last = {};

export function sfx(name) {
  if (!ctx || ctx.state !== 'running') return;
  const now = performance.now();
  if (last[name] && now - last[name] < 60) return;
  last[name] = now;
  switch (name) {
    case 'pick': tone(520, 0.06, 'triangle', 0.12); tone(780, 0.05, 'triangle', 0.06, 0.03); break;
    case 'drop': tone(300, 0.08, 'triangle', 0.14); noise(0.05, 'lowpass', 900, 0.08); break;
    case 'plate': tone(1250, 0.12, 'sine', 0.06); tone(1880, 0.1, 'sine', 0.04, 0.02); break;
    case 'plateclink': tone(2100, 0.18, 'sine', 0.06); tone(2900, 0.15, 'sine', 0.035, 0.03); break;
    case 'sizzle': crackle(1.0, 16, 0.05); break;
    case 'fry': crackle(1.2, 12, 0.04); for (let i = 0; i < 9; i++) bubble(320 + Math.random() * 380, i * 0.12 + Math.random() * 0.05, 0.035); break;
    case 'pot': for (let i = 0; i < 4; i++) tone(180 + Math.random() * 120, 0.06, 'sine', 0.06, i * 0.09); break;
    case 'ding': tone(1568, 0.6, 'sine', 0.14); tone(2093, 0.5, 'sine', 0.06, 0.01); break;
    case 'chopdone': noise(0.04, 'bandpass', 1800, 0.25, 0, 3); tone(880, 0.12, 'triangle', 0.08, 0.04); break;
    case 'chop': noise(0.03, 'bandpass', 2200, 0.2, 0, 4); break;
    case 'burn': tone(392, 0.15, 'triangle', 0.09); tone(311, 0.3, 'triangle', 0.09, 0.17); break;
    case 'bin': noise(0.12, 'lowpass', 350, 0.16); tone(90, 0.15, 'sine', 0.18); break;
    case 'unpack': noise(0.12, 'lowpass', 1200, 0.25); tone(140, 0.12, 'sine', 0.15); break;
    case 'box': noise(0.09, 'lowpass', 700, 0.2); break;
    case 'fridge': tone(110, 0.25, 'sine', 0.08); noise(0.2, 'lowpass', 400, 0.05); break;
    case 'pour': for (let i = 0; i < 6; i++) bubble(420 + i * 70 + Math.random() * 60, i * 0.08, 0.05); break;
    case 'chat': tone(990, 0.07, 'sine', 0.07); tone(1320, 0.09, 'sine', 0.06, 0.06); break;
    case 'door': tone(1318, 0.5, 'sine', 0.09); tone(1046, 0.6, 'sine', 0.08, 0.16); break;
    case 'greet': tone(660, 0.1, 'triangle', 0.08); tone(880, 0.12, 'triangle', 0.07, 0.08); break;
    case 'seat': noise(0.1, 'lowpass', 600, 0.12); break;
    case 'ready': tone(988, 0.12, 'sine', 0.09); tone(1318, 0.18, 'sine', 0.08, 0.1); break;
    case 'ticket': for (let i = 0; i < 6; i++) noise(0.02, 'bandpass', 3000, 0.08, i * 0.035, 5); tone(1760, 0.1, 'sine', 0.05, 0.25); break;
    case 'serve': tone(784, 0.1, 'triangle', 0.1); tone(1046, 0.16, 'triangle', 0.09, 0.07); break;
    case 'check': tone(1046, 0.1, 'sine', 0.08); break;
    case 'cash': tone(1318, 0.08, 'square', 0.05); tone(1760, 0.25, 'sine', 0.1, 0.07); noise(0.08, 'highpass', 6000, 0.05, 0.06); break;
    case 'bell': tone(1046, 1.2, 'sine', 0.12); tone(1568, 1.0, 'sine', 0.06, 0.005); tone(2637, 0.6, 'sine', 0.03, 0.01); break;
    case 'level': [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, i * 0.09)); break;
    case 'truck': noise(0.9, 'lowpass', 150, 0.12); tone(1046, 0.12, 'sine', 0.05, 0.3); tone(1046, 0.12, 'sine', 0.05, 0.6); break;
    case 'error': tone(200, 0.12, 'square', 0.05); break;
    case 'ui': tone(700, 0.04, 'triangle', 0.06); break;
    case 'bad': tone(311, 0.2, 'triangle', 0.09); tone(233, 0.3, 'triangle', 0.09, 0.15); break;
  }
}

// ------------------------------------------------------------ dining-room chatter
// Each talker is a buzzing "voice" pushed through two moving vowel formants,
// spoken in short syllable phrases with pauses. A few talkers are active when
// the room is quiet; up to ten when it's packed. A small room reverb blends
// them into a distant murmur.

const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [300, 870], [570, 840], [440, 1020], [660, 1720], [400, 1900]];
const MAX_TALKERS = 10;
let talkers = [], chatterBus = null, crowd = 0, chatterTimer = null, clinkAt = 0;
const rnd = (a, b) => a + Math.random() * (b - a);

function roomVerb() {
  const len = Math.floor(ctx.sampleRate * 1.3);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const c = ctx.createConvolver();
  c.buffer = buf;
  return c;
}

function makeTalker(i) {
  const low = i % 2 === 0;                      // alternate deeper and higher voices
  const f0 = low ? rnd(95, 140) : rnd(175, 240);
  const fs = low ? 1 : 1.15;                    // formant scale
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = f0;
  const mk = (type, freq, q, gain) => {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    osc.connect(f).connect(g);
    return { f, g };
  };
  const f1 = mk('bandpass', 500, 5, 1.0), f2 = mk('bandpass', 1500, 7, 0.45), body = mk('lowpass', 320, 0.7, 0.3);
  const v = ctx.createGain(); v.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  for (const n of [f1, f2, body]) n.g.connect(v);
  if (pan) { pan.pan.value = rnd(-0.75, 0.75); v.connect(pan).connect(chatterBus); } else v.connect(chatterBus);
  osc.start();
  return { osc, f1: f1.f, f2: f2.f, v, f0, fs, next: ctx.currentTime + rnd(0.2, 3), active: false };
}

function speak(tk, t) {
  const laugh = Math.random() < 0.07;
  const n = laugh ? 4 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 9);
  const question = !laugh && Math.random() < 0.25;
  const loud = rnd(0.6, 1);
  let at = t;
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    const dur = laugh ? rnd(0.07, 0.1) : rnd(0.09, 0.22);
    let pitch = tk.f0 * (laugh ? 1.45 - k * 0.35 : 1.12 - k * 0.2 + rnd(-0.06, 0.06));
    if (question && i >= n - 2) pitch = tk.f0 * (1.15 + (i - n + 3) * 0.15);
    const [a, b] = laugh ? [800, 1250] : VOWELS[Math.floor(Math.random() * VOWELS.length)];
    tk.osc.frequency.setTargetAtTime(pitch, at, 0.03);
    tk.f1.frequency.setTargetAtTime(a * tk.fs, at, 0.02);
    tk.f2.frequency.setTargetAtTime(b * tk.fs, at, 0.02);
    tk.v.gain.setTargetAtTime(0.15 * loud * rnd(0.6, 1), at, 0.015);
    tk.v.gain.setTargetAtTime(0, at + dur * 0.75, 0.025);
    at += dur + (laugh ? 0.06 : Math.random() < 0.2 ? rnd(0.08, 0.16) : 0.015);
  }
  return at;
}

function chatterTick() {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const want = crowd <= 0 ? 0 : Math.min(MAX_TALKERS, Math.ceil(crowd * 0.6));
  const busy = Math.min(1, crowd / 16);
  chatterBus.gain.setTargetAtTime(crowd > 0 ? 0.55 + 0.45 * busy : 0, now, 0.8);
  talkers.forEach((tk, i) => {
    const on = i < want;
    if (on && !tk.active) tk.next = Math.max(tk.next, now + rnd(0.1, 2));
    tk.active = on;
    if (!on || tk.next > now + 0.4) return;
    const end = speak(tk, Math.max(tk.next, now + 0.05));
    tk.next = end + rnd(0.5, 3.6 - busy * 1.8);
  });
  // Now and then, cutlery on plates.
  if (crowd > 0 && now > clinkAt) {
    clinkAt = now + rnd(1.2, 6) / (0.4 + busy);
    const f = rnd(2400, 3600);
    for (let j = 0; j < (Math.random() < 0.4 ? 2 : 1); j++) tone(f * rnd(0.9, 1.1), 0.12, 'sine', 0.012 * (0.5 + busy), j * rnd(0.08, 0.16), chatterBus);
  }
}

function startAmbience() {
  chatterBus = ctx.createGain();
  chatterBus.gain.value = 0;
  const tone2 = ctx.createBiquadFilter(); tone2.type = 'lowpass'; tone2.frequency.value = 2200;
  const verb = roomVerb();
  const wet = ctx.createGain(); wet.gain.value = 0.55;
  const dry = ctx.createGain(); dry.gain.value = 0.5;
  chatterBus.connect(tone2);
  tone2.connect(dry).connect(ambBus);
  tone2.connect(verb).connect(wet).connect(ambBus);
  for (let i = 0; i < MAX_TALKERS; i++) talkers.push(makeTalker(i));
  chatterTimer = setInterval(chatterTick, 120);
}

/** Guests in the dining room right now; chatter follows it. */
export function setCrowd(n) { crowd = Math.max(0, n | 0); }

// ------------------------------------------------------------ the radio

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
};
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dim: [0, 3, 6], sus: [0, 5, 7] };

function parseChord(name) {
  const m = /^([A-G])([b#]?)(.*)$/.exec(name);
  const pc = (PC[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0) + 12) % 12;
  return { pc, iv: QUAL[m[3]] || QUAL[''] };
}

function degreeSemis(tok, scale) {
  const acc = tok[0] === 'b' ? -1 : tok[0] === '#' ? 1 : 0;
  const d = parseInt(acc ? tok.slice(1) : tok, 10);
  const idx = d - 1, oct = Math.floor(idx / 7), i = ((idx % 7) + 7) % 7;
  return scale[i] + 12 * oct + acc;
}

/** One synthesized note at absolute time t into bus. */
function voice(inst, t, n, dur, vel, bus) {
  const f = midi(n);
  const g = ctx.createGain();
  g.connect(bus);
  const osc = (type, freq, out = g) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(out); o.start(t); o.stop(t + dur + 1.6); return o; };
  const filt = (type, freq, q = 0.7) => { const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q; fl.connect(g); return fl; };
  const vib = (o, rate, cents) => { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = rate; lg.gain.value = f * (Math.pow(2, cents / 1200) - 1); l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 1.6); };
  const pluckEnv = (peak, decay) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + decay); };
  const susEnv = (peak, a, r) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + Math.max(a, dur - r)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + r); };
  switch (inst) {
    case 'pluck': { const fl = filt('lowpass', 3200); fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(500, t + 0.25); osc('sawtooth', f, fl); pluckEnv(0.07 * vel, Math.max(0.3, dur * 1.3)); break; }
    case 'piano': osc('triangle', f); osc('sine', f * 2); pluckEnv(0.05 * vel, Math.max(0.4, dur * 1.5)); break;
    case 'brass': { const fl = filt('lowpass', 700); fl.frequency.setValueAtTime(700, t); fl.frequency.linearRampToValueAtTime(2200, t + 0.05); osc('sawtooth', f, fl); susEnv(0.05 * vel, 0.03, 0.08); break; }
    case 'square': { const fl = filt('lowpass', 2600); osc('square', f, fl); susEnv(0.035 * vel, 0.01, 0.06); break; }
    case 'chip': osc('square', f); pluckEnv(0.018 * vel, 0.12); break;
    case 'bell': osc('sine', f); { const h = ctx.createGain(); h.gain.value = 0.25; h.connect(g); osc('sine', f * 3.01, h); } pluckEnv(0.07 * vel, 1.1); break;
    case 'organ': { osc('sine', f); const h = ctx.createGain(); h.gain.value = 0.4; h.connect(g); const o2 = osc('sine', f * 2, h); vib(o2, 6, 8); susEnv(0.045 * vel, 0.02, 0.06); break; }
    case 'harmonica': { const fl = filt('lowpass', 1500, 1.5); const o = osc('square', f, fl); vib(o, 5.5, 18); susEnv(0.04 * vel, 0.05, 0.1); break; }
    case 'pad': { const fl = filt('lowpass', 900); osc('sawtooth', f * 1.003, fl); osc('sawtooth', f * 0.997, fl); susEnv(0.012 * vel, Math.min(0.3, dur / 3), 0.3); break; }
    case 'bass': osc('triangle', f); susEnv(0.16 * vel, 0.02, 0.06); break;
    case 'synthbass': { const fl = filt('lowpass', 500, 4); fl.frequency.setValueAtTime(1400, t); fl.frequency.exponentialRampToValueAtTime(300, t + 0.15); osc('sawtooth', f, fl); susEnv(0.09 * vel, 0.005, 0.05); break; }
    case 'chipbass': osc('triangle', f); susEnv(0.14 * vel, 0.003, 0.02); break;
  }
}

function drum(kind, t, vel, bus) {
  const g = ctx.createGain();
  g.connect(bus);
  const hit = (peak, decay) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak * vel, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + decay); };
  const nz = (type, freq, q, dur, out = g, at = t) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f).connect(out); s.start(at, Math.random()); s.stop(at + dur);
  };
  switch (kind) {
    case 'k': { const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); o.connect(g); o.start(t); o.stop(t + 0.3); hit(0.32, 0.25); break; }
    case 's': nz('bandpass', 1800, 0.7, 0.15); { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 190; o.connect(g); o.start(t); o.stop(t + 0.1); } hit(0.09, 0.13); break;
    case 'h': nz('highpass', 7500, 0.7, 0.05); hit(0.03, 0.04); break;
    case 'z': nz('bandpass', 6000, 1.2, 0.06); hit(0.02, 0.05); break;
    case 'p': nz('bandpass', 3000, 4, 0.04); { const o = ctx.createOscillator(); o.frequency.value = 820; o.connect(g); o.start(t); o.stop(t + 0.04); } hit(0.06, 0.04); break;
    case 'c': for (let i = 0; i < 3; i++) nz('bandpass', 1500, 1, 0.03, g, t + i * 0.011); hit(0.08, 0.12); break;
  }
}

function chordTones(ch, lo = 55) {
  return ch.iv.map((iv) => { let n = ch.pc + iv; while (n < lo) n += 12; while (n >= lo + 12) n -= 12; return n; }).sort((a, b) => a - b);
}

// Original house jazz: a slow ii-V-I loop with walking bass and soft stabs.
const JAZZ = [
  [[62, 65, 69, 72], 50], [[67, 71, 74, 77], 55], [[60, 64, 67, 71], 48], [[57, 60, 64, 67], 45],
  [[62, 65, 69, 72], 50], [[67, 71, 74, 77], 43], [[64, 67, 71, 74], 52], [[57, 61, 64, 67], 45],
];
function jazzBar(t0, bar, bus) {
  const beat = 0.62;
  const [chord, root] = JAZZ[bar % JAZZ.length];
  for (let b = 0; b < 4; b++) {
    const bassNote = root - 12 + [0, 7, 12, 10][b] - (b === 3 && bar % 2 ? 2 : 0);
    voice('bass', t0 + b * beat, bassNote, beat * 0.85, 1, bus);
  }
  for (const hit of [0.5, 2.5]) {
    if (Math.random() < 0.15) continue;
    for (const n of chord) {
      const t = t0 + hit * beat + Math.random() * 0.02;
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.frequency.value = midi(n);
      f.type = 'lowpass'; f.frequency.value = 1800;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 1.6);
      o.connect(f).connect(g).connect(bus);
      o.start(t); o.stop(t + beat * 1.8);
    }
  }
  for (const b of [1, 3]) drum('h', t0 + b * beat, 0.8, bus);
  return beat * 4;
}

function songBar(song, t0, bar, bus) {
  const beats = song.beats || 4;
  const steps = beats * 4;
  const st = 60 / song.bpm / 4;                        // one sixteenth
  const swing = song.swing || 0;
  const at = (i) => t0 + i * st + (i % 4 === 2 ? swing * st : 0);
  const nb = song.bars.length;
  const bi = bar % nb, pass = Math.floor(bar / nb);
  const ch = parseChord(song.bars[bi]);
  const next = parseChord(song.bars[(bi + 1) % nb]);
  const scale = SCALES[song.scale] || SCALES.major;
  const bassRoot = 36 + ch.pc;

  // Bass.
  if (song.bass === 'walk') {
    const tones = [0, ch.iv[1], ch.iv[2], null];
    for (let b = 0; b < beats; b++) {
      let n = tones[b] == null ? (36 + next.pc) + (Math.random() < 0.5 ? -1 : 1) : bassRoot + tones[b];
      if (b === 2 && Math.random() < 0.4) n = bassRoot + 12;
      voice(song.bassInst, at(b * 4), n, st * 3.4, 1, bus);
    }
  } else {
    const pat = song.bass;
    for (let i = 0; i < steps; i++) {
      const c = pat[i];
      if (!c || c === '.') continue;
      let len = 1; while (i + len < steps && pat[i + len] === '.' && len < 4) len++;
      const iv = { R: 0, 3: ch.iv[1], 5: 7, 6: 9, 7: ch.iv[3] ?? 10, O: 12, A: (next.pc - ch.pc + 11) % 12 }[c] ?? 0;
      voice(song.bassInst, at(i), bassRoot + iv, st * len * 0.9, 1, bus);
    }
  }

  // Chords.
  for (const part of song.comp || []) {
    const tones = chordTones(ch).map((n) => n + (part.up || 0));
    if (part.type === 'pad') { for (const n of tones) voice(part.inst, at(0), n, st * steps * 0.95, 1, bus); continue; }
    let k = 0;
    for (let i = 0; i < steps; i++) {
      if (part.pat[i] !== 'x') continue;
      if (part.type === 'arp') voice(part.inst, at(i), tones[k++ % tones.length], st * 0.9, 0.8, bus);
      else if (part.type === 'strum') tones.forEach((n, j) => voice(part.inst, at(i) + j * 0.012, n, st * 1.5, 0.6, bus));
      else for (const n of tones) voice(part.inst, at(i), n, st * (part.type === 'skank' ? 0.7 : 1.2), part.type === 'skank' ? 0.9 : 0.75, bus);
    }
  }

  // Drums.
  for (const [kind, pat] of Object.entries(song.drums || {})) {
    for (let i = 0; i < steps; i++) {
      const c = pat[i];
      if (c === 'x' || c === 'X' || c === 'g') drum(kind, at(i), c === 'X' ? 1.3 : c === 'g' ? 0.45 : 1, bus);
    }
  }

  // Melody: rest the lead for the first half of every fourth pass, a little breakdown.
  const breakdown = pass % 4 === 3 && bi < nb / 2;
  if (!breakdown) {
    const toks = song.melody[bi].trim().split(/\s+/);
    const lift = pass % 2 === 1 ? 12 : 0;
    const base = song.key + (song.leadOct || 0);
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk === '.' || tk === '-') continue;
      let len = 1; while (toks[i + len] === '-') len++;
      const semis = degreeSemis(tk, scale);
      const t = at(i * 2), dur = st * 2 * len * 0.9;
      voice(song.lead, t, base + semis, dur, 1, bus);
      if (song.harmony) {
        const acc = tk[0] === 'b' || tk[0] === '#' ? tk[0] : '';
        const d = parseInt(acc ? tk.slice(1) : tk, 10) + song.harmony;
        voice(song.lead, t, base + degreeSemis(acc + d, scale), dur, 0.6, bus);
      }
      if (lift && (song.lead === 'bell' || song.lead === 'square' || song.lead === 'pluck')) voice('bell', t, base + semis + 12, dur, 0.35, bus);
    }
  }
  return st * steps;
}

let musicOn = false, musicTimer = null, station = 0, playing = null, pulseAt = [];

function startSong(n) {
  if (playing) {
    const old = playing.bus;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    setTimeout(() => old.disconnect(), 800);
    playing = null;
  }
  if (n >= RADIO_OFF) return;
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(musicBus);
  playing = { song: SONGS[n], bus, bar: 0, next: ctx.currentTime + 0.4 };
}

function tuneStatic() {
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.3);
  const g = ctx.createGain();
  env(g, t, 0.01, 0.06, 0.3);
  s.connect(f).connect(g).connect(musicBus);
  s.start(t, Math.random()); s.stop(t + 0.4);
  tone(1600, 0.03, 'square', 0.015, 0, musicBus);
}

function musicTick() {
  if (!ctx || !musicOn || !playing) return;
  // Schedule a bit ahead so background tabs (throttled timers) don't gap.
  while (playing.next < ctx.currentTime + 1.2) {
    const p = playing;
    const len = p.song.legacy ? jazzBar(p.next, p.bar, p.bus) : songBar(p.song, p.next, p.bar, p.bus);
    const beats = p.song.legacy ? 4 : (p.song.beats || 4);
    for (let b = 0; b < beats; b++) pulseAt.push(p.next + (len / beats) * b);
    p.next += len;
    p.bar++;
  }
  const now = ctx.currentTime;
  pulseAt = pulseAt.filter((t) => t > now - 0.5);
}

export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  startSong(station);
  musicTimer = setInterval(musicTick, 100);
  musicTick();
}

export function stopMusic() {
  musicOn = false;
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (playing) { playing.bus.disconnect(); playing = null; }
}

/** Follow the shared radio station. Changes play a burst of tuning static. */
export function setStation(n) {
  if (n === station) return;
  station = n;
  if (!ctx || !musicOn) return;
  tuneStatic();
  startSong(n);
}

/** Outside, the radio sounds like it's through the wall. */
export function setMuffled(on) {
  if (!muffle) return;
  muffle.frequency.setTargetAtTime(on ? 650 : 18000, ctx.currentTime, 0.15);
}

/** 0..1, peaking on each beat of the radio. For a little bounce on the radio model. */
export function musicPulse() {
  if (!ctx || !playing) return 0;
  const now = ctx.currentTime;
  let best = Infinity;
  for (const t of pulseAt) if (t <= now) best = Math.min(best, now - t);
  return best === Infinity ? 0 : Math.max(0, 1 - best * 5);
}
