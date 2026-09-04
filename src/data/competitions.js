// Competition definitions: the league pyramid, the two domestic cups, and Europe.
//
// Prize money deliberately reproduces the real financial cliff between divisions.
// The Championship-to-Premier-League jump is roughly 6M -> 100M, and that gap is the
// single most important number in the game: it is what makes the final promotion land.

export const DIVISIONS = [
  {
    tier: 0,
    id: 'PL',
    name: 'Premier League',
    short: 'Premier League',
    clubs: 20,
    autoPromoted: 0,
    playoffPlaces: [],
    relegated: 3,
    prizeBase: 100_000_000,
    prizePerPlace: 3_500_000,
    // Broadcast money is what makes a Premier League club rich even in 17th.
    sponsorBase: 28_000_000,
    ticketPrice: 55,
    europeanPlaces: { ucl: 4, uel: 1, uecl: 1 },
  },
  {
    tier: 1,
    id: 'CH',
    name: 'Championship',
    short: 'Championship',
    clubs: 24,
    autoPromoted: 2,
    playoffPlaces: [3, 4, 5, 6],
    relegated: 3,
    prizeBase: 6_000_000,
    prizePerPlace: 250_000,
    sponsorBase: 2_400_000,
    ticketPrice: 30,
  },
  {
    tier: 2,
    id: 'L1',
    name: 'League One',
    short: 'League One',
    clubs: 24,
    autoPromoted: 2,
    playoffPlaces: [3, 4, 5, 6],
    relegated: 4,
    prizeBase: 900_000,
    prizePerPlace: 40_000,
    sponsorBase: 520_000,
    ticketPrice: 22,
  },
  {
    tier: 3,
    id: 'L2',
    name: 'League Two',
    short: 'League Two',
    clubs: 24,
    autoPromoted: 3,
    playoffPlaces: [4, 5, 6, 7],
    relegated: 2,
    prizeBase: 600_000,
    prizePerPlace: 25_000,
    sponsorBase: 260_000,
    ticketPrice: 18,
  },
  {
    tier: 4,
    id: 'NL',
    name: 'National League',
    short: 'National League',
    clubs: 24,
    autoPromoted: 1,
    playoffPlaces: [2, 3, 4, 5, 6, 7],
    relegated: 0,
    prizeBase: 180_000,
    prizePerPlace: 8_000,
    sponsorBase: 90_000,
    ticketPrice: 14,
  },
];

export const DIVISION_BY_TIER = Object.fromEntries(DIVISIONS.map((d) => [d.tier, d]));

// Parachute payments soften a Premier League relegation, exactly as they do in reality —
// and they are why a recently relegated club is usually favourite to bounce straight back.
export const PARACHUTE = [45_000_000, 35_000_000, 18_000_000];

// Squad rating bands per tier. Generation targets these, which keeps the world plausible.
export const TIER_RATING_BAND = [
  { min: 68, max: 88 },  // Premier League
  { min: 60, max: 74 },  // Championship
  { min: 54, max: 66 },  // League One
  { min: 47, max: 59 },  // League Two
  { min: 41, max: 52 },  // National League
];

export const CUPS = {
  FA: {
    id: 'FA',
    name: 'FA Cup',
    short: 'FA Cup',
    // Which tiers enter, and at which round index.
    entries: [
      { round: 0, tiers: [2, 3, 4] },
      { round: 2, tiers: [0, 1] },
    ],
    twoLegged: [],
    // Prize per round survived, indexed by round reached (0-based).
    prizes: [50_000, 75_000, 150_000, 300_000, 600_000, 1_200_000, 2_500_000, 4_000_000],
    winnerPrize: 7_000_000,
    winnerReputation: 12,
    finalistReputation: 5,
    europeanSpot: 'uel',
  },
  EFL: {
    id: 'EFL',
    name: 'Carabao Cup',
    short: 'Carabao Cup',
    entries: [
      { round: 0, tiers: [1, 2, 3] },
      { round: 2, tiers: [0] },
    ],
    twoLegged: [],
    prizes: [25_000, 40_000, 80_000, 200_000, 500_000, 1_200_000, 2_500_000],
    winnerPrize: 4_000_000,
    winnerReputation: 9,
    finalistReputation: 4,
    europeanSpot: 'uecl',
  },
};

export const EURO_COMPS = {
  ucl: {
    id: 'ucl',
    name: 'Champions League',
    short: 'UCL',
    accent: '#4A6BF5',
    leaguePhaseMatches: 6,
    fieldSize: 24,
    qualifyForKnockout: 8,
    participation: 25_000_000,
    perWin: 3_000_000,
    perDraw: 1_000_000,
    knockoutPrizes: { QF: 12_000_000, SF: 18_000_000, F: 22_000_000 },
    winnerPrize: 30_000_000,
    winnerReputation: 20,
    strengthBonus: 10,
  },
  uel: {
    id: 'uel',
    name: 'Europa League',
    short: 'UEL',
    accent: '#E8853B',
    leaguePhaseMatches: 6,
    fieldSize: 24,
    qualifyForKnockout: 8,
    participation: 8_000_000,
    perWin: 1_000_000,
    perDraw: 350_000,
    knockoutPrizes: { QF: 4_000_000, SF: 6_000_000, F: 8_000_000 },
    winnerPrize: 12_000_000,
    winnerReputation: 12,
    strengthBonus: 3,
  },
  uecl: {
    id: 'uecl',
    name: 'Conference League',
    short: 'UECL',
    accent: '#3BA55C',
    leaguePhaseMatches: 6,
    fieldSize: 24,
    qualifyForKnockout: 8,
    participation: 3_000_000,
    perWin: 400_000,
    perDraw: 150_000,
    knockoutPrizes: { QF: 1_500_000, SF: 2_500_000, F: 3_500_000 },
    winnerPrize: 5_000_000,
    winnerReputation: 8,
    strengthBonus: -3,
  },
};

// Reputation movement at the end of a season.
export const REPUTATION = {
  promotion: 8,
  playoffPromotion: 7,
  relegation: -7,
  titleWin: 5,
  perLeaguePosition: 0.06,
  cupRunBonus: 0.8,
};

export function divisionName(tier) {
  return DIVISION_BY_TIER[tier]?.name ?? 'Unknown';
}

export function leaguePrize(tier, position) {
  const d = DIVISION_BY_TIER[tier];
  if (!d) return 0;
  return d.prizeBase + (d.clubs + 1 - position) * d.prizePerPlace;
}

// Knockout rounds are named by how many clubs remain, so the same code handles
// any field size (the FA Cup's 62-club third round included).
export function roundName(clubsRemaining) {
  if (clubsRemaining <= 2) return 'Final';
  if (clubsRemaining <= 4) return 'Semi-final';
  if (clubsRemaining <= 8) return 'Quarter-final';
  if (clubsRemaining <= 16) return 'Fifth round';
  if (clubsRemaining <= 32) return 'Fourth round';
  if (clubsRemaining <= 64) return 'Third round';
  if (clubsRemaining <= 128) return 'Second round';
  return 'First round';
}

export function shortRoundName(clubsRemaining) {
  if (clubsRemaining <= 2) return 'Final';
  if (clubsRemaining <= 4) return 'SF';
  if (clubsRemaining <= 8) return 'QF';
  if (clubsRemaining <= 16) return 'R5';
  if (clubsRemaining <= 32) return 'R4';
  if (clubsRemaining <= 64) return 'R3';
  if (clubsRemaining <= 128) return 'R2';
  return 'R1';
}
