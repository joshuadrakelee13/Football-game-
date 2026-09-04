// European competitions: a streamlined league phase followed by a knockout bracket.
//
// Six league-phase matches against seeded continental opposition, top eight advance,
// then two-legged quarter-finals and semi-finals and a one-off final. That keeps the
// real shape and the real prize money without adding fifteen fixtures to a season
// that already runs to 46 league games and two domestic cups.

import { EURO_COMPS } from '../data/competitions.js';
import { EURO_CLUBS } from '../data/europe-clubs.js';
import { createClub } from '../model/club.js';
import { createTable, applyResult, standings } from './league.js';
import { ratingForPrestige } from '../model/club.js';

// Continental clubs are built lazily, only for the competitions actually in play.
export function ensureEuroClubs(world, rng) {
  if (world.europeClubs) return;
  world.europeClubs = {};
  for (const base of EURO_CLUBS) {
    world.europeClubs[base.id] = createClub(rng, { ...base, tier: 0 }, {
      ratingTarget: ratingForPrestige(base.prestige),
    });
  }
}

export function anyClub(world, id) {
  return world.clubs[id] || world.europeClubs?.[id] || null;
}

// Build one competition from its English qualifiers plus a seeded continental field.
export function createEuroCompetition(world, compId, englishClubIds, rng) {
  const def = EURO_COMPS[compId];
  ensureEuroClubs(world, rng);

  // Seed the continental field by prestige band so the Champions League draws the
  // giants and the Conference League draws the rest.
  const used = new Set(world.usedEuroClubIds || []);
  const pool = EURO_CLUBS
    .filter((c) => !used.has(c.id))
    .sort((a, b) => b.prestige - a.prestige);

  const bandStart = compId === 'ucl' ? 0 : compId === 'uel' ? 12 : 26;
  const need = def.fieldSize - englishClubIds.length;
  const chosen = pool.slice(bandStart, bandStart + need).map((c) => c.id);
  const fallback = pool.filter((c) => !chosen.includes(c.id)).map((c) => c.id);
  while (chosen.length < need && fallback.length) chosen.push(fallback.shift());

  world.usedEuroClubIds = [...used, ...chosen];

  const field = [...englishClubIds, ...chosen];
  return {
    id: compId,
    name: def.name,
    active: true,
    phase: 'league',
    field,
    englishClubs: englishClubIds,
    table: createTable(field),
    schedule: buildLeaguePhase(field, def.leaguePhaseMatches, rng),
    matchdayIndex: 0,
    currentTies: [],
    knockout: null,
    results: [],
    winner: null,
    complete: false,
  };
}

// Swiss-style league phase: each club plays a handful of opponents from the same
// pool, and everyone sits in one table.
function buildLeaguePhase(field, matches, rng) {
  const rounds = [];
  const playCount = Object.fromEntries(field.map((id) => [id, 0]));
  const met = new Set();

  for (let r = 0; r < matches; r++) {
    const available = rng.shuffle(field.filter((id) => playCount[id] <= r));
    const used = new Set();
    const ties = [];

    for (const home of available) {
      if (used.has(home)) continue;
      const opponent = available.find(
        (away) => away !== home && !used.has(away) &&
          !met.has(key(home, away)) && !met.has(key(away, home))
      );
      if (!opponent) continue;
      used.add(home); used.add(opponent);
      met.add(key(home, opponent));
      playCount[home]++; playCount[opponent]++;
      // Alternate home advantage across the phase.
      ties.push(r % 2 === 0 ? { home, away: opponent } : { home: opponent, away: home });
    }
    rounds.push(ties);
  }
  return rounds;
}

const key = (a, b) => a + '|' + b;

// Ties to be played on the competition's next European matchday.
export function nextEuroTies(comp) {
  if (comp.phase === 'league') {
    const round = comp.schedule[comp.matchdayIndex];
    return (round || []).map((t) => ({
      ...t, competition: comp.id, roundLabel: `League phase ${comp.matchdayIndex + 1}`,
      roundShort: `LP${comp.matchdayIndex + 1}`,
    }));
  }
  return comp.currentTies;
}

export function recordEuroLeagueResult(comp, tie, result, clubNameFn) {
  applyResult(comp.table, tie.home, tie.away, result.homeGoals, result.awayGoals);
  comp.results.push({
    phase: 'league', home: tie.home, away: tie.away,
    homeGoals: result.homeGoals, awayGoals: result.awayGoals,
  });
}

// League phase over: the top eight go into a two-legged bracket.
export function startKnockout(comp, rng, clubNameFn) {
  const def = EURO_COMPS[comp.id];
  const table = standings(comp.table, clubNameFn);
  const qualified = table.slice(0, def.qualifyForKnockout).map((r) => r.clubId);
  comp.qualified = qualified;
  comp.phase = 'knockout';
  comp.knockout = { round: 'QF', alive: qualified, leg: 1, aggregates: {} };
  comp.currentTies = pairKnockout(comp, qualified, 'QF', 1, rng);
  return qualified;
}

// Seeded pairing: first plays eighth, second plays seventh, and so on.
function pairKnockout(comp, alive, round, leg, rng) {
  const ties = [];
  const n = alive.length;
  for (let i = 0; i < n / 2; i++) {
    const a = alive[i];
    const b = alive[n - 1 - i];
    // The higher seed hosts the decisive second leg.
    const home = leg === 1 ? b : a;
    const away = leg === 1 ? a : b;
    ties.push({
      home, away, competition: comp.id, round, leg,
      roundLabel: round === 'F' ? 'Final' : round === 'SF' ? `Semi-final leg ${leg}` : `Quarter-final leg ${leg}`,
      roundShort: round,
      neutralVenue: round === 'F',
      extraTime: round !== 'F' ? leg === 2 : true,
      penaltiesIfDrawn: round === 'F' || leg === 2,
      pairKey: [a, b].sort().join('|'),
    });
  }
  return ties;
}

const NEXT_ROUND = { QF: 'SF', SF: 'F', F: null };

// Advance the bracket after every tie on the current matchday has been played.
export function advanceKnockout(comp, rng, clubNameFn) {
  const ko = comp.knockout;

  if (ko.round !== 'F' && ko.leg === 1) {
    ko.leg = 2;
    comp.currentTies = pairKnockout(comp, ko.alive, ko.round, 2, rng);
    return;
  }

  // Settle every pairing on aggregate.
  const winners = [];
  const seen = new Set();
  for (const id of ko.alive) {
    for (const other of ko.alive) {
      if (id === other) continue;
      const pairKey = [id, other].sort().join('|');
      if (seen.has(pairKey)) continue;
      const agg = ko.aggregates[pairKey];
      if (!agg) continue;
      seen.add(pairKey);
      const [a, b] = pairKey.split('|');
      let winner;
      if (agg[a] > agg[b]) winner = a;
      else if (agg[b] > agg[a]) winner = b;
      else winner = agg.shootout || a;
      winners.push(winner);
    }
  }

  ko.aggregates = {};
  const next = NEXT_ROUND[ko.round];
  if (!next || winners.length <= 1) {
    comp.winner = winners[0] || ko.alive[0];
    comp.complete = true;
    comp.active = false;
    comp.currentTies = [];
    return;
  }

  // Keep the original seeding order among the survivors.
  ko.alive = comp.qualified.filter((id) => winners.includes(id));
  ko.round = next;
  ko.leg = 1;
  comp.finalists = next === 'F' ? ko.alive.slice() : comp.finalists;
  comp.currentTies = pairKnockout(comp, ko.alive, next, next === 'F' ? 1 : 1, rng);
  if (next === 'F') {
    comp.currentTies = [{
      home: ko.alive[0], away: ko.alive[1], competition: comp.id, round: 'F', leg: 1,
      roundLabel: 'Final', roundShort: 'F', neutralVenue: true,
      extraTime: true, penaltiesIfDrawn: true,
      pairKey: ko.alive.slice().sort().join('|'),
    }];
  }
}

export function recordEuroKnockoutResult(comp, tie, result) {
  const ko = comp.knockout;
  const agg = ko.aggregates[tie.pairKey] || {};
  agg[tie.home] = (agg[tie.home] || 0) + result.homeGoals;
  agg[tie.away] = (agg[tie.away] || 0) + result.awayGoals;
  if (result.penalties) {
    agg.shootout = result.penalties.home > result.penalties.away ? tie.home : tie.away;
  }
  ko.aggregates[tie.pairKey] = agg;
  comp.results.push({
    phase: 'knockout', round: tie.round, leg: tie.leg,
    home: tie.home, away: tie.away,
    homeGoals: result.homeGoals, awayGoals: result.awayGoals,
    penalties: result.penalties,
  });
}

// Prize money earned in Europe: participation, per-result money, and round bonuses.
export function euroPrize(comp, clubId) {
  const def = EURO_COMPS[comp.id];
  let total = def.participation;
  for (const r of comp.results) {
    if (r.home !== clubId && r.away !== clubId) continue;
    const isHome = r.home === clubId;
    const gf = isHome ? r.homeGoals : r.awayGoals;
    const ga = isHome ? r.awayGoals : r.homeGoals;
    if (gf > ga) total += def.perWin;
    else if (gf === ga) total += def.perDraw;
  }
  const reachedRounds = new Set(comp.results.filter((r) => r.phase === 'knockout' && (r.home === clubId || r.away === clubId)).map((r) => r.round));
  for (const round of reachedRounds) total += def.knockoutPrizes[round] || 0;
  if (comp.winner === clubId) total += def.winnerPrize;
  return total;
}
