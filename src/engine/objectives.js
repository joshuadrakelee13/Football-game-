// Long-term objectives. There is always a named next goal on screen, and the list
// spans the whole arc from surviving in League Two to dominating the Premier League.

import { DIVISION_BY_TIER } from '../data/competitions.js';
import { squadRating } from '../model/club.js';

export const OBJECTIVES = [
  {
    id: 'survive', name: 'Stay in the Football League',
    describe: () => 'Avoid relegation out of League Two in your first season',
    // Tracks how far through the season you are, so the bar means something while
    // the objective is still live rather than sitting full and incomplete.
    progress: (world, club) => ({
      current: Math.min(world.matchdayIndex, world.calendar.length),
      target: Math.max(1, world.calendar.length),
    }),
    done: (world, club) => world.seasonNumber > 1 && club.tier <= 3,
  },
  {
    id: 'promotion_l1', name: 'Reach League One',
    describe: () => 'Win promotion out of League Two',
    progress: (world, club) => ({ current: club.tier <= 2 ? 1 : 0, target: 1 }),
    done: (world, club) => club.tier <= 2,
  },
  {
    id: 'promotion_ch', name: 'Reach the Championship',
    describe: () => 'Climb into the second tier',
    progress: (world, club) => ({ current: club.tier <= 1 ? 1 : 0, target: 1 }),
    done: (world, club) => club.tier <= 1,
  },
  {
    id: 'promotion_pl', name: 'Reach the Premier League',
    describe: () => 'Take the club into the top flight',
    progress: (world, club) => ({ current: club.tier === 0 ? 1 : 0, target: 1 }),
    done: (world, club) => club.tier === 0,
  },
  {
    id: 'win_pl', name: 'Win the Premier League',
    describe: () => 'Be crowned champions of England',
    progress: (world, club) => ({ current: countTrophies(club, 'Premier League'), target: 1 }),
    done: (world, club) => world.history.some((h) => h.player?.champion && h.player?.tier === 0),
  },
  {
    id: 'win_fa', name: 'Win the FA Cup',
    describe: () => 'Lift the oldest cup competition in football',
    progress: (world, club) => ({ current: countTrophies(club, 'FA Cup'), target: 1 }),
    done: (world, club) => countTrophies(club, 'FA Cup') > 0,
  },
  {
    id: 'win_efl', name: 'Win the Carabao Cup',
    describe: () => 'Win the League Cup',
    progress: (world, club) => ({ current: countTrophies(club, 'Carabao Cup'), target: 1 }),
    done: (world, club) => countTrophies(club, 'Carabao Cup') > 0,
  },
  {
    id: 'win_ucl', name: 'Win the Champions League',
    describe: () => 'Conquer Europe',
    progress: (world, club) => ({ current: countTrophies(club, 'Champions League'), target: 1 }),
    done: (world, club) => countTrophies(club, 'Champions League') > 0,
  },
  {
    id: 'big_stadium', name: 'Build a 60,000-seat stadium',
    describe: () => 'Expand the ground to elite capacity',
    progress: (world, club) => ({ current: club.stadiumCapacity, target: 60000 }),
    done: (world, club) => club.stadiumCapacity >= 60000,
  },
  {
    id: 'reputation', name: 'Reach reputation 90',
    describe: () => 'Become one of the biggest clubs in the country',
    progress: (world, club) => ({ current: Math.round(club.reputation), target: 90 }),
    done: (world, club) => club.reputation >= 90,
  },
  {
    id: 'world_class_youth', name: 'Develop a world-class academy graduate',
    describe: () => 'Bring through an academy player who reaches 85 overall',
    progress: (world, club) => {
      const best = club.squad.filter((p) => p.academyGraduate).reduce((m, p) => Math.max(m, p.overall), 0);
      return { current: best, target: 85 };
    },
    done: (world, club) => club.squad.some((p) => p.academyGraduate && p.overall >= 85),
  },
  {
    id: 'rich', name: 'Bank £100M',
    describe: () => 'Become financially dominant',
    progress: (world, club) => ({ current: Math.max(0, club.balance), target: 100_000_000 }),
    done: (world, club) => club.balance >= 100_000_000,
  },
  {
    id: 'century', name: 'A 100-point season',
    describe: () => 'Win a league title with 100 points or more',
    progress: (world, club) => ({ current: bestPointsTotal(world), target: 100 }),
    done: (world) => bestPointsTotal(world) >= 100,
  },
  {
    id: 'unbeaten', name: 'Go a season unbeaten',
    describe: () => 'Complete a league campaign without losing',
    progress: (world, club) => {
      const best = world.history.reduce((m, h) => {
        const row = h.player?.row;
        if (!row) return m;
        return Math.max(m, row.played > 0 && row.lost === 0 ? 1 : 0);
      }, 0);
      return { current: best, target: 1 };
    },
    done: (world) => world.history.some((h) => h.player?.row && h.player.row.played > 0 && h.player.row.lost === 0),
  },
];

function countTrophies(club, competition) {
  return (club.trophies || []).filter((t) => t.competition === competition).length;
}

function bestPointsTotal(world) {
  return world.history.reduce((m, h) => Math.max(m, h.player?.row?.points || 0), 0);
}

export function objectiveState(world) {
  const club = world.clubs[world.playerClubId];
  return OBJECTIVES.map((o) => {
    const progress = o.progress(world, club);
    const complete = o.done(world, club);
    return {
      id: o.id,
      name: o.name,
      description: o.describe(world, club),
      current: progress.current,
      target: progress.target,
      ratio: complete ? 1 : Math.max(0, Math.min(1, progress.current / progress.target)),
      complete,
    };
  });
}

// The single objective the dashboard should be nagging about right now.
export function currentObjective(world) {
  const states = objectiveState(world);
  return states.find((s) => !s.complete) || states[states.length - 1];
}

// The board's expectation for this season, shown on the dashboard.
export function seasonExpectation(world) {
  const club = world.clubs[world.playerClubId];
  const div = DIVISION_BY_TIER[club.tier];
  const rating = squadRating(club);
  const rivals = (world.divisions[club.tier] || [])
    .map((id) => squadRating(world.clubs[id]))
    .sort((a, b) => b - a);
  const rank = rivals.filter((r) => r > rating).length + 1;
  const size = rivals.length;

  if (rank <= 2) return { text: `Win ${div.name}`, tone: 'high' };
  if (rank <= Math.max(2, div.autoPromoted + div.playoffPlaces.length)) return { text: 'Reach the play-offs', tone: 'high' };
  if (rank <= size * 0.55) return { text: 'Finish in the top half', tone: 'mid' };
  if (rank <= size - div.relegated - 2) return { text: 'Consolidate in mid-table', tone: 'mid' };
  return { text: 'Avoid relegation', tone: 'low' };
}
