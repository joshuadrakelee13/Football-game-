// The Club context: a read-only look at any club — a rival in the league, a European
// opponent, or the far side of a transfer. Overview only for now; a Squad tab (each
// row reusing the existing Player context) follows in a later phase.

import { h, panel, statTile, formGuide, emptyState, clubCrest } from './dom.js';
import { num, ordinal, seasonLabel } from '../core/format.js';
import { anyClub } from '../engine/europe.js';
import { standings } from '../engine/league.js';
import { DIVISION_BY_TIER } from '../data/competitions.js';
import { openContext } from '../main.js';

function resolve(world, entry) {
  return anyClub(world, entry.clubId);
}

export const clubContext = {
  resolve,

  title(world, entry) {
    return resolve(world, entry)?.name ?? 'Club';
  },

  tabs(world, entry) {
    if (!resolve(world, entry)) return [{ key: 'gone', label: 'Club' }];
    return [
      { key: 'overview', label: 'Overview' },
      { key: 'squad', label: 'Squad' },
    ];
  },

  render(world, entry) {
    const club = resolve(world, entry);
    if (!club) return goneView();
    switch (entry.tab) {
      case 'squad': return squadTab(club);
      case 'overview':
      default: return overviewTab(world, club);
    }
  },

  actionItems() {
    return [];
  },
};

function goneView() {
  return emptyState('This club is no longer available.');
}

function overviewTab(world, club) {
  // Only English-pyramid clubs sit in world.tables — a European-only opponent (built
  // by engine/europe.js into world.europeClubs) carries tier 0 like the Premier League
  // does, but never appears in world.tables[0]'s rows, so it needs its own label rather
  // than a misleading "Premier League" / a position that will never resolve.
  const isDomestic = !!world.clubs[club.id];
  const div = DIVISION_BY_TIER[club.tier];
  let position = null;
  if (isDomestic) {
    const table = standings(world.tables[club.tier], (id) => world.clubs[id]?.name || id);
    position = table.findIndex((r) => r.clubId === club.id) + 1 || null;
  }

  return h('div', null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' } },
      clubCrest(club, { size: 'lg' }),
      h('div', { style: { fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700 } }, club.name),
    ),
    h('div', { class: 'grid cols-4', style: { marginBottom: 'var(--space-4)' } },
      statTile('Reputation', Math.round(club.reputation) + ' / 100'),
      statTile('Supporters', num(club.fans)),
      statTile('Stadium', num(club.stadiumCapacity)),
      statTile('League position', position ? ordinal(position) : '—', { note: isDomestic ? div.name : 'European club' }),
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' } },
      h('span', { class: 'eyebrow' }, 'Recent form'),
      formGuide(club.form, 5),
    ),
    panel('Honours',
      (club.trophies || []).length
        ? h('div', null, ...club.trophies.map((t) => h('div', { class: 'result-row' },
            h('span', { class: 'score', style: { background: 'rgba(232,184,75,0.16)', color: 'var(--gold)' } }, '★'),
            h('span', { class: 'opponent' }, t.competition),
            h('span', { class: 'comp' }, seasonLabel(t.season)),
          )))
        : emptyState('No trophies yet.'),
    ),
  );
}

// A compact, read-only roster — full attributes/contract detail live in the existing
// Player context, which already degrades correctly for a player who isn't yours (no
// Renew/Sell) since it's gated on entry.source.clubId === world.playerClubId.
function squadTab(club) {
  const roster = [...club.squad].sort((a, b) => b.overall - a.overall);
  if (!roster.length) return emptyState('No players registered.');
  return h('div', { class: 'table-scroll' },
    h('table', { class: 'data' },
      h('thead', null, h('tr', null,
        h('th', null, 'Player'), h('th', null, 'Pos'),
        h('th', { class: 'num' }, 'Age'), h('th', { class: 'num' }, 'OVR'),
      )),
      h('tbody', null, ...roster.map((p) => h('tr', {
        class: 'clickable',
        onclick: () => openContext('player', { playerId: p.id, source: { kind: 'squad', clubId: club.id } }),
      },
        h('td', { class: 'strong' }, p.name),
        h('td', null, p.position),
        h('td', { class: 'num' }, p.age),
        h('td', { class: 'num' }, Math.round(p.overall)),
      ))),
    ),
  );
}
