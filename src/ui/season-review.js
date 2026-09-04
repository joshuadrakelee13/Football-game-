// End of season: the headline, the final table, and what it all cost or earned.

import { h, mount, clubChip, panel } from './dom.js';
import { money, num, ordinal, seasonLabel } from '../core/format.js';
import { DIVISION_BY_TIER, CUPS, EURO_COMPS } from '../data/competitions.js';
import { zoneClass, signedNum } from './screen-overview.js';

export function showSeasonReview(summary, world) {
  return new Promise((resolve) => {
    const p = summary.player;
    const div = DIVISION_BY_TIER[p.tier];
    const table = summary.divisions[p.tier] || [];

    const { headline, sub, tone } = headlineFor(p, div, world);

    const host = document.getElementById('overlays');
    const overlay = h('div', { class: 'match-overlay' },
      h('div', { class: 'review-banner' },
        h('div', { class: 'eyebrow' }, `${seasonLabel(summary.season)} · ${div.name}`),
        h('div', { class: 'headline ' + tone, style: { marginTop: '10px' } }, headline),
        h('div', { class: 'sub' }, sub),
      ),

      h('div', { style: { flex: 1, overflowY: 'auto', padding: 'var(--space-5) var(--space-6)' } },
        h('div', { class: 'grid cols-4', style: { marginBottom: 'var(--space-5)' } },
          tile('Final position', p.position ? ordinal(p.position) : '—'),
          tile('Points', p.row?.points ?? '—'),
          tile('Goals', p.row ? `${p.row.goalsFor}–${p.row.goalsAgainst}` : '—'),
          tile('Reputation', p.reputation, 'money'),
        ),

        h('div', { class: 'grid split' },
          panel(`${div.name} final table`,
            h('div', { class: 'table-scroll', style: { maxHeight: '420px', overflowY: 'auto' } },
              h('table', { class: 'data' },
                h('thead', null, h('tr', null,
                  h('th', null, '#'), h('th', null, 'Club'),
                  h('th', { class: 'num' }, 'P'), h('th', { class: 'num' }, 'GD'), h('th', { class: 'num' }, 'Pts'),
                )),
                h('tbody', null, ...table.map((row, i) => {
                  const club = world.clubs[row.clubId];
                  return h('tr', { class: (club?.isPlayerClub ? 'you ' : '') + zoneClass(i + 1, div, table.length) },
                    h('td', { class: 'pos num' }, i + 1),
                    h('td', { class: 'strong' }, clubChip(club, { short: false })),
                    h('td', { class: 'num' }, row.played),
                    h('td', { class: 'num' }, signedNum(row.goalsFor - row.goalsAgainst)),
                    h('td', { class: 'num strong' }, row.points),
                  );
                })),
              ),
            ),
          ),

          h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
            panel('Around the grounds',
              h('div', null,
                ...movementRows(summary, world),
              ),
            ),
            panel('Cups',
              h('div', null,
                ...Object.entries(summary.cups).map(([key, cup]) => h('div', { class: 'result-row' },
                  h('span', { class: 'comp', style: { width: '96px', flex: 'none' } }, CUPS[key]?.name || key),
                  h('span', { class: 'opponent' }, world.clubs[cup.winner]?.name || '—'),
                )),
                ...Object.entries(summary.europe || {}).map(([key, comp]) => h('div', { class: 'result-row' },
                  h('span', { class: 'comp', style: { width: '96px', flex: 'none' } }, EURO_COMPS[key]?.short || key),
                  h('span', { class: 'opponent' },
                    world.clubs[comp.winner]?.name || world.europeClubs?.[comp.winner]?.name || '—'),
                )),
              ),
            ),
            p.topScorer ? panel('Your top scorer',
              h('div', { class: 'panel-body' },
                h('div', { style: { fontSize: '16px', fontWeight: 600 } }, p.topScorer.name),
                h('div', { style: { color: 'var(--text-3)', fontSize: '13px' } },
                  `${p.topScorer.goals} goals, ${p.topScorer.assists} assists`),
              ),
            ) : null,
          ),
        ),
      ),

      h('div', { class: 'match-foot' },
        h('button', {
          class: 'btn primary lg',
          onclick: () => { overlay.remove(); resolve(); },
        }, 'Start the new season'),
      ),
    );

    mount(host, overlay);
  });
}

function headlineFor(p, div, world) {
  if (p.champion && p.tier === 0) return { headline: 'CHAMPIONS OF ENGLAND', sub: 'You have won the Premier League.', tone: 'champion' };
  if (p.champion) return { headline: `${div.name.toUpperCase()} CHAMPIONS`, sub: 'Top of the pile, and up you go.', tone: 'champion' };
  if (p.promoted) return {
    headline: 'PROMOTED',
    sub: `Up into ${DIVISION_BY_TIER[p.newTier]?.name}${p.promotedVia === 'play-off' ? ' through the play-offs' : ''}.`,
    tone: 'promoted',
  };
  if (p.relegated) return {
    headline: 'RELEGATED',
    sub: `Down into ${DIVISION_BY_TIER[p.newTier]?.name}. There is a way back.`,
    tone: 'relegated',
  };
  return {
    headline: `${ordinal(p.position || 0).toUpperCase()} PLACE`,
    sub: 'Another season in the books. Build for the next one.',
    tone: '',
  };
}

function movementRows(summary, world) {
  const rows = [];
  for (const move of summary.promoted.slice(0, 8)) {
    const club = world.clubs[move.clubId];
    if (!club) continue;
    rows.push(h('div', { class: 'result-row' },
      h('span', { class: 'tag pitch', style: { flex: 'none' } }, 'Up'),
      h('span', { class: 'opponent' }, club.name),
      h('span', { class: 'comp' }, DIVISION_BY_TIER[move.to]?.short || ''),
    ));
  }
  for (const move of summary.relegated.slice(0, 8)) {
    const club = world.clubs[move.clubId];
    if (!club) continue;
    rows.push(h('div', { class: 'result-row' },
      h('span', { class: 'tag danger', style: { flex: 'none' } }, 'Down'),
      h('span', { class: 'opponent' }, club.name),
      h('span', { class: 'comp' }, DIVISION_BY_TIER[move.to]?.short || ''),
    ));
  }
  return rows.length ? rows : [h('div', { class: 'empty-state' }, 'No movement recorded.')];
}

function tile(label, value, tone = '') {
  return h('div', { class: 'stat-tile' },
    h('div', { class: 'k' }, label),
    h('div', { class: 'v ' + tone }, value),
  );
}
