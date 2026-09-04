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

export function buildCommentary(result, rng, homeClub, awayClub) {
  const choose = makeChooser(rng);
  const lines = [];
  const context = {
    home: homeClub.short,
    away: awayClub.short,
    venue: result.neutralVenue ? 'a neutral venue' : homeClub.stadium,
  };

  let lastMinute = -10;
  let homeGoals = 0;
  let awayGoals = 0;

  for (const event of result.events) {
    const isHome = event.clubId === homeClub.id;
    if (event.type === 'goal') {
      if (isHome) homeGoals++; else awayGoals++;
    }

    let show = ALWAYS_SHOW.has(event.type);
    if (!show && SOMETIMES_SHOW[event.type] !== undefined) {
      show = rng.chance(SOMETIMES_SHOW[event.type]);
    }
    if (!show) continue;

    const bucket = bucketFor(event);
    const templates = COMMENTARY[bucket];
    if (!templates) continue;

    const data = { ...context, ...event, homeGoals, awayGoals };
    lines.push({
      minute: event.minute,
      type: event.type,
      clubId: event.clubId ?? null,
      isHome,
      text: fill(choose(bucket, templates), data),
      homeGoals,
      awayGoals,
      major: event.type === 'goal' || event.type === 'red_card' || event.type === 'full_time',
    });

    lastMinute = typeof event.minute === 'number' ? event.minute : lastMinute;
  }

  // Drop a little colour into any long gap so the feed never stalls.
  return padQuietSpells(lines, rng, context, result, choose);
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
