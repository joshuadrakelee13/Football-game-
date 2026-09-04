// Stadium: capacity, the expansion track, and what a bigger ground actually buys you.

import { h, panel, meter, statTile } from './dom.js';
import { money, num } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { DIVISION_BY_TIER } from '../data/competitions.js';
import { STADIUM_TIERS, nextTier, canExpand } from '../engine/stadium.js';
import { attendanceFor, recordLedger } from '../engine/finance.js';
import { stadiumUpkeep } from '../model/club.js';
import { persist, render } from '../main.js';
import { confirmDialog } from './modal.js';
import { toast } from './toast.js';

export function renderStadium(world) {
  const you = playerClub(world);
  const div = DIVISION_BY_TIER[you.tier];
  const next = nextTier(you.stadiumCapacity);
  const gate = attendanceFor(you, { reputation: you.reputation }, world);
  const perGame = gate.attendance * div.ticketPrice + gate.attendance * 6.5;
  const fill = you.fans / Math.max(1, you.stadiumCapacity);

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, 'Stadium'),
      h('span', { class: 'sub' }, you.stadium),
    ),

    h('div', { class: 'grid cols-4' },
      statTile('Capacity', num(you.stadiumCapacity)),
      statTile('Supporters', num(you.fans), { note: fill >= 0.95 ? 'Selling out' : `${Math.round(fill * 100)}% of capacity` }),
      statTile('Typical gate', money(Math.round(perGame)), { tone: 'money', note: `${num(gate.attendance)} through the turnstiles` }),
      statTile('Upkeep', money(stadiumUpkeep(you)) + '/yr', { note: 'Rises with every expansion' }),
    ),

    h('div', { class: 'grid split', style: { marginTop: 'var(--space-4)' } },
      panel('Expansion',
        h('div', { class: 'track' }, ...STADIUM_TIERS.map((tier, i) => {
          const done = you.stadiumCapacity > tier.capacity;
          const current = you.stadiumCapacity === tier.capacity;
          const isNext = next && next.capacity === tier.capacity;
          const affordable = isNext && you.balance >= tier.cost;
          return h('div', { class: 'track-step ' + (done ? 'done' : current ? 'current' : isNext ? '' : 'locked') },
            h('div', { class: 'step-name' },
              h('div', { class: 'n' }, num(tier.capacity), ' seats',
                current ? h('span', { class: 'tag pitch', style: { marginLeft: '8px' } }, 'Current') : null),
              h('div', { class: 'e' }, tier.label),
            ),
            done ? h('span', { class: 'tag muted' }, 'Built')
              : isNext ? h('button', {
                  class: 'btn sm ' + (affordable ? 'primary' : ''),
                  disabled: !affordable,
                  onclick: () => expand(world, you, tier),
                }, money(tier.cost))
              : h('span', { class: 'cost' }, money(tier.cost)),
          );
        })),
      ),

      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        panel('How full is the ground?',
          h('div', { class: 'panel-body' },
            h('div', { class: 'capacity-visual' },
              ...Array.from({ length: 24 }, (_, i) => {
                const share = (i + 1) / 24;
                return h('i', {
                  class: share <= fill ? 'filled' : '',
                  style: { height: (30 + share * 70) + '%' },
                });
              }),
            ),
            h('p', { style: { color: 'var(--text-3)', fontSize: '12.5px', margin: '4px 0 0' } },
              fill >= 0.95
                ? 'Every game is a sell-out. You are turning supporters away — and leaving money on the table.'
                : fill >= 0.75
                ? 'Healthy crowds. Expanding now would pay for itself if results hold up.'
                : 'There is room to grow into. Win games and the fans will come before the seats need to.'),
          ),
        ),
        panel('What expansion buys',
          h('div', { class: 'panel-body' },
            next
              ? h('div', null,
                  h('p', { style: { margin: '0 0 12px', color: 'var(--text-2)', fontSize: '13px' } },
                    `Going to ${num(next.capacity)} seats costs ${money(next.cost)} and raises upkeep. `,
                    `At full capacity that is about ${money(Math.round(next.capacity * (div.ticketPrice + 6.5)))} a game.`),
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '5px' } },
                    h('span', { class: 'eyebrow' }, 'Funds available'),
                    h('span', { class: 'mono', style: { fontSize: '12px' } }, `${money(you.balance)} of ${money(next.cost)}`)),
                  meter(you.balance / next.cost, you.balance >= next.cost ? '' : 'gold'),
                )
              : h('p', { style: { margin: 0, color: 'var(--text-3)' } }, 'The ground is already as big as it gets.'),
          ),
        ),
      ),
    ),
  );
}

async function expand(world, you, tier) {
  const check = canExpand(you);
  if (!check.ok) { toast('Cannot expand', check.reason, { tone: 'danger' }); return; }
  const ok = await confirmDialog('Expand the ground?',
    `Increase capacity to ${num(tier.capacity)} for ${money(tier.cost)}? Annual upkeep will rise too.`,
    'Build it');
  if (!ok) return;

  recordLedger(you, world.seasonNumber, 'stadium', `Expansion to ${num(tier.capacity)} seats`, -tier.cost);
  you.stadiumCapacity = tier.capacity;
  you.reputation = Math.min(100, you.reputation + 1.5);
  toast('Stadium expanded', `${you.stadium} now holds ${num(tier.capacity)}.`, { tone: 'gold' });
  persist();
  render();
}
