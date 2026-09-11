// Club: objectives, honours, history and the state of the institution.

import { h, panel, meter, statTile, emptyState, clubCrest } from './dom.js';
import { money, num, seasonLabel, ordinal } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { DIVISION_BY_TIER } from '../data/competitions.js';
import { objectiveState } from '../engine/objectives.js';
import { facilityInfo } from '../engine/training.js';
import { squadRating } from '../model/club.js';
import { facilityPanel } from './screen-training.js';

export function renderClub(world) {
  const you = playerClub(world);
  const div = DIVISION_BY_TIER[you.tier];
  const objectives = objectiveState(world);
  const done = objectives.filter((o) => o.complete).length;

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title', style: { display: 'flex', alignItems: 'center', gap: 'var(--space-4)' } },
      clubCrest(you, { size: 'lg' }),
      h('div', null,
        h('h1', null, you.name),
        h('span', { class: 'sub' }, `${div.name} · managed by ${world.managerName}`),
      ),
    ),

    h('div', { class: 'grid cols-4' },
      statTile('Reputation', Math.round(you.reputation) + ' / 100', { tone: 'money' }),
      statTile('Supporters', num(you.fans)),
      statTile('Trophies', (you.trophies || []).length, { tone: (you.trophies || []).length ? 'good' : '' }),
      statTile('Objectives', `${done} of ${objectives.length}`),
    ),

    h('div', { class: 'grid split', style: { marginTop: 'var(--space-4)' } },
      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        panel('Objectives',
          h('div', null, ...objectives.map((o) => h('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
              padding: '11px var(--space-4)', borderBottom: '1px solid var(--line-faint)',
              opacity: o.complete ? 0.6 : 1,
            },
          },
            h('span', { style: { width: '16px', color: o.complete ? 'var(--pitch)' : 'var(--text-faint)', flex: 'none' } },
              o.complete ? '✓' : '○'),
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { fontWeight: 500, fontSize: '13.5px' } }, o.name),
              h('div', { style: { color: 'var(--text-3)', fontSize: '12px' } }, o.description),
            ),
            h('div', { style: { width: '110px', flex: 'none' } },
              meter(o.ratio, o.complete ? '' : 'gold'),
              h('div', { class: 'mono', style: { fontSize: '10.5px', color: 'var(--text-faint)', textAlign: 'right', marginTop: '3px' } },
                Math.round(o.ratio * 100) + '%'),
            ),
          ))),
        ),

        panel('Season history',
          (world.history || []).length
            ? h('div', { class: 'table-scroll' },
                h('table', { class: 'data' },
                  h('thead', null, h('tr', null,
                    h('th', null, 'Season'), h('th', null, 'Division'),
                    h('th', { class: 'num' }, 'Pos'), h('th', { class: 'num' }, 'Pts'),
                    h('th', null, 'Outcome'), h('th', null, 'Top scorer'),
                  )),
                  h('tbody', null, ...[...world.history].reverse().map((entry) => {
                    const p = entry.player;
                    if (!p) return null;
                    return h('tr', null,
                      h('td', { class: 'strong' }, seasonLabel(entry.season)),
                      h('td', null, DIVISION_BY_TIER[p.tier]?.short || '—'),
                      h('td', { class: 'num' }, p.position ? ordinal(p.position) : '—'),
                      h('td', { class: 'num' }, p.row?.points ?? '—'),
                      h('td', null,
                        p.champion ? h('span', { class: 'tag gold' }, 'Champions')
                          : p.promoted ? h('span', { class: 'tag pitch' }, 'Promoted')
                          : p.relegated ? h('span', { class: 'tag danger' }, 'Relegated')
                          : h('span', { class: 'tag muted' }, '—')),
                      h('td', null, p.topScorer ? `${p.topScorer.name} (${p.topScorer.goals})` : '—'),
                    );
                  })),
                ),
              )
            : emptyState('No seasons completed yet.'),
        ),
      ),

      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        panel('Honours',
          (you.trophies || []).length
            ? h('div', null, ...you.trophies.map((t) => h('div', { class: 'result-row' },
                h('span', { class: 'score', style: { background: 'rgba(232,184,75,0.16)', color: 'var(--gold)' } }, '★'),
                h('span', { class: 'opponent' }, t.competition),
                h('span', { class: 'comp' }, seasonLabel(t.season)),
              )))
            : emptyState('No trophies yet. There is a whole cabinet waiting.'),
        ),

        panel('The club',
          h('div', { class: 'panel-body', style: { display: 'grid', gap: 'var(--space-3)' } },
            infoRow('Ground', `${you.stadium} · ${num(you.stadiumCapacity)}`),
            infoRow('Training', facilityInfo('training', you.facilities.training).name),
            infoRow('Academy', facilityInfo('youth', you.facilities.youth).name),
            infoRow('Scouting', facilityInfo('scouting', you.facilities.scouting).name),
            infoRow('Sponsor', `${you.sponsor?.name || '—'} · ${money(you.sponsor?.value || 0)}/yr`),
            infoRow('Squad rating', squadRating(you).toFixed(1)),
          ),
        ),

        facilityPanel(world, you, 'scouting', 'Scouting department'),
      ),
    ),
  );
}

function infoRow(label, value) {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' } },
    h('span', { class: 'eyebrow' }, label),
    h('span', { style: { fontSize: '12.5px', textAlign: 'right' } }, value),
  );
}
