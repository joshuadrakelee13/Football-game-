// Boot, the frame loop, and the wiring between the simulation, the canvas and
// the interface. The only file that knows about all three.

import { Rng } from './core/rng.js';
import { TUNING, UNITS } from './data/balance.js';
import { createState } from './model/state.js';
import { load as loadProfile, recordResult } from './model/save.js';
import { DT, step } from './engine/step.js';
import { queueIntent } from './engine/intents.js';

import { createStage, frameTransform } from './render/stage.js';
import { drawScene } from './render/scene.js';
import { consume, createFx, tickFx } from './render/fx.js';
import { buildHud, hudSignature, patchHud } from './ui/hud.js';
import { closePicker, hideScreen, openTurretPicker, renderEnd, renderPause, renderTitle } from './ui/screens.js';

const game = {
  stage: null, fx: null, rng: null, state: null,
  hud: null, hudRoot: null, screenRoot: null, pickerRoot: null,
  profile: loadProfile(),
  difficulty: 'normal',
  speed: 1, paused: false, running: false,
  acc: 0, last: 0, openSlot: null,
};

const SPEEDS = [1, 2, 3];

// ---------------------------------------------------------------------------
// Actions. Everything the interface can do goes through the same intent queue
// the AI uses, so the two are playing the identical game.

const actions = {
  spawn(key) {
    if (!game.state || game.paused) return;
    queueIntent(game.state, { side: 0, type: 'spawn', key });
  },
  cancelLast(key) {
    const q = game.state?.sides[0].queue;
    if (!q) return;
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].key === key) { queueIntent(game.state, { side: 0, type: 'cancel', index: i }); return; }
    }
  },
  evolve() { if (game.state) queueIntent(game.state, { side: 0, type: 'evolve' }); },
  special() { if (game.state) queueIntent(game.state, { side: 0, type: 'special' }); },
  buySlot() { if (game.state) queueIntent(game.state, { side: 0, type: 'buySlot' }); },
  sellTurret(index) { if (game.state) queueIntent(game.state, { side: 0, type: 'sellTurret', slot: index }); },
  slotClicked(index) {
    const you = game.state?.sides[0];
    if (!you) return;
    const slot = you.slots[index];
    if (slot?.turret) { actions.sellTurret(index); return; }
    if (game.openSlot === index) { actions.closePicker(); return; }
    game.openSlot = index;
    openTurretPicker(game.pickerRoot, you, index, (key) => {
      queueIntent(game.state, { side: 0, type: 'buyTurret', slot: index, key });
      actions.closePicker();
    }, () => actions.closePicker());
  },
  closePicker() { game.openSlot = null; closePicker(game.pickerRoot); },
  cycleSpeed() { game.speed = SPEEDS[(SPEEDS.indexOf(game.speed) + 1) % SPEEDS.length]; },
  togglePause() { game.paused ? resume() : pause(); },
};

// ---------------------------------------------------------------------------

function startBattle(difficulty) {
  game.difficulty = difficulty;
  game.rng = new Rng(Date.now() >>> 0);
  game.state = createState({ seed: game.rng.seed, difficulty });
  game.fx = createFx();
  game.fx.reduced = prefersReducedMotion();
  game.speed = 1;
  game.paused = false;
  game.openSlot = null;
  game.acc = 0;
  game.last = performance.now();
  game.running = true;

  hideScreen(game.screenRoot);
  closePicker(game.pickerRoot);
  game.hudRoot.classList.add('on');
  game.hud = buildHud(game.hudRoot, game.state, actions);
}

function pause() {
  if (!game.running) return;
  game.paused = true;
  renderPause(game.screenRoot, { onResume: resume, onQuit: toMenu });
}

function resume() {
  game.paused = false;
  hideScreen(game.screenRoot);
  game.last = performance.now();
}

function toMenu() {
  game.running = false;
  game.state = null;
  game.hudRoot.classList.remove('on');
  closePicker(game.pickerRoot);
  renderTitle(game.screenRoot, { profile: game.profile, onStart: startBattle });
}

function finish() {
  game.running = false;
  const won = game.state.over.winner === 0;
  const before = game.profile.impossibleUnlocked;
  game.profile = recordResult(game.profile, {
    difficulty: game.difficulty, won, seconds: game.state.time,
  });
  game.hudRoot.classList.remove('on');
  closePicker(game.pickerRoot);
  renderEnd(game.screenRoot, {
    state: game.state, won, difficulty: game.difficulty,
    unlockedNow: !before && game.profile.impossibleUnlocked,
    onAgain: () => startBattle(game.difficulty),
    onMenu: toMenu,
  });
}

// ---------------------------------------------------------------------------
// The frame loop.
//
// Game speed multiplies how much time goes INTO the accumulator, never the size
// of a step. Three times speed is three ticks in a frame, each identical to a
// tick at normal speed - so a fast battle and a slow one are the same battle,
// and the headless harness reproduces either exactly.

function frame(now) {
  requestAnimationFrame(frame);

  let elapsed = (now - game.last) / 1000;
  game.last = now;
  if (elapsed > 0.25) elapsed = 0.25;          // a backgrounded tab must not spiral

  if (game.running && !game.paused && game.state && !game.state.over) {
    game.acc += elapsed * game.speed;
    let steps = 0;
    while (game.acc >= DT && steps < TUNING.maxStepsPerFrame) {
      for (const side of game.state.sides) for (const u of side.units) u.px = u.x;
      step(game.state, DT, game.rng);
      consume(game.fx, game.state);
      game.acc -= DT;
      steps++;
    }
    if (game.acc > DT * TUNING.maxStepsPerFrame) game.acc = 0;
    tickFx(game.fx, elapsed * game.speed);
  }

  if (game.state) {
    frameTransform(game.stage);
    drawScene(game.stage.ctx, game.state, game.fx, Math.min(1, game.acc / DT), now / 1000);

    if (game.hud) {
      const sig = hudSignature(game.state);
      if (sig !== game.hud.sig) game.hud = buildHud(game.hudRoot, game.state, actions);
      patchHud(game.hud, game.state, game);
    }

    if (game.state.over && game.running) finish();
  }
}

// ---------------------------------------------------------------------------

function onKey(e) {
  if (e.repeat) return;
  const key = e.key.toLowerCase();

  if (key === ' ' || key === 'escape') {
    e.preventDefault();
    if (game.running) actions.togglePause();
    return;
  }
  if (!game.running || game.paused || !game.state) return;

  const you = game.state.sides[0];
  const unitIndex = '1234'.indexOf(key);
  if (unitIndex >= 0) {
    const list = buyable(you);
    if (list[unitIndex]) actions.spawn(list[unitIndex].key);
    return;
  }

  const slotIndex = 'qwer'.indexOf(key);
  if (slotIndex >= 0 && slotIndex < you.slotsOwned) { actions.slotClicked(slotIndex); return; }

  if (key === 'v') actions.evolve();
  else if (key === 's') actions.special();
  else if (key === '+' || key === '=') game.speed = Math.min(3, game.speed + 1);
  else if (key === '-') game.speed = Math.max(1, game.speed - 1);
}

function buyable(side) {
  const list = Object.values(UNITS).filter((u) => u.age === side.age && u.role !== 'secret');
  if (side.secretUnlocked) list.push(UNITS.super_soldier);
  return list;
}

const prefersReducedMotion = () =>
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// ---------------------------------------------------------------------------

function boot() {
  const wrap = document.getElementById('stage-wrap');
  const canvas = document.getElementById('stage');
  game.stage = createStage(canvas, wrap);
  game.hudRoot = document.getElementById('hud');
  game.screenRoot = document.getElementById('screens');
  game.pickerRoot = document.getElementById('picker');

  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', () => { if (game.running && !game.paused) pause(); });

  renderTitle(game.screenRoot, { profile: game.profile, onStart: startBattle });
  requestAnimationFrame((t) => { game.last = t; frame(t); });
}

boot();
