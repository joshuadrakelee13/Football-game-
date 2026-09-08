// AI half-time tactical reactions.
//
// Kept in its own small file, as one named, swappable function — this is the seam a
// later "assistant manager quality affects in-match reactions" feature would hook
// into without reworking anything else. Fires for every AI match — quick-simmed,
// auto-played and live alike, since it is called from match.js's applyHalfTime, not
// from anything UI-specific — so it is never only-when-a-human-happens-to-be-watching.

import { clampDial } from '../data/tactics.js';

const LOSING_NUDGE = 1;   // chase the game: more attacking, more aggressive
const LEADING_NUDGE = -1; // ahead on the scoreboard: protect it

// club.tactics is mutated in place. Caller is responsible for syncing any live match
// side's cached ratings afterward (see syncSideTactics in match.js) — this function
// only decides the club's new tactical state, not how a match in progress picks it up.
//
// Deliberately symmetric on ANY deficit/lead, not just a 2+ goal gap: a match decided
// by exactly one goal at half time is the common case, and an earlier version only
// nudged the trailing side (leading required a 2-goal cushion to react at all). That
// meant most non-drawn half times injected a lone +1 into the AI population with
// nothing to cancel it, which measurably pushed goals-per-game past the tuned ceiling
// in season-test — a population-balance bug, not just a realism one. Reacting to any
// margin means every decisive half-time score contributes one +1 and one -1 in the
// same match, so the population nets to zero by construction, the same fix already
// applied to pickClubIdentity's profile mix.
export function aiAdjustTactics(club, { goalsFor, goalsAgainst }) {
  const diff = goalsFor - goalsAgainst;
  let nudge = 0;
  if (diff < 0) nudge = LOSING_NUDGE;
  else if (diff > 0) nudge = LEADING_NUDGE;
  if (!nudge) return false;

  club.tactics.mentality = clampDial(club.tactics.mentality + nudge);
  club.tactics.pressing = clampDial(club.tactics.pressing + nudge);
  return true;
}
