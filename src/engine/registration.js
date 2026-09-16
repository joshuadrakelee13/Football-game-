// Squad registration: the Premier League's own rule, not a general English-football
// one — the Championship downward has no such cap, so this only ever applies to a
// tier-0 club. A senior squad list of at most 25, of whom at least 8 must be
// homegrown; players 21 or under never count against the 25 at all.
//
// "Homegrown" in the real rule is about which national association trained a player
// for three seasons before his 21st birthday, irrespective of his own nationality — not
// a fact this engine's player model tracks (there is no per-player development-history
// log). The honest proxy available from what a player object actually carries:
// academyGraduate (unambiguous — he trained at an English club, this one) or English/
// Welsh nationality (a reasonable stand-in given this is deliberately an England-only
// world — see the epic 1 roadmap's own world-scale decision — where an English or
// Welsh player overwhelmingly means an English-trained one).

export const SQUAD_LIST_SIZE = 25;
export const HOMEGROWN_MINIMUM = 8;
export const HOMEGROWN_AGE_EXEMPT = 21;

export function isHomegrown(player) {
  return player.academyGraduate === true || player.nation === 'ENG' || player.nation === 'WAL';
}

export function isRegistrationRequired(club) {
  return club.tier === 0;
}

// The players who actually count against the 25 — anyone over the U21 exemption.
export function seniorSquadList(club) {
  return club.squad.filter((p) => p.age > HOMEGROWN_AGE_EXEMPT);
}

// A full status snapshot for the UI and for the deadline-day check. `required: false`
// for anything outside the Premier League — every count still computed, just not
// something the club needs to satisfy, so a promoted club can see it coming.
export function registrationStatus(club) {
  const senior = seniorSquadList(club);
  const homegrownCount = senior.filter(isHomegrown).length;
  const seniorOverBy = Math.max(0, senior.length - SQUAD_LIST_SIZE);
  const homegrownShortBy = Math.max(0, HOMEGROWN_MINIMUM - homegrownCount);
  const required = isRegistrationRequired(club);
  const issues = [];
  if (seniorOverBy > 0) {
    issues.push(`${seniorOverBy} too many senior player${seniorOverBy === 1 ? '' : 's'} for the 25-man list`);
  }
  if (homegrownShortBy > 0) {
    issues.push(`${homegrownShortBy} short of the ${HOMEGROWN_MINIMUM}-player homegrown minimum`);
  }
  return {
    required,
    ok: !required || issues.length === 0,
    seniorCount: senior.length,
    homegrownCount,
    seniorOverBy,
    homegrownShortBy,
    issues,
  };
}
