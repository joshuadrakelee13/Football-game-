// Turns the match engine's structured events into a readable commentary feed.
// The engine emits data; this module owns all the words.

import { COMMENTARY } from '../data/flavour.js';

function fill(template, data) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (data[key] ?? ''));
}

// Remembers the last phrase used for each bucket and re-rolls rather than repeating
// it. Two identical lines a minute apart is the fastest way to break the illusion.
function makeChooser(rng) {
  const lastUsed = new Map();
  return (bucket, list) => {
    if (!list || !list.length) return '';
    if (list.length === 1) return list[0];
    let pick = list[Math.floor(rng.next() * list.length)];
    if (pick === lastUsed.get(bucket)) {
      pick = list[Math.floor(rng.next() * list.length)];
      if (pick === lastUsed.get(bucket)) {
        const alternatives = list.filter((t) => t !== lastUsed.get(bucket));
        pick = alternatives[Math.floor(rng.next() * alternatives.length)];
      }
    }
    lastUsed.set(bucket, pick);
    return pick;
  };
}

// Which commentary bucket an event maps to.
function bucketFor(event) {
  switch (event.type) {
    case 'goal':
      if (event.kind === 'penalty') return 'goal_penalty';
      return event.assist ? 'goal_assisted' : 'goal_open_play';
    case 'red_card':
      return event.second ? 'red_card_second' : 'red_card';
    case 'substitution':
      return event.forced ? 'substitution_forced' : 'substitution';
    default:
      return event.type;
  }
}

// Events that always earn a line in the feed.
const ALWAYS_SHOW = new Set([
  'kickoff', 'goal', 'penalty_missed', 'red_card', 'injury',
  'half_time', 'full_time', 'extra_time', 'shootout_start', 'shootout_end', 'woodwork',
]);

// Events shown only sometimes, so the feed reads like commentary rather than a log.
const SOMETIMES_SHOW = {
  shot_saved: 0.55,
  shot_off: 0.3,
  yellow_card: 0.7,
  substitution: 0.85,
};

// "12" -> "12'", "90+3" -> "90+3'", kickoff -> "".
export function minuteLabel(minute) {
  const raw = String(minute ?? '').trim();
  if (!raw || raw === '0') return '';
  return raw.endsWith("'") ? raw : raw + "'";
}

function contextFor(result, homeClub, awayClub) {
  return {
    home: homeClub.short,
    away: awayClub.short,
    venue: result.neutralVenue ? 'a neutral venue' : homeClub.stadium,
  };
}

// Persistent state across a match's commentary — the chooser's repetition memory and
// the running goal tally — so buildCommentaryDelta can be called once per live
// checkpoint and still read like one continuous commentary rather than restarting
// itself every 15 minutes.
export function createCommentaryState(rng) {
  return { choose: makeChooser(rng), homeGoals: 0, awayGoals: 0 };
}

// The actual event -> line conversion, shared by buildCommentary (the whole match at
// once) and buildCommentaryDelta (one live checkpoint's worth of new events) so the
// bucket/chooser/goal-tally logic exists in exactly one place.
function eventsToLines(events, rng, homeClub, awayClub, context, state) {
  const lines = [];
  for (const event of events) {
    const isHome = event.clubId === homeClub.id;
    if (event.type === 'goal') {
      if (isHome) state.homeGoals++; else state.awayGoals++;
    }

    let show = ALWAYS_SHOW.has(event.type);
    if (!show && SOMETIMES_SHOW[event.type] !== undefined) {
      show = rng.chance(SOMETIMES_SHOW[event.type]);
    }
    if (!show) continue;

    const bucket = bucketFor(event);
    const templates = COMMENTARY[bucket];
    if (!templates) continue;

    const data = { ...context, ...event, homeGoals: state.homeGoals, awayGoals: state.awayGoals };
    lines.push({
      minute: event.minute,
      type: event.type,
      clubId: event.clubId ?? null,
      isHome,
      text: fill(state.choose(bucket, templates), data),
      homeGoals: state.homeGoals,
      awayGoals: state.awayGoals,
      major: event.type === 'goal' || event.type === 'red_card' || event.type === 'full_time',
    });
  }
  return lines;
}

export function buildCommentary(result, rng, homeClub, awayClub) {
  const state = createCommentaryState(rng);
  const context = contextFor(result, homeClub, awayClub);
  const lines = eventsToLines(result.events, rng, homeClub, awayClub, context, state);

  // Drop a little colour into any long gap so the feed never stalls.
  return padQuietSpells(lines, rng, context, result, state.choose);
}

// One live checkpoint's worth of new events, continuing a state created by
// createCommentaryState. No quiet-spell padding here — that pass looks ahead to the
// next line's minute across the *whole* match, which a partial, still-unfolding
// event list can't do correctly, and a live match's checkpoint cadence already paces
// the feed, so nothing needs filling in.
export function buildCommentaryDelta(events, rng, homeClub, awayClub, result, state) {
  const context = contextFor(result, homeClub, awayClub);
  return eventsToLines(events, rng, homeClub, awayClub, context, state);
}

function padQuietSpells(lines, rng, context, result, choose) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const current = numericMinute(lines[i].minute);
    const next = i + 1 < lines.length ? numericMinute(lines[i + 1].minute) : null;
    if (next != null && next - current >= 14 && next <= 90) {
      const minute = current + Math.floor((next - current) / 2);
      const dominantHome = result.stats.possession[0] >= 55;
      const dominantAway = result.stats.possession[1] >= 55;
      const bucket = dominantHome ? 'pressure_home' : dominantAway ? 'pressure_away' : 'quiet';
      out.push({
        minute: String(minute),
        type: 'flavour',
        clubId: null,
        isHome: false,
        text: fill(choose(bucket, COMMENTARY[bucket]), context),
        homeGoals: lines[i].homeGoals,
        awayGoals: lines[i].awayGoals,
        major: false,
      });
    }
  }
  return out;
}

function numericMinute(minute) {
  if (typeof minute === 'number') return minute;
  const m = String(minute).match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}
