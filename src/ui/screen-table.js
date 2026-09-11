// League tables, for any division in the pyramid.

import { h, clubChip, formGuide, panel } from './dom.js';
import { playerClub } from '../model/world.js';
import { DIVISIONS, DIVISION_BY_TIER } from '../data/competitions.js';
import { standings } from '../engine/league.js';
import { zoneClass, signedNum } from './screen-overview.js';
import { render, openContext } from '../main.js';

let viewTier = null;

export function renderTable(world) {
  const you = playerClub(world);
  if (viewTier === null || !world.divisions[viewTier]) viewTier = you.tier;

  const div = DIVISION_BY_TIER[viewTier];
  const table = standings(world.tables[viewTier], (id) => world.clubs[id]?.name || id);

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, 'League Table'),
      h('span', { class: 'sub' }, div.name),
    ),

    h('div', { class: 'formation-picker', style: { marginBottom: 'var(--space-4)' } },
      ...DIVISIONS.map((d) => h('button', {
        class: 'formation-option' + (d.tier === viewTier ? ' active' : ''),
        onclick: () => { viewTier = d.tier; render(); },
      }, d.short)),
    ),

    panel(div.name,
      h('div', { class: 'table-scroll' },
        h('table', { class: 'data' },
          h('thead', null, h('tr', null,
            h('th', null, '#'), h('th', null, ''), h('th', null, 'Club'),
            h('th', { class: 'num' }, 'P'), h('th', { class: 'num' }, 'W'),
            h('th', { class: 'num' }, 'D'), h('th', { class: 'num' }, 'L'),
            h('th', { class: 'num' }, 'GF'), h('th', { class: 'num' }, 'GA'),
            h('th', { class: 'num' }, 'GD'), h('th', { class: 'num' }, 'Pts'),
            h('th', null, 'Form'),
          )),
          h('tbody', null, ...table.map((row, i) => {
            const club = world.clubs[row.clubId];
            const pos = i + 1;
            const moved = row.lastPosition ? row.lastPosition - pos : 0;
            return h('tr', {
              class: 'clickable ' + (club.isPlayerClub ? 'you ' : '') + zoneClass(pos, div, table.length),
              onclick: () => openContext('club', { clubId: club.id }),
            },
              h('td', { class: 'pos num' }, pos),
              h('td', null, h('span', { class: 'move ' + (moved > 0 ? 'up' : moved < 0 ? 'down' : 'same') },
                moved > 0 ? '▲' : moved < 0 ? '▼' : '·')),
              h('td', { class: 'strong' }, clubChip(club, { short: false })),
              h('td', { class: 'num' }, row.played),
              h('td', { class: 'num' }, row.won),
              h('td', { class: 'num' }, row.drawn),
              h('td', { class: 'num' }, row.lost),
              h('td', { class: 'num' }, row.goalsFor),
              h('td', { class: 'num' }, row.goalsAgainst),
              h('td', { class: 'num' }, signedNum(row.goalsFor - row.goalsAgainst)),
              h('td', { class: 'num strong' }, row.points),
              h('td', null, formGuide(row.form, 5)),
            );
          })),
        ),
      ),
      null,
    ),

    h('div', { class: 'zone-key', style: { marginTop: 'var(--space-4)' } },
      div.tier > 0 && div.autoPromoted > 0
        ? h('span', null, h('i', { style: { background: 'var(--pitch)' } }), `Automatic promotion (top ${div.autoPromoted})`)
        : div.tier === 0 ? h('span', null, h('i', { style: { background: 'var(--pitch)' } }), 'Champions League') : null,
      div.playoffPlaces.length
        ? h('span', null, h('i', { style: { background: 'var(--info)' } }), `Play-offs (${div.playoffPlaces[0]}–${div.playoffPlaces[div.playoffPlaces.length - 1]})`)
        : null,
      div.relegated > 0
        ? h('span', null, h('i', { style: { background: 'var(--danger)' } }), `Relegation (bottom ${div.relegated})`)
        : null,
    ),
  );
}
