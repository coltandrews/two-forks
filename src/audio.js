// Synthesized sound: no audio files. Short effects, a dining-room murmur that
// grows with the crowd, and a gentle generated jazz loop.
let ctx = null, master, sfxBus, musicBus, ambBus, noiseBuf;
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
  musicBus = ctx.createGain(); musicBus.gain.value = vol.music * 0.5; musicBus.connect(master);
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
    case 'sizzle': { const n = noise(1.1, 'highpass', 3500, 0.09); n.f.frequency.linearRampToValueAtTime(5200, ctx.currentTime + 1); break; }
    case 'fry': noise(1.4, 'bandpass', 2600, 0.12, 0, 0.6); break;
    case 'pot': for (let i = 0; i < 4; i++) tone(180 + Math.random() * 120, 0.06, 'sine', 0.06, i * 0.09); break;
    case 'ding': tone(1568, 0.6, 'sine', 0.14); tone(2093, 0.5, 'sine', 0.06, 0.01); break;
    case 'chopdone': noise(0.04, 'bandpass', 1800, 0.25, 0, 3); tone(880, 0.12, 'triangle', 0.08, 0.04); break;
    case 'chop': noise(0.03, 'bandpass', 2200, 0.2, 0, 4); break;
    case 'burn': tone(220, 0.25, 'sawtooth', 0.08); tone(196, 0.3, 'sawtooth', 0.08, 0.25); break;
    case 'bin': noise(0.18, 'lowpass', 500, 0.3); tone(90, 0.15, 'sine', 0.2); break;
    case 'unpack': noise(0.12, 'lowpass', 1200, 0.25); tone(140, 0.12, 'sine', 0.15); break;
    case 'box': noise(0.09, 'lowpass', 700, 0.2); break;
    case 'fridge': tone(110, 0.25, 'sine', 0.08); noise(0.2, 'lowpass', 400, 0.05); break;
    case 'pour': { const n = noise(0.6, 'bandpass', 900, 0.12, 0, 2); n.f.frequency.linearRampToValueAtTime(1800, ctx.currentTime + 0.6); break; }
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
    case 'truck': noise(0.8, 'lowpass', 220, 0.2); tone(70, 0.6, 'sawtooth', 0.04); break;
    case 'error': tone(200, 0.12, 'square', 0.05); break;
    case 'ui': tone(700, 0.04, 'triangle', 0.06); break;
    case 'bad': tone(311, 0.2, 'triangle', 0.09); tone(233, 0.3, 'triangle', 0.09, 0.15); break;
  }
}

// ------------------------------------------------------------ ambience and music

let murmur = null, crowd = 0, musicOn = false, musicTimer = null;

function startAmbience() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 520;
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.31;
  const lg = ctx.createGain();
  lg.gain.value = 120;
  lfo.connect(lg).connect(f.frequency);
  lfo.start();
  src.connect(f).connect(g).connect(ambBus);
  src.start();
  murmur = g;
}

export function setCrowd(n) {
  crowd = n;
  if (!murmur) return;
  murmur.gain.setTargetAtTime(Math.min(0.22, n * 0.018), ctx.currentTime, 1.2);
}

// A slow ii-V-I loop with walking bass and soft chord stabs.
const PROG = [
  [[62, 65, 69, 72], 50], [[67, 71, 74, 77], 55], [[60, 64, 67, 71], 48], [[57, 60, 64, 67], 45],
  [[62, 65, 69, 72], 50], [[67, 71, 74, 77], 43], [[64, 67, 71, 74], 52], [[57, 61, 64, 67], 45],
];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  let bar = 0;
  const beat = 0.62;
  const play = () => {
    if (!musicOn) return;
    const [chord, root] = PROG[bar % PROG.length];
    const t0 = ctx.currentTime + 0.05;
    for (let b = 0; b < 4; b++) {
      const bassNote = root - 12 + [0, 7, 12, 10][b] - (b === 3 && bar % 2 ? 2 : 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(midi(bassNote), t0 + b * beat);
      g.gain.setValueAtTime(0.0001, t0 + b * beat);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + b * beat + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + b * beat + beat * 0.9);
      o.connect(g).connect(musicBus);
      o.start(t0 + b * beat); o.stop(t0 + b * beat + beat);
    }
    for (const hit of [0.5, 2.5]) {
      if (Math.random() < 0.15) continue;
      for (const n of chord) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sine';
        o.frequency.value = midi(n);
        f.type = 'lowpass'; f.frequency.value = 1800;
        const t = t0 + hit * beat + Math.random() * 0.02;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 1.6);
        o.connect(f).connect(g).connect(musicBus);
        o.start(t); o.stop(t + beat * 1.8);
      }
    }
    // Brushed hi-hat on 2 and 4.
    for (const b of [1, 3]) noise(0.06, 'highpass', 7000, 0.025, 0.05 + b * beat, 1, musicBus);
    bar++;
    musicTimer = setTimeout(play, beat * 4 * 1000 - 20);
  };
  play();
}

export function stopMusic() {
  musicOn = false;
  if (musicTimer) clearTimeout(musicTimer);
}
