// Inbox: a durable, dated record of things that happened — replacing the old pattern
// where a toast fired once and the fact it ever happened was gone for good.

import { h, panel, emptyState } from './dom.js';
import { matchDate } from '../core/format.js';
import { persist, goTo } from '../main.js';
import { SCREENS } from './screens.js';

export function renderInbox(world) {
  const entries = [...(world.inbox || [])].reverse(); // most recent first

  // Capture which entries are unread *before* marking them read, so this one render
  // can still highlight what's new — the badge that reads world.inbox right after this
  // function returns (renderRail, called unconditionally by setActiveScreen) needs
  // read to already be true, but the row styling for this viewing needs to know what
  // was true a moment ago.
  const wasUnread = new Set(entries.filter((e) => !e.read).map((e) => e.id));
  let changed = false;
  for (const e of world.inbox || []) {
    if (!e.read) { e.read = true; changed = true; }
  }
  if (changed) persist();

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, 'Inbox'),
      h('span', { class: 'sub' }, `${entries.length} item${entries.length === 1 ? '' : 's'}`),
    ),
    entries.length
      ? panel('All items',
          h('div', { class: 'panel-body flush' },
            ...entries.map((e) => inboxRow(world, e, wasUnread.has(e.id))),
          ),
        )
      : emptyState('Nothing here yet — check back after your next few matchdays.'),
  );
}

function inboxRow(world, entry, unread) {
  const screen = entry.action ? SCREENS[entry.action.screen] : null;
  return h('div', { class: `inbox-row tone-${entry.tone}` + (unread ? ' unread' : '') },
    h('div', { class: 'when' }, dayLabel(world, entry)),
    h('div', { class: 'content' },
      h('div', { class: 'title' }, entry.title),
      h('div', { class: 'body' }, entry.body),
    ),
    screen ? h('button', { class: 'btn ghost sm', onclick: () => goTo(entry.action.screen) }, screen.name) : null,
  );
}

// entry.day is an offset into the season it was raised in, not the current one — the
// calendar's start year has to be walked back by however many seasons have passed
// since, since world.startYear and world.seasonNumber always increment together.
function dayLabel(world, entry) {
  if (entry.day == null) return `Season ${entry.season}`;
  const startYear = world.startYear - (world.seasonNumber - entry.season);
  return matchDate(entry.day, startYear);
}
