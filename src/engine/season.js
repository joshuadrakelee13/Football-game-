// Season orchestration: advancing matchdays, applying results, and everything that
// happens when a season ends.

import { clamp } from '../core/rng.js';
import { DIVISIONS, DIVISION_BY_TIER, REPUTATION, EURO_COMPS, CUPS, PARACHUTE } from '../data/competitions.js';
import { pickBestXI, weeklyWages, overallStrength, squadRating, pickClubIdentity } from '../model/club.js';
import { refreshDerived, generatePlayer, isAvailable } from '../model/player.js';
import { startSeason, playerClub, fixtureForClubOnMatchday, pickSponsor, sponsorValue } from '../model/world.js';
import { simulateMatch } from './match.js';
import { applyResult, standings, snapshotPositions } from './league.js';
import { createCup, drawRound, resolveTie, completeRound, cupPrizeFor } from './cups.js';
import {
  createEuroCompetition, nextEuroTies, recordEuroLeagueResult, startKnockout,
  advanceKnockout, recordEuroKnockoutResult, euroPrize, anyClub, ensureEuroClubs,
} from './europe.js';
import {
  payMatchday, chargeWeeklyCosts, paySponsorship, payLeaguePrize, payParachute,
  recordLedger, setTransferBudget, setWageBudget, refreshSponsor,
} from './finance.js';

const nameOf = (world) => (id) => anyClub(world, id)?.name || id;

// ---------------------------------------------------------------------------
// Matchday advance
// ---------------------------------------------------------------------------

export function currentMatchday(world) {
  return world.calendar[world.matchdayIndex] || null;
}

export function playerFixture(world) {
  const md = currentMatchday(world);
  if (!md) return null;
  const fixture = fixtureForClubOnMatchday(world, world.playerClubId, md);
  return fixture ? { matchday: md, fixture } : null;
}

// Process the next matchday in full. Returns a digest the UI can show, including the
// player's own match (with its complete event stream) when they have a fixture.
export function advanceMatchday(world, rng) {
  const md = currentMatchday(world);
  if (!md) return { finished: true };

  ensureCompetitionsForMatchday(world, md, rng);

  const digest = {
    matchday: md,
    playerMatch: null,
    playerFixture: null,
    results: [],
    news: [],
    seasonEnded: false,
  };

  if (md.type === 'league') runLeagueMatchday(world, md, rng, digest);
  else if (md.type === 'cup') runCupMatchday(world, md, rng, digest);
  else if (md.type === 'euro') runEuroMatchday(world, md, rng, digest);

  // Weekly running costs are charged as calendar time passes, not per match.
  const nextMd = world.calendar[world.matchdayIndex + 1];
  const daysElapsed = nextMd ? nextMd.day - md.day : 7;
  const weeks = Math.max(0, daysElapsed / 7);
  for (const club of Object.values(world.clubs)) {
    chargeWeeklyCosts(club, world.seasonNumber, weeks);
    paySponsorship(club, world.seasonNumber, weeks);
  }

  recoverAndDevelop(world, weeks, rng);

  world.matchdayIndex++;
  if (world.matchdayIndex >= world.calendar.length) {
    digest.seasonEnded = true;
  }
  return digest;
}

// Cups and European competitions are created the first time their matchday comes up.
function ensureCompetitionsForMatchday(world, md, rng) {
  if (md.type === 'cup' && !world.cups[md.competition]) {
    world.cups[md.competition] = createCup(world, md.competition, rng);
  }
  if (md.type === 'euro' && !world.europeInitialised) {
    initialiseEurope(world, rng);
  }
}

function runLeagueMatchday(world, md, rng, digest) {
  const fixtures = world.leagueFixtures[md.leagueRound] || [];
  for (const tier of Object.keys(world.tables)) snapshotPositions(world.tables[tier], nameOf(world));

  for (const fixture of fixtures) {
    const home = world.clubs[fixture.home];
    const away = world.clubs[fixture.away];
    if (!home || !away) continue;

    const isPlayerMatch = home.isPlayerClub || away.isPlayerClub;
    const result = simulateMatch(home, away, rng, { competition: 'LEAGUE' });
    applyMatchOutcome(world, home, away, result, 'LEAGUE', rng);
    applyResult(world.tables[fixture.tier], fixture.home, fixture.away, result.homeGoals, result.awayGoals);

    const record = summariseResult(world, fixture, result, 'LEAGUE');
    digest.results.push(record);
    if (isPlayerMatch) world.results.push(record);
    if (isPlayerMatch) {
      digest.playerMatch = result;
      digest.playerFixture = fixture;
    }
  }
}

function runCupMatchday(world, md, rng, digest) {
  const cup = world.cups[md.competition];
  if (!cup || cup.complete) return;

  if (!cup.currentTies.length) drawRound(world, cup, rng);
  if (cup.complete || !cup.currentTies.length) return;

  const winners = [];
  for (const tie of cup.currentTies) {
    const home = world.clubs[tie.home];
    const away = world.clubs[tie.away];
    if (!home || !away) continue;

    const result = simulateMatch(home, away, rng, {
      competition: cup.id, label: tie.roundLabel,
      neutralVenue: tie.neutralVenue, extraTime: true, penaltiesIfDrawn: true,
    });
    applyMatchOutcome(world, home, away, result, cup.id, rng);
    winners.push(resolveTie(cup, tie, result));

    const record = summariseResult(world, tie, result, cup.id);
    digest.results.push(record);
    if (home.isPlayerClub || away.isPlayerClub) {
      digest.playerMatch = result;
      digest.playerFixture = tie;
    }
  }

  completeRound(cup, winners);
  if (cup.complete && cup.winner) {
    payCupPrizes(world, cup);
    digest.news.push({ type: 'cup_won', cupId: cup.id, clubId: cup.winner, text: `${anyClub(world, cup.winner).name} win the ${CUPS[cup.id].name}` });
  } else {
    cup.currentTies = [];
    drawRound(world, cup, rng);
  }
}

function runEuroMatchday(world, md, rng, digest) {
  for (const key of ['ucl', 'uel', 'uecl']) {
    const comp = world.europe[key];
    if (!comp || !comp.active || comp.complete) continue;

    const ties = nextEuroTies(comp);
    if (!ties.length) continue;

    for (const tie of ties) {
      const home = anyClub(world, tie.home);
      const away = anyClub(world, tie.away);
      if (!home || !away) continue;

      const result = simulateMatch(home, away, rng, {
        competition: key.toUpperCase(), label: tie.roundLabel,
        neutralVenue: tie.neutralVenue,
        extraTime: !!tie.extraTime, penaltiesIfDrawn: !!tie.penaltiesIfDrawn,
      });
      applyMatchOutcome(world, home, away, result, key.toUpperCase(), rng);

      if (comp.phase === 'league') recordEuroLeagueResult(comp, tie, result, nameOf(world));
      else recordEuroKnockoutResult(comp, tie, result);

      const record = summariseResult(world, tie, result, key.toUpperCase());
      digest.results.push(record);
      if (home.isPlayerClub || away.isPlayerClub) {
        digest.playerMatch = result;
        digest.playerFixture = tie;
      }
    }

    if (comp.phase === 'league') {
      comp.matchdayIndex++;
      if (comp.matchdayIndex >= comp.schedule.length) startKnockout(comp, rng, nameOf(world));
    } else {
      advanceKnockout(comp, rng, nameOf(world));
      if (comp.complete && comp.winner) {
        digest.news.push({ type: 'euro_won', compId: key, clubId: comp.winner, text: `${anyClub(world, comp.winner).name} win the ${EURO_COMPS[key].name}` });
      }
    }
  }
}

function summariseResult(world, fixture, result, competition) {
  return {
    home: fixture.home, away: fixture.away,
    homeGoals: result.homeGoals, awayGoals: result.awayGoals,
    competition,
    label: fixture.roundLabel || null,
    penalties: result.penalties || null,
    season: world.seasonNumber,
    matchdayIndex: world.matchdayIndex,
  };
}

// ---------------------------------------------------------------------------
// Post-match effects
// ---------------------------------------------------------------------------

function applyMatchOutcome(world, home, away, result, competition, rng) {
  applySide(world, home, away, result, result.home, result.homeGoals, result.awayGoals, true, competition, rng);
  applySide(world, away, home, result, result.away, result.awayGoals, result.homeGoals, false, competition, rng);

  // Only the home club takes gate receipts, and not at a neutral venue.
  if (!result.neutralVenue && home.squad) {
    payMatchday(home, away, world, competition);
  }
}

function applySide(world, club, opponent, result, side, goalsFor, goalsAgainst, isHome, competition, rng) {
  if (!club.squad) return;
  const byId = new Map(club.squad.map((p) => [p.id, p]));

  const won = goalsFor > goalsAgainst;
  const drew = goalsFor === goalsAgainst;
  club.form.push(won ? 'W' : drew ? 'D' : 'L');
  if (club.form.length > 12) club.form.shift();

  if (club.seasonStats && competition === 'LEAGUE') {
    club.seasonStats.played++;
    club.seasonStats.goalsFor += goalsFor;
    club.seasonStats.goalsAgainst += goalsAgainst;
    if (won) club.seasonStats.won++;
    else if (drew) club.seasonStats.drawn++;
    else club.seasonStats.lost++;
  }

  // Appearances and match fatigue.
  for (const entry of side.onPitch) {
    const player = byId.get(entry.playerId);
    if (!player) continue;
    player.apps++;
    player.seasonApps++;
    player.careerApps++;
    const minutes = clamp(entry.minutes ?? 90, 1, 120);
    player.fitness = clamp(player.fitness - (6 + (minutes / 90) * 12) * (1 + rng.next() * 0.3), 25, 100);
  }

  for (const s of side.scorers) {
    const player = byId.get(s.playerId);
    if (!player) continue;
    player.goals++; player.seasonGoals++; player.careerGoals++;
    player.form = clamp(player.form + 1.6, -6, 6);
    player.morale = clamp(player.morale + 5, 0, 100);
  }
  for (const a of side.assists) {
    const player = byId.get(a.playerId);
    if (!player) continue;
    player.assists++; player.seasonAssists++;
    player.form = clamp(player.form + 0.9, -6, 6);
    player.morale = clamp(player.morale + 3, 0, 100);
  }
  for (const b of side.bookings) {
    const player = byId.get(b.playerId);
    if (player) player.yellowCards++;
  }
  for (const r of side.sentOff) {
    const player = byId.get(r.playerId);
    if (player) { player.redCards++; player.morale = clamp(player.morale - 8, 0, 100); }
  }
  for (const inj of side.injuries) {
    const player = byId.get(inj.playerId);
    if (!player) continue;
    player.injuredFor = inj.weeks;
    player.injuryType = inj.weeks >= 8 ? 'Serious injury' : inj.weeks >= 3 ? 'Muscle injury' : 'Knock';
    player.morale = clamp(player.morale - 6, 0, 100);
  }

  // Squad morale follows results, weighted by how surprising the result was.
  const gap = overallStrength(club) - overallStrength(opponent);
  let moraleShift = won ? 5 : drew ? 0.5 : -4.5;
  if (won && gap < -6) moraleShift += 3.5;      // beating a better side
  if (!won && !drew && gap > 6) moraleShift -= 3; // losing to a worse one
  const formShift = won ? 0.8 : drew ? 0 : -0.7;
  for (const p of club.squad) {
    p.morale = clamp(p.morale + moraleShift * (0.6 + rng.next() * 0.8), 5, 100);
    p.form = clamp(p.form + formShift * 0.5, -6, 6);
  }

  club.lineup = pickBestXI(club);
}

// Fitness recovery, injury healing and training-driven development between matches.
function recoverAndDevelop(world, weeks, rng) {
  if (weeks <= 0) return;
  for (const club of Object.values(world.clubs)) {
    const trainingLevel = club.facilities?.training ?? 1;
    for (const p of club.squad) {
      if (p.injuredFor > 0) {
        p.injuredFor = Math.max(0, p.injuredFor - weeks);
        if (p.injuredFor === 0) p.injuryType = null;
        p.fitness = clamp(p.fitness + 3 * weeks, 25, 92);
      } else {
        p.fitness = clamp(p.fitness + (9 + trainingLevel * 1.6) * weeks, 25, 100);
      }
      p.form = p.form * Math.pow(0.88, weeks);
      // Morale drifts back toward contentment when nothing is happening.
      p.morale = clamp(p.morale + (62 - p.morale) * 0.04 * weeks, 5, 100);
    }
    club.lineup = pickBestXI(club);
  }
}

// ---------------------------------------------------------------------------
// Europe
// ---------------------------------------------------------------------------

function initialiseEurope(world, rng) {
  world.europeInitialised = true;
  world.usedEuroClubIds = [];
  ensureEuroClubs(world, rng);

  const qualifiers = world.europeanQualifiers || {};
  for (const key of ['ucl', 'uel', 'uecl']) {
    const englishClubs = (qualifiers[key] || []).filter((id) => world.clubs[id]);
    if (!englishClubs.length) {
      world.europe[key] = { id: key, active: false, complete: true };
      continue;
    }
    world.europe[key] = createEuroCompetition(world, key, englishClubs, rng);
  }
}

// ---------------------------------------------------------------------------
// Prize money
// ---------------------------------------------------------------------------

function payCupPrizes(world, cup) {
  const def = CUPS[cup.id];
  const roundsWon = {};
  for (const r of cup.results) roundsWon[r.winner] = (roundsWon[r.winner] || 0) + 1;

  for (const [clubId, wins] of Object.entries(roundsWon)) {
    const club = world.clubs[clubId];
    if (!club) continue;
    const amount = cupPrizeFor(cup.id, wins, cup.winner === clubId);
    if (amount > 0) recordLedger(club, world.seasonNumber, 'prize', `${def.name} prize money`, amount);
  }

  const winner = world.clubs[cup.winner];
  if (winner) {
    winner.reputation = clamp(winner.reputation + def.winnerReputation, 1, 100);
    winner.trophies.push({ competition: def.name, season: world.startYear });
    winner.fans = Math.round(winner.fans * 1.06);
  }
  const finalRecord = cup.results[cup.results.length - 1];
  if (finalRecord) {
    const runnerUp = world.clubs[finalRecord.winner === finalRecord.home ? finalRecord.away : finalRecord.home];
    if (runnerUp) runnerUp.reputation = clamp(runnerUp.reputation + def.finalistReputation, 1, 100);
  }
}

function payEuroPrizes(world) {
  for (const key of ['ucl', 'uel', 'uecl']) {
    const comp = world.europe[key];
    if (!comp || !comp.field) continue;
    const def = EURO_COMPS[key];
    for (const clubId of comp.englishClubs || []) {
      const club = world.clubs[clubId];
      if (!club) continue;
      recordLedger(club, world.seasonNumber, 'prize', `${def.name} revenue`, euroPrize(comp, clubId));
    }
    const winner = world.clubs[comp.winner];
    if (winner) {
      winner.reputation = clamp(winner.reputation + def.winnerReputation, 1, 100);
      winner.trophies.push({ competition: def.name, season: world.startYear });
      winner.fans = Math.round(winner.fans * 1.1);
    }
  }
}

// ---------------------------------------------------------------------------
// End of season
// ---------------------------------------------------------------------------

export function endSeason(world, rng) {
  const summary = {
    season: world.startYear,
    seasonNumber: world.seasonNumber,
    divisions: {},
    promoted: [],
    relegated: [],
    playoffs: {},
    cups: {},
    europe: {},
    player: null,
  };

  // Play-offs first: they decide the last promotion place in each division.
  for (const div of DIVISIONS) {
    const table = standings(world.tables[div.tier], nameOf(world));
    summary.divisions[div.tier] = table.map((r) => ({ ...r }));
    if (div.playoffPlaces.length) {
      summary.playoffs[div.tier] = runPlayoffs(world, div, table, rng);
    }
  }

  applyLeaguePrizes(world, summary);
  payEuroPrizes(world);
  recordCupSummary(world, summary);
  determineEuropeanQualifiers(world, summary);

  const movement = applyPromotionAndRelegation(world, summary);
  summary.promoted = movement.promoted;
  summary.relegated = movement.relegated;

  summary.player = buildPlayerSummary(world, summary);

  ageAndDevelopSquads(world, rng);
  refreshClubEconomies(world, rng);

  world.history.push(summary);
  world.seasonSummary = summary;
  return summary;
}

function runPlayoffs(world, div, table, rng) {
  const places = div.playoffPlaces;
  const contenders = places.map((p) => table[p - 1]?.clubId).filter(Boolean);
  if (contenders.length < 2) return null;

  const rounds = [];
  let alive = contenders.slice();

  // Semi-finals pair highest with lowest, exactly as the real play-offs do.
  while (alive.length > 1) {
    const next = [];
    const ties = [];
    for (let i = 0; i < alive.length / 2; i++) {
      const a = alive[i];
      const b = alive[alive.length - 1 - i];
      const neutral = alive.length === 2;
      const result = simulateMatch(world.clubs[a], world.clubs[b], rng, {
        competition: 'PLAYOFF', neutralVenue: neutral, extraTime: true, penaltiesIfDrawn: true,
      });
      const winner = result.penalties
        ? (result.penalties.home > result.penalties.away ? a : b)
        : (result.homeGoals > result.awayGoals ? a : b);
      ties.push({ home: a, away: b, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penalties: result.penalties, winner });
      next.push(winner);
    }
    rounds.push(ties);
    alive = contenders.filter((id) => next.includes(id));
  }

  return { rounds, winner: alive[0] };
}

function applyLeaguePrizes(world, summary) {
  for (const div of DIVISIONS) {
    const table = summary.divisions[div.tier];
    table.forEach((row, i) => {
      const club = world.clubs[row.clubId];
      if (!club) return;
      payLeaguePrize(club, i + 1, world.seasonNumber);
      payParachute(club, world.seasonNumber);
    });
  }
}

function recordCupSummary(world, summary) {
  for (const key of ['FA', 'EFL']) {
    const cup = world.cups[key];
    if (cup) summary.cups[key] = { name: CUPS[key].name, winner: cup.winner, results: cup.results.slice(-8) };
  }
  for (const key of ['ucl', 'uel', 'uecl']) {
    const comp = world.europe[key];
    if (comp && comp.field) summary.europe[key] = { name: EURO_COMPS[key].name, winner: comp.winner };
  }
}

// Next season's European places, following the real routes.
function determineEuropeanQualifiers(world, summary) {
  const pl = summary.divisions[0] || [];
  const taken = new Set();
  const qualifiers = { ucl: [], uel: [], uecl: [] };

  const claim = (clubId, comp) => {
    if (!clubId || taken.has(clubId)) return false;
    taken.add(clubId);
    qualifiers[comp].push(clubId);
    return true;
  };

  for (let i = 0; i < 4 && i < pl.length; i++) claim(pl[i].clubId, 'ucl');

  // A cup win is a European route in its own right.
  const faWinner = world.cups.FA?.winner;
  const eflWinner = world.cups.EFL?.winner;
  const inPl = (id) => pl.some((r) => r.clubId === id);
  if (faWinner && inPl(faWinner)) claim(faWinner, 'uel');
  if (eflWinner && inPl(eflWinner)) claim(eflWinner, 'uecl');

  // League places fill whatever the cups did not.
  for (let i = 4; i < pl.length && qualifiers.uel.length < 2; i++) claim(pl[i].clubId, 'uel');
  for (let i = 4; i < pl.length && qualifiers.uecl.length < 2; i++) claim(pl[i].clubId, 'uecl');

  world.europeanQualifiers = qualifiers;
  summary.europeanQualifiers = qualifiers;
}

function applyPromotionAndRelegation(world, summary) {
  const promoted = [];
  const relegated = [];

  for (const div of DIVISIONS) {
    const table = summary.divisions[div.tier];
    const playoff = summary.playoffs[div.tier];

    for (let i = 0; i < div.autoPromoted; i++) {
      const row = table[i];
      if (row) promoted.push({ clubId: row.clubId, from: div.tier, to: div.tier - 1, via: 'automatic' });
    }
    if (playoff?.winner) {
      promoted.push({ clubId: playoff.winner, from: div.tier, to: div.tier - 1, via: 'play-off' });
    }
    for (let i = 0; i < div.relegated; i++) {
      const row = table[table.length - 1 - i];
      if (row) relegated.push({ clubId: row.clubId, from: div.tier, to: div.tier + 1 });
    }
  }

  // Apply movement, remembering the old tier so the summary can describe it.
  for (const club of Object.values(world.clubs)) club.previousTier = club.tier;

  for (const move of promoted) {
    const club = world.clubs[move.clubId];
    if (!club || move.to < 0) continue;
    club.tier = move.to;
    club.reputation = clamp(club.reputation + (move.via === 'automatic' ? REPUTATION.promotion : REPUTATION.playoffPromotion), 1, 100);
    club.fans = Math.round(club.fans * 1.22);
    club.parachuteYears = 0;
  }
  for (const move of relegated) {
    const club = world.clubs[move.clubId];
    if (!club || move.to > 4) continue;
    club.tier = move.to;
    club.reputation = clamp(club.reputation + REPUTATION.relegation, 1, 100);
    club.fans = Math.round(club.fans * 0.86);
    if (move.from === 0) club.parachuteYears = PARACHUTE.length;
  }

  // Champions and league position both nudge reputation.
  for (const div of DIVISIONS) {
    const table = summary.divisions[div.tier];
    table.forEach((row, i) => {
      const club = world.clubs[row.clubId];
      if (!club) return;
      if (i === 0) club.reputation = clamp(club.reputation + REPUTATION.titleWin, 1, 100);
      const midpoint = table.length / 2;
      club.reputation = clamp(club.reputation + (midpoint - (i + 1)) * REPUTATION.perLeaguePosition, 1, 100);
    });
  }

  // Rebuild division membership from the clubs' new tiers.
  for (const div of DIVISIONS) {
    world.divisions[div.tier] = Object.values(world.clubs).filter((c) => c.tier === div.tier).map((c) => c.id);
  }

  return { promoted, relegated };
}

function buildPlayerSummary(world, summary) {
  const you = playerClub(world);
  const fromTier = you.previousTier ?? you.tier;
  const table = summary.divisions[fromTier] || [];
  const row = table.find((r) => r.clubId === you.id);
  const position = row ? table.indexOf(row) + 1 : null;
  const promotedEntry = summary.promoted.find((p) => p.clubId === you.id);
  const relegatedEntry = summary.relegated.find((p) => p.clubId === you.id);

  const topScorer = [...you.squad].sort((a, b) => b.seasonGoals - a.seasonGoals)[0];

  return {
    clubId: you.id,
    tier: fromTier,
    newTier: you.tier,
    position,
    row: row ? { ...row } : null,
    promoted: !!promotedEntry,
    promotedVia: promotedEntry?.via || null,
    relegated: !!relegatedEntry,
    champion: position === 1,
    topScorer: topScorer && topScorer.seasonGoals > 0
      ? { name: topScorer.name, goals: topScorer.seasonGoals, assists: topScorer.seasonAssists }
      : null,
    trophies: you.trophies.filter((t) => t.season === world.startYear),
    fans: you.fans,
    reputation: Math.round(you.reputation),
    balance: you.balance,
  };
}

// Ageing, development and decline. Runs once per season for every player in the world.
function ageAndDevelopSquads(world, rng) {
  for (const club of Object.values(world.clubs)) {
    const trainingLevel = club.facilities?.training ?? 1;
    const retiring = [];

    for (const p of club.squad) {
      p.age++;
      p.contractYears--;

      const headroom = p.potential - p.overall;
      if (p.age <= 23 && headroom > 0) {
        // Young players close the gap to their potential, faster with better facilities.
        const gain = Math.min(headroom, rng.float(0.5, 2.6) * (0.7 + trainingLevel * 0.22));
        applyGrowth(p, gain);
      } else if (p.age <= 28 && headroom > 0) {
        applyGrowth(p, Math.min(headroom, rng.float(0, 1.2) * (0.7 + trainingLevel * 0.18)));
      } else if (p.age >= 31) {
        applyGrowth(p, -rng.float(0.8, 3.0) * (p.age >= 34 ? 1.6 : 1));
      }

      p.fitness = clamp(p.fitness + 12, 40, 100);
      p.injuredFor = 0;
      p.injuryType = null;
      p.form = 0;
      // Pre-season resets the mood. Without it a relegated squad stays broken and the
      // club spirals down the pyramid with no way back.
      p.morale = clamp(p.morale + (64 - p.morale) * 0.7, 30, 100);

      if (p.age >= 35 && rng.chance(0.45)) retiring.push(p.id);
      else if (p.age >= 38) retiring.push(p.id);
    }

    if (retiring.length) {
      club.squad = club.squad.filter((p) => !retiring.includes(p.id));
    }
    replenishSquad(world, club, rng);
    if (!club.isPlayerClub) pickClubIdentity(rng, club);
    club.lineup = pickBestXI(club);
  }
}

function applyGrowth(player, delta) {
  const keys = Object.keys(player.attributes);
  for (const key of keys) {
    player.attributes[key] = clamp(Math.round(player.attributes[key] + delta), 6, 99);
  }
  refreshDerived(player);
  player.overall = Math.min(player.overall, Math.max(player.overall, player.potential));
}

// Keep every AI squad at a workable size, generating replacements at the level the
// club's prestige justifies. This is what stops the world hollowing out over decades.
function replenishSquad(world, club, rng) {
  const MIN_SQUAD = 20;
  if (club.squad.length >= MIN_SQUAD) return;
  if (club.isPlayerClub) return; // the player replaces their own departures

  const target = clubTargetRating(club);
  const needed = MIN_SQUAD - club.squad.length;
  const shortage = missingPositions(club, needed, rng);

  for (const position of shortage) {
    const player = generatePlayer(rng, {
      tier: club.tier, position,
      targetOverall: clamp(target + rng.int(-6, 3), 24, 92),
    });
    club.squad.push(player);
  }
}

function clubTargetRating(club) {
  // Derived from the club's own standing rather than a static table, so a club that
  // has genuinely risen recruits accordingly.
  const current = squadRating(club);
  const anchor = 38 + club.prestige * 0.48;
  return (current * 0.55 + anchor * 0.45);
}

function missingPositions(club, needed, rng) {
  const counts = {};
  for (const p of club.squad) counts[p.position] = (counts[p.position] || 0) + 1;
  const wanted = { GK: 3, CB: 4, LB: 2, RB: 2, CDM: 2, CM: 3, CAM: 2, LW: 2, RW: 2, ST: 3 };
  const out = [];
  for (const [pos, want] of Object.entries(wanted)) {
    for (let i = (counts[pos] || 0); i < want && out.length < needed; i++) out.push(pos);
  }
  while (out.length < needed) out.push(rng.pick(['CB', 'CM', 'ST', 'LW', 'RW']));
  return out;
}

// New sponsorship deals, refreshed budgets, fan drift.
function refreshClubEconomies(world, rng) {
  for (const club of Object.values(world.clubs)) {
    refreshSponsor(club);
    if (rng.chance(0.25)) club.sponsor = pickSponsor(rng, club);

    // Fans drift toward the level the club's reputation and stadium support.
    const ceiling = Math.min(club.stadiumCapacity * 1.25, 900 + club.reputation * club.reputation * 4.2);
    club.fans = Math.round(clamp(club.fans + (ceiling - club.fans) * 0.28, 400, 3_000_000));

    setTransferBudget(club);
    setWageBudget(club);
    if (!club.isPlayerClub) {
      // AI clubs never let their budget fall below what they already pay out.
      club.wageBudget = Math.max(club.wageBudget, Math.round(weeklyWages(club) * 1.1));
      // AI clubs reinvest rather than hoarding, which keeps the world's economy sane
      // across decades of simulation.
      const cap = weeklyWages(club) * 90;
      if (club.balance > cap) {
        recordLedger(club, world.seasonNumber, 'operations', 'Infrastructure reinvestment', -(club.balance - cap));
      }
    }
  }
}

// Begin the next season: new fixtures, new calendar, cleared cups.
export function nextSeason(world, rng) {
  world.seasonNumber++;
  world.startYear++;
  world.cups = {};
  world.europe = {};
  world.europeInitialised = false;
  world.usedEuroClubIds = [];
  world.seasonSummary = null;
  startSeason(world, rng);
}
