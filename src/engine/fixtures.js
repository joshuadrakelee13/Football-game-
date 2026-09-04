// Fixture and calendar generation.
//
// Every match in the world lives on a numbered matchday in one global ordered list.
// "Advance" processes the next matchday; "sim to date" processes matchdays until the
// player's next fixture in some competition. That one structure serves all four of the
// match-pacing modes without a separate code path for each.

import { DIVISIONS } from '../data/competitions.js';

// Standard circle method. With an even field this produces n-1 rounds where every club
// plays exactly once per round.
export function singleRoundRobin(ids) {
  const teams = ids.slice();
  if (teams.length % 2 !== 0) teams.push(null); // bye
  const n = teams.length;
  const rounds = [];
  const rotating = teams.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    const left = [teams[0], ...rotating.slice(0, n / 2 - 1)];
    const right = rotating.slice(n / 2 - 1).reverse();
    for (let i = 0; i < n / 2; i++) {
      const a = left[i];
      const b = right[i];
      if (a == null || b == null) continue;
      // Alternate which side is at home so no club has a lopsided home schedule.
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop());
  }
  return rounds;
}

// Full home-and-away season: the first half, then the same fixtures reversed.
export function doubleRoundRobin(ids, rng) {
  const shuffled = rng ? rng.shuffle(ids) : ids.slice();
  const first = singleRoundRobin(shuffled);
  const second = first.map((round) => round.map(([h, a]) => [a, h]));
  const orderedSecond = rng ? rng.shuffle(second) : second;
  return [...first, ...orderedSecond];
}

// Which league round numbers are played midweek. Compresses the season to roughly
// August-May instead of spilling into the summer, exactly as the real calendar does
// with its Christmas and Easter congestion.
const MIDWEEK_LEAGUE_ROUNDS = new Set([11, 20, 22, 24, 33, 40, 44]);

// Cup and European rounds are injected after a given league round.
// [afterLeagueRound, competition, roundIndex]
const INSERTIONS = [
  [2, 'EFL', 0], [3, 'EURO', 0], [4, 'EFL', 1], [6, 'EURO', 1],
  [8, 'EFL', 2], [9, 'EURO', 2], [12, 'EFL', 3], [12, 'EURO', 3],
  [14, 'FA', 0], [15, 'EURO', 4], [17, 'FA', 1], [18, 'EURO', 5],
  [20, 'EFL', 4], [23, 'FA', 2], [27, 'FA', 3], [29, 'EFL', 5],
  [30, 'EURO', 6], [31, 'FA', 4], [32, 'EURO', 7], [33, 'EFL', 6],
  [35, 'FA', 5], [36, 'EURO', 8], [38, 'EURO', 9], [39, 'FA', 6],
  [44, 'EURO', 10], [46, 'FA', 7],
];

// Total league rounds is driven by the largest division (24 clubs -> 46 rounds).
export const LEAGUE_ROUNDS = 46;

export function buildCalendar(startYear) {
  const aug1 = new Date(Date.UTC(startYear, 7, 1));
  // Days from 1 August to the first Saturday.
  const firstSaturday = (6 - aug1.getUTCDay() + 7) % 7;

  const insertionsByRound = new Map();
  for (const [after, comp, round] of INSERTIONS) {
    if (!insertionsByRound.has(after)) insertionsByRound.set(after, []);
    insertionsByRound.get(after).push({ comp, round });
  }

  const matchdays = [];
  let week = 0;
  let lastWeekendDay = firstSaturday - 7;

  for (let leagueRound = 1; leagueRound <= LEAGUE_ROUNDS; leagueRound++) {
    if (MIDWEEK_LEAGUE_ROUNDS.has(leagueRound)) {
      // A midweek league round shares the current week rather than claiming a new one.
      matchdays.push({
        id: matchdays.length,
        day: lastWeekendDay + 4,
        type: 'league',
        leagueRound,
        label: `Matchday ${leagueRound}`,
      });
    } else {
      week++;
      lastWeekendDay = firstSaturday + (week - 1) * 7;
      matchdays.push({
        id: matchdays.length,
        day: lastWeekendDay,
        type: 'league',
        leagueRound,
        label: `Matchday ${leagueRound}`,
      });
    }

    const inserts = insertionsByRound.get(leagueRound) || [];
    inserts.forEach((ins, i) => {
      matchdays.push({
        id: matchdays.length,
        day: lastWeekendDay + 3 + i,
        type: ins.comp === 'EURO' ? 'euro' : 'cup',
        competition: ins.comp,
        cupRound: ins.round,
        label: ins.comp === 'EURO' ? `European matchday` : `${ins.comp} Cup round`,
      });
    });
  }

  matchdays.sort((a, b) => a.day - b.day);
  // Two competitions can land on the same date once congestion bites; nudge the later
  // one so every matchday has a distinct, strictly increasing day.
  for (let i = 1; i < matchdays.length; i++) {
    if (matchdays[i].day <= matchdays[i - 1].day) matchdays[i].day = matchdays[i - 1].day + 1;
  }
  matchdays.forEach((m, i) => { m.id = i; });
  return matchdays;
}

// League fixtures for every division, keyed by league round number.
// The Premier League plays 38 rounds, so its fixtures are spread across the 46
// available league matchdays and it simply has no game on the other 8.
export function buildLeagueFixtures(world, rng) {
  const byRound = new Map();

  for (const div of DIVISIONS) {
    const ids = world.divisions[div.tier];
    if (!ids || ids.length < 2) continue;
    const rounds = doubleRoundRobin(ids, rng);
    const slots = spreadRounds(rounds.length, LEAGUE_ROUNDS);

    rounds.forEach((pairs, i) => {
      const leagueRound = slots[i];
      if (!byRound.has(leagueRound)) byRound.set(leagueRound, []);
      for (const [home, away] of pairs) {
        byRound.get(leagueRound).push({
          home, away, tier: div.tier, competition: 'LEAGUE', leagueRound,
        });
      }
    });
  }
  return byRound;
}

// Evenly distribute `count` rounds across `total` available slots (1-indexed).
function spreadRounds(count, total) {
  if (count >= total) return Array.from({ length: count }, (_, i) => i + 1);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.min(total, 1 + Math.round((i * (total - 1)) / (count - 1))));
  }
  // Guarantee strictly increasing slots so two rounds never collide.
  for (let i = 1; i < out.length; i++) {
    if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1;
  }
  return out;
}
