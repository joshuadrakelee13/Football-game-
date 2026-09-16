// Squad-status promises and transfer requests. Actual status is derived from this
// SEASON's appearance rate — never stored, the same "derived, not stored" approach
// already used for personality — and compared against whatever was promised at
// signing. Ties directly into E1-P7's hidden ambition/loyalty: an ambitious player
// stuck below the role he expects gets restless; a loyal one tolerates more of it.

import { clamp } from '../core/rng.js';
import { pushInboxEntry } from './inbox.js';

export const SQUAD_STATUS_LEVELS = ['star', 'important', 'regular', 'rotation', 'backup'];
export const SQUAD_STATUS_LABELS = {
  star: 'Star player', important: 'Important player', regular: 'Regular starter',
  rotation: 'Rotation option', backup: 'Backup',
};

// Judging a promise on the season's first couple of matches would be unfair — a single
// early absence (injury, rotation) swings the rate wildly with so few games banked.
const MIN_GAMES_FOR_JUDGEMENT = 8;

export function actualSquadStatus(club, player) {
  const played = club.seasonStats?.played || 0;
  if (played < MIN_GAMES_FOR_JUDGEMENT) return null;
  const rate = player.seasonApps / played;
  if (rate >= 0.85) return 'star';
  if (rate >= 0.65) return 'important';
  if (rate >= 0.35) return 'regular';
  if (rate >= 0.15) return 'rotation';
  return 'backup';
}

// How many tiers worse than promised his actual status sits (0 = met or exceeded it,
// positive = fell short). null whenever there's nothing meaningful to compare yet.
export function statusShortfall(club, player) {
  if (!player.promisedStatus) return null;
  const actual = actualSquadStatus(club, player);
  if (!actual) return null;
  return SQUAD_STATUS_LEVELS.indexOf(actual) - SQUAD_STATUS_LEVELS.indexOf(player.promisedStatus);
}

// A small probabilistic roll per check, not a hard threshold that fires the instant a
// condition is met — real unrest builds up over weeks of feeling overlooked, not from
// a single bad match, and the small per-tick chance is what gives that a texture across
// a season instead of every eligible player requesting out in the same week.
export function checkTransferRequests(world, club, rng) {
  for (const player of club.squad) {
    if (player.transferListed) continue;
    const ambition = player.hidden?.ambition ?? 11;
    const loyalty = player.hidden?.loyalty ?? 11;
    const shortfall = statusShortfall(club, player);
    const actual = actualSquadStatus(club, player);

    const brokenPromise = shortfall !== null && shortfall >= 2;
    const stuckDespiteAmbition = ambition >= 15 && player.age >= 21 && (actual === 'rotation' || actual === 'backup');
    const miserable = player.morale < 35;
    if (!brokenPromise && !stuckDespiteAmbition && !miserable) continue;

    const baseChance = brokenPromise ? 0.05 : miserable ? 0.04 : 0.025;
    // A loyal player tolerates a lot more of this before acting on it; a disloyal,
    // ambitious one acts on far less — centred on the ~11 hidden average, same as
    // every other loyalty-driven formula this epic already uses.
    const loyaltyDamping = clamp(1 - (loyalty - 11) * 0.05, 0.3, 1.6);
    if (!rng.chance(baseChance * loyaltyDamping)) continue;

    player.transferListed = true;
    if (club.isPlayerClub) {
      const reason = brokenPromise ? "feels his promised role hasn't been honoured"
        : stuckDespiteAmbition ? 'wants regular first-team football elsewhere'
          : 'is unhappy with life at the club';
      pushInboxEntry(world, {
        type: 'transfer_request', tone: 'bad', title: 'Transfer request',
        body: `${player.name} has handed in a transfer request — he ${reason}.`,
        action: { screen: 'squad' },
      });
    }
  }
}

export function rejectTransferRequest(player) {
  player.transferListed = false;
  player.morale = clamp(player.morale - 15, 0, 100);
}
