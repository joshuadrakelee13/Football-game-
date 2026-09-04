// The financial model: where money comes from, where it goes, and why a promotion
// changes everything.

import { DIVISION_BY_TIER, PARACHUTE, leaguePrize } from '../data/competitions.js';
import { weeklyWages, stadiumUpkeep, facilityUpkeep } from '../model/club.js';
import { sponsorValue } from '../model/world.js';

export function recordLedger(club, season, category, description, amount) {
  club.balance += amount;
  // Only the player's club has a ledger anyone ever reads. Keeping one for all 116
  // clubs would triple the save file for data that is never displayed.
  if (!club.isPlayerClub) return;
  club.ledger.push({ season, category, description, amount });
  if (club.ledger.length > 600) club.ledger.splice(0, club.ledger.length - 600);
}

// How many people actually turn up. Capped by the stadium, driven by the fan base,
// and nudged by form and by who the visitors are.
export function attendanceFor(club, opponent, world) {
  const div = DIVISION_BY_TIER[club.tier];
  const recentForm = club.form.slice(-5);
  const wins = recentForm.filter((r) => r === 'W').length;
  const losses = recentForm.filter((r) => r === 'L').length;

  const formFactor = 1 + wins * 0.035 - losses * 0.03;
  const glamour = 1 + Math.max(0, (opponent?.reputation ?? 40) - club.reputation) * 0.0035;
  const base = club.fans * 0.92 * formFactor * glamour;

  const attendance = Math.min(club.stadiumCapacity, Math.max(200, Math.round(base)));
  return { attendance, soldOut: attendance >= club.stadiumCapacity * 0.985, ticketPrice: div.ticketPrice };
}

// Matchday income: tickets plus what the crowd spends inside the ground.
export function matchdayIncome(club, opponent, world, competition = 'LEAGUE') {
  const { attendance, soldOut, ticketPrice } = attendanceFor(club, opponent, world);
  const multiplier = competition === 'LEAGUE' ? 1 : competition === 'FA' || competition === 'EFL' ? 0.85 : 1.35;
  const tickets = Math.round(attendance * ticketPrice * multiplier);
  const concessions = Math.round(attendance * 6.5 * multiplier);
  return { attendance, soldOut, tickets, concessions, total: tickets + concessions };
}

// Charged every matchday so wages bite continuously rather than in one lump.
const TIER_FIXED_OPERATIONS = [180_000, 46_000, 9_000, 2_500, 1_200];

export function weeklyRunningCost(club) {
  const wages = weeklyWages(club);
  const stadium = Math.round(stadiumUpkeep(club) / 52);
  const facilities = Math.round(facilityUpkeep(club) / 52);
  // Non-playing staff, travel and matchday operations. Roughly half the playing
  // budget again, which is what keeps a small club's margins genuinely thin.
  const operations = Math.round(wages * 0.55 + (TIER_FIXED_OPERATIONS[club.tier] ?? 2_000));
  return { wages, stadium, facilities, operations, total: wages + stadium + facilities + operations };
}

// Applied once per calendar week that passes.
export function chargeWeeklyCosts(club, season, weeks = 1) {
  const cost = weeklyRunningCost(club);
  recordLedger(club, season, 'wages', `Player wages (${weeks}w)`, -cost.wages * weeks);
  recordLedger(club, season, 'stadium', `Stadium upkeep (${weeks}w)`, -cost.stadium * weeks);
  recordLedger(club, season, 'facilities', `Facility upkeep (${weeks}w)`, -cost.facilities * weeks);
  recordLedger(club, season, 'operations', `Staff and operations (${weeks}w)`, -cost.operations * weeks);
  return cost.total * weeks;
}

export function payMatchday(club, opponent, world, competition) {
  const income = matchdayIncome(club, opponent, world, competition);
  recordLedger(club, world.seasonNumber, 'matchday', `Gate v ${opponent?.short ?? 'opponent'} (${income.attendance.toLocaleString('en-GB')})`, income.total);
  return income;
}

// Sponsorship arrives in weekly instalments across the season.
export function paySponsorship(club, season, weeks = 1) {
  if (!club.sponsor) return 0;
  const weekly = Math.round(club.sponsor.value / 52);
  recordLedger(club, season, 'sponsorship', `${club.sponsor.name} sponsorship`, weekly * weeks);
  return weekly * weeks;
}

export function payLeaguePrize(club, position, season) {
  const amount = leaguePrize(club.tier, position);
  recordLedger(club, season, 'prize', `${DIVISION_BY_TIER[club.tier].name} prize money (${position})`, amount);
  return amount;
}

export function payParachute(club, season) {
  if (!club.parachuteYears || club.parachuteYears <= 0) return 0;
  const index = PARACHUTE.length - club.parachuteYears;
  const amount = PARACHUTE[index] ?? 0;
  if (amount > 0) recordLedger(club, season, 'prize', 'Parachute payment', amount);
  club.parachuteYears--;
  return amount;
}

// A season's worth of the ledger, grouped for the Finances screen.
export function seasonSummary(club, season) {
  const rows = club.ledger.filter((l) => l.season === season);
  const groups = {};
  for (const row of rows) {
    if (!groups[row.category]) groups[row.category] = { income: 0, expense: 0 };
    if (row.amount >= 0) groups[row.category].income += row.amount;
    else groups[row.category].expense += -row.amount;
  }
  const income = Object.values(groups).reduce((s, g) => s + g.income, 0);
  const expense = Object.values(groups).reduce((s, g) => s + g.expense, 0);
  return { groups, income, expense, net: income - expense };
}

// The board's transfer allowance. Kept separate from the bank balance so the two
// constraints in the brief -- a transfer budget and a weekly wage budget -- both
// bite independently, and cash is still needed for stadium and facility work.
export function transferBudget(club) {
  return Math.max(0, club.transferBudget || 0);
}

// A transfer fee costs the club both its allowance and real cash.
export function spendTransferFee(club, amount, season, description) {
  club.transferBudget = Math.max(0, (club.transferBudget || 0) - amount);
  recordLedger(club, season, 'transfers', description, -amount);
}

export function receiveTransferFee(club, amount, season, description) {
  club.transferBudget = (club.transferBudget || 0) + amount;
  recordLedger(club, season, 'transfers', description, amount);
}

// At the end of a season the board reviews the books and sets next year's allowance:
// a share of the cash pile, floored so there is always something to work with.
export function setTransferBudget(club) {
  const runway = weeklyRunningCost(club).total * 14;
  const spare = Math.max(0, club.balance - runway);
  const share = club.isPlayerClub ? 0.62 : 0.55;
  const floor = [8_000_000, 900_000, 180_000, 90_000, 40_000][club.tier] ?? 40_000;
  club.transferBudget = Math.max(floor, Math.round((spare * share) / 1000) * 1000);
  return club.transferBudget;
}

export function canAffordWage(club, wage) {
  return weeklyWages(club) + wage <= club.wageBudget * 1.15;
}

export function refreshSponsor(club) {
  const value = sponsorValue(club);
  if (club.sponsor) club.sponsor.value = value;
  return value;
}
