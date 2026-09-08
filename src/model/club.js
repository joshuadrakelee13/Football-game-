// Club construction: squads, finances, facilities and the starting XI picker.

import { clamp } from '../core/rng.js';
import { DIVISION_BY_TIER } from '../data/competitions.js';
import { FORMATIONS, positionFit, SLOT_SPLIT, SLOT_LINE, roleFit, dutyLineBias, ROLE_OPTIONS } from '../data/positions.js';
import { generatePlayer, SQUAD_TEMPLATE, effectiveRating, isAvailable } from './player.js';
import { defaultTactics, mentalityBias } from '../data/tactics.js';

// Prestige -> the rating a club's first-choice XI should average.
// Interpolated between control points so the whole pyramid stays plausible.
const PRESTIGE_CURVE = [
  [10, 45], [20, 48], [30, 53], [40, 58], [50, 63],
  [60, 68], [70, 73], [80, 77], [90, 81], [96, 84],
];

export function ratingForPrestige(prestige) {
  const pts = PRESTIGE_CURVE;
  if (prestige <= pts[0][0]) return pts[0][1];
  if (prestige >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    if (prestige <= x2) return y1 + ((prestige - x1) / (x2 - x1)) * (y2 - y1);
  }
  return pts[pts.length - 1][1];
}

// Quality spread inside a squad: a few standouts, a solid core, then the fringe.
// Weighted so the first-choice XI averages close to the club's headline rating.
const SQUAD_SPREAD = [
  5, 4, 3, 2, 2, 1, 1, 0, -1, -2, -3,
  -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13, -14, -15, -16,
];

export function buildSquad(rng, club, { ratingTarget = null } = {}) {
  const target = (ratingTarget ?? ratingForPrestige(club.prestige)) - 1;
  const offsets = rng.shuffle(SQUAD_SPREAD.slice(0, SQUAD_TEMPLATE.length));
  const squad = [];
  SQUAD_TEMPLATE.forEach((position, i) => {
    const player = generatePlayer(rng, {
      tier: club.tier,
      position,
      targetOverall: clamp(target + offsets[i], 22, 92),
    });
    squad.push(player);
  });
  return squad;
}

export function createClub(rng, base, { isPlayerClub = false, ratingTarget = null } = {}) {
  const div = DIVISION_BY_TIER[base.tier];
  const prestige = base.prestige;

  // Fan base and money both track prestige, which is why a relegated Premier League
  // club is still a monster in the Championship.
  const fans = Math.round(
    isPlayerClub ? 1000 : clamp(base.capacity * (0.35 + prestige / 190), 800, base.capacity * 1.9)
  );

  const club = {
    ...base,
    isPlayerClub,
    squad: [],
    formation: '4-4-2',
    lineup: [],
    tactics: defaultTactics(),
    playerTactics: {},   // { [playerId]: { role, duty } } — persisted, NOT on lineup (see save.js)
    fans,
    reputation: isPlayerClub ? 10 : prestige,
    balance: 0,
    stadiumCapacity: base.capacity,
    facilities: { training: 1, youth: 1, scouting: 1 },
    form: [],
    seasonStats: null,
    trophies: [],
    parachuteYears: 0,
    trainingFocus: 'balanced',
    history: [],
    ledger: [],
    sponsor: null,
    transfersIn: [],
    transfersOut: [],
  };

  club.squad = buildSquad(rng, base, { ratingTarget });

  const wageBill = weeklyWages(club);
  if (isPlayerClub) {
    club.balance = 100_000;
    club.transferBudget = 100_000;
    club.wageBudget = 10_000;
    club.stadiumCapacity = 2000;
    club.fans = 1000;
  } else {
    // AI clubs run on roughly a season of headroom, scaled by division.
    club.balance = Math.round(div.prizeBase * (0.10 + prestige / 500) + wageBill * 4);
    club.transferBudget = Math.round(club.balance * 0.5);
    club.wageBudget = Math.round(wageBill * 1.18);
  }

  club.lineup = pickBestXI(club);
  if (!isPlayerClub) pickClubIdentity(rng, club);
  return club;
}

// Named tactical profiles for AI clubs — the first, deliberate departure from
// neutral-by-default in this whole system. Individual player roles/duties still
// default to neutral everywhere (see pickBestXI); it is only here, assigning a
// club's identity, that non-neutral values get introduced, which is what keeps this
// one balance-relevant change isolated and separately re-measurable.
// Each dial sums to exactly 0 across the four equally-likely profiles, and every
// value stays within +/-1 rather than reaching the +/-2 extremes.
//
// Both constraints came from measurement, not caution for its own sake. A first
// version averaged +0.25 on mentality and tempo, and a whole league of AI clubs
// drawing from a population that skews even slightly attacking compounded into a
// real, measured shift: goals/game rose from 2.69 to 3.01 in sim-test, 3.64 in the
// Premier League specifically in season-test. Zeroing the population mean brought
// sim-test back to 2.86 — better, but a longer season-test run still crept back to
// 3.6+ in the top two divisions. The reason: mentality's own bias table isn't even
// symmetric (-2 gives defence x1.10, +2 gives defence x0.92) and shot volume is a
// clamped, nonlinear function of the attack/defence ratio — a zero-mean population
// of *inputs* doesn't guarantee a zero-mean population of *goals*. Shrinking every
// value to +/-1 keeps identities clearly differentiated while asking much less of
// that nonlinearity, which is what the validation section of the plan meant by
// "shrink the new tactics factors before touching the already-fitted constants."
const CLUB_IDENTITY_TACTICS = {
  possession:   { mentality: 0, pressing: -1, tempo: -1, width: -1 },
  direct:       { mentality: 1, pressing: 0, tempo: 1, width: 1 },
  defensive:    { mentality: -1, pressing: 0, tempo: -1, width: -1 },
  'high-press': { mentality: 0, pressing: 1, tempo: 1, width: 1 },
};
const CLUB_IDENTITY_KEYS = Object.keys(CLUB_IDENTITY_TACTICS);

// Which duty each identity tends to hand to a slot that can meaningfully carry
// forward — everyone else stays at support.
const IDENTITY_DUTY_LEAN = { possession: 'support', direct: 'attack', defensive: 'defend', 'high-press': 'attack' };

// Gives a club a tactical identity: the four dials, plus best-fit roles and
// identity-leaning duties for its likely starters. Called on AI clubs at creation
// and again whenever a squad regenerates, so identities aren't frozen at world-build
// time. `forcedKey` lets a caller pin a specific identity rather than rolling one —
// used by tools/balance-test.mjs, where a real manager settles on an approach
// instead of reinventing their whole tactical philosophy every single summer; role
// and duty still refresh each call, for whoever is actually in the XI that season.
export function pickClubIdentity(rng, club, forcedKey = null) {
  const key = forcedKey || rng.pick(CLUB_IDENTITY_KEYS);
  club.tactics = { ...defaultTactics(), ...CLUB_IDENTITY_TACTICS[key], oppositionFocus: rng.chance(0.15) };
  club.identity = key;

  const lean = IDENTITY_DUTY_LEAN[key];
  const xi = pickBestXI(club);
  for (const entry of xi) {
    const player = club.squad.find((p) => p.id === entry.playerId);
    if (!player) continue;
    const roles = ROLE_OPTIONS[entry.slot] || [];
    let bestRole = null, bestFit = 1;
    for (const role of roles) {
      const fit = roleFit(player, entry.slot, role);
      if (fit > bestFit) { bestFit = fit; bestRole = role; }
    }
    // Not every eligible player gets the identity's duty lean — otherwise every club
    // sharing a profile would play in lockstep. GK is excluded: duty is a no-op there.
    const duty = entry.slot !== 'GK' && rng.chance(0.55) ? lean : 'support';
    club.playerTactics[player.id] = { role: bestRole, duty };
  }
  club.lineup = pickBestXI(club);
}

export function weeklyWages(club) {
  return club.squad.reduce((sum, p) => sum + p.wage, 0);
}

export function squadRating(club) {
  if (!club.squad.length) return 0;
  const sorted = [...club.squad].sort((a, b) => b.overall - a.overall).slice(0, 11);
  return sorted.reduce((s, p) => s + p.overall, 0) / sorted.length;
}

export function squadMorale(club) {
  if (!club.squad.length) return 50;
  return club.squad.reduce((s, p) => s + p.morale, 0) / club.squad.length;
}

// Best available player for each slot of the current formation, greedily assigned
// in the order the formation lists them (goalkeeper first, then back to front).
export function pickBestXI(club, formationKey = club.formation) {
  const formation = FORMATIONS[formationKey] || FORMATIONS['4-4-2'];
  const available = club.squad.filter(isAvailable);
  const pool = available.length >= 11 ? available : [...club.squad];
  const used = new Set();
  const lineup = [];

  for (const slot of formation.slots) {
    let best = null;
    let bestScore = -Infinity;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const score = effectiveRating(p) * positionFit(p.position, slot);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) {
      used.add(best.id);
      // Role/duty live on club.playerTactics, keyed by player, never on the lineup
      // entry itself — the lineup is disposable and gets regenerated on load (see
      // save.js's unpackClubs), so anything stored only here would vanish on reload.
      const pt = club.playerTactics?.[best.id];
      lineup.push({ slot, playerId: best.id, role: pt?.role ?? null, duty: pt?.duty ?? 'support' });
    }
  }
  return lineup;
}

export function lineupPlayers(club) {
  const byId = new Map(club.squad.map((p) => [p.id, p]));
  return club.lineup.map((entry) => ({ ...entry, player: byId.get(entry.playerId) })).filter((e) => e.player);
}

export function benchPlayers(club) {
  const inXI = new Set(club.lineup.map((l) => l.playerId));
  return club.squad.filter((p) => !inXI.has(p.id));
}

// Team ratings for the match engine: three lines plus a goalkeeper.
// CDMs, full-backs and wingers contribute to two lines, which is why formation matters.
//
// `debuffs` is an optional Map<playerId, factor> for opposition focus — a match-only,
// never-persisted reduction to how much one named opposing player contributes to his
// own team's lines. See src/engine/match.js's simulateMatch for how it's built.
export function teamRatings(club, { debuffs = null } = {}) {
  const formation = FORMATIONS[club.formation] || FORMATIONS['4-4-2'];
  // Weighted accumulator per line, so a CDM who is 45% defender / 55% midfielder
  // contributes proportionally to both without inflating either average.
  const lines = {
    gk: { sum: 0, weight: 0 },
    defence: { sum: 0, weight: 0 },
    midfield: { sum: 0, weight: 0 },
    attack: { sum: 0, weight: 0 },
  };

  // Duty's effect is aggregated separately, below, rather than folded into this
  // split — see dutyLineBias's comment in positions.js for why redistributing
  // weight at face value isn't reliably directional.
  let dutyAttack = 1, dutyDefence = 1, dutyMidfield = 1;
  const DUTY_NUDGE = 0.007;

  for (const { slot, player, role, duty } of lineupPlayers(club)) {
    const debuff = debuffs?.get(player.id) ?? 1;
    const rating = effectiveRating(player) * positionFit(player.position, slot) * roleFit(player, slot, role) * debuff;
    const split = slot === 'GK' ? { gk: 1 } : SLOT_SPLIT[slot] || { [SLOT_LINE[slot]]: 1 };
    for (const line in split) {
      lines[line].sum += rating * split[line];
      lines[line].weight += split[line];
    }

    const bias = dutyLineBias(slot, duty);
    if (bias) {
      const nudge = { attack: dutyAttack, defence: dutyDefence, midfield: dutyMidfield };
      nudge[bias.toward] += DUTY_NUDGE * bias.magnitude / 0.12;
      nudge[bias.away] -= DUTY_NUDGE * 0.75 * bias.magnitude / 0.12;
      dutyAttack = nudge.attack; dutyDefence = nudge.defence; dutyMidfield = nudge.midfield;
    }
  }

  const base = squadRating(club) * 0.85;
  const avg = (line) => (line.weight > 0 ? line.sum / line.weight : base);
  // Same mechanism as formation.bias, composed alongside it rather than replacing it.
  const mentality = mentalityBias(club.tactics?.mentality ?? 0);

  return {
    gk: avg(lines.gk),
    defence: avg(lines.defence) * formation.bias.defence * mentality.defence * dutyDefence,
    midfield: avg(lines.midfield) * formation.bias.midfield * dutyMidfield,
    attack: avg(lines.attack) * formation.bias.attack * mentality.attack * dutyAttack,
    formation: formation.name,
  };
}

// Highest-overall available starter — the target when a club has opposition focus
// switched on. Recomputed fresh every match rather than stored, so it can never go
// stale when the fixture changes.
export function pickOppositionFocusTarget(club) {
  const entries = lineupPlayers(club);
  if (!entries.length) return null;
  return entries.reduce((best, e) => (!best || e.player.overall > best.player.overall ? e : best), null).player;
}

// One number for league tables, transfer ambition and cup seeding.
export function overallStrength(club) {
  const r = teamRatings(club);
  return r.gk * 0.16 + r.defence * 0.3 + r.midfield * 0.28 + r.attack * 0.26;
}

export function formString(club) {
  return club.form.slice(-5);
}

export function stadiumUpkeep(club) {
  return Math.round(club.stadiumCapacity * 22 + 40_000);
}

export function facilityUpkeep(club) {
  const f = club.facilities;
  const tierMultiplier = club.tier === 0 ? 3 : club.tier === 1 ? 1.8 : 1;
  return Math.round((f.training * 18_000 + f.youth * 12_000 + f.scouting * 9_000) * tierMultiplier);
}
