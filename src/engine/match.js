// The match engine.
//
// Minute by minute, DOM-free, deterministic given an RNG. It returns a full event
// stream plus statistics; the UI decides whether to play that stream back as live
// commentary or jump straight to the result. One code path serves both.
//
// Every constant that shapes the outcome distribution lives in TUNING, and the
// numbers there were fitted with tools/sim-test.mjs rather than guessed.

import { clamp } from '../core/rng.js';
import { teamRatings, lineupPlayers, benchPlayers, pickOppositionFocusTarget } from '../model/club.js';
import { positionFit } from '../data/positions.js';
import { isAvailable } from '../model/player.js';
import {
  defaultTactics, pressingDefenceFactor, pressingFatigueFactor, pressingFoulFactor,
  tempoVolumeFactor, tempoQualityAdjust, widthCornerFactor, widthInvolvement, dutyInvolvement,
  OPPOSITION_FOCUS_TARGET_DEBUFF, OPPOSITION_FOCUS_OWN_DEFENCE_COST,
} from '../data/tactics.js';
import { aiAdjustTactics } from './ai-tactics.js';

export const TUNING = {
  shotsPerTeam: 12.0,          // baseline shots for an evenly matched side
  strengthExponent: 2.15,      // how sharply shot volume responds to a rating edge
  onTargetBase: 0.355,         // share of shots that hit the target
  conversionBase: 0.272,       // share of on-target shots that beat the keeper
  // These look big, but the attack-vs-defence ratio damps them sharply: together
  // they are worth about a quarter of a goal, which is real football's home edge.
  homeAttack: 1.160,
  homeDefence: 1.075,
  formSd: 0.130,               // per-match variance: the "any given Saturday" factor
  yellowPerTeam: 1.5,
  redChance: 0.010,            // straight red
  secondYellowRed: 0.4,        // a booked player who fouls again does not always walk
  injuryChance: 0.09,
  penaltyChance: 0.009,        // ~0.11 penalties per team per game, as in real football
  penaltyConversion: 0.76,
  woodworkShare: 0.055,
};

// How likely each position is to be the one finishing a chance.
const SCORER_WEIGHT = { ST: 10, LW: 6.5, RW: 6.5, CAM: 5.5, CM: 2.6, CDM: 1.1, LB: 0.7, RB: 0.7, CB: 1.1, GK: 0.02 };
const ASSIST_WEIGHT = { CAM: 8, LW: 7, RW: 7, CM: 6, ST: 4, LB: 3.2, RB: 3.2, CDM: 2.2, CB: 0.9, GK: 0.15 };
const CARD_WEIGHT   = { CDM: 3.2, CB: 3, CM: 2.4, LB: 2, RB: 2, ST: 1.5, CAM: 1.2, LW: 1.1, RW: 1.1, GK: 0.4 };

// `side` is passed only at the scorer/assist call sites, never at the CARD_WEIGHT
// ones — width and duty shift who gets the ball in a scoring position, not who
// concedes a foul, so a call site that omits `side` gets tacticalFactor 1, unchanged.
function pickWeighted(rng, entries, weightTable, attribute, exclude = null, side = null) {
  const pool = entries.filter((e) => e.player && e.player.id !== exclude);
  if (!pool.length) return null;
  const weights = pool.map((e) => {
    const positional = weightTable[e.slot] ?? 1;
    const skill = attribute ? Math.pow(e.player.attributes[attribute] / 55, 1.6) : 1;
    const tacticalFactor = side
      ? widthInvolvement(e.slot, side.tactics?.width ?? 0) * dutyInvolvement(e.duty)
      : 1;
    return Math.max(0.01, positional * skill * tacticalFactor);
  });
  return rng.weighted(pool, weights).player;
}

// Side state carried through the 90 minutes.
// `debuffs` and `ownDefenceCost` implement opposition focus — see simulateMatch for
// how they're built from each club's tactics.oppositionFocus.
function buildSide(club, isHome, { debuffs = null, ownDefenceCost = null } = {}) {
  const ratings = teamRatings(club, { debuffs });
  if (ownDefenceCost) ratings.defence *= ownDefenceCost;
  const onPitch = lineupPlayers(club).map((e) => ({ ...e, matchFitness: e.player.fitness }));
  return {
    club,
    isHome,
    ratings,
    // Snapshotted, not a live reference to club.tactics — a mid-match tactical
    // change (the AI's half-time reaction, or later a human's) refreshes this
    // explicitly via syncSideTactics rather than having every read implicitly
    // notice a mutation partway through a match.
    tactics: club.tactics || defaultTactics(),
    // Kept so syncSideTactics can recompute ratings with the same opposition-focus
    // debuff still applied — that part of a side's state is fixed at kickoff and
    // does not change mid-match, only the tactics dials might.
    debuffs, ownDefenceCost,
    onPitch,
    bench: benchPlayers(club).filter(isAvailable),
    subsUsed: 0,
    goals: 0,
    shots: 0,
    onTarget: 0,
    corners: 0,
    fouls: 0,
    yellows: 0,
    reds: 0,
    possession: 50,
    scorers: [],
    assists: [],
    bookings: [],
    injuries: [],
    subs: [],
    sentOff: [],
  };
}

function attackingPower(side) {
  const r = side.ratings;
  const base = r.attack * 0.68 + r.midfield * 0.32;
  return base * side.form * (side.isHome ? TUNING.homeAttack : 1) * side.manpower;
}

function defensivePower(side) {
  const r = side.ratings;
  const base = r.defence * 0.7 + r.midfield * 0.18 + r.gk * 0.12;
  const pressing = pressingDefenceFactor(side.tactics?.pressing ?? 0);
  return base * pressing * side.form * (side.isHome ? TUNING.homeDefence : 1) * side.manpower;
}

export function simulateMatch(homeClub, awayClub, rng, options = {}) {
  const {
    neutralVenue = false,
    competition = 'LEAGUE',
    label = '',
    extraTime = false,
    penaltiesIfDrawn = false,
    aggregate = null,
    // Off only for harnesses that hold a club's tactics fixed to isolate one lever's
    // effect (see tools/tactics-test.mjs, tools/sim-test.mjs) — real play, season-test
    // and balance-test all want the AI actually reacting at half time, same as every
    // other tactics behaviour.
    aiHalfTimeReactions = true,
  } = options;

  // Opposition focus: whichever side has it switched on debuffs the opponent's best
  // available starter for this match, recomputed fresh rather than stored — and pays
  // a small cost of its own to its defence line, so it's a trade like every other
  // lever, not a free lunch.
  const homeFocusesOn = homeClub.tactics?.oppositionFocus ? pickOppositionFocusTarget(awayClub) : null;
  const awayFocusesOn = awayClub.tactics?.oppositionFocus ? pickOppositionFocusTarget(homeClub) : null;

  const home = buildSide(homeClub, !neutralVenue, {
    debuffs: awayFocusesOn ? new Map([[awayFocusesOn.id, OPPOSITION_FOCUS_TARGET_DEBUFF]]) : null,
    ownDefenceCost: homeFocusesOn ? OPPOSITION_FOCUS_OWN_DEFENCE_COST : null,
  });
  const away = buildSide(awayClub, false, {
    debuffs: homeFocusesOn ? new Map([[homeFocusesOn.id, OPPOSITION_FOCUS_TARGET_DEBUFF]]) : null,
    ownDefenceCost: awayFocusesOn ? OPPOSITION_FOCUS_OWN_DEFENCE_COST : null,
  });

  for (const side of [home, away]) {
    side.form = clamp(rng.normal(1, TUNING.formSd), 0.72, 1.3);
    side.manpower = 1; // drops if a player is sent off
  }

  // Possession follows the midfield battle.
  const midHome = home.ratings.midfield * home.form * (home.isHome ? 1.03 : 1);
  const midAway = away.ratings.midfield * away.form;
  const homeShare = clamp(midHome / (midHome + midAway), 0.28, 0.72);
  home.possession = Math.round(homeShare * 100);
  away.possession = 100 - home.possession;

  const events = [];
  const push = (minute, type, data = {}) => events.push({ minute, type, ...data });

  push(0, 'kickoff', {
    home: homeClub.short, away: awayClub.short,
    venue: neutralVenue ? 'a neutral venue' : homeClub.stadium,
    competition, label,
  });

  const totalMinutes = 90;
  const simulateBlock = (from, to, phase) => {
    for (let minute = from; minute <= to; minute++) {
      tickMinute(minute, home, away, homeShare, rng, push, phase);
      tickMinute(minute, away, home, 1 - homeShare, rng, push, phase);
      if (minute === 45 && phase === 'normal') {
        push(45, 'half_time', { homeGoals: home.goals, awayGoals: away.goals });
        applyHalfTime(home, away, rng, push, aiHalfTimeReactions);
      }
      if (minute % 15 === 0) considerSubs(minute, home, rng, push), considerSubs(minute, away, rng, push);
    }
  };

  simulateBlock(1, totalMinutes, 'normal');

  // Stoppage time: a short extra block where late drama happens.
  const stoppage = rng.int(1, 5);
  for (let i = 1; i <= stoppage; i++) {
    tickMinute(90 + i, home, away, homeShare, rng, push, 'stoppage', `90+${i}`);
    tickMinute(90 + i, away, home, 1 - homeShare, rng, push, 'stoppage', `90+${i}`);
  }

  let wentToExtraTime = false;
  let penalties = null;

  const aggHome = (aggregate?.home || 0) + home.goals;
  const aggAway = (aggregate?.away || 0) + away.goals;
  const levelForKnockout = aggregate ? aggHome === aggAway : home.goals === away.goals;

  if (extraTime && levelForKnockout) {
    wentToExtraTime = true;
    push(90, 'extra_time', {});
    for (let minute = 91; minute <= 120; minute++) {
      tickMinute(minute, home, away, homeShare, rng, push, 'extra');
      tickMinute(minute, away, home, 1 - homeShare, rng, push, 'extra');
    }
  }

  const finalLevel = aggregate
    ? (aggregate.home || 0) + home.goals === (aggregate.away || 0) + away.goals
    : home.goals === away.goals;

  if (penaltiesIfDrawn && finalLevel) {
    penalties = shootout(home, away, rng, push);
  }

  push(90, 'full_time', { homeGoals: home.goals, awayGoals: away.goals });

  return {
    homeClubId: homeClub.id,
    awayClubId: awayClub.id,
    homeGoals: home.goals,
    awayGoals: away.goals,
    competition,
    label,
    neutralVenue,
    wentToExtraTime,
    penalties,
    events,
    stats: {
      possession: [home.possession, away.possession],
      shots: [home.shots, away.shots],
      onTarget: [home.onTarget, away.onTarget],
      corners: [home.corners, away.corners],
      fouls: [home.fouls, away.fouls],
      yellows: [home.yellows, away.yellows],
      reds: [home.reds, away.reds],
    },
    home: summarise(home),
    away: summarise(away),
  };
}

function summarise(side) {
  return {
    clubId: side.club.id,
    scorers: side.scorers,
    assists: side.assists,
    bookings: side.bookings,
    injuries: side.injuries,
    subs: side.subs,
    sentOff: side.sentOff,
    onPitch: side.onPitch.map((e) => ({ playerId: e.player.id, slot: e.slot, minutes: e.minutesPlayed ?? 90 })),
  };
}

function tickMinute(minute, side, opponent, possessionShare, rng, push, phase, minuteLabel = null) {
  const atk = attackingPower(side);
  const def = defensivePower(opponent);
  const ratio = atk / (atk + def);
  const volume = Math.pow(ratio / 0.5, TUNING.strengthExponent);

  // Expected shots for this side across the match, converted to a per-minute rate.
  // Tempo is a volume lever here; its quality trade-off lives in resolveChance's
  // onTargetProb, deliberately a separate touch point so the two effects stay
  // independently measurable.
  const possessionFactor = 0.6 + 0.8 * possessionShare;
  const tempo = tempoVolumeFactor(side.tactics?.tempo ?? 0);
  const expected = TUNING.shotsPerTeam * volume * possessionFactor * tempo;
  let perMinute = expected / 90;
  if (phase === 'stoppage' || phase === 'extra') perMinute *= 1.1; // tired legs, stretched games

  // Fatigue drags on the chasing side late on. Pressing raises the drain rate — the
  // cost side of what is otherwise a pure defensive boost in defensivePower().
  const pressingFatigue = pressingFatigueFactor(side.tactics?.pressing ?? 0);
  for (const entry of side.onPitch) {
    entry.matchFitness = Math.max(30, entry.matchFitness - 0.16 * pressingFatigue);
  }

  if (rng.chance(perMinute)) {
    resolveChance(minute, side, opponent, rng, push, minuteLabel);
  }

  // Corners, fouls and cards tick along independently of shots. Width raises corners
  // (more crosses, more deflected balls out); pressing raises fouls (and, through the
  // existing yellow-card roll below, cards) — pressing's second cost, alongside fatigue.
  const widthCorner = widthCornerFactor(side.tactics?.width ?? 0);
  if (rng.chance(0.055 * (0.6 + 0.8 * possessionShare) * widthCorner)) side.corners++;

  const pressingFoul = pressingFoulFactor(side.tactics?.pressing ?? 0);
  if (rng.chance(0.13 * pressingFoul)) {
    side.fouls++;
    if (rng.chance(TUNING.yellowPerTeam / 12)) bookPlayer(minute, side, rng, push, minuteLabel);
  }
  if (rng.chance(TUNING.injuryChance / 90)) injurePlayer(minute, side, rng, push, minuteLabel);
}

function resolveChance(minute, side, opponent, rng, push, minuteLabel) {
  const label = minuteLabel || String(minute);
  side.shots++;

  const attackQuality = side.ratings.attack * side.form;
  const keeperQuality = opponent.ratings.gk * opponent.form;

  // A penalty is a chance resolved differently.
  if (rng.chance(TUNING.penaltyChance)) {
    const taker = pickWeighted(rng, side.onPitch, SCORER_WEIGHT, 'finishing', null, side);
    if (taker) {
      const converted = rng.chance(TUNING.penaltyConversion + (taker.attributes.finishing - 60) * 0.0022);
      if (converted) {
        side.onTarget++;
        recordGoal(minute, side, taker, null, rng, push, label, 'penalty');
      } else {
        push(label, 'penalty_missed', { club: side.club.short, player: taker.name, clubId: side.club.id });
      }
      return;
    }
  }

  // Tempo's quality trade: rushed, fast-tempo shots are less accurate; patient,
  // slow-tempo ones more so. Kept separate from tempo's volume effect in tickMinute
  // so a harness can attribute each independently.
  const tempoQuality = tempoQualityAdjust(side.tactics?.tempo ?? 0);
  const onTargetProb = clamp(TUNING.onTargetBase + (attackQuality - keeperQuality) * 0.0035 + tempoQuality, 0.18, 0.62);
  if (!rng.chance(onTargetProb)) {
    if (rng.chance(TUNING.woodworkShare)) {
      const player = pickWeighted(rng, side.onPitch, SCORER_WEIGHT, 'finishing', null, side);
      push(label, 'woodwork', { club: side.club.short, clubId: side.club.id, player: player?.name });
    } else {
      const player = pickWeighted(rng, side.onPitch, SCORER_WEIGHT, 'finishing', null, side);
      push(label, 'shot_off', { club: side.club.short, clubId: side.club.id, player: player?.name });
    }
    return;
  }

  side.onTarget++;
  const conversion = clamp(TUNING.conversionBase + (attackQuality - keeperQuality) * 0.0042, 0.08, 0.62);
  const scorer = pickWeighted(rng, side.onPitch, SCORER_WEIGHT, 'finishing', null, side);
  if (!scorer) return;

  if (rng.chance(conversion)) {
    const assister = rng.chance(0.72) ? pickWeighted(rng, side.onPitch, ASSIST_WEIGHT, 'passing', scorer.id, side) : null;
    recordGoal(minute, side, scorer, assister, rng, push, label, 'open_play');
  } else {
    push(label, 'shot_saved', { club: side.club.short, clubId: side.club.id, player: scorer.name });
  }
}

function recordGoal(minute, side, scorer, assister, rng, push, label, kind) {
  side.goals++;
  side.scorers.push({ playerId: scorer.id, minute, kind });
  if (assister) side.assists.push({ playerId: assister.id, minute });
  push(label, 'goal', {
    club: side.club.short,
    clubId: side.club.id,
    player: scorer.name,
    playerId: scorer.id,
    assist: assister?.name || null,
    kind,
  });
}

function bookPlayer(minute, side, rng, push, minuteLabel) {
  const label = minuteLabel || String(minute);
  let player = pickWeighted(rng, side.onPitch, CARD_WEIGHT, 'tackling');
  if (!player) return;
  let alreadyBooked = side.bookings.some((b) => b.playerId === player.id);

  // A referee who has already booked someone usually finds another culprit rather
  // than reaching straight for the second yellow.
  if (alreadyBooked && !rng.chance(TUNING.secondYellowRed)) {
    const booked = new Set(side.bookings.map((b) => b.playerId));
    const clean = side.onPitch.filter((e) => !booked.has(e.player.id));
    if (!clean.length) return;
    player = pickWeighted(rng, clean, CARD_WEIGHT, 'tackling');
    if (!player) return;
    alreadyBooked = false;
  }

  if (alreadyBooked || rng.chance(TUNING.redChance)) {
    side.reds++;
    side.sentOff.push({ playerId: player.id, minute });
    side.onPitch = side.onPitch.filter((e) => e.player.id !== player.id);
    // Ten men is a real, felt penalty rather than a cosmetic one.
    side.manpower = Math.max(0.6, side.manpower - 0.14);
    push(label, 'red_card', { club: side.club.short, clubId: side.club.id, player: player.name, second: alreadyBooked });
  } else {
    side.yellows++;
    side.bookings.push({ playerId: player.id, minute });
    push(label, 'yellow_card', { club: side.club.short, clubId: side.club.id, player: player.name });
  }
}

function injurePlayer(minute, side, rng, push, minuteLabel) {
  const label = minuteLabel || String(minute);
  const entry = rng.pick(side.onPitch);
  if (!entry) return;
  const weeks = rng.weighted([1, 2, 3, 5, 8, 14], [34, 26, 18, 12, 7, 3]);
  side.injuries.push({ playerId: entry.player.id, minute, weeks });
  push(label, 'injury', { club: side.club.short, clubId: side.club.id, player: entry.player.name, weeks });
  makeSub(minute, side, rng, push, entry, true);
}

// Recomputes a side's cached ratings after club.tactics has changed mid-match (the
// AI's half-time reaction here, or later a human's pause-menu change) — reapplies the
// same opposition-focus debuff and own-defence cost fixed at kickoff against the club's
// new tactics, rather than rebuilding the side from scratch.
function syncSideTactics(side) {
  side.tactics = side.club.tactics || defaultTactics();
  const ratings = teamRatings(side.club, { debuffs: side.debuffs });
  if (side.ownDefenceCost) ratings.defence *= side.ownDefenceCost;
  side.ratings = ratings;
}

function applyHalfTime(home, away, rng, push, aiHalfTimeReactions = true) {
  for (const side of [home, away]) {
    for (const entry of side.onPitch) entry.matchFitness = Math.min(100, entry.matchFitness + 3);
  }

  if (!aiHalfTimeReactions) return;

  // The AI reacts to the scoreline at the break — a losing side pushes on, a side
  // sitting on a comfortable lead shuts up shop — for every match this engine plays,
  // quick-simmed or live, not only ones a human happens to be watching. The player's
  // own club is left untouched: their tactics change only through their own action.
  for (const [side, opponent] of [[home, away], [away, home]]) {
    if (side.club.isPlayerClub) continue;
    const changed = aiAdjustTactics(side.club, { goalsFor: side.goals, goalsAgainst: opponent.goals });
    if (changed) syncSideTactics(side);
  }
}

// Substitutions come on for the most tired players, or for anyone injured.
function considerSubs(minute, side, rng, push) {
  if (minute < 55 || side.subsUsed >= 3 || !side.bench.length) return;
  const tired = side.onPitch
    .filter((e) => e.slot !== 'GK')
    .sort((a, b) => a.matchFitness - b.matchFitness)[0];
  if (!tired || tired.matchFitness > 62) return;
  if (!rng.chance(0.4)) return;
  makeSub(minute, side, rng, push, tired, false);
}

function makeSub(minute, side, rng, push, outEntry, forced) {
  if (side.subsUsed >= 5 || !side.bench.length) return;
  const candidates = side.bench.filter((p) => p.position !== 'GK' || outEntry.slot === 'GK');
  const pool = candidates.length ? candidates : side.bench;
  let best = null;
  let bestScore = -Infinity;
  for (const p of pool) {
    const score = p.overall * positionFit(p.position, outEntry.slot);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best) return;

  side.bench = side.bench.filter((p) => p.id !== best.id);
  outEntry.minutesPlayed = minute;
  side.onPitch = side.onPitch.filter((e) => e.player.id !== outEntry.player.id);
  side.onPitch.push({ slot: outEntry.slot, player: best, matchFitness: best.fitness, minutesPlayed: 90 - minute, cameOn: minute });
  side.subsUsed++;
  side.subs.push({ off: outEntry.player.id, on: best.id, minute, forced });
  push(String(minute), 'substitution', {
    club: side.club.short, clubId: side.club.id,
    off: outEntry.player.name, on: best.name, forced,
  });
}

function shootout(home, away, rng, push) {
  push(120, 'shootout_start', {});
  // A side reduced by red cards can end the match with very few players on the pitch,
  // so fall back to the wider squad rather than indexing into an empty list.
  const takers = (side) => {
    const onPitch = [...side.onPitch]
      .sort((a, b) => b.player.attributes.finishing - a.player.attributes.finishing)
      .map((e) => e.player);
    if (onPitch.length) return onPitch;
    const squad = [...(side.club.squad || [])].sort((a, b) => b.attributes.finishing - a.attributes.finishing);
    return squad.length ? squad : null;
  };
  const homeTakers = takers(home);
  const awayTakers = takers(away);
  let h = 0, a = 0;

  const kick = (side, taker, opponent) => {
    if (!taker) return rng.chance(0.5);
    const p = clamp(0.7 + (taker.attributes.finishing - opponent.ratings.gk) * 0.004, 0.5, 0.92);
    return rng.chance(p);
  };
  const pickTaker = (list, i) => (list && list.length ? list[i % list.length] : null);

  for (let i = 0; i < 5; i++) {
    if (kick(home, pickTaker(homeTakers, i), away)) h++;
    if (kick(away, pickTaker(awayTakers, i), home)) a++;
  }
  let round = 5;
  while (h === a && round < 15) {
    const hs = kick(home, pickTaker(homeTakers, round), away);
    const as = kick(away, pickTaker(awayTakers, round), home);
    if (hs) h++;
    if (as) a++;
    round++;
  }
  if (h === a) h++; // guarantee a winner
  push(120, 'shootout_end', { home: h, away: a });
  return { home: h, away: a };
}
