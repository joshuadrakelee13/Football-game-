// Transfer windows: real English-football dates, not a year-round market.
//
// Summer runs through 1 September; winter is the whole of January — the two windows
// this game's compressed August-to-May league season actually spans (see fixtures.js's
// MIDWEEK_LEAGUE_ROUNDS comment). Deadline day is a window's final day, the day AI
// activity and the UI's own urgency framing concentrate on.
//
// The world's clock only ever advances in matchday-sized jumps (world.matchdayIndex),
// there is no independent "today" field — so "today" for window purposes is the date of
// the next scheduled matchday, the same reference point screen-overview.js already
// shows as "what's coming up". Between seasons, once the calendar is exhausted and
// nextSeason() has not yet rebuilt it, the day after the last played matchday stands in;
// nextSeason's rebuilt calendar begins at day 0 (1 August), inside the summer window,
// so the window reopens exactly when a new season's own calendar says it should.

import { dayToDate } from '../core/format.js';
import { currentMatchday } from './season.js';

export function currentDayOffset(world) {
  const md = currentMatchday(world);
  if (md) return md.day;
  const last = world.calendar[world.calendar.length - 1];
  return last ? last.day + 1 : 0;
}

// 'summer' | 'winter' | null (closed) for a given real calendar date.
export function windowFor(date) {
  const month = date.getUTCMonth(); // 0 = January
  const day = date.getUTCDate();
  if (month === 0) return 'winter';
  if (month < 7) return null; // Feb-Jul: both windows closed
  if (month === 7) return 'summer'; // August
  if (month === 8 && day === 1) return 'summer'; // 1 September
  return null;
}

export function activeWindow(world) {
  return windowFor(dayToDate(currentDayOffset(world), world.startYear));
}

export function isWindowOpen(world) {
  return activeWindow(world) !== null;
}

// For UI countdown/status text: how many days remain in the active window (0 on
// deadline day itself), or how many days until the next window opens if closed now.
export function daysUntilWindowChange(world) {
  let date = dayToDate(currentDayOffset(world), world.startYear);
  const startedOpen = windowFor(date) !== null;
  for (let i = 0; i < 366; i++) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    const nowOpen = windowFor(next) !== null;
    if (nowOpen !== startedOpen) return i + 1;
    date = next;
  }
  return null;
}

// True once the window is down to its final week. A literal "exactly the closing
// date" check very often lands on nothing at all: the world's clock advances in
// matchday-sized jumps of up to about a week (see fixtures.js), so the single true
// deadline date frequently falls inside a gap between two matchdays and is never once
// the reference date this checks against — measured directly: with 1-day tolerance,
// a full simulated season saw zero deadline-day hits. A week's tolerance is what a
// week-spaced calendar can actually guarantee catching.
export function isDeadlineDay(world) {
  return isWindowOpen(world) && daysUntilWindowChange(world) <= 7;
}

// Did a window open somewhere in (previousDay, nextDay]? The world's clock advances in
// matchday-sized jumps, not day by day, so a transition can land between two ticks —
// this is what applyBetweenMatchday checks to know whether to run a fresh burst of AI
// window activity and post a "window has opened" notice, exactly once per transition.
export function windowJustOpened(startYear, previousDay, nextDay) {
  const wasOpen = previousDay != null && windowFor(dayToDate(previousDay, startYear)) !== null;
  if (wasOpen) return false;
  const from = (previousDay ?? nextDay - 1) + 1;
  for (let d = from; d <= nextDay; d++) {
    if (windowFor(dayToDate(d, startYear)) !== null) return true;
  }
  return false;
}

// Same idea, the other direction — did an open window close in this gap? Used to post
// a "window has closed" notice.
export function windowJustClosed(startYear, previousDay, nextDay) {
  const wasOpen = previousDay != null && windowFor(dayToDate(previousDay, startYear)) !== null;
  if (!wasOpen) return false;
  const from = (previousDay ?? nextDay - 1) + 1;
  for (let d = from; d <= nextDay; d++) {
    if (windowFor(dayToDate(d, startYear)) === null) return true;
  }
  return false;
}
