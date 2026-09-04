// Squad: the starting XI on a pitch, the formation picker, and the full squad list.

import { h, clubChip, ratingPill, meter, panel, emptyState } from './dom.js';
import { money, num } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { FORMATIONS, FORMATION_KEYS, positionFit } from '../data/positions.js';
import { pickBestXI, lineupPlayers, benchPlayers, squadRating, weeklyWages, teamRatings } from '../model/club.js';
import { moraleLabel, isAvailable, effectiveRating } from '../model/player.js';
import { renewalDemand, renewContract, sellPlayer } from '../engine/transfers.js';
import { visiblePotential } from '../engine/scouting.js';
import { persist, render } from '../main.js';
import { openModal, closeModal, confirmDialog } from './modal.js';
import { toast } from './toast.js';

// Where each formation slot sits on the pitch, as percentages.
const SLOT_LAYOUT = {
  '4-4-2':   [[50,92],[82,74],[62,76],[38,76],[18,74],[85,46],[60,48],[40,48],[15,46],[60,18],[40,18]],
  '4-3-3':   [[50,92],[82,74],[62,76],[38,76],[18,74],[50,58],[68,44],[32,44],[80,20],[50,14],[20,20]],
  '4-2-3-1': [[50,92],[82,74],[62,76],[38,76],[18,74],[62,58],[38,58],[80,34],[50,36],[20,34],[50,14]],
  '3-5-2':   [[50,92],[68,78],[50,80],[32,78],[86,50],[62,50],[50,62],[38,50],[14,50],[60,18],[40,18]],
  '5-3-2':   [[50,92],[88,72],[68,78],[50,80],[32,78],[12,72],[66,50],[50,56],[34,50],[60,20],[40,20]],
  '4-5-1':   [[50,92],[82,74],[62,76],[38,76],[18,74],[86,46],[64,46],[50,58],[36,46],[14,46],[50,16]],
};

export function renderSquad(world) {
  const you = playerClub(world);

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, 'Squad'),
      h('span', { class: 'sub' }, `${you.squad.length} players · rating ${squadRating(you).toFixed(1)} · ${money(weeklyWages(you))}/wk`),
    ),

    h('div', { class: 'grid split' },
      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        squadTable(world, you),
      ),
      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        formationPanel(world, you),
        pitchPanel(world, you),
        linesPanel(you),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------

function formationPanel(world, you) {
  return panel('Formation',
    h('div', { class: 'panel-body' },
      h('div', { class: 'formation-picker' }, ...FORMATION_KEYS.map((key) =>
        h('button', {
          class: 'formation-option' + (you.formation === key ? ' active' : ''),
          onclick: () => {
            you.formation = key;
            you.lineup = pickBestXI(you, key);
            persist();
            render();
          },
        }, key),
      )),
      h('p', { style: { color: 'var(--text-3)', fontSize: '12px', margin: '12px 0 0' } },
        FORMATIONS[you.formation]?.note),
      h('button', {
        class: 'btn ghost sm block', style: { marginTop: '12px' },
        onclick: () => { you.lineup = pickBestXI(you); persist(); render(); toast('Best XI selected'); },
      }, 'Pick the strongest XI'),
    ),
  );
}

function pitchPanel(world, you) {
  const layout = SLOT_LAYOUT[you.formation] || SLOT_LAYOUT['4-4-2'];
  const entries = lineupPlayers(you);

  return panel('Starting XI',
    h('div', { class: 'panel-body flush', style: { padding: '10px' } },
      h('div', { class: 'pitch-view' },
        h('div', { class: 'pitch-lines' }),
        h('div', { class: 'pitch-inner' }, ...entries.map((entry, i) => {
          const [x, y] = layout[i] || [50, 50];
          const fit = positionFit(entry.player.position, entry.slot);
          const classes = ['pitch-slot'];
          if (fit < 0.9) classes.push('out-of-position');
          if (!isAvailable(entry.player)) classes.push('injured');
          return h('button', {
            class: classes.join(' '),
            style: { left: x + '%', top: y + '%' },
            title: `${entry.player.name} — ${entry.player.position} in a ${entry.slot} role`,
            onclick: () => openPlayer(world, you, entry.player),
          },
            h('span', { class: 'shirt' }, Math.round(entry.player.overall)),
            h('span', { class: 'pname' }, entry.player.last),
            h('span', { class: 'ppos' }, entry.slot),
          );
        })),
      ),
    ),
  );
}

function linesPanel(you) {
  const r = teamRatings(you);
  return panel('Team strength',
    h('div', { class: 'panel-body', style: { display: 'grid', gap: 'var(--space-3)' } },
      lineRow('Goalkeeper', r.gk),
      lineRow('Defence', r.defence),
      lineRow('Midfield', r.midfield),
      lineRow('Attack', r.attack),
    ),
  );
}

function lineRow(label, value) {
  return h('div', null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '5px' } },
      h('span', { class: 'eyebrow' }, label),
      h('span', { class: 'mono', style: { fontSize: '12px' } }, value.toFixed(1)),
    ),
    meter(value / 90),
  );
}

// ---------------------------------------------------------------------------

function squadTable(world, you) {
  const inXI = new Set(you.lineup.map((l) => l.playerId));
  const order = { GK: 0, CB: 1, LB: 2, RB: 3, CDM: 4, CM: 5, CAM: 6, LW: 7, RW: 8, ST: 9 };
  const squad = [...you.squad].sort((a, b) => {
    const xi = (inXI.has(b.id) ? 1 : 0) - (inXI.has(a.id) ? 1 : 0);
    if (xi !== 0) return xi;
    if (order[a.position] !== order[b.position]) return order[a.position] - order[b.position];
    return b.overall - a.overall;
  });
  const avg = squadRating(you);

  return panel('Full squad',
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', null, h('tr', null,
          h('th', null, ''), h('th', null, 'Player'), h('th', null, 'Pos'),
          h('th', { class: 'num' }, 'Age'), h('th', { class: 'num' }, 'OVR'), h('th', null, 'POT'),
          h('th', null, 'Fit'), h('th', null, 'Morale'),
          h('th', { class: 'num' }, 'G'), h('th', { class: 'num' }, 'A'),
          h('th', { class: 'num' }, 'Wage'), h('th', { class: 'num' }, 'Contract'),
        )),
        h('tbody', null, ...squad.map((p) => {
          const pot = visiblePotential(you, p);
          const starting = inXI.has(p.id);
          return h('tr', {
            class: 'clickable' + (starting ? ' you' : ''),
            onclick: () => openPlayer(world, you, p),
          },
            h('td', null, starting ? h('span', { class: 'tag pitch' }, 'XI') : ''),
            h('td', { class: 'strong' },
              p.name,
              !isAvailable(p) ? h('span', { class: 'tag danger', style: { marginLeft: '6px' } }, `${p.injuredFor}w`) : null,
              p.academyGraduate ? h('span', { class: 'tag muted', style: { marginLeft: '6px' } }, 'Academy') : null,
            ),
            h('td', null, p.position),
            h('td', { class: 'num' }, p.age),
            h('td', { class: 'num' }, ratingPill(p.overall, { context: avg })),
            h('td', null, h('span', { class: 'pot-range' + (pot.exact ? ' exact' : '') },
              pot.exact ? pot.min : `${pot.min}–${pot.max}`)),
            h('td', null, conditionDot(p.fitness)),
            h('td', null, h('span', { style: { fontSize: '11.5px', color: moraleColour(p.morale) } }, moraleLabel(p.morale))),
            h('td', { class: 'num' }, p.seasonGoals),
            h('td', { class: 'num' }, p.seasonAssists),
            h('td', { class: 'num' }, money(p.wage)),
            h('td', { class: 'num' }, p.contractYears <= 0 ? h('span', { class: 'tag danger' }, 'Expired')
              : p.contractYears === 1 ? h('span', { class: 'tag' }, '1 yr') : `${p.contractYears} yrs`),
          );
        })),
      ),
    ),
  );
}

function conditionDot(fitness) {
  const tone = fitness >= 88 ? 'var(--pitch)' : fitness >= 70 ? 'var(--warn)' : 'var(--danger)';
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } },
    h('i', { style: { width: '6px', height: '6px', borderRadius: '50%', background: tone, display: 'inline-block' } }),
    h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--text-3)' } }, Math.round(fitness)),
  );
}

function moraleColour(m) {
  if (m >= 70) return 'var(--pitch)';
  if (m >= 45) return 'var(--text-2)';
  return 'var(--danger)';
}

// ---------------------------------------------------------------------------

export function openPlayer(world, club, player) {
  const pot = visiblePotential(club, player);
  const demand = renewalDemand(player);
  const attrs = ['pace', 'finishing', 'passing', 'tackling', 'physical', 'technique'];
  if (player.position === 'GK') attrs.push('handling', 'reflexes');

  openModal({
    title: player.name,
    wide: true,
    body: h('div', null,
      h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
        pill('Position', player.position),
        pill('Age', player.age),
        pill('Overall', Math.round(player.overall)),
        pill('Potential', pot.exact ? pot.min : `${pot.min}–${pot.max}`),
        pill('Value', money(player.value)),
        pill('Wage', money(player.wage) + '/wk'),
        pill('Contract', player.contractYears <= 0 ? 'Expired' : `${player.contractYears} yr`),
      ),

      h('p', { style: { color: 'var(--text-2)', fontSize: '13px', margin: '0 0 16px' } },
        `${player.archetype}. `,
        player.joinedFrom ? `Joined from ${player.joinedFrom}. ` : '',
        `${player.seasonApps} appearances this season, ${player.seasonGoals} goals and ${player.seasonAssists} assists.`,
        !isAvailable(player) ? ` Currently out for ${player.injuredFor} weeks (${player.injuryType}).` : '',
      ),

      h('div', { class: 'grid cols-2' }, ...attrs.map((a) =>
        h('div', null,
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
            h('span', { class: 'eyebrow' }, a),
            h('span', { class: 'mono', style: { fontSize: '12px' } }, Math.round(player.attributes[a])),
          ),
          meter(player.attributes[a] / 99, player.attributes[a] >= 75 ? '' : player.attributes[a] < 45 ? 'danger' : 'warn'),
        ),
      )),
    ),
    actions: [
      h('button', {
        class: 'btn',
        onclick: () => {
          const result = renewContract(club, player.id, demand.wage, demand.years);
          closeModal();
          if (result.ok) toast('Contract renewed', `${player.name} signs for ${money(demand.wage)}/wk`);
          else toast('Renewal failed', result.reasons[0], { tone: 'danger' });
          persist(); render();
        },
      }, `Renew · ${money(demand.wage)}/wk`),
      h('button', {
        class: 'btn danger',
        onclick: async () => {
          closeModal();
          const ok = await confirmDialog('Sell player?',
            `Sell ${player.name} for around ${money(player.value)}? Your squad will drop to ${club.squad.length - 1} players.`,
            'Sell');
          if (!ok) return;
          const result = sellPlayer(world, club, player.id, player.value);
          if (result.ok) toast('Player sold', `${player.name} leaves for ${money(player.value)}`, { tone: 'gold' });
          else toast('Cannot sell', result.reasons[0], { tone: 'danger' });
          persist(); render();
        },
      }, 'Sell'),
    ],
  });
}

function pill(k, v) {
  return h('div', null,
    h('div', { class: 'eyebrow' }, k),
    h('div', { class: 'mono', style: { fontSize: '15px' } }, v),
  );
}
