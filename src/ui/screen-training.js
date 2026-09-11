// Training: pick a focus, upgrade the facilities, watch players develop.

import { h, panel, meter, statTile } from './dom.js';
import { money } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { TRAINING_FOCUS, FACILITY_UPGRADES, facilityInfo, nextFacilityUpgrade, trainingMultiplier } from '../engine/training.js';
import { recordLedger } from '../engine/finance.js';
import { squadRating } from '../model/club.js';
import { persist, render } from '../main.js';
import { confirmDialog } from './modal.js';
import { toast } from './toast.js';

export function renderTraining(world) {
  const you = playerClub(world);
  const focus = TRAINING_FOCUS[you.trainingFocus] || TRAINING_FOCUS.balanced;

  const developing = [...you.squad]
    .filter((p) => p.potential > p.overall)
    .sort((a, b) => (b.potential - b.overall) - (a.potential - a.overall))
    .slice(0, 8);

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, 'Training'),
      h('span', { class: 'sub' }, `${facilityInfo('training', you.facilities.training).name} · squad rating ${squadRating(you).toFixed(1)}`),
    ),

    h('div', { class: 'grid split' },
      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        panel('Training focus',
          h('div', { class: 'panel-body', style: { display: 'grid', gap: 'var(--space-2)' } },
            ...Object.values(TRAINING_FOCUS).map((f) => h('button', {
              class: 'choice',
              style: f.id === you.trainingFocus
                ? { borderColor: 'var(--pitch)', background: 'var(--pitch-glow)' } : {},
              onclick: () => { you.trainingFocus = f.id; persist(); render(); toast('Training focus', f.name); },
            },
              h('span', null,
                h('div', { class: 'label' }, f.name),
                h('div', { style: { color: 'var(--text-3)', fontSize: '12px' } }, f.blurb),
              ),
              f.id === you.trainingFocus ? h('span', { class: 'tag pitch' }, 'Active') : null,
            )),
          ),
        ),

        panel('Developing players',
          developing.length ? h('table', { class: 'data' },
            h('thead', null, h('tr', null,
              h('th', null, 'Player'), h('th', null, 'Pos'), h('th', { class: 'num' }, 'Age'),
              h('th', { class: 'num' }, 'Now'), h('th', { class: 'num' }, 'Ceiling'), h('th', null, 'Room to grow'),
            )),
            h('tbody', null, ...developing.map((p) => h('tr', null,
              h('td', { class: 'strong' }, p.name),
              h('td', null, p.position),
              h('td', { class: 'num' }, p.age),
              h('td', { class: 'num' }, Math.round(p.overall)),
              h('td', { class: 'num' }, p.potential),
              h('td', { style: { minWidth: '110px' } },
                meter((p.overall - 30) / Math.max(1, p.potential - 30), p.age <= 23 ? '' : 'warn')),
            ))),
          ) : h('div', { class: 'empty-state' }, 'Nobody in the squad has room left to improve. Sign younger players.'),
        ),
      ),

      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        focusGainsPanel(focus),
        facilityPanel(world, you, 'training', 'Training ground'),
        h('div', { class: 'grid cols-2' },
          statTile('Development rate', '×' + trainingMultiplier(you.facilities.training).toFixed(2),
            { note: 'From facility level' }),
          statTile('Current focus', focus.name),
        ),
      ),
    ),
  );
}

// What the active focus actually trades off, reusing meter() unmodified for both
// directions (a positive gain, or the trade-off a heavy focus quietly costs elsewhere).
function focusGainsPanel(focus) {
  const entries = Object.entries(focus.gains).filter(([, rate]) => rate !== 0);
  const maxAbs = Math.max(0.1, ...entries.map(([, rate]) => Math.abs(rate)));
  const gains = entries.filter(([, rate]) => rate > 0).sort((a, b) => b[1] - a[1]);
  const costs = entries.filter(([, rate]) => rate < 0).sort((a, b) => a[1] - b[1]);

  return panel('What this focus trains',
    h('div', { class: 'panel-body', style: { display: 'grid', gap: '6px' } },
      h('div', { class: 'eyebrow' }, 'Improving'),
      ...gains.map(([attr, rate]) => gainRow(attr, rate, maxAbs)),
      costs.length ? h('div', { class: 'eyebrow', style: { marginTop: '6px' } }, 'Trade-off') : null,
      ...costs.map(([attr, rate]) => gainRow(attr, rate, maxAbs)),
    ),
  );
}

function gainRow(attr, rate, maxAbs) {
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } },
    h('span', { style: { flex: 'none', width: '76px', fontSize: '12px', color: 'var(--text-2)', textTransform: 'capitalize' } }, attr),
    h('div', { style: { flex: 1 } }, meter(Math.abs(rate) / maxAbs, rate >= 0 ? '' : 'danger')),
  );
}

export function facilityPanel(world, you, kind, title) {
  const level = you.facilities[kind];
  const next = nextFacilityUpgrade(kind, level);
  const affordable = next && you.balance >= next.cost;

  return panel(title,
    h('div', { class: 'track' }, ...FACILITY_UPGRADES[kind].map((step) => {
      const done = level > step.level;
      const current = level === step.level;
      const isNext = next && next.level === step.level;
      return h('div', { class: 'track-step ' + (done ? 'done' : current ? 'current' : isNext ? '' : 'locked') },
        h('div', { class: 'step-name' },
          h('div', { class: 'n' }, step.name,
            current ? h('span', { class: 'tag pitch', style: { marginLeft: '8px' } }, 'Current') : null),
          h('div', { class: 'e' }, step.effect),
        ),
        done || current ? h('span', { class: 'tag muted' }, done ? 'Built' : 'Level ' + step.level)
          : isNext ? h('button', {
              class: 'btn sm ' + (affordable ? 'primary' : ''),
              disabled: !affordable,
              onclick: () => upgrade(world, you, kind, step),
            }, money(step.cost))
          : h('span', { class: 'cost' }, money(step.cost)),
      );
    })),
  );
}

async function upgrade(world, you, kind, step) {
  if (you.balance < step.cost) { toast('Not enough money', null, { tone: 'danger' }); return; }
  const ok = await confirmDialog('Upgrade facilities?',
    `Spend ${money(step.cost)} on ${step.name}? ${step.effect}.`, 'Build it');
  if (!ok) return;

  recordLedger(you, world.seasonNumber, kind === 'training' ? 'facilities' : kind, step.name, -step.cost);
  you.facilities[kind] = step.level;
  toast('Upgraded', step.name, { tone: 'gold' });
  persist();
  render();
}
