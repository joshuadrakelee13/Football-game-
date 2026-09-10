// Youth academy: prospects waiting on a decision, and the academy itself.

import { h, panel, emptyState, meter, statTile } from './dom.js';
import { money } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { promoteProspect, prospectGrade, academyLevelInfo } from '../engine/youth.js';
import { facilityInfo } from '../engine/training.js';
import { receiveTransferFee } from '../engine/finance.js';
import { facilityPanel } from './screen-training.js';
import { persist, render } from '../main.js';
import { toast } from './toast.js';

export function renderYouth(world) {
  const you = playerClub(world);
  const prospects = world.youthProspects || [];
  const graduates = you.squad.filter((p) => p.academyGraduate);
  const info = academyLevelInfo(you.facilities.youth);

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, 'Youth Academy'),
      h('span', { class: 'sub' }, facilityInfo('youth', you.facilities.youth).name),
    ),

    h('div', { class: 'grid cols-3' },
      statTile('Prospects waiting', prospects.length, { tone: prospects.length ? 'good' : '' }),
      statTile('Graduates in the squad', graduates.length),
      statTile('Discovery rate', Math.round(info.chance * 100) + '%', { note: 'Chance every six weeks' }),
    ),

    h('div', { class: 'grid split', style: { marginTop: 'var(--space-4)' } },
      panel('Prospects',
        prospects.length
          ? h('div', null, ...prospects.map((p) => prospectRow(world, you, p)))
          : emptyState('No prospects right now. The academy produces them every few weeks — upgrade it to speed that up.'),
      ),
      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        facilityPanel(world, you, 'youth', 'Academy'),
        graduates.length ? panel('Academy graduates',
          h('table', { class: 'data' },
            h('thead', null, h('tr', null,
              h('th', null, 'Player'), h('th', null, 'Pos'), h('th', { class: 'num' }, 'Age'),
              h('th', { class: 'num' }, 'OVR'), h('th', { class: 'num' }, 'POT'),
            )),
            h('tbody', null, ...graduates.map((p) => h('tr', null,
              h('td', { class: 'strong' }, p.name),
              h('td', null, p.position),
              h('td', { class: 'num' }, p.age),
              h('td', { class: 'num' }, Math.round(p.overall)),
              h('td', { class: 'num' }, p.potential),
            ))),
          ),
        ) : null,
      ),
    ),
  );
}

function prospectRow(world, you, prospect) {
  const grade = prospectGrade(prospect);
  const fee = Math.round(prospect.value * 1.3);

  return h('div', {
    style: {
      padding: 'var(--space-4)', borderBottom: '1px solid var(--line-faint)',
      display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap',
    },
  },
    h('div', { style: { flex: 1, minWidth: '180px' } },
      h('div', { style: { fontWeight: 600 } }, prospect.name,
        h('span', { class: 'tag ' + (grade.tone === 'gold' ? 'gold' : grade.tone === 'good' ? 'pitch' : 'muted'), style: { marginLeft: '8px' } },
          grade.label)),
      h('div', { style: { color: 'var(--text-3)', fontSize: '12px' } },
        `${prospect.age} · ${prospect.position} · ${prospect.archetype} · ${money(prospect.wage)}/wk`),
      h('div', { style: { display: 'flex', gap: 'var(--space-4)', marginTop: '8px', alignItems: 'center' } },
        h('span', { class: 'mono', style: { fontSize: '12px' } }, `${Math.round(prospect.overall)} → ${prospect.potential}`),
        h('div', { style: { flex: 1, maxWidth: '160px' } },
          meter((prospect.overall - 20) / Math.max(1, prospect.potential - 20), 'gold')),
      ),
    ),
    h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      h('button', {
        class: 'btn sm primary',
        onclick: () => {
          const result = promoteProspect(you, prospect);
          if (!result.ok) { toast('Cannot promote', result.reason, { tone: 'danger' }); return; }
          world.youthProspects = world.youthProspects.filter((p) => p !== prospect);
          toast('Promoted', `${prospect.name} joins the senior squad.`);
          persist(); render();
        },
      }, 'Promote'),
      h('button', {
        class: 'btn sm',
        onclick: () => {
          receiveTransferFee(you, fee, world.seasonNumber, `Sold academy player ${prospect.name}`);
          world.youthProspects = world.youthProspects.filter((p) => p !== prospect);
          toast('Sold', `${prospect.name} leaves for ${money(fee)}.`, { tone: 'gold' });
          persist(); render();
        },
      }, `Sell · ${money(fee)}`),
      h('button', {
        class: 'btn sm ghost',
        onclick: () => {
          world.youthProspects = world.youthProspects.filter((p) => p !== prospect);
          persist(); render();
        },
      }, 'Release'),
    ),
  );
}
