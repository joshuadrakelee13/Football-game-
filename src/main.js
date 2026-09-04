// Bootstrap, game state and routing.

import { Rng } from './core/rng.js';
import { buildWorld, playerClub } from './model/world.js';
import { load, save, hasSave, clearSave, serialise, deserialise } from './model/save.js';
import {
  advanceMatchday, endSeason, nextSeason, currentMatchday, playerFixture,
} from './engine/season.js';
import { generateTransferMarket, generateFreeAgents, generateBids, runAiTransferWindow, processExpiringContracts } from './engine/transfers.js';
import { applyTraining } from './engine/training.js';
import { maybeFireEvent } from './engine/events.js';
import { rollProspect } from './engine/youth.js';
import { setTransferBudget, setWageBudget } from './engine/finance.js';
import { pickBestXI } from './model/club.js';

import { renderShell, setActiveScreen } from './ui/shell.js';
import { showMatch } from './ui/match-view.js';
import { showSeasonReview } from './ui/season-review.js';
import { showEvent } from './ui/event-view.js';
import { renderSetup } from './ui/setup.js';
import { toast } from './ui/toast.js';
import { SCREENS } from './ui/screens.js';

export const game = {
  world: null,
  rng: null,
  screen: 'overview',
  busy: false,
  pendingBids: [],
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function newGame({ clubName, managerName }) {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  game.world = buildWorld({ seed, clubName, managerName });
  game.rng = new Rng(seed ^ 0x9e3779b9);
  game.world.rngState = game.rng.toJSON();
  refreshMarket();
  game.screen = 'overview';
  persist();
  render();
}

export function continueGame() {
  const loaded = load();
  if (!loaded) return false;
  game.world = loaded.world;
  game.rng = Rng.fromJSON(game.world.rngState);
  game.screen = 'overview';
  render();
  return true;
}

export function abandonGame() {
  clearSave();
  game.world = null;
  game.rng = null;
  render();
}

export function persist() {
  if (!game.world) return;
  game.world.rngState = game.rng.toJSON();
  const result = save(game.world);
  if (!result.ok) toast('Could not save', result.error, { tone: 'danger' });
}

export function exportSave() {
  game.world.rngState = game.rng.toJSON();
  return serialise(game.world);
}

export function importSave(json) {
  const loaded = deserialise(json);
  game.world = loaded.world;
  game.rng = Rng.fromJSON(game.world.rngState);
  game.screen = 'overview';
  persist();
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function render() {
  const root = document.getElementById('root');
  if (!game.world) {
    renderSetup(root, { hasSave: hasSave() });
    return;
  }
  renderShell(root);
  setActiveScreen(game.screen);
}

export function goTo(screen) {
  if (!SCREENS[screen]) return;
  game.screen = screen;
  // A short crossfade between screens where the browser supports it, and a plain
  // swap where it does not.
  if (document.startViewTransition && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(() => setActiveScreen(screen));
  } else {
    setActiveScreen(screen);
  }
}

// ---------------------------------------------------------------------------
// Playing matches
// ---------------------------------------------------------------------------

// Advance one matchday. `mode` decides how the player's own match is presented.
export async function advance(mode = 'quick') {
  if (game.busy || !game.world) return;
  const world = game.world;
  if (world.matchdayIndex >= world.calendar.length) return finishSeason();

  game.busy = true;
  try {
    const digest = advanceMatchday(world, game.rng);
    applyBetweenMatchday(world, digest);

    if (digest.playerMatch && mode === 'live') {
      await showMatch(digest, world);
    } else if (digest.playerMatch && mode === 'quick') {
      await showMatch(digest, world, { instant: true });
    }

    persist();
    render();

    if (digest.seasonEnded) {
      await finishSeason();
      return;
    }
    await maybeShowEvent();
  } finally {
    game.busy = false;
  }
}

// Advance repeatedly until the player's next fixture, or a limit is hit.
export async function simTo(predicate, { maxMatchdays = 80 } = {}) {
  if (game.busy || !game.world) return;
  game.busy = true;
  const digestLog = [];
  try {
    for (let i = 0; i < maxMatchdays; i++) {
      const world = game.world;
      if (world.matchdayIndex >= world.calendar.length) break;
      const digest = advanceMatchday(world, game.rng);
      applyBetweenMatchday(world, digest);
      digestLog.push(digest);
      if (digest.seasonEnded) break;
      if (predicate(world, digest)) break;
    }
    persist();
    render();
    const last = digestLog[digestLog.length - 1];
    if (last?.seasonEnded) { await finishSeason(); return digestLog; }
    await maybeShowEvent();
  } finally {
    game.busy = false;
  }
  return digestLog;
}

// Sim forward to the club's next fixture in a given competition, or the next N days.
export function simToNextFixture() {
  return simTo((world) => !!playerFixture(world));
}

export function simToDate(days) {
  const world = game.world;
  const startDay = currentMatchday(world)?.day ?? 0;
  return simTo((w) => {
    const md = currentMatchday(w);
    return !md || md.day - startDay >= days;
  });
}

export function autoPlaySeason() {
  return simTo(() => false, { maxMatchdays: 200 });
}

// Training, academy and market activity that happens between matchdays.
function applyBetweenMatchday(world, digest) {
  const you = playerClub(world);
  const next = world.calendar[world.matchdayIndex];
  const previous = world.calendar[world.matchdayIndex - 1];
  const weeks = next && previous ? Math.max(0.4, (next.day - previous.day) / 7) : 1;

  applyTraining(you, weeks, game.rng);

  // Youth prospects surface every few weeks rather than constantly.
  world.youthTimer = (world.youthTimer ?? 0) + weeks;
  if (world.youthTimer >= 6) {
    world.youthTimer = 0;
    const prospect = rollProspect(world, you, game.rng);
    if (prospect) {
      world.youthProspects = world.youthProspects || [];
      world.youthProspects.push(prospect);
    }
  }

  // Bids for your players arrive periodically.
  world.bidTimer = (world.bidTimer ?? 0) + weeks;
  if (world.bidTimer >= 8) {
    world.bidTimer = 0;
    const bids = generateBids(world, game.rng);
    if (bids.length) {
      world.pendingBids = [...(world.pendingBids || []), ...bids].slice(-6);
    }
  }

  // The market rotates twice a season, which is what stops it going stale.
  world.marketTimer = (world.marketTimer ?? 0) + weeks;
  if (world.marketTimer >= 20) {
    world.marketTimer = 0;
    refreshMarket();
  }

  you.lineup = you.lineupLocked ? you.lineup : pickBestXI(you);
}

async function maybeShowEvent() {
  const event = maybeFireEvent(game.world, game.rng);
  if (!event) return;
  await showEvent(event);
  persist();
  render();
}

export function refreshMarket() {
  game.world.transferMarket = generateTransferMarket(game.world, game.rng);
  game.world.freeAgents = generateFreeAgents(game.world, game.rng);
}

// ---------------------------------------------------------------------------
// Season rollover
// ---------------------------------------------------------------------------

async function finishSeason() {
  const world = game.world;
  const summary = endSeason(world, game.rng);
  persist();

  await showSeasonReview(summary, world);

  processExpiringContracts(world, game.rng);
  runAiTransferWindow(world, game.rng);
  setTransferBudget(playerClub(world));
  setWageBudget(playerClub(world));
  nextSeason(world, game.rng);
  refreshMarket();
  world.pendingBids = [];
  world.youthProspects = [];

  game.screen = 'overview';
  persist();
  render();
  toast('New season', `${world.startYear}/${String((world.startYear + 1) % 100).padStart(2, '0')} is under way.`);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  render();
  // Autosave when the tab goes away, so a closed laptop does not lose a season.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && game.world) persist();
  });
}

boot();
