// Bootstrap, game state and routing.

import { Rng } from './core/rng.js';
import { money } from './core/format.js';
import { buildWorld, playerClub } from './model/world.js';
import { load, save, hasSave, clearSave, serialise, deserialise } from './model/save.js';
import {
  advanceMatchday, endSeason, nextSeason, currentMatchday, playerFixture,
  resolvePlayerMatchSession,
} from './engine/season.js';
import { generateTransferMarket, generateFreeAgents, generateBids, runAiTransferWindow, processExpiringContracts } from './engine/transfers.js';
import { applyTraining } from './engine/training.js';
import { maybeFireEvent } from './engine/events.js';
import { rollProspect, prospectGrade } from './engine/youth.js';
import { setTransferBudget, setWageBudget } from './engine/finance.js';
import { pushInboxEntry } from './engine/inbox.js';
import { pickBestXI, squadRating } from './model/club.js';

import { renderShell, setActiveScreen } from './ui/shell.js';
import { showMatch, showLiveMatch } from './ui/match-view.js';
import { showSeasonReview } from './ui/season-review.js';
import { showEvent } from './ui/event-view.js';
import { renderSetup } from './ui/setup.js';
import { toast } from './ui/toast.js';
import { SCREENS } from './ui/screens.js';
import { CONTEXTS } from './ui/contexts.js';

export const game = {
  world: null,
  rng: null,
  screen: 'overview',
  busy: false,
  pendingBids: [],
  // A stack of drilled-into object contexts (players, later agents/clubs/etc.),
  // rendered over the current screen rather than as a separate page — see goTo,
  // openContext, goBack below. Reset on every full-world swap and every top-level
  // nav click, since either one invalidates whatever was being drilled into.
  contextStack: [],
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
  game.contextStack = [];
  persist();
  render();
}

export function continueGame() {
  const loaded = load();
  if (!loaded) return false;
  game.world = loaded.world;
  game.rng = Rng.fromJSON(game.world.rngState);
  game.screen = 'overview';
  game.contextStack = [];
  render();
  return true;
}

export function abandonGame() {
  clearSave();
  game.world = null;
  game.rng = null;
  game.contextStack = [];
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
  game.contextStack = [];
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

// A short crossfade where the browser supports it and the viewer hasn't asked for
// reduced motion, and a plain swap otherwise. Used for genuine full-content swaps
// (a screen change, or a context push/pop) — NOT for setContextTab, where the
// context bar and tab strip are visually identical before/after, so a full-page
// crossfade would just flicker unchanged chrome rather than animate anything.
function withTransition(fn) {
  if (document.startViewTransition && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(fn);
  } else {
    fn();
  }
}

export function goTo(screen) {
  if (!SCREENS[screen]) return;
  game.screen = screen;
  // A top-level nav click is a fresh context switch — whatever object you had
  // drilled into no longer applies once you've left the screen you drilled in
  // from. This is also what makes a breadcrumb's root crumb correct with no
  // special case: it just calls goTo(game.screen).
  game.contextStack = [];
  withTransition(() => setActiveScreen(screen));
}

// ---------------------------------------------------------------------------
// Object contexts — drilling into a player (later: agent, club, ...) without
// leaving the screen you were on. See ui/contexts.js for the per-type registry
// and ui/shell.js for how the top of the stack actually renders.
//
// Nothing that can invalidate an open context (market rotation, contract expiry,
// AI transfer windows) is reachable while one is open: those all fire from a
// button on a *screen*, and no screen's DOM exists while a context sits on top
// of it — reaching a different screen requires goTo(), which clears the stack
// first. The real hazard is an action reachable from *inside* the context that
// removes the very object being viewed (Sell, in particular) — those handlers
// must call goBack() rather than a bare render(), so the object-is-gone case
// stays unreachable through normal play rather than something the UI has to
// paper over.
// ---------------------------------------------------------------------------

export function openContext(type, entryFields) {
  if (!CONTEXTS[type]) return;
  game.contextStack.push({ type, ...entryFields, tab: entryFields.tab ?? null });
  withTransition(() => setActiveScreen(game.screen));
}

// Safe to call unconditionally — a no-op fallthrough to the plain screen render
// when the stack is already empty, so the same handler works whether it was
// invoked from inside an open context or from a menu with no context open.
export function goBack() {
  game.contextStack.pop();
  withTransition(() => setActiveScreen(game.screen));
}

// Breadcrumb click-to-jump: truncate to a given depth (0-based) in the stack.
export function jumpToContextDepth(index) {
  game.contextStack = game.contextStack.slice(0, index + 1);
  withTransition(() => setActiveScreen(game.screen));
}

export function setContextTab(tab) {
  const top = game.contextStack.at(-1);
  if (top) top.tab = tab;
  setActiveScreen(game.screen);
}

// Swaps an open context's source after the object it's showing has genuinely
// moved (e.g. a market listing that just got signed is now a squad player with
// the same id) — used by negotiation-modal.js's completeDeal on a successful
// buy, never on a walk-away/reject.
export function retargetPlayerContext(playerId, newSource) {
  const entry = game.contextStack.find((e) => e.type === 'player' && e.playerId === playerId);
  if (entry) { entry.source = newSource; entry.tab = null; }
}

// ---------------------------------------------------------------------------
// Playing matches
// ---------------------------------------------------------------------------

// Advance one matchday. `mode` decides how the player's own match is presented.
//
// 'live' on a league fixture gets a genuinely pausable match: advanceMatchday hands
// back a pendingSession instead of an already-resolved result, showLiveMatch drives
// it minute by minute and lets the player adjust tactics at a real pause, and
// resolvePlayerMatchSession applies the result once it's actually over. Every other
// case (quick-sim, or a live cup/euro fixture, which keeps today's animated-replay-
// of-an-already-simulated-match presentation) is untouched.
export async function advance(mode = 'quick') {
  if (game.busy || !game.world) return;
  const world = game.world;
  if (world.matchdayIndex >= world.calendar.length) return finishSeason();

  game.busy = true;
  try {
    const digest = advanceMatchday(world, game.rng, mode === 'live' ? { liveSession: true } : {});

    if (digest.pendingSession) {
      const result = await showLiveMatch(digest.pendingSession, world);
      resolvePlayerMatchSession(world, digest, result);
    } else if (digest.playerMatch && mode === 'live') {
      await showMatch(digest, world);
    } else if (digest.playerMatch && mode === 'quick') {
      await showMatch(digest, world, { instant: true });
    }

    applyBetweenMatchday(world, digest);

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
      const grade = prospectGrade(prospect);
      pushInboxEntry(world, {
        type: 'prospect',
        tone: grade.tone === 'muted' ? 'neutral' : grade.tone,
        title: 'Academy prospect',
        body: `Scouts have flagged ${prospect.name}, a ${grade.label.toLowerCase()} ${prospect.position} (${prospect.age}yo).`,
        action: { screen: 'youth' },
      });
    }
  }

  // Bids for your players arrive periodically.
  world.bidTimer = (world.bidTimer ?? 0) + weeks;
  if (world.bidTimer >= 8) {
    world.bidTimer = 0;
    const bids = generateBids(world, game.rng);
    if (bids.length) {
      world.pendingBids = [...(world.pendingBids || []), ...bids].slice(-6);
      for (const bid of bids) {
        pushInboxEntry(world, {
          type: 'bid',
          tone: 'gold',
          title: 'Transfer bid received',
          body: `${bid.buyerName} have offered ${money(bid.offer)} for ${bid.playerName}.`,
          action: { screen: 'transfers' },
        });
      }
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

  const departures = processExpiringContracts(world, game.rng);
  const you = playerClub(world);
  for (const { clubId, player } of departures) {
    if (clubId !== world.playerClubId) continue;
    pushInboxEntry(world, {
      type: 'departure',
      tone: player.overall >= squadRating(you) ? 'bad' : 'neutral',
      title: 'Contract expired',
      body: `${player.name}'s contract has run out — he leaves on a free transfer.`,
    });
  }

  runAiTransferWindow(world, game.rng);
  setTransferBudget(you);
  setWageBudget(you);
  nextSeason(world, game.rng);
  refreshMarket();
  world.pendingBids = [];
  world.youthProspects = [];

  pushInboxEntry(world, {
    type: 'season', tone: 'neutral', title: 'New season',
    body: `${world.startYear}/${String((world.startYear + 1) % 100).padStart(2, '0')} is under way.`,
    action: { screen: 'club' },
  });

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
