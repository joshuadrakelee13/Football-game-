// Club construction: squads, finances, facilities and the starting XI picker.

import { clamp } from '../core/rng.js';
import { DIVISION_BY_TIER } from '../data/competitions.js';
import { FORMATIONS, positionFit, SLOT_SPLIT, SLOT_LINE } from '../data/positions.js';
import { generatePlayer, SQUAD_TEMPLATE, effectiveRating, isAvailable } from './player.js';

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
  return club;
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
      lineup.push({ slot, playerId: best.id });
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
export function teamRatings(club) {
  const formation = FORMATIONS[club.formation] || FORMATIONS['4-4-2'];
  // Weighted accumulator per line, so a CDM who is 45% defender / 55% midfielder
  // contributes proportionally to both without inflating either average.
  const lines = {
    gk: { sum: 0, weight: 0 },
    defence: { sum: 0, weight: 0 },
    midfield: { sum: 0, weight: 0 },
    attack: { sum: 0, weight: 0 },
  };

  for (const { slot, player } of lineupPlayers(club)) {
    const rating = effectiveRating(player) * positionFit(player.position, slot);
    const split = slot === 'GK' ? { gk: 1 } : SLOT_SPLIT[slot] || { [SLOT_LINE[slot]]: 1 };
    for (const line in split) {
      lines[line].sum += rating * split[line];
      lines[line].weight += split[line];
    }
  }

  const base = squadRating(club) * 0.85;
  const avg = (line) => (line.weight > 0 ? line.sum / line.weight : base);

  return {
    gk: avg(lines.gk),
    defence: avg(lines.defence) * formation.bias.defence,
    midfield: avg(lines.midfield) * formation.bias.midfield,
    attack: avg(lines.attack) * formation.bias.attack,
    formation: formation.name,
  };
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
