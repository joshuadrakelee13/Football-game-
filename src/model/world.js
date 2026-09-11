// World construction: every club, every squad, every table, the whole calendar.

import { Rng } from '../core/rng.js';
import { CLUB_DATA, PLAYER_CLUB_TEMPLATE, DISPLACED_CLUB_ID } from '../data/clubs.js';
import { DIVISIONS } from '../data/competitions.js';
import { SPONSORS } from '../data/flavour.js';
import { createClub } from './club.js';
import { resetPlayerIds } from './player.js';
import { buildCalendar, buildLeagueFixtures } from '../engine/fixtures.js';
import { createTable } from '../engine/league.js';

export const FIRST_SEASON_YEAR = 2025;

export function buildWorld({ seed = Date.now(), clubName = 'Riverside FC', managerName = 'The Manager' } = {}) {
  const rng = new Rng(seed);
  resetPlayerIds();

  const world = {
    seed,
    startYear: FIRST_SEASON_YEAR,
    seasonNumber: 1,
    managerName,
    playerClubId: PLAYER_CLUB_TEMPLATE.id,
    clubs: {},
    divisions: {},
    tables: {},
    calendar: [],
    matchdayIndex: 0,
    leagueFixtures: {},
    results: [],
    news: [],
    cups: {},
    europe: {},
    transferMarket: [],
    freeAgents: [],
    pendingEvent: null,
    eventCooldown: 3,
    lastEventBad: false,
    objectives: {},
    history: [],
    seasonSummary: null,
    finished: false,
    inbox: [],
    inboxSeq: 0,
    sellOnClauses: [],
    installmentSchedules: [],
    riseClauses: [],
    obligationSeq: 0,
    shortlist: [],
  };

  // The player's club takes a League Two place; one real club steps aside for the save.
  const displaced = new Set([DISPLACED_CLUB_ID]);
  for (const base of CLUB_DATA) {
    if (displaced.has(base.id)) continue;
    world.clubs[base.id] = createClub(rng, base);
  }

  const playerBase = { ...PLAYER_CLUB_TEMPLATE, name: clubName, short: shortenName(clubName), abbr: abbreviate(clubName) };
  world.clubs[playerBase.id] = createClub(rng, playerBase, { isPlayerClub: true });

  for (const div of DIVISIONS) {
    world.divisions[div.tier] = Object.values(world.clubs)
      .filter((c) => c.tier === div.tier)
      .map((c) => c.id);
  }

  for (const club of Object.values(world.clubs)) {
    club.sponsor = pickSponsor(rng, club);
  }

  startSeason(world, rng);
  return world;
}

export function pickSponsor(rng, club) {
  const name = rng.pick(SPONSORS);
  return { name, value: sponsorValue(club) };
}

export function sponsorValue(club) {
  const div = DIVISIONS.find((d) => d.tier === club.tier);
  const base = div ? div.sponsorBase : 100_000;
  // Reputation and fan base both move the needle, which is why the sponsorship line
  // grows even in a season where you do not go up.
  const repFactor = 0.55 + (club.reputation / 100) * 1.1;
  const fanFactor = 0.7 + Math.min(1.2, club.fans / Math.max(1, club.stadiumCapacity * 1.4));
  return Math.round((base * repFactor * fanFactor) / 1000) * 1000;
}

// Prepare tables, fixtures and the calendar for a fresh season.
export function startSeason(world, rng) {
  world.calendar = buildCalendar(world.startYear);
  world.matchdayIndex = 0;
  world.tables = {};
  for (const div of DIVISIONS) {
    world.tables[div.tier] = createTable(world.divisions[div.tier]);
  }

  const fixtures = buildLeagueFixtures(world, rng);
  world.leagueFixtures = {};
  for (const [round, list] of fixtures) world.leagueFixtures[round] = list;

  world.results = [];
  for (const club of Object.values(world.clubs)) {
    club.form = [];
    club.seasonStats = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
    club.transfersIn = [];
    club.transfersOut = [];
    for (const p of club.squad) {
      p.seasonGoals = 0;
      p.seasonAssists = 0;
      p.seasonApps = 0;
      p.yellowCards = 0;
      p.redCards = 0;
    }
  }
}

export function playerClub(world) {
  return world.clubs[world.playerClubId];
}

export function clubName(world, id) {
  return world.clubs[id]?.name || world.europeClubs?.[id]?.name || id;
}

export function shortenName(name) {
  return name.replace(/\s+(FC|AFC|United|City|Town|Albion|Rovers|Wanderers|County)$/i, '').trim() || name;
}

export function abbreviate(name) {
  const words = name.replace(/[^A-Za-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length >= 3) return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
  if (words.length === 2) return (words[0].slice(0, 2) + words[1][0]).toUpperCase();
  return name.slice(0, 3).toUpperCase();
}

// The fixtures for a given league round, filtered to a division if asked.
export function fixturesForRound(world, leagueRound, tier = null) {
  const list = world.leagueFixtures[leagueRound] || [];
  return tier === null ? list : list.filter((f) => f.tier === tier);
}

// Every remaining fixture for one club, across all competitions, in calendar order.
export function upcomingFixtures(world, clubId, limit = 8) {
  const out = [];
  for (let i = world.matchdayIndex; i < world.calendar.length && out.length < limit; i++) {
    const md = world.calendar[i];
    const fixture = fixtureForClubOnMatchday(world, clubId, md);
    if (fixture) out.push({ matchday: md, ...fixture });
  }
  return out;
}

export function fixtureForClubOnMatchday(world, clubId, matchday) {
  if (matchday.type === 'league') {
    const list = world.leagueFixtures[matchday.leagueRound] || [];
    const f = list.find((x) => x.home === clubId || x.away === clubId);
    return f ? { ...f, competition: 'LEAGUE' } : null;
  }
  if (matchday.type === 'cup') {
    const cup = world.cups[matchday.competition];
    if (!cup) return null;
    const tie = (cup.currentTies || []).find((t) => t.home === clubId || t.away === clubId);
    return tie ? { ...tie, competition: matchday.competition } : null;
  }
  if (matchday.type === 'euro') {
    for (const key of ['ucl', 'uel', 'uecl']) {
      const comp = world.europe[key];
      if (!comp || !comp.active) continue;
      const tie = (comp.currentTies || []).find((t) => t.home === clubId || t.away === clubId);
      if (tie) return { ...tie, competition: key.toUpperCase() };
    }
  }
  return null;
}
