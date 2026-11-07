// BGMと効果音（Web Audio でその場で合成。音声ファイルは使わない）
// BGM：ゆったりしたコード進行のパッドと、ときどき鳴るピアノ風の音。考えごとの邪魔にならない音量。
const KEY = 'chess-step-up/sound';

let prefs = { bgm: false, sfx: true };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* 保存できなくても動く */ }
const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* 無視 */ } };

let ctx = null;
let master, musicBus, sfxBus, reverb;
let timer = null;
let nextTime = 0;
let beat = 0;
let lastMelody = 76;
const listeners = new Set();

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // 残響（ノイズから作るインパルス応答）
  reverb = ctx.createConvolver();
  const len = ctx.sampleRate * 3.2;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  reverb.connect(wet).connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2400;
  musicBus.connect(tone);
  tone.connect(master);
  tone.connect(reverb);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.5;
  sfxBus.connect(master);

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (prefs.bgm || prefs.sfx) ctx.resume();
  });
  return ctx;
}

// ---------- BGM ----------
// Fmaj7 → Em7 → Dm7 → Cmaj7（各2小節、テンポ 64）
const PROGRESSION = [
  { bass: 41, pad: [57, 60, 64, 65] },
  { bass: 40, pad: [55, 59, 62, 64] },
  { bass: 38, pad: [57, 60, 62, 65] },
  { bass: 36, pad: [55, 59, 60, 64] },
];
const SCALE = [72, 74, 76, 79, 81, 84, 86, 88]; // Cメジャー・ペンタトニック
const BEAT = 60 / 64;
const BEATS_PER_CHORD = 8;

function padNote(midi, t, dur, gain, type = 'triangle') {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = midiHz(midi);
  o.detune.value = (Math.random() - 0.5) * 8;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 1.6);
  g.gain.setValueAtTime(gain, t + dur - 1.2);
  g.gain.linearRampToValueAtTime(0, t + dur + 1.0);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 1.2);
}

function pianoNote(midi, t, gain) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 2.6);
  g.connect(musicBus);
  [[1, 1], [2, 0.25], [3, 0.08]].forEach(([mul, amp]) => {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = midiHz(midi) * mul;
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 2.7);
  });
}

function scheduleBeat(t) {
  const chordIdx = Math.floor(beat / BEATS_PER_CHORD) % PROGRESSION.length;
  const chord = PROGRESSION[chordIdx];
  const inChord = beat % BEATS_PER_CHORD;
  if (inChord === 0) {
    const dur = BEAT * BEATS_PER_CHORD;
    chord.pad.forEach((m) => padNote(m, t, dur, 0.035));
    padNote(chord.bass, t, dur, 0.06, 'sine');
  }
  // メロディ：拍の約3割で、前の音の近くを選ぶ
  const p = inChord % 2 === 0 ? 0.34 : 0.14;
  if (Math.random() < p) {
    const near = SCALE.filter((n) => Math.abs(n - lastMelody) <= 5);
    const pick = near[Math.floor(Math.random() * near.length)] || SCALE[2];
    lastMelody = pick;
    const swing = inChord % 2 === 1 ? BEAT * 0.08 : 0;
    pianoNote(pick, t + swing, 0.05 + Math.random() * 0.03);
  }
  beat++;
}

function startBgm() {
  if (!ensureCtx()) return;
  ctx.resume();
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(0.55, ctx.currentTime, 0.8);
  if (timer) return;
  nextTime = ctx.currentTime + 0.1;
  beat = 0;
  timer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    while (nextTime < ctx.currentTime + 1.2) { scheduleBeat(nextTime); nextTime += BEAT; }
  }, 250);
}

function stopBgm() {
  if (!ctx) return;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  const t = timer;
  timer = null;
  setTimeout(() => { if (!timer) clearInterval(t); }, 1500);
}

// ---------- 効果音 ----------
function click(t, freq, gain, len = 0.06) {
  // 駒を置く「コトッ」という音：短いノイズ＋低い音
  const n = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  n.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq * 6;
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.value = gain;
  n.connect(f).connect(g).connect(sfxBus);
  n.start(t);
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.08);
  og.gain.setValueAtTime(gain * 0.6, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(og).connect(sfxBus);
  o.start(t);
  o.stop(t + 0.12);
}

function chime(t, notes, gap = 0.09, gain = 0.18) {
  notes.forEach((m, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = midiHz(m);
    const s = t + i * gap;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(gain, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, s + 0.7);
    o.connect(g).connect(sfxBus);
    o.start(s);
    o.stop(s + 0.75);
  });
}

const SFX = {
  move: (t) => click(t, 220, 0.5),
  capture: (t) => { click(t, 170, 0.75, 0.08); click(t + 0.05, 260, 0.3); },
  good: (t) => chime(t, [76, 83]),
  bad: (t) => chime(t, [52, 48], 0.12, 0.16),
  done: (t) => chime(t, [72, 76, 79, 84], 0.1),
};

export const sound = {
  get bgm() { return prefs.bgm; },
  get sfx() { return prefs.sfx; },
  onChange(fn) { listeners.add(fn); },
  setBgm(on) {
    prefs.bgm = on; savePrefs();
    on ? startBgm() : stopBgm();
    listeners.forEach((f) => f());
  },
  setSfx(on) {
    prefs.sfx = on; savePrefs();
    if (on && ensureCtx()) ctx.resume();
    listeners.forEach((f) => f());
  },
  play(name) {
    if (!prefs.sfx || !SFX[name]) return;
    if (!ensureCtx()) return;
    if (ctx.state !== 'running') ctx.resume();
    SFX[name](ctx.currentTime + 0.01);
  },
  // 前回BGMがオンなら、最初のタップで再開する（iPhoneは操作なしに音を出せないため）
  armAutoResume() {
    const go = () => {
      window.removeEventListener('pointerdown', go, true);
      if (prefs.bgm) startBgm();
      else if (prefs.sfx && ensureCtx()) ctx.resume();
    };
    window.addEventListener('pointerdown', go, true);
  },
};
