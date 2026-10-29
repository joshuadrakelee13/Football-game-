/*  LANTERN WALL — engine
    Gameplay rules, physics and timing live here and in levels.js.
    Every colour and every piece of sprite art comes from skin.js. */
(() => {
'use strict';

const SKIN = window.SKIN, LEVELS = window.LEVELS;
// The screen is one whole level wide, so the entire wall is always in view (no scrolling).
const PIECE = 224;                  // one piece of wall; a level is PIECES pieces plus the BELL_TAIL
const PIECES = 2;
const BELL_TAIL = 40;               // walkway after the last piece, where the belfry (or the tower) stands
const W = PIECES * PIECE + BELL_TAIL, H = 256;
const OX = (W - 224) / 2;           // left edge of a centred 224-wide column, for the title text
const FLOOR = 176;            // walkway surface
const MOAT = 226;             // water line
const BAR = 244;              // bottom status bar
const START_X = 14, GOAL_X = W - 24;   // GOAL_X: where the title-screen demo stops
const TOWER_W = 22, TOWER_TOP = FLOOR - 74;   // the queen's tower at the end of the last section
const BELL_TOP = FLOOR - 90;        // where the belfry bell hangs from its beam
const ROPE_END = FLOOR - 10;        // bottom of the bell rope
const BELL_RING = 24, BELL_FLY = 46;   // frames the bell swings, then frames it flies to the HUD

// Arcade physics at 60 steps per second. Once a jump starts there is no air control.
const PHYS = {
  run: 1.0,
  jumpVy: -2.6,
  gravity: 0.13,
  maxFall: 4.5,
  releaseVy: -1.4,      // extra lift when letting go of a chain
  maxReleaseVx: 1.9,
};
// Fixed hitboxes, independent of the sprite art.
const HERO = { halfW: 3.5, height: 13, foot: 2 };
const KNIGHT = { halfW: 4, height: 15, hang: 18 };   // hang: how far below the walkway he clings under a breach

const SECTIONS = LEVELS.sections;
SECTIONS.forEach(d => { if (d.pieces.length !== PIECES) console.warn(`levels.js: "${d.name}" needs exactly ${PIECES} pieces`); });
const SEC_LEN = SECTIONS.map(() => W);
const SEC_START = SEC_LEN.map((_, i) => SEC_LEN.slice(0, i).reduce((a, b) => a + b, 0));
const ROUND_LEN = SEC_LEN.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- canvas

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
ctx.imageSmoothingEnabled = false;
const screenEl = document.getElementById('screen');
const stageEl = document.getElementById('stage');

function fit() {
  let s = Math.min(stageEl.clientWidth / W, stageEl.clientHeight / H);
  if (s >= 2) s = Math.floor(s);
  s = Math.max(s, 0.5);
  screenEl.style.width = W * s + 'px';
  screenEl.style.height = H * s + 'px';
  screenEl.style.setProperty('--px', s + 'px');
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- sprites

const SPR = {};
for (const [name, rows] of Object.entries(SKIN.sprites)) SPR[name] = makeSprite(name, rows);

function makeSprite(name, rows) {
  const h = rows.length, w = rows[0].length;
  const img = document.createElement('canvas');
  img.width = w; img.height = h;
  const g = img.getContext('2d');
  rows.forEach((row, y) => {
    if (row.length !== w) console.warn(`skin.js: sprite "${name}" row ${y} is ${row.length} wide, expected ${w}`);
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = SKIN.palette[ch];
      if (!col) { console.warn(`skin.js: no palette colour for "${ch}" in sprite "${name}"`); continue; }
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  const flip = document.createElement('canvas');
  flip.width = w; flip.height = h;
  const fg = flip.getContext('2d');
  fg.translate(w, 0); fg.scale(-1, 1); fg.drawImage(img, 0, 0);
  return { w, h, img, flip };
}

function spr(name, x, y, flip = false) {
  const s = SPR[name];
  if (s) ctx.drawImage(flip ? s.flip : s.img, Math.round(x), Math.round(y));
}

// ---------------------------------------------------------------- 5x7 font

const FONT_SRC = {
  '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111', '3': '11111 00010 00100 00010 00001 10001 01110',
  '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11100 10010 10001 10001 10001 10010 11100',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  '.': '00000 00000 00000 00000 00000 01100 01100', '-': '00000 00000 00000 11111 00000 00000 00000',
  '!': '00100 00100 00100 00100 00100 00000 00100', ':': '00000 01100 01100 00000 01100 01100 00000',
  '/': '00001 00010 00010 00100 01000 01000 10000', "'": '00100 00100 01000 00000 00000 00000 00000',
  '?': '01110 10001 00001 00010 00100 00000 00100', ',': '00000 00000 00000 00000 01100 00100 01000',
  '>': '01000 00100 00010 00001 00010 00100 01000', '<': '00010 00100 01000 10000 01000 00100 00010',
};
const FONT = {};
for (const [ch, s] of Object.entries(FONT_SRC)) FONT[ch] = s.split(' ').map(r => parseInt(r, 2));
const glyphCache = new Map();

function glyph(ch, color) {
  const key = ch + color;
  let g = glyphCache.get(key);
  if (g) return g;
  g = document.createElement('canvas');
  g.width = 5; g.height = 7;
  const gc = g.getContext('2d');
  gc.fillStyle = color;
  (FONT[ch] || FONT['?']).forEach((bits, y) => {
    for (let x = 0; x < 5; x++) if (bits & (16 >> x)) gc.fillRect(x, y, 1, 1);
  });
  glyphCache.set(key, g);
  return g;
}

function text(str, x, y, color, scale = 1) {
  str = String(str).toUpperCase();
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== ' ') ctx.drawImage(glyph(str[i], color), Math.round(x + i * 6 * scale), Math.round(y), 5 * scale, 7 * scale);
  }
}
const textW = (str, scale = 1) => (String(str).length * 6 - 1) * scale;
const ctext = (str, y, color, scale = 1) => text(str, Math.round((W - textW(str, scale)) / 2), y, color, scale);
const pad = (n, len) => String(Math.floor(n)).padStart(len, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = arr => arr[(Math.random() * arr.length) | 0];

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- sound

let actx = null;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
  if (actx.state === 'suspended') actx.resume();
}
function beep(f0, f1, dur, type = 'square', vol = 0.07, delay = 0) {
  if (!actx || G.muted) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.12, cutoff = 1800) {
  if (!actx || G.muted) return;
  const t = actx.currentTime, n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(actx.destination);
  src.start(t);
}
function tune(seq, step = 0.085) {
  let d = 0;
  for (const [m, len] of seq) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    beep(f, f, step * len * 0.9, 'square', 0.05, d);
    beep(f / 2, f / 2, step * len * 0.9, 'triangle', 0.06, d);
    d += step * len;
  }
}
const TUNES = {
  start: [[72, 1], [76, 1], [79, 1], [84, 2], [79, 1], [84, 3]],
  clear: [[79, 1], [84, 1], [88, 1], [91, 2], [88, 1], [91, 1], [96, 4]],
  over: [[72, 3], [67, 3], [64, 3], [60, 8]],
  life: [[84, 1], [88, 1], [91, 1], [96, 1], [91, 1], [96, 3]],
};
const SFX = {
  jump: () => beep(220, 660, 0.14),
  land: () => beep(140, 90, 0.05, 'triangle', 0.08),
  bolt: () => beep(900, 300, 0.08, 'sawtooth', 0.025),
  bat: () => beep(1500, 1100, 0.05, 'square', 0.02),
  grab: () => beep(500, 760, 0.07),
  pickup: () => [0, 0.06, 0.12].forEach((d, i) => beep(880 * (1 + i * 0.26), 880 * (1 + i * 0.26), 0.07, 'square', 0.05, d)),
  hit: () => beep(700, 60, 0.6, 'square', 0.08),
  fall: () => beep(900, 120, 0.7, 'square', 0.06),
  splash: () => noise(0.5, 0.16, 1400),
  tick: () => beep(1250, 1250, 0.025, 'square', 0.03),
  crumble: () => noise(0.3, 0.1, 500),
  spike: () => beep(260, 520, 0.05, 'sawtooth', 0.02),
  bell: () => [[0, 1], [0.42, 0.84], [0.84, 1]].forEach(([d, k]) => {      // ding, dong, ding
    const f = 880 * k;
    beep(f, f, 1.3, 'sine', 0.09, d);
    beep(f * 2.4, f * 2.4, 0.5, 'sine', 0.03, d);
    beep(f / 2, f / 2, 1.5, 'triangle', 0.05, d);
  }),
  knight: () => beep(170, 110, 0.12, 'square', 0.04),
  lost: () => beep(520, 130, 0.45, 'triangle', 0.07),
};

// ---------------------------------------------------------------- input

const keys = { left: false, right: false, jump: false, start: false };
const edge = { jump: false, start: false };
const prev = { left: false, right: false };
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump', KeyX: 'jump',
  Enter: 'start', NumpadEnter: 'start',
};
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.-!';

function press(k) {
  audio();
  if (!keys[k] && (k === 'jump' || k === 'start')) edge[k] = true;
  keys[k] = true;
}
function release(k) { keys[k] = false; }

window.addEventListener('keydown', e => {
  if (G.state === 'initials') {
    const m = /^Key([A-Z])$/.exec(e.code);
    if (m) { e.preventDefault(); typeInitial(m[1]); return; }
    if (e.code === 'Backspace') { e.preventDefault(); G.ini.name = G.ini.name.slice(0, -1); return; }
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  press(k);
});
window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) release(k); });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

for (const btn of document.querySelectorAll('[data-k]')) {
  const k = btn.dataset.k;
  btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); press(k); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => release(k));
  btn.addEventListener('contextmenu', e => e.preventDefault());
}
cv.addEventListener('pointerdown', () => {
  cv.focus();
  audio();
  if (G.state === 'title' || G.state === 'gameover') edge.start = true;
});

const muteBtn = document.getElementById('mute'), crtBtn = document.getElementById('crt');
function toggleMute() {
  G.muted = !G.muted;
  try { localStorage.setItem('lanternwall.muted', G.muted ? '1' : '0'); } catch (e) {}
  syncButtons();
}
function toggleCrt() {
  screenEl.classList.toggle('crt');
  try { localStorage.setItem('lanternwall.crt', screenEl.classList.contains('crt') ? '1' : '0'); } catch (e) {}
  syncButtons();
}
function syncButtons() {
  if (muteBtn) { muteBtn.textContent = G.muted ? 'Sound off' : 'Sound on'; muteBtn.setAttribute('aria-pressed', String(!G.muted)); }
  if (crtBtn) { const on = screenEl.classList.contains('crt'); crtBtn.textContent = on ? 'Scanlines on' : 'Scanlines off'; crtBtn.setAttribute('aria-pressed', String(on)); }
}
muteBtn?.addEventListener('click', () => { toggleMute(); cv.focus(); });
crtBtn?.addEventListener('click', () => { toggleCrt(); cv.focus(); });
function togglePause() {
  if (G.state === 'title' || G.state === 'initials') return;
  G.paused = !G.paused;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state !== 'title' && G.state !== 'initials') G.paused = true;
});

// ---------------------------------------------------------------- high scores

const HS_KEY = 'lanternwall.hiscores.v1';
function loadScores() {
  try {
    const s = JSON.parse(localStorage.getItem(HS_KEY));
    if (Array.isArray(s) && s.length === 5) return s;
  } catch (e) {}
  return [{ n: 'PIP', s: 20000 }, { n: 'ODA', s: 15000 }, { n: 'LUX', s: 10000 }, { n: 'WIK', s: 7500 }, { n: 'EMB', s: 5000 }];
}
function saveScores() { try { localStorage.setItem(HS_KEY, JSON.stringify(G.scores)); } catch (e) {} }

// ---------------------------------------------------------------- game state

const G = {
  state: 'title', t: 0, stateT: 0, paused: false, muted: false,
  score: 0, lives: 3, section: 0, loop: 0, bonus: 0, bells: 0, lifeFlash: 0, clearHold: 0, splashT: 0,
  world: null, hero: null, parts: [], pops: [], scores: loadScores(), ini: null,
  bgCache: {}, titleBg: null, titleWorld: null, demo: null,
};
try { G.muted = localStorage.getItem('lanternwall.muted') === '1'; } catch (e) {}
try {
  const crt = localStorage.getItem('lanternwall.crt');
  if (crt === '0' || (crt === null && !SKIN.scanlines)) screenEl.classList.remove('crt');
} catch (e) {}
syncButtons();

function bonusFor(loop, pieces) {
  return pieces * Math.max(LEVELS.bonusMinPerPiece, LEVELS.bonusPerPiece - loop * LEVELS.bonusLoopCut);
}

// A section is its pieces laid end to end; every piece position is shifted by PIECE per piece.
function buildWorld(i, loop, respawn = false) {
  const d = SECTIONS[i], len = SEC_LEN[i];
  const w = {
    def: d, len, sf: Math.min(LEVELS.maxSpeed, 1 + loop * LEVELS.loopSpeedUp), t: 0, lit: false, rung: false, ringT: 0,
    gaps: [], crumbles: [], lifts: [], chains: [], spikes: [], flasks: [], lanes: [], projectiles: [],
  };
  d.pieces.forEach((name, pi) => {
    const p = LEVELS.pieces[name], ox = pi * PIECE;
    if (!p) { console.warn(`levels.js: no piece called "${name}"`); return; }
    for (const [x, wd] of p.gaps || []) w.gaps.push({ x: ox + x, w: wd });
    for (const [x, wd] of p.crumbles || []) w.crumbles.push({ x: ox + x, w: wd, state: 'solid', t: 0 });
    for (const l of p.lifts || []) w.lifts.push({ from: ox + l.from, to: ox + l.to, w: l.w, period: l.period, px: ox + l.from, dx: 0, isLift: true });
    for (const c of p.chains || []) w.chains.push({ x: ox + c.x, len: c.len, amp: c.amp, period: c.period, phase: c.phase || 0, ay: FLOOR - 21 - c.len, th: 0, om: 0 });
    for (const [x, wd, period, up, offset] of p.spikes || []) w.spikes.push({ x: ox + x, w: wd, period, up, offset: offset || 0, level: 0 });
    for (const [x, hgt] of p.flasks || []) w.flasks.push({ x: ox + x - 3, y: FLOOR - hgt, got: false });
    if (p.shots) w.lanes.push({ ...p.shots, x0: ox, x1: ox + PIECE, acc: p.shots.beat - (p.shots.offset || 0), i: 0 });
  });
  if (d.tower) { w.towerX = len - TOWER_W; w.beaconX = len - 11; }
  else w.ropeX = len - 26;
  const K = LEVELS.knight;
  w.knight = { mode: 'wait', timer: respawn ? K.delay : (d.knightDelay ?? K.delay), x: 0, y: 0, vx: 0, vy: 0, face: -1, t: 0, step: 0 };
  poseWorld(w);
  if (!G.bgCache[i]) G.bgCache[i] = renderBackground(w, i + 1);
  w.bg = G.bgCache[i];
  return w;
}

function poseWorld(w) {
  const T = w.t * w.sf;
  for (const c of w.chains) {
    const a = (2 * Math.PI * T) / c.period + c.phase;
    c.th = c.amp * Math.sin(a);
    c.om = c.amp * Math.cos(a) * (2 * Math.PI * w.sf) / c.period;
  }
  for (const l of w.lifts) {
    const px = l.from + (l.to - l.from) * (0.5 - 0.5 * Math.cos((2 * Math.PI * T) / l.period));
    l.dx = px - l.px;
    l.px = px;
  }
}

function newHero(x = START_X) {
  return { x, y: FLOOR, vx: 0, vy: 0, mode: 'ground', face: 1, walk: 0, chain: null, grabR: 1, regrab: 0, on: null };
}

function startGame() {
  audio();
  Object.assign(G, { score: 0, lives: 3, section: 0, loop: 0, bells: 0, lifeFlash: 0, parts: [], pops: [], paused: false });
  tune(TUNES.start);
  startSection();
}

function startSection() {
  G.world = buildWorld(G.section, G.loop);
  G.piece = 0;
  G.hero = newHero();
  G.bonus = bonusFor(G.loop, G.world.def.pieces.length);
  setState('ready');
}

function setState(s) { G.state = s; G.stateT = 0; }

function addScore(n) { G.score += n; }
// World popups float over the wall; screen popups (screen = true) sit in fixed screen space.
function popup(x, y, txt, screen = false) { G.pops.push({ x, y, txt: String(txt), life: 50, screen }); }
function part(x, y, vx, vy, color, life, g = 0.1) { G.parts.push({ x, y, vx, vy, color, life, g }); }

// ---------------------------------------------------------------- collision helpers

function solidAt(w, x) {
  if (x < 0 || x > w.len) return true;
  for (const c of w.crumbles) if (x >= c.x && x < c.x + c.w) return c.state !== 'gone' ? c : null;
  for (const l of w.lifts) if (x >= l.px && x < l.px + l.w) return l;
  for (const g of w.gaps) if (x >= g.x && x < g.x + g.w) return null;
  return true;
}
function support(w, x) {
  const a = solidAt(w, x - HERO.foot), b = solidAt(w, x + HERO.foot);
  if (a && a !== true) return a;
  if (b && b !== true) return b;
  return a || b;
}
function chainPoint(c, r) {
  return { x: c.x + Math.sin(c.th) * c.len * r, y: c.ay + Math.cos(c.th) * c.len * r };
}
function grabTest(c, h) {
  const hx = h.x + h.face * 2, hy = h.y - 15;
  for (let r = 0.45; r <= 1.001; r += 0.05) {
    const p = chainPoint(c, r);
    if (Math.abs(p.x - hx) < 6 && Math.abs(p.y - hy) < 7) return Math.min(r, 1);
  }
  return 0;
}
function clampX(h, w) {
  if (h.x < 6) { h.x = 6; if (h.mode === 'air') h.vx = 0; }
  if (h.x > w.len - 6) { h.x = w.len - 6; if (h.mode === 'air') h.vx = 0; }
}
// The knight can stand on stone (and loose stones still in place), but not on a moving plank.
function knightFoot(w, x) {
  const s = solidAt(w, x);
  return !!s && !s.isLift;
}
function stepOn(s) {
  if (s && s.state === 'solid') { s.state = 'shaking'; s.t = LEVELS.crumbleDelay; }
}

// ---------------------------------------------------------------- update

function updateWorld(w) {
  w.t++;
  poseWorld(w);
  const T = w.t * w.sf;
  for (const s of w.spikes) {
    const p = (T + s.offset) % s.period;
    const lv = p < s.up ? 2 : (p > s.period - 14 ? 1 : 0);
    if (lv === 2 && s.level !== 2 && G.state === 'play') SFX.spike();
    s.level = lv;
  }
  for (const c of w.crumbles) {
    if (c.state === 'shaking' && --c.t <= 0) {
      c.state = 'gone';
      SFX.crumble();
      for (let i = 0; i < 12; i++) part(c.x + Math.random() * c.w, FLOOR + 2, (Math.random() - 0.5) * 1.2, -Math.random() * 1.5, pick(SKIN.particles.rubble), 70);
    }
  }
  // only the piece the hero is on fires at him
  const lane = G.state === 'play' && w.lanes.find(l => G.hero.x >= l.x0 && G.hero.x < l.x1);
  if (lane) {
    lane.acc += w.sf;
    if (lane.acc >= lane.beat) {
      lane.acc -= lane.beat;
      spawnShot(w, lane, lane.pattern[lane.i++ % lane.pattern.length]);
    }
  }
  for (const p of w.projectiles) {
    p.x += p.vx;
    p.t++;
    if (p.kind === 'bat') p.y = p.y0 + Math.sin(p.t * 2 * Math.PI / 64) * 11;
  }
  w.projectiles = w.projectiles.filter(p => p.x > -20);
  if (w.rung) w.ringT++;
  if (w.lit && G.t % 5 === 0) part(w.beaconX - 3 + Math.random() * 6, TOWER_TOP - 28, (Math.random() - 0.5) * 0.4, -0.7, pick(SKIN.particles.spark), 40, -0.004);
}

function spawnShot(w, lane, ch) {
  const speed = (lane.speed || 1.4) * w.sf, x = W;
  if (ch === 'L' || ch === 'H') {
    w.projectiles.push({ kind: 'bolt', high: ch === 'H', x: x + 4, y: ch === 'H' ? FLOOR - 24 : FLOOR - 5, vx: -speed, t: 0 });
    SFX.bolt();
  } else if (ch === 'B') {
    w.projectiles.push({ kind: 'bat', x: x + 6, y0: FLOOR - 20, y: FLOOR - 20, vx: -0.9 * w.sf, t: 0 });
    SFX.bat();
  }
}

// ---------------------------------------------------------------- the climbing knight
// Like the knight in Hunchback, he comes up the wall face out of the moat behind the hero,
// hauls himself onto the walkway and walks after him. A breach does not stop him: he
// climbs down and crosses it clinging to the stones below the walkway, then climbs back up.

function spawnKnight(w) {
  const K = LEVELS.knight, k = w.knight, h = G.hero;
  const x = Math.max(h.x - K.behind, 8);          // at the start of the wall, right at the left edge
  Object.assign(k, { mode: 'climb', x, y: MOAT - 2, vx: 0, vy: 0, t: 0, step: 0, face: h.x < x ? -1 : 1 });
  SFX.knight();
}

function updateKnight(w) {
  const K = LEVELS.knight, k = w.knight, h = G.hero, sf = w.sf;
  if (k.mode === 'fall') {
    k.vy = Math.min(k.vy + PHYS.gravity, PHYS.maxFall);
    k.x += k.vx; k.y += k.vy;
    if (k.y > MOAT + 6) {
      k.mode = 'gone';
      SFX.splash();
      for (let i = 0; i < 12; i++) part(k.x + (Math.random() - 0.5) * 6, MOAT + 2, (Math.random() - 0.5) * 1.6, -1 - Math.random() * 2, pick(SKIN.particles.splash), 40);
    }
    return;
  }
  if (G.state !== 'play' || k.mode === 'gone') return;
  if (k.mode === 'wait') { if (--k.timer <= 0) spawnKnight(w); return; }

  k.t++;
  const dx = h.x - k.x, dir = Math.abs(dx) > 1.5 ? Math.sign(dx) : 0;
  if (dir) k.face = dir;
  if (k.mode === 'walk') {
    const nx = k.x + dir * K.walk * sf;
    if (!knightFoot(w, k.x) || (dir && !knightFoot(w, nx + dir * 3))) k.mode = 'climb';   // a breach: over the side
    else { k.x = nx; if (dir) k.step++; }
  }
  if (k.mode === 'climb') {
    k.x += dir * K.climbAcross * sf;
    const top = knightFoot(w, k.x - 5) && knightFoot(w, k.x + 5);
    const ty = top ? FLOOR : FLOOR + KNIGHT.hang;
    if (k.y > ty) k.y = Math.max(ty, k.y - K.climb * sf);
    else if (k.y < ty) k.y = Math.min(ty, k.y + K.climb * sf);
    if (top && k.y <= FLOOR) { k.mode = 'walk'; k.y = FLOOR; SFX.knight(); }
  }
}

function knockKnight(w) {
  const k = w.knight;
  if (k.mode === 'climb' || k.mode === 'walk') { k.mode = 'fall'; k.vy = -1.6; k.vx = -k.face * 0.5; }
  else if (k.mode === 'wait') k.mode = 'gone';
}

function updateHero(w, jp) {
  const h = G.hero;
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  switch (h.mode) {
    case 'ground': {
      if (h.on && h.on.isLift) h.x += h.on.dx;
      if (dir) h.face = dir;
      h.vx = dir * PHYS.run;
      if (jp) {                         // horizontal speed is locked in at take-off
        h.mode = 'air'; h.vy = PHYS.jumpVy; h.on = null;
        SFX.jump();
        break;
      }
      h.x += h.vx;
      if (dir) h.walk++;
      clampX(h, w);
      const s = support(w, h.x);
      if (!s) { h.mode = 'air'; h.vy = 0.5; h.on = null; break; }
      h.on = s;
      stepOn(s);
      if (w.def.tower && h.x >= w.len - 24) reachBeacon();
      break;
    }
    case 'air': {
      const py = h.y;
      h.vy = Math.min(h.vy + PHYS.gravity, PHYS.maxFall);
      if (h.y > FLOOR + 3) h.vx = 0;   // inside a breach: drop straight down
      h.x += h.vx;
      h.y += h.vy;
      clampX(h, w);
      if (h.regrab > 0) h.regrab--;
      else {
        for (const c of w.chains) {
          const r = grabTest(c, h);
          if (r) { h.mode = 'chain'; h.chain = c; h.grabR = r; h.vx = 0; h.vy = 0; SFX.grab(); return; }
        }
      }
      if (h.vy > 0 && py <= FLOOR && h.y >= FLOOR) {
        const s = support(w, h.x);
        if (s) {
          h.y = FLOOR; h.vy = 0; h.vx = 0; h.mode = 'ground'; h.on = s;
          SFX.land();
          stepOn(s);
          if (w.def.tower && h.x >= w.len - 24) reachBeacon();
        }
      }
      if (h.y > MOAT - 14) die('fall');
      break;
    }
    case 'chain': {
      const c = h.chain;
      if (dir) h.face = dir;
      const p = chainPoint(c, h.grabR);
      h.x = p.x - h.face * 2;
      h.y = p.y + 15;
      if (jp) {
        const v = c.len * h.grabR * c.om;
        h.vx = clamp(Math.cos(c.th) * v, -PHYS.maxReleaseVx, PHYS.maxReleaseVx);
        h.vy = -Math.sin(c.th) * v + PHYS.releaseVy;
        h.mode = 'air'; h.chain = null; h.regrab = 24;
        if (Math.abs(h.vx) > 0.2) h.face = Math.sign(h.vx);
        SFX.jump();
      }
      break;
    }
  }
}

function checkHazards(w) {
  const h = G.hero;
  if (G.state !== 'play') return;
  const hx0 = h.x - HERO.halfW, hx1 = h.x + HERO.halfW, hy0 = h.y - HERO.height, hy1 = h.y;
  for (const p of w.projectiles) {
    let bx0, bx1, by0, by1;
    if (p.kind === 'bolt') { bx0 = p.x + 1; bx1 = p.x + 7; by0 = p.y - 1; by1 = p.y + 1; }
    else { bx0 = p.x + 2; bx1 = p.x + 8; by0 = p.y - 2; by1 = p.y + 2; }
    if (bx0 < hx1 && bx1 > hx0 && by0 < hy1 && by1 > hy0) { die('hit'); return; }
    if (!p.passed && bx1 < hx0) {
      p.passed = true;
      const pts = p.kind === 'bat' ? 100 : (!p.high && h.mode !== 'ground' ? 100 : 50);
      addScore(pts);
      popup(h.x - 8, h.y - 26, pts);
    }
  }
  if (h.y > FLOOR - 4 && h.mode !== 'chain') {
    for (const s of w.spikes) {
      if (s.level === 2 && h.x + HERO.foot > s.x + 1 && h.x - HERO.foot < s.x + s.w - 1) { die('hit'); return; }
    }
  }
  for (const f of w.flasks) {
    if (!f.got && f.x < hx1 && f.x + 6 > hx0 && f.y - 8 < hy1 && f.y > hy0) {
      f.got = true;
      addScore(300);
      popup(f.x - 6, f.y - 18, 300);
      SFX.pickup();
      for (let i = 0; i < 8; i++) part(f.x + 3, f.y - 4, (Math.random() - 0.5) * 2, -Math.random() * 2, pick(SKIN.particles.spark), 30);
    }
  }
  const k = w.knight;
  if (k.mode === 'climb' || k.mode === 'walk') {
    if (k.x - KNIGHT.halfW < hx1 && k.x + KNIGHT.halfW > hx0 && k.y - KNIGHT.height < hy1 && k.y - 1 > hy0) { die('hit'); return; }
  }
  if (!w.def.tower && Math.abs(h.x - w.ropeX) < HERO.halfW + 1.5 && hy0 < ROPE_END && hy1 > BELL_TOP + 10) ringBell();
}

function updateBonus() {
  if (G.stateT % 12 === 0) {
    G.bonus = Math.max(0, G.bonus - 10);
    if (G.bonus === 0) { popup(G.hero.x - 20, G.hero.y - 30, 'TIME UP'); die('time'); }
  }
}

function die(kind) {
  if (G.state !== 'play') return;
  const h = G.hero;
  setState('dying');
  h.deathKind = kind; h.deathX = h.x; h.chain = null; h.mode = 'dead'; h.vx = 0;
  if (kind === 'fall') SFX.fall();
  else { h.vy = -2.4; SFX.hit(); }
  if (G.bells > 0) {             // dying before the fifth bell loses every bell rung so far
    G.bells = 0;
    popup(W / 2 - 29, 40, 'BELLS LOST', true);
    SFX.lost();
  }
}

function updateDeath() {
  const h = G.hero;
  if (!h.splashed) {
    h.vy = Math.min(h.vy + PHYS.gravity, PHYS.maxFall);
    h.y += h.vy;
    if (h.y > MOAT + 6) {
      h.splashed = true; h.hidden = true; G.splashT = G.stateT;
      SFX.splash();
      for (let i = 0; i < 16; i++) part(h.x + (Math.random() - 0.5) * 6, MOAT + 2, (Math.random() - 0.5) * 1.6, -1 - Math.random() * 2, pick(SKIN.particles.splash), 40);
    }
  } else if (G.stateT - G.splashT > 70) loseLife();
}

function loseLife() {
  G.lives--;
  if (G.lives <= 0) { setState('gameover'); tune(TUNES.over); return; }
  // start again from the beginning of the piece of wall the hero fell on
  const pieces = G.world.def.pieces.length;
  G.piece = clamp(Math.floor(G.hero.deathX / PIECE), 0, pieces - 1);
  const got = G.world.flasks.map(f => f.got);
  G.world = buildWorld(G.section, G.loop, true);
  G.world.flasks.forEach((f, i) => { f.got = got[i]; });
  G.hero = newHero(G.piece * PIECE + START_X);
  G.bonus = bonusFor(G.loop, pieces - G.piece);
  setState('ready');
}

function finishSection() {
  const w = G.world, h = G.hero;
  setState('clear');
  w.projectiles = [];
  h.vx = 0;
  if (h.mode === 'chain') { h.mode = 'air'; h.chain = null; h.vy = 0; }
  knockKnight(w);
  G.clearHold = 80;
}

function reachBeacon() {
  finishSection();
  G.world.lit = true;
  G.hero.mode = 'ground';
  addScore(500);
  popup(G.world.beaconX - 34, FLOOR - 40, 500);
  tune(TUNES.clear);
}

function ringBell() {
  const w = G.world;
  finishSection();
  w.rung = true;
  w.ringT = 0;
  addScore(500);
  popup(w.ropeX - 30, FLOOR - 40, 500);
  SFX.bell();
}

// The rung bell lands in the HUD: a fifth bell in a row is an extra life.
function collectBell() {
  G.bells++;
  SFX.pickup();
  if (G.bells >= LEVELS.bellsForLife) {
    G.bells = 0;
    G.lives++;
    G.lifeFlash = 90;
    tune(TUNES.life);
    popup(W / 2 - 29, 40, 'EXTRA LIFE', true);
  }
}

// Where the flying bell is on screen, f running 0 to 1 from the belfry to its HUD slot.
function bellFlight(f) {
  const x0 = G.world.ropeX - 3, y0 = BELL_TOP + 2, x1 = 3 + G.bells * 8, y1 = 11;
  const e = f * f * (3 - 2 * f);
  return { x: x0 + (x1 - x0) * e, y: y0 + (y1 - y0) * e - Math.sin(f * Math.PI) * 24 };
}

function updateClear() {
  const w = G.world, h = G.hero;
  if (h.mode === 'air') {        // touched the rope mid-jump: come down onto the walkway
    h.vy = Math.min(h.vy + PHYS.gravity, PHYS.maxFall);
    h.y += h.vy;
    if (h.y >= FLOOR) { h.y = FLOOR; h.vy = 0; h.mode = 'ground'; SFX.land(); }
  }
  updateKnight(w);
  if (w.rung) {
    const f = (G.stateT - BELL_RING) / BELL_FLY;
    if (f >= 0 && f < 1 && G.stateT % 2 === 0) {
      const p = bellFlight(f);
      part(p.x + 3, p.y + 3, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, pick(SKIN.particles.spark), 24, 0);
    }
    if (G.stateT === BELL_RING + BELL_FLY) collectBell();
  }
  if (G.stateT <= 80) return;
  if (G.bonus > 0) {
    const d = Math.min(50, G.bonus);
    G.bonus -= d;
    addScore(d);
    if (G.stateT % 3 === 0) SFX.tick();
    G.clearHold = G.stateT;
  } else if (G.stateT - G.clearHold > 70) {
    G.section++;
    if (G.section >= SECTIONS.length) { G.section = 0; G.loop++; }
    startSection();
  }
}

function endGame() {
  if (G.score > G.scores[4].s) { G.ini = { cur: 0, name: '' }; setState('initials'); }
  else { setState('title'); resetDemo(); }
}

function typeInitial(ch) {
  G.ini.name += ch;
  SFX.grab();
  if (G.ini.name.length === 3) {
    G.scores.push({ n: G.ini.name, s: G.score });
    G.scores.sort((a, b) => b.s - a.s);
    G.scores = G.scores.slice(0, 5);
    saveScores();
    setState('title');
    G.stateT = 420;              // open on the high-score page
    resetDemo();
  }
}

function updateInitials(jp, le, re) {
  const I = G.ini;
  if (le) { I.cur = (I.cur + ALPHA.length - 1) % ALPHA.length; SFX.tick(); }
  if (re) { I.cur = (I.cur + 1) % ALPHA.length; SFX.tick(); }
  if (jp) typeInitial(ALPHA[I.cur]);
}

function resetDemo() {
  G.demo = { x: START_X, y: FLOOR, vx: 0.8, mode: 'ground', face: 1, walk: 0, lit: false };
}

function updateTitle(start) {
  if (start) { startGame(); return; }
  const d = G.demo, page = ((G.stateT / 420) | 0) % 3;
  if (page === 0) {
    if (d.x < GOAL_X) { d.x += 0.8; d.walk++; d.vx = 0.8; }
    else { d.vx = 0; d.lit = true; }
  } else resetDemo();
  G.titleWorld.lit = G.demo.lit;
  if (G.demo.lit && G.t % 5 === 0) part(G.titleWorld.beaconX - 3 + Math.random() * 6, TOWER_TOP - 28, (Math.random() - 0.5) * 0.4, -0.7, pick(SKIN.particles.spark), 40, -0.004);
}

function step() {
  const jp = edge.jump, sp = edge.start;
  edge.jump = edge.start = false;
  const le = keys.left && !prev.left, re = keys.right && !prev.right;
  prev.left = keys.left; prev.right = keys.right;
  if (G.paused) { if (sp) G.paused = false; return; }
  G.t++; G.stateT++;
  switch (G.state) {
    case 'title': updateTitle(jp || sp); break;
    case 'ready': if (G.stateT > 100) setState('play'); break;
    case 'play':
      updateWorld(G.world);
      updateHero(G.world, jp);
      updateKnight(G.world);
      checkHazards(G.world);
      if (G.state === 'play') updateBonus();
      break;
    case 'dying': updateWorld(G.world); updateDeath(); break;
    case 'clear': updateWorld(G.world); updateClear(); break;
    case 'gameover': if (G.stateT > 220 || (G.stateT > 60 && (jp || sp))) endGame(); break;
    case 'initials': updateInitials(jp || sp, le, re); break;
  }
  for (const p of G.parts) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--; }
  G.parts = G.parts.filter(p => p.life > 0 && p.y < H);
  for (const q of G.pops) { q.y -= 0.3; q.life--; }
  G.pops = G.pops.filter(q => q.life > 0);
  if (G.lifeFlash > 0) G.lifeFlash--;
}

// ---------------------------------------------------------------- background (drawn once per section)
// Three layers: the sky and moon, the distant town, and the wall itself (everything from the parapet down).

function layer(wd) {
  const c = document.createElement('canvas');
  c.width = wd; c.height = H;
  return [c, c.getContext('2d')];
}

function renderBackground(w, seed) {
  const S = SKIN.scene, r = rng(seed * 7919 + 13), L = w.len;
  const voids = [...w.gaps, ...w.crumbles];
  const isVoid = x => voids.some(v => x >= v.x && x < v.x + v.w);

  // sky: flat bands joined by a two-step dither
  const [sky, g] = layer(W);
  const top = 20, n = S.sky.length, band = (FLOOR - top) / n;
  g.fillStyle = S.sky[0];
  g.fillRect(0, 0, W, top);
  for (let i = 0; i < n; i++) {
    const y0 = Math.round(top + i * band), y1 = Math.round(top + (i + 1) * band);
    g.fillStyle = S.sky[i];
    g.fillRect(0, y0, W, y1 - y0);
    if (i > 0) {
      g.fillStyle = S.sky[i - 1];
      for (let y = y0; y < y0 + 4; y++) {
        const stepX = y - y0 < 2 ? 2 : 4;
        for (let x = (y & 1); x < W; x += stepX) g.fillRect(x, y, 1, 1);
      }
    }
  }

  // stars
  const stars = [];
  for (let i = 0; i < Math.round(46 * W / 224); i++) {
    const x = Math.floor(r() * W), y = Math.floor(22 + r() * 100);
    stars.push({ x, y });
    g.fillStyle = r() < 0.3 ? S.star : S.starDim;
    g.fillRect(x, y, 1, 1);
  }

  // moon
  const M = S.moonPos;
  disc(g, M.x, M.y, M.r, S.moon);
  disc(g, M.x - 3, M.y - 2, 2, S.moonShade);
  disc(g, M.x + 3, M.y + 3, 3, S.moonShade);
  disc(g, M.x + 4, M.y - 4, 1, S.moonShade);

  // distant town, wide enough for the half-speed scroll
  const townW = W + Math.ceil((L - W) / 2) + 4;
  const [town, t] = layer(townW);
  let x = -4;
  const base = FLOOR - 8;
  while (x < townW) {
    const bw = 8 + Math.floor(r() * 14), bh = 10 + Math.floor(r() * 30);
    t.fillStyle = S.skyline;
    t.fillRect(x, base - bh, bw, bh + 8);
    if (r() < 0.45) for (let k = 0; k < Math.ceil(bw / 2); k++) t.fillRect(x + k, base - bh - k, bw - 2 * k, 1);
    else if (r() < 0.25) t.fillRect(x + (bw >> 1), base - bh - 9, 1, 9);
    t.fillStyle = S.window;
    for (let wy = base - bh + 3; wy < base - 2; wy += 5) {
      for (let wx = x + 2; wx < x + bw - 2; wx += 4) if (r() < 0.16) t.fillRect(wx, wy, 1, 2);
    }
    x += bw + (r() < 0.3 ? 2 : 0);
  }

  const [fore, f] = layer(L);

  // back parapet with merlons, broken where the walkway is breached
  for (let px = 0; px < L; px++) {
    if (isVoid(px)) continue;
    const merlon = (px % 16) < 8;
    const y0 = merlon ? FLOOR - 12 : FLOOR - 6;
    f.fillStyle = S.parapet;
    f.fillRect(px, y0, 1, FLOOR - y0);
    f.fillStyle = S.parapetTop;
    f.fillRect(px, y0, 1, 1);
  }

  // wall face
  f.fillStyle = S.mortar;
  f.fillRect(0, FLOOR, L, MOAT - FLOOR);
  for (let y = FLOOR + 4, row = 0; y < MOAT; y += 6, row++) {
    for (let bx = (row & 1 ? -6 : -12); bx < L; bx += 12) {
      f.fillStyle = S.brick[Math.floor(r() * S.brick.length)];
      f.fillRect(bx, y, 11, Math.min(5, MOAT - y));
    }
  }
  // coping stones along the walkway
  f.fillStyle = S.coping; f.fillRect(0, FLOOR, L, 4);
  f.fillStyle = S.copingLight; f.fillRect(0, FLOOR, L, 1);
  f.fillStyle = S.copingShadow; f.fillRect(0, FLOOR + 3, L, 1);
  for (let jx = 0; jx < L; jx += 16) f.fillRect(jx, FLOOR + 1, 1, 2);

  // breaches
  for (const v of voids) {
    f.fillStyle = S.breach;
    f.fillRect(v.x, FLOOR, v.w, MOAT - FLOOR);
    f.fillStyle = S.breachEdge;
    for (let y = FLOOR + 6; y < MOAT; y += 6) f.fillRect(v.x + 2, y, v.w - 4, 1);
    for (let y = FLOOR; y < MOAT; y++) {
      f.fillStyle = S.brick[Math.floor(r() * S.brick.length)];
      f.fillRect(v.x, y, Math.floor(r() * 3), 1);
      const rw = Math.floor(r() * 3);
      f.fillRect(v.x + v.w - rw, y, rw, 1);
    }
  }

  // spike grates
  f.fillStyle = S.grate;
  for (const s of w.spikes) f.fillRect(s.x, FLOOR, s.w, 2);

  // gallows beams for the chains
  for (const ch of w.chains) {
    const gap = w.gaps.find(gp => ch.x >= gp.x && ch.x < gp.x + gp.w) || { x: ch.x - 20, w: 40 };
    const x0 = gap.x - 3, x1 = gap.x + gap.w + 1, by = ch.ay - 4;
    f.fillStyle = S.woodDark;
    f.fillRect(x0, by, 2, FLOOR - by);
    f.fillRect(x1, by, 2, FLOOR - by);
    f.fillRect(x0, by + 2, x1 - x0 + 2, 2);
    f.fillStyle = S.wood;
    f.fillRect(x0, by, x1 - x0 + 2, 2);
    f.fillStyle = S.chainDark;
    f.fillRect(ch.x - 1, by + 3, 3, 2);
  }

  // rails for the lifts
  for (const l of w.lifts) {
    const ry = FLOOR - 46, x0 = l.from - 3, x1 = l.to + l.w + 1;
    f.fillStyle = S.woodDark;
    f.fillRect(x0, ry, 2, FLOOR - ry);
    f.fillRect(x1, ry, 2, FLOOR - ry);
    f.fillRect(x0, ry - 1, x1 - x0 + 2, 2);
  }

  if (w.def.tower) {
    // rescue tower: stone courses, battlements, a lit window and a door
    const TX = w.towerX, BX = w.beaconX;
    f.fillStyle = S.towerDark;
    f.fillRect(TX, TOWER_TOP, L - TX, FLOOR - TOWER_TOP);
    for (let y = TOWER_TOP, row = 0; y < FLOOR; y += 5, row++) {
      for (let bx = TX + (row & 1 ? -4 : 0); bx < L; bx += 8) {
        const x0 = Math.max(bx, TX);
        f.fillStyle = S.towerStone; f.fillRect(x0, y, bx + 7 - x0, 4);
        f.fillStyle = S.towerLight; f.fillRect(x0, y, bx + 7 - x0, 1);
      }
    }
    for (let mx = TX; mx < L; mx += 6) {
      f.fillStyle = S.towerStone; f.fillRect(mx, TOWER_TOP - 5, 4, 5);
      f.fillStyle = S.towerLight; f.fillRect(mx, TOWER_TOP - 5, 4, 1);
    }
    arch(f, BX - 6, FLOOR - 60, 12, 16, S.towerWindow);
    f.fillStyle = S.towerWindowGlow;
    f.fillRect(BX - 6, FLOOR - 50, 12, 6);
    f.fillStyle = S.towerLight;
    f.fillRect(BX - 7, FLOOR - 44, 14, 1);
    arch(f, BX - 5, FLOOR - 14, 10, 14, S.woodDark);
    f.fillStyle = S.wood;
    for (let dx = 1; dx < 10; dx += 3) f.fillRect(BX - 5 + dx, FLOOR - 11, 1, 11);
  } else {
    // belfry: two posts, a beam for the bell and a little pitched roof
    const RX = w.ropeX, x0 = RX - 14, x1 = RX + 12, by = BELL_TOP - 4;
    f.fillStyle = S.woodDark;
    f.fillRect(x0, by, 2, FLOOR - by);
    f.fillRect(x1, by, 2, FLOOR - by);
    f.fillRect(x0 - 2, by + 2, x1 - x0 + 6, 2);
    f.fillStyle = S.wood;
    f.fillRect(x0 - 2, by, x1 - x0 + 6, 2);
    for (let i = 0; i < 10; i++) {
      const half = 3 + Math.round(i * 1.6);
      f.fillStyle = i === 0 ? S.roofLight : S.roof;
      f.fillRect(RX - half, by - 10 + i, half * 2 + 1, 1);
    }
    f.fillStyle = S.roofLight;
    for (let i = 1; i < 10; i++) f.fillRect(RX - 3 - Math.round(i * 1.6), by - 10 + i, 1, 1);
    f.fillStyle = S.chainDark;
    f.fillRect(RX, by + 4, 1, 1);
  }

  // water and status bar
  for (let i = 0; i < 3; i++) {
    f.fillStyle = S.water[i];
    f.fillRect(0, MOAT + i * 6, L, i === 2 ? BAR - MOAT - 12 : 6);
  }
  f.fillStyle = S.hudBar;
  f.fillRect(0, BAR, L, H - BAR);

  return { sky, town, fore, stars };
}

function arch(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y + 2, w, h - 2);
  g.fillRect(x + 1, y + 1, w - 2, 1);
  g.fillRect(x + 2, y, w - 4, 1);
}

function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r + r * 0.8 - dy * dy));
    if (half >= 0) g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

// ---------------------------------------------------------------- draw

function drawTwinkle(stars) {
  ctx.fillStyle = SKIN.scene.star;
  for (let i = 0; i < stars.length; i++) {
    const k = (G.t + i * 53) % 140;
    if (k >= 8) continue;
    const st = stars[i];
    ctx.fillRect(st.x, st.y, 1, 1);
    if (k > 2 && k < 6) { ctx.fillRect(st.x - 1, st.y, 3, 1); ctx.fillRect(st.x, st.y - 1, 1, 3); }
  }
}

function drawMoat() {
  const S = SKIN.scene;
  ctx.fillStyle = S.waterLight;
  for (let row = 0; row < 4; row++) {
    const y = MOAT + 2 + row * 4, sh = Math.floor(G.t * (0.3 + row * 0.1) + row * 37);
    for (let x = -(sh % 24); x < W; x += 24) ctx.fillRect(x + row * 5, y, 4 - (row >> 1), 1);
  }
  ctx.fillStyle = S.moonGlint;
  for (let i = 0; i < 5; i++) {
    const wob = Math.round(Math.sin(G.t / 10 + i) * 2);
    ctx.fillRect(S.moonPos.x - 3 + wob, MOAT + 3 + i * 3, 6 - i, 1);
  }
}

function drawCrumble(c) {
  if (c.state === 'gone') return;
  const S = SKIN.scene, jx = c.state === 'shaking' ? ((G.t >> 1) & 1 ? 1 : -1) : 0;
  for (let x = c.x; x < c.x + c.w; x += 8) {
    const ww = Math.min(8, c.x + c.w - x);
    ctx.fillStyle = S.copingShadow; ctx.fillRect(x + jx, FLOOR, ww, 6);
    ctx.fillStyle = S.crumble; ctx.fillRect(x + jx, FLOOR, ww - 1, 5);
    ctx.fillStyle = S.copingLight; ctx.fillRect(x + jx, FLOOR, ww - 1, 1);
    ctx.fillStyle = S.crack; ctx.fillRect(x + jx + 3, FLOOR + 2, 1, 2);
  }
}

function drawLift(l) {
  const S = SKIN.scene, x = Math.round(l.px), ry = FLOOR - 46;
  ctx.fillStyle = S.rope;
  ctx.fillRect(x + 2, ry + 2, 1, FLOOR - ry - 2);
  ctx.fillRect(x + l.w - 3, ry + 2, 1, FLOOR - ry - 2);
  ctx.fillStyle = S.chainDark;
  ctx.fillRect(x + 1, ry - 2, 3, 3);
  ctx.fillRect(x + l.w - 4, ry - 2, 3, 3);
  ctx.fillStyle = S.plankDark; ctx.fillRect(x, FLOOR, l.w, 4);
  ctx.fillStyle = S.plank; ctx.fillRect(x, FLOOR, l.w, 3);
  ctx.fillStyle = S.plankDark;
  for (let i = 6; i < l.w; i += 6) ctx.fillRect(x + i, FLOOR, 1, 3);
}

function drawSpikes(s) {
  if (s.level === 0) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(s.x, FLOOR - 8, s.w, 8); ctx.clip();
  for (let x = s.x; x < s.x + s.w; x += 8) spr('spikes', x, FLOOR - 6 + (s.level === 1 ? 4 : 0));
  ctx.restore();
}

function drawChain(c) {
  const S = SKIN.scene, links = Math.round(c.len / 3);
  for (let i = 0; i <= links; i++) {
    const p = chainPoint(c, i / links);
    ctx.fillStyle = i & 1 ? S.chainDark : S.chain;
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
  }
  const e = chainPoint(c, 1);
  ctx.fillStyle = S.chain;
  ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y), 3, 2);
}

function drawQueen(w, rescued, t) {
  const x = w.beaconX - 5, y = FLOOR - 58;
  if (rescued) spr('queenCheer', x, y - ((t >> 3) & 1));
  else spr(((G.t / 20) | 0) % 2 ? 'queenWave2' : 'queenWave1', x, y);
}

function drawBeacon(w, lit, t) {
  const by = TOWER_TOP - 18;
  if (lit) {
    ctx.fillStyle = SKIN.scene.glow;
    ctx.beginPath(); ctx.arc(w.beaconX, by - 4, 26, 0, Math.PI * 2); ctx.fill();
    const rise = Math.max(0, 10 - (t >> 1));
    spr('flame', w.beaconX - 6, by - 10 + rise, ((G.t / 6) | 0) % 2 === 1);
  }
  spr('brazier', w.beaconX - 8, by);
}

// The belfry bell and its long rope. Once rung it swings, then flies off to the HUD.
function drawBell(w) {
  if (w.rung && G.state === 'clear' && G.stateT >= BELL_RING) return;
  const S = SKIN.scene, rt = w.ringT;
  const a = w.rung ? Math.sin(rt * 0.45) * 0.55 * Math.exp(-rt / 40) : Math.sin(G.t / 50) * 0.03;
  const px = w.ropeX + 0.5, py = BELL_TOP;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(a);
  ctx.drawImage(SPR.bell.img, -5.5, 0);
  ctx.restore();
  // rope: from the clapper to just above the walkway, lagging a little behind the bell
  const tx = px + Math.sin(a) * 10, ty = py + Math.cos(a) * 10;
  const bx = w.ropeX + Math.sin(a) * 22 + Math.sin(G.t / 37) * 0.8;
  for (let y = Math.round(ty); y <= ROPE_END; y++) {
    const f = (y - ty) / (ROPE_END - ty);
    ctx.fillStyle = (y % 3) ? S.rope : S.ropeDark;
    ctx.fillRect(Math.round(tx + (bx - tx) * f - 0.5), y, 1, 1);
  }
  ctx.fillStyle = S.ropeDark;
  ctx.fillRect(Math.round(bx) - 1, ROPE_END - 1, 2, 3);
}

function drawBellFlight() {
  const w = G.world;
  if (!w.rung || G.state !== 'clear') return;
  const f = (G.stateT - BELL_RING) / BELL_FLY;
  if (f < 0 || f >= 1) return;
  const p = bellFlight(f);
  spr(f < 0.5 ? 'bell' : 'bellIcon', p.x - (f < 0.5 ? 2 : 0), p.y);
}

function drawKnight(k) {
  if (k.mode === 'wait' || k.mode === 'gone') return;
  const x = Math.round(k.x), y = Math.round(k.y);
  if (k.mode === 'fall') {                 // knocked off the wall, tumbling into the moat
    ctx.save();
    ctx.translate(x, y - 8);
    ctx.scale(k.face < 0 ? -1 : 1, -1);
    ctx.drawImage(SPR.knightWalk1.img, -6, -8);
    ctx.restore();
    return;
  }
  if (k.mode === 'climb') spr('knightClimb', x - 6, y - 16, ((k.t / 14) | 0) % 2 === 1);
  else spr(((k.step / 7) | 0) % 2 ? 'knightWalk2' : 'knightWalk1', x - 6, y - 16, k.face < 0);
}

const WALK = ['heroWalk1', 'heroIdle', 'heroWalk2', 'heroIdle'];
function drawHero(h) {
  if (!h || h.hidden) return;
  const x = Math.round(h.x), y = Math.round(h.y);
  ctx.fillStyle = SKIN.scene.glow;
  ctx.beginPath(); ctx.arc(x + h.face * 4, y - 6, 16, 0, Math.PI * 2); ctx.fill();
  if (h.mode === 'dead' && h.deathKind !== 'fall') {     // knocked off the wall, tumbling
    ctx.save();
    ctx.translate(x, y - 8);
    ctx.scale(h.face < 0 ? -1 : 1, -1);
    ctx.drawImage(SPR.heroJump.img, -6, -8);
    ctx.restore();
    return;
  }
  let name = 'heroJump';
  if (h.mode === 'ground') name = h.vx !== 0 ? WALK[((h.walk / 5) | 0) % 4] : 'heroIdle';
  spr(name, x - 6, y - 16, h.face < 0);
}

function drawShot(p) {
  if (p.kind === 'bolt') spr('bolt', p.x, p.y - 1);
  else spr(((p.t / 8) | 0) % 2 ? 'bat2' : 'bat1', p.x, p.y - 3);
}

function drawEffects() {
  for (const p of G.parts) { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
  for (const q of G.pops) if (!q.screen) text(q.txt, q.x, q.y, SKIN.ui.good);
}
function drawScreenPops() {
  for (const q of G.pops) if (q.screen) text(q.txt, q.x, q.y, SKIN.ui.banner);
}

function banner(lines) {
  const U = SKIN.ui, wd = Math.max(...lines.map(l => textW(l))) + 20, ht = lines.length * 12 + 8;
  const x = Math.round((W - wd) / 2), y = 60;
  ctx.fillStyle = U.panel; ctx.fillRect(x, y, wd, ht);
  ctx.strokeStyle = U.box; ctx.strokeRect(x + 0.5, y + 0.5, wd - 1, ht - 1);
  lines.forEach((l, i) => ctext(l, y + 6 + i * 12, i === 0 ? U.banner : U.text));
}

function drawLayers(bg) {
  ctx.drawImage(bg.sky, 0, 0);
  drawTwinkle(bg.stars);
  ctx.drawImage(bg.town, 0, 0);
  ctx.drawImage(bg.fore, 0, 0);
  drawMoat();
}

function drawGame() {
  const w = G.world;
  drawLayers(w.bg);
  for (const c of w.crumbles) drawCrumble(c);
  for (const l of w.lifts) drawLift(l);
  for (const s of w.spikes) drawSpikes(s);
  for (const c of w.chains) drawChain(c);
  if (w.def.tower) {
    drawBeacon(w, w.lit, G.state === 'clear' ? G.stateT : 99);
    drawQueen(w, w.lit, G.t);
  } else drawBell(w);
  for (const f of w.flasks) if (!f.got) spr('flask', f.x, f.y - 8 + Math.round(Math.sin(G.t / 12)));
  drawKnight(w.knight);
  drawHero(G.hero);
  for (const p of w.projectiles) drawShot(p);
  drawEffects();
  drawBellFlight();
  drawScreenPops();
  if (G.state === 'ready') {
    const lines = [`WALL ${G.loop + 1}-${G.section + 1}`, w.def.name, (G.stateT >> 4) & 1 ? 'READY' : ' '];
    if (G.piece === 0 && G.loop === 0 && (G.section === 0 || w.def.tower)) lines.push(w.def.tower ? SKIN.towerHint : SKIN.goalHint);
    banner(lines);
  }
  if (G.state === 'clear' && G.stateT > 20) banner([w.def.tower ? SKIN.clearBanner : SKIN.bellBanner]);
  if (G.state === 'gameover') banner(['GAME OVER']);
}

function logo(str, y) {
  const s = 3, x = Math.round((W - textW(str, s)) / 2);
  text(str, x + 1, y + 2, SKIN.ui.logoShadow, s);
  text(str, x, y, SKIN.ui.logo, s);
}

const COARSE = window.matchMedia && matchMedia('(pointer: coarse)').matches;

function drawTitle() {
  const U = SKIN.ui, page = ((G.stateT / 420) | 0) % 3;
  drawLayers(G.titleBg);
  drawBeacon(G.titleWorld, G.demo.lit, 99);
  drawQueen(G.titleWorld, G.demo.lit, G.t);
  logo(SKIN.title[0], 26);
  if (SKIN.title[1]) logo(SKIN.title[1], 50);
  if (page === 0) {
    ctext(SKIN.subtitle, 82, U.banner);
    if ((G.t >> 5) & 1) ctext(COARSE ? 'TAP TO START' : 'PUSH START', 104, U.text);
    if (!COARSE) ctext('SPACE OR ENTER', 116, U.dim);
    ctext(`${SECTIONS.length - 1} BELLS, THEN THE QUEEN`, 134, U.dim);
    drawHero(G.demo);
  } else if (page === 1) {
    ctext('HIGH SCORES', 82, U.banner);
    G.scores.forEach((e, i) => {
      const y = 98 + i * 12;
      text(['1ST', '2ND', '3RD', '4TH', '5TH'][i], OX + 46, y, U.label);
      text(pad(e.s, 6), OX + 88, y, U.text);
      text(e.n, OX + 148, y, U.hi);
    });
  } else {
    ctext('HOW TO PLAY', 78, U.banner);
    const rows = [
      ['bolt', 'JUMP OVER LOW BOLTS'], ['high', 'STAY DOWN FOR HIGH ONES'], ['bat1', 'SLIP PAST THE BATS'],
      ['spikes', 'WAIT OUT THE SPIKES'], ['chain', 'JUMP ON AND OFF CHAINS'],
      ['knightLife', 'JUMP THE CLIMBING KNIGHT'], ['bellIcon', 'TOUCH ROPES FOR BELLS'],
      ['', `${LEVELS.bellsForLife} BELLS: EXTRA LIFE`], ['flask', 'LAMP OIL 300 PTS'],
    ];
    rows.forEach(([icon, label], i) => {
      const y = 89 + i * 9;
      if (icon === 'high') spr('bolt', OX + 12, y);
      else if (icon === 'chain') { ctx.fillStyle = SKIN.scene.chain; for (let k = 0; k < 3; k++) ctx.fillRect(OX + 16, y - 1 + k * 3, 2, 2); }
      else if (icon) spr(icon, OX + 12, y - 1);
      text(label, OX + 30, y, U.text);
    });
  }
  drawEffects();
  drawScreenPops();
}

function drawInitials() {
  const U = SKIN.ui;
  drawLayers(G.titleBg);
  ctext('NEW HIGH SCORE!', 44, U.banner);
  ctext(pad(G.score, 6), 58, U.text);
  ctext('ENTER YOUR INITIALS', 80, U.label);
  for (let i = 0; i < 3; i++) {
    const n = G.ini.name.length;
    const ch = i < n ? G.ini.name[i] : (i === n ? ALPHA[G.ini.cur] : '-');
    const blink = i === n && (G.t >> 4) & 1;
    text(ch, OX + 85 + i * 20, 98, blink ? U.dim : U.text, 2);
  }
  ctext('< > CHANGE   JUMP OK', 128, U.dim);
  if (!COARSE) ctext('OR TYPE A LETTER', 140, U.dim);
}

// Top left: one slot per bell towards the next extra life.
function drawBells() {
  const n = LEVELS.bellsForLife, flash = G.lifeFlash > 0 && (G.t >> 3) & 1;
  text('BELLS', Math.round(3 + (n * 8 - 1 - textW('BELLS')) / 2), 2, SKIN.ui.label);
  for (let i = 0; i < n; i++) spr(i < G.bells || flash ? 'bellIcon' : 'bellSlot', 3 + i * 8, 11);
}

// Bottom left: the whole round as one strip of wall. Bells along it, the tower at the end,
// the walked stretch filled in and a blinking marker where the hero is now.
function drawProgress() {
  const U = SKIN.ui, P = SKIN.palette, x0 = 3, y0 = BAR + 1, wd = 160, ht = 10;
  const ix = x0 + 2, iw = wd - 4, at = d => ix + Math.round((d / ROUND_LEN) * (iw - 1));
  ctx.strokeStyle = U.box;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, wd - 1, ht - 1);
  const w = G.world, done = SEC_START[G.section] + clamp(G.hero.x, 0, w.len);
  ctx.fillStyle = U.progressTrack; ctx.fillRect(ix, y0 + 6, iw, 2);
  ctx.fillStyle = U.progress; ctx.fillRect(ix, y0 + 6, at(done) - ix + 1, 2);
  for (let i = 0; i < SECTIONS.length; i++) {
    const end = SEC_START[i] + SEC_LEN[i];
    if (SECTIONS[i].tower) {
      const tx = at(end) - 2;
      ctx.fillStyle = SKIN.scene.towerStone; ctx.fillRect(tx, y0 + 2, 3, 6);
      ctx.fillStyle = P.U; ctx.fillRect(tx + 1, y0 + 3, 1, 1);
    } else {
      const rung = i < G.section || (i === G.section && w.rung);
      ctx.fillStyle = rung ? P.H : U.progressTrack;
      ctx.fillRect(at(end - 26) - 1, y0 + 2, 3, 3);
    }
  }
  if ((G.t >> 4) & 1 || G.state !== 'play') { ctx.fillStyle = U.text; ctx.fillRect(at(done), y0 + 2, 1, 6); }
}

function drawHUD() {
  const U = SKIN.ui, inGame = G.state !== 'title' && G.state !== 'initials';
  if (inGame) drawBells();
  text('1UP', 57, 2, U.label);
  text(pad(G.score, 6), 48, 11, U.score);
  ctext('HI-SCORE', 2, U.label);
  ctext(pad(Math.max(G.scores[0].s, G.score), 6), 11, U.hi);
  if (!inGame) {
    if (G.state === 'title' && (G.t >> 5) & 1) ctext(COARSE ? 'TAP TO START' : 'PUSH START', BAR + 3, U.text);
    return;
  }
  ctx.strokeStyle = U.box;
  ctx.strokeRect(W - 51.5, 0.5, 47, 19);
  text('BONUS', W - 42, 3, U.bonus);
  text(pad(G.bonus, 5), W - 42, 11, U.text);
  drawProgress();
  for (let i = 0; i < Math.min(G.lives - 1, 8); i++) spr('heroLife', 172 + i * 13, BAR + 3);
  const label = `WALL ${G.loop + 1}-${G.section + 1}`;
  text(label, W - 4 - textW(label), BAR + 3, U.dim);
}

function draw() {
  if (G.state === 'title') drawTitle();
  else if (G.state === 'initials') drawInitials();
  else drawGame();
  drawHUD();
  if (G.paused) banner(['PAUSED', COARSE ? '' : 'P TO RESUME']);
}

// ---------------------------------------------------------------- boot

G.titleWorld = { def: { tower: true }, len: W, towerX: W - TOWER_W, beaconX: W - 11, gaps: [], crumbles: [], chains: [], lifts: [], spikes: [], lit: false };
G.titleBg = renderBackground(G.titleWorld, 99);
resetDemo();

const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= STEP) { step(); acc -= STEP; }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
cv.focus();

// Handy for testing: lanternWall.go(sectionIndex, round)
window.lanternWall = {
  G, keys, edge, step,
  go(section, loop = 0) { startGame(); G.section = section; G.loop = loop; startSection(); },
};
})();
