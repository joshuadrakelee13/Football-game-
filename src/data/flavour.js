// Commentary phrasing and other flavour text. Kept as data so the tone can be
// adjusted without touching the engine.

export const COMMENTARY = {
  kickoff: [
    'We are under way at {venue}.',
    '{home} get us started against {away}.',
    'Kick-off at {venue}. {home} versus {away}.',
  ],
  goal_open_play: [
    'GOAL! {player} finds the net for {club}!',
    'GOAL! {player} makes no mistake. {club} score!',
    'GOAL! A fine finish from {player}. {club} are in front of the noise now.',
    'GOAL! {player} buries it for {club}!',
  ],
  goal_assisted: [
    'GOAL! {assist} picks out {player}, who finishes it for {club}!',
    'GOAL! Lovely work from {assist} and {player} taps home for {club}!',
    'GOAL! {player} converts the {assist} cross. {club} celebrate!',
  ],
  goal_penalty: [
    'GOAL! {player} sends the keeper the wrong way from the spot. {club} score!',
    'GOAL! {player} makes no mistake from twelve yards for {club}!',
  ],
  penalty_missed: [
    'PENALTY SAVED! {player} is denied from the spot!',
    'MISSED! {player} drags the penalty wide. {club} will rue that.',
  ],
  shot_saved: [
    '{player} forces a save from the keeper.',
    'Good stop! {player} tests the goalkeeper.',
    '{player} shoots — held by the keeper.',
    'Save! {club} come close through {player}.',
  ],
  shot_off: [
    '{player} skews it wide for {club}.',
    '{player} shoots over the bar.',
    'Wasteful from {player} there.',
    '{player} drags his effort well wide.',
  ],
  woodwork: [
    'OFF THE POST! {player} is inches away!',
    'CROSSBAR! {player} rattles the frame of the goal!',
    'So close! {player} strikes the woodwork.',
  ],
  yellow_card: [
    'Yellow card. {player} goes into the book.',
    '{player} is booked for {club}.',
    'The referee shows {player} a yellow.',
  ],
  red_card: [
    'RED CARD! {player} is sent off! {club} are down to ten.',
    'OFF! {player} sees red. {club} must play on a man short.',
  ],
  red_card_second: [
    'SECOND YELLOW! {player} is off. {club} are down to ten men.',
  ],
  injury: [
    '{player} is down and cannot continue. {club} have an injury worry.',
    'Bad news for {club} — {player} limps off.',
  ],
  substitution: [
    'SUBSTITUTION. {on} replaces {off} for {club}.',
    'Change for {club}: {on} on, {off} off.',
  ],
  substitution_forced: [
    'Forced change. {on} comes on for the injured {off}.',
  ],
  half_time: ['HALF TIME. {home} {homeGoals} - {awayGoals} {away}'],
  full_time: ['FULL TIME. {home} {homeGoals} - {awayGoals} {away}'],
  extra_time: ['We go to extra time.'],
  shootout_start: ['It will be settled from the penalty spot.'],
  shootout_end: ['The shoot-out finishes {home} - {away}.'],
  pressure_home: [
    '{home} are on top and pushing for more.',
    'Sustained pressure from {home} here.',
    '{home} are dominating possession.',
  ],
  pressure_away: [
    '{away} are growing into this one.',
    '{away} have the ball and are probing.',
    'A spell of control for {away}.',
  ],
  quiet: [
    'A scrappy passage of play.',
    'Neither side can find any rhythm.',
    'It has gone flat for a few minutes.',
    'The game has settled into a lull.',
  ],
};

export const SPONSORS = [
  'Northgate Insurance', 'Halberd Logistics', 'Vantage Energy', 'Bramwell Bank',
  'Kestrel Motors', 'Ironbridge Steel', 'Cobalt Telecom', 'Fairwind Airlines',
  'Redstone Brewing', 'Meridian Health', 'Copperline Coffee', 'Sable Sportswear',
  'Whitcombe Foods', 'Harbour & Vine', 'Lockwood Homes', 'Talisman Tyres',
];

export const NEWS_HEADLINES = {
  bigWin: ['{club} run riot', '{club} put on a show', 'Statement win for {club}'],
  bigLoss: ['{club} humbled', 'Alarm bells for {club}', 'A day to forget for {club}'],
  promotion: ['{club} go up!', 'Promotion for {club}', '{club} climb into {division}'],
  relegation: ['{club} go down', 'Relegation confirmed for {club}', 'Drop for {club}'],
  title: ['{club} are champions!', '{division} title for {club}'],
};
