// Fixtures and results across every competition.

import { h, clubChip, panel, emptyState } from './dom.js';
import { matchDate, seasonLabel } from '../core/format.js';
import { playerClub, upcomingFixtures } from '../model/world.js';
import { DIVISION_BY_TIER } from '../data/competitions.js';
import { openContext } from '../main.js';

const COMP_NAMES = {
  LEAGUE: 'League', FA: 'FA Cup', EFL: 'Carabao Cup',
  UCL: 'Champions League', UEL: 'Europa League', UECL: 'Conference League',
};

const COMP_COLOURS = {
  LEAGUE: '#7BDB56', FA: '#F0C24D', EFL: '#E8853B',
  UCL: '#C084FC', UEL: '#5AA7F5', UECL: '#4A6BF5',
};

export function renderFixtures(world) {
  const you = playerClub(world);
  const upcoming = upcomingFixtures(world, you.id, 12);
  const results = [...(world.results || [])].reverse();

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, 'Fixtures'),
      h('span', { class: 'sub' }, `${seasonLabel(world.startYear)} · ${DIVISION_BY_TIER[you.tier].name}`),
    ),

    upcoming.length ? h('div', { class: 'rhythm-strip' }, ...upcoming.slice(0, 8).map((entry) => rhythmChip(world, you, entry))) : null,

    h('div', { class: 'grid split' },
      panel('Results',
        results.length ? h('div', { class: 'table-scroll' },
          h('table', { class: 'data' },
            h('thead', null, h('tr', null,
              h('th', null, 'Competition'), h('th', null, 'Opponent'),
              h('th', null, 'Venue'), h('th', { class: 'num' }, 'Score'), h('th', null, ''),
            )),
            h('tbody', null, ...results.map((r) => {
              const isHome = r.home === you.id;
              const opponentId = isHome ? r.away : r.home;
              const opponent = world.clubs[opponentId] || world.europeClubs?.[opponentId];
              const gf = isHome ? r.homeGoals : r.awayGoals;
              const ga = isHome ? r.awayGoals : r.homeGoals;
              const outcome = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
              return h('tr', {
                class: opponent ? 'clickable' : null,
                onclick: opponent ? () => openContext('club', { clubId: opponent.id }) : null,
              },
                h('td', null, h('span', { style: { fontSize: '11.5px', color: 'var(--text-3)' } },
                  r.label || COMP_NAMES[r.competition] || r.competition)),
                h('td', { class: 'strong' }, clubChip(opponent, { short: false })),
                h('td', null, isHome ? 'Home' : 'Away'),
                h('td', { class: 'num strong' }, `${gf}–${ga}`,
                  r.penalties ? h('span', { style: { color: 'var(--text-3)', fontSize: '11px' } },
                    ` (${r.penalties.home}–${r.penalties.away} pens)`) : null),
                h('td', null, h('span', { class: 'form-guide' }, h('i', { class: outcome }, outcome))),
              );
            })),
          ),
        ) : emptyState('No matches played yet.'),
      ),

      panel('Coming up',
        upcoming.length ? h('div', null, ...upcoming.map((entry) => {
          const isHome = entry.home === you.id;
          const opponentId = isHome ? entry.away : entry.home;
          const opponent = world.clubs[opponentId] || world.europeClubs?.[opponentId];
          return h('div', {
            class: 'result-row',
            style: opponent ? { cursor: 'pointer' } : null,
            onclick: opponent ? () => openContext('club', { clubId: opponent.id }) : null,
          },
            h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--text-faint)', width: '74px', flex: 'none' } },
              matchDate(entry.matchday.day, world.startYear)),
            h('span', { class: 'opponent' },
              isHome ? 'v ' : 'at ', opponent?.short || 'TBC'),
            h('span', { class: 'comp' }, entry.roundLabel || COMP_NAMES[entry.competition] || entry.competition),
          );
        })) : emptyState('No fixtures left this season.'),
      ),
    ),
  );
}

// A compact "what's coming" rhythm strip above the full Results/Coming-up tables —
// same upcoming fixtures, just a glanceable overview rather than the detailed list.
function rhythmChip(world, you, entry) {
  const isHome = entry.home === you.id;
  const opponentId = isHome ? entry.away : entry.home;
  const opponent = world.clubs[opponentId] || world.europeClubs?.[opponentId];
  const color = COMP_COLOURS[entry.competition] || 'var(--text-3)';
  return h('div', {
    class: 'rhythm-chip',
    style: opponent ? { cursor: 'pointer' } : null,
    onclick: opponent ? () => openContext('club', { clubId: opponent.id }) : null,
    title: entry.roundLabel || COMP_NAMES[entry.competition] || entry.competition,
  },
    h('i', { class: 'dot', style: { background: color } }),
    h('span', null, isHome ? 'v ' : 'at ', opponent?.short || 'TBC'),
  );
}
