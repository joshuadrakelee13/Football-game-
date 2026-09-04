// Domestic cups: the FA Cup and the Carabao Cup.
//
// One generic knockout handles both. It copes with any field size by handing out byes,
// which is what lets the FA Cup's awkward 62-club third round work without special cases.

import { CUPS, cupRoundLabel, cupRoundShort } from '../data/competitions.js';

export function createCup(world, cupId, rng) {
  const def = CUPS[cupId];
  const entryByRound = new Map();
  for (const entry of def.entries) entryByRound.set(entry.round, entry.tiers);

  return {
    id: cupId,
    name: def.name,
    round: -1,
    alive: [],
    entryByRound: Object.fromEntries(entryByRound),
    currentTies: [],
    results: [],
    eliminated: {},
    winner: null,
    finalists: [],
    complete: false,
  };
}

// Advance the cup to its next round: add any newly entering clubs, then draw the ties.
export function drawRound(world, cup, rng) {
  const def = CUPS[cup.id];
  cup.round++;

  const entering = cup.entryByRound[cup.round];
  if (entering) {
    for (const tier of entering) {
      for (const id of world.divisions[tier] || []) {
        if (!cup.alive.includes(id)) cup.alive.push(id);
      }
    }
  }

  if (cup.alive.length <= 1) {
    cup.complete = true;
    cup.winner = cup.alive[0] || null;
    cup.currentTies = [];
    return;
  }

  const shuffled = rng.shuffle(cup.alive);
  const ties = [];
  // An odd field means one club goes through without kicking a ball.
  const byeId = shuffled.length % 2 === 1 ? shuffled.pop() : null;

  for (let i = 0; i < shuffled.length; i += 2) {
    ties.push({
      home: shuffled[i],
      away: shuffled[i + 1],
      competition: cup.id,
      round: cup.round,
      roundLabel: cupRoundLabel(cup.round, cup.alive.length),
      roundShort: cupRoundShort(cup.round, cup.alive.length),
      neutralVenue: cup.alive.length <= 2,
      extraTime: true,
      penaltiesIfDrawn: true,
    });
  }

  cup.currentTies = ties;
  cup.bye = byeId;
  cup.roundLabel = cupRoundLabel(cup.round, cup.alive.length);
  cup.roundShort = cupRoundShort(cup.round, cup.alive.length);
}

// Record a played tie and work out who goes through.
export function resolveTie(cup, tie, result) {
  let winner;
  if (result.penalties) {
    winner = result.penalties.home > result.penalties.away ? tie.home : tie.away;
  } else {
    winner = result.homeGoals > result.awayGoals ? tie.home : tie.away;
  }
  const loser = winner === tie.home ? tie.away : tie.home;
  cup.eliminated[loser] = cup.round;
  cup.results.push({
    round: cup.round,
    roundLabel: tie.roundLabel,
    home: tie.home,
    away: tie.away,
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    penalties: result.penalties,
    winner,
  });
  return winner;
}

// After every tie in a round is played, reduce the field to the survivors.
export function completeRound(cup, winners) {
  const survivors = [...winners];
  if (cup.bye) survivors.push(cup.bye);
  cup.alive = survivors;
  cup.bye = null;

  if (survivors.length === 1) {
    cup.winner = survivors[0];
    cup.complete = true;
    cup.currentTies = [];
  }
}

// Prize money for how far a club got. Reaching round N pays for every round survived.
export function cupPrizeFor(cupId, roundsSurvived, isWinner) {
  const def = CUPS[cupId];
  let total = 0;
  for (let i = 0; i < Math.min(roundsSurvived, def.prizes.length); i++) total += def.prizes[i];
  if (isWinner) total += def.winnerPrize;
  return total;
}

export function cupRoundsSurvived(cup, clubId) {
  if (cup.winner === clubId) return cup.results.filter((r) => r.winner === clubId).length;
  const out = cup.eliminated[clubId];
  if (out === undefined) return 0;
  return cup.results.filter((r) => r.winner === clubId).length;
}
