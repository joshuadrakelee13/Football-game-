// League tables and standings.
//
// Sorting follows the English game: points, then goal difference, then goals scored,
// then alphabetically by name as a stable tiebreak.

export function emptyRow(clubId) {
  return {
    clubId, played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, points: 0,
    form: [], lastPosition: null,
  };
}

export function createTable(clubIds) {
  const table = {};
  for (const id of clubIds) table[id] = emptyRow(id);
  return table;
}

export function applyResult(table, homeId, awayId, homeGoals, awayGoals) {
  const home = table[homeId];
  const away = table[awayId];
  if (!home || !away) return;

  home.played++; away.played++;
  home.goalsFor += homeGoals; home.goalsAgainst += awayGoals;
  away.goalsFor += awayGoals; away.goalsAgainst += homeGoals;

  if (homeGoals > awayGoals) {
    home.won++; home.points += 3; home.form.push('W');
    away.lost++; away.form.push('L');
  } else if (homeGoals < awayGoals) {
    away.won++; away.points += 3; away.form.push('W');
    home.lost++; home.form.push('L');
  } else {
    home.drawn++; home.points++; home.form.push('D');
    away.drawn++; away.points++; away.form.push('D');
  }
}

export function goalDifference(row) {
  return row.goalsFor - row.goalsAgainst;
}

// Ordered standings. `clubName` resolves an id to a name for the alphabetical tiebreak.
export function standings(table, clubName = () => '') {
  const rows = Object.values(table).slice();
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gd = goalDifference(b) - goalDifference(a);
    if (gd !== 0) return gd;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return clubName(a.clubId).localeCompare(clubName(b.clubId));
  });
  rows.forEach((row, i) => { row.position = i + 1; });
  return rows;
}

export function positionOf(table, clubId, clubName) {
  const rows = standings(table, clubName);
  return rows.findIndex((r) => r.clubId === clubId) + 1;
}

// Snapshot current positions so the next update can show movement arrows.
export function snapshotPositions(table, clubName) {
  const rows = standings(table, clubName);
  for (const row of rows) table[row.clubId].lastPosition = row.position;
}

// Points a club could still reach — used to detect a settled title or relegation.
export function maxAttainable(row, totalGames) {
  return row.points + (totalGames - row.played) * 3;
}
