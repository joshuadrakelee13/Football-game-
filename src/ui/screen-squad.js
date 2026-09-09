// Squad: the starting XI on a pitch, the formation picker, and the full squad list.

import { h, clubChip, ratingPill, meter, attrBadge, panel, emptyState } from './dom.js';
import { money, num } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { FORMATIONS, FORMATION_KEYS, positionFit, ROLE_OPTIONS, ROLE_LABELS, DUTY_OPTIONS } from '../data/positions.js';
import { pickBestXI, lineupPlayers, benchPlayers, squadRating, weeklyWages, teamRatings } from '../model/club.js';
import { moraleLabel, isAvailable, effectiveRating } from '../model/player.js';
import { renewalDemand, renewContract, sellPlayer } from '../engine/transfers.js';
import { visiblePotential } from '../engine/scouting.js';
import { DIAL_KEYS, DIAL_LABELS, dialLevelLabel } from '../data/tactics.js';
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
        tacticsPanel(you),
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
        h('div', { class: 'pitch-lines' },
          h('i', { class: 'box top' }),
          h('i', { class: 'box bottom' }),
        ),
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
            onclick: () => openPlayer(world, you, entry.player, entry.slot),
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

// The whole point of this panel: teamRatings(you) below already renders live off
// club.tactics, so moving a slider here and watching linesPanel's meters shift is
// the cheapest, most direct proof a lever is real — visible before a match is played.
function tacticsPanel(you) {
  return panel('Tactics',
    h('div', { class: 'panel-body', style: { display: 'grid', gap: 'var(--space-4)' } },
      ...DIAL_KEYS.map((key) => dialRow(you, key)),
      oppositionFocusRow(you),
    ),
  );
}

function dialRow(you, key) {
  const value = you.tactics[key];
  const label = DIAL_LABELS[key];
  return h('div', null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' } },
      h('span', { class: 'eyebrow' }, label.name),
      h('span', { class: 'mono', style: { fontSize: '11.5px', color: 'var(--text-2)' } }, dialLevelLabel(key, value)),
    ),
    h('div', { class: 'formation-picker' }, ...[-2, -1, 0, 1, 2].map((v) =>
      h('button', {
        class: 'formation-option' + (value === v ? ' active' : ''),
        style: { minWidth: '36px', textAlign: 'center' },
        onclick: () => { you.tactics[key] = v; persist(); render(); },
      }, v > 0 ? '+' + v : String(v)),
    )),
  );
}

function oppositionFocusRow(you) {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' } },
    h('div', { style: { minWidth: 0 } },
      h('div', { style: { fontWeight: 500, fontSize: '13px' } }, 'Opposition focus'),
      h('div', { style: { color: 'var(--text-3)', fontSize: '11.5px' } },
        'Mark their best player tighter — costs a little of your own defensive shape.'),
    ),
    h('button', {
      class: 'btn sm ' + (you.tactics.oppositionFocus ? 'primary' : 'ghost'),
      onclick: () => { you.tactics.oppositionFocus = !you.tactics.oppositionFocus; persist(); render(); },
    }, you.tactics.oppositionFocus ? 'On' : 'Off'),
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
          const slot = starting ? you.lineup.find((l) => l.playerId === p.id)?.slot : null;
          return h('tr', {
            class: 'clickable' + (starting ? ' you' : ''),
            onclick: () => openPlayer(world, you, p, slot),
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

export function openPlayer(world, club, player, slot = null) {
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

      slot ? rolePicker(world, club, player, slot) : null,

      h('div', { class: 'attr-list grid cols-2' }, ...attrs.map((a) =>
        h('div', { class: 'attr-row' },
          h('span', { class: 'name' }, a),
          attrBadge(player.attributes[a]),
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

// Only shown for a player currently in the starting XI — role/duty are meaningful
// relative to the slot he's actually playing, and ROLE_OPTIONS is keyed by slot.
function rolePicker(world, club, player, slot) {
  const roles = ROLE_OPTIONS[slot] || [];
  const current = club.playerTactics[player.id] || { role: null, duty: 'support' };

  const apply = (patch) => {
    club.playerTactics[player.id] = { ...current, ...patch };
    club.lineup = pickBestXI(club);
    persist();
    render();
    openPlayer(world, club, player, slot); // refresh the modal in place with the new state
  };

  return h('div', { style: { marginBottom: 'var(--space-4)', display: 'grid', gap: '12px' } },
    h('div', null,
      h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Role'),
      h('div', { class: 'formation-picker' },
        h('button', {
          class: 'formation-option' + (!current.role ? ' active' : ''),
          onclick: () => apply({ role: null }),
        }, 'Natural'),
        ...roles.map((role) => h('button', {
          class: 'formation-option' + (current.role === role ? ' active' : ''),
          onclick: () => apply({ role }),
        }, ROLE_LABELS[role])),
      ),
    ),
    // A goalkeeper's duty is a structural no-op (see ADJACENT_LINE in positions.js) —
    // omitted rather than shown as buttons that would silently do nothing.
    slot !== 'GK' ? h('div', null,
      h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Duty'),
      h('div', { class: 'formation-picker' },
        ...DUTY_OPTIONS.map((duty) => h('button', {
          class: 'formation-option' + (current.duty === duty ? ' active' : ''),
          onclick: () => apply({ duty }),
        }, duty[0].toUpperCase() + duty.slice(1))),
      ),
    ) : null,
  );
}

function pill(k, v) {
  return h('div', null,
    h('div', { class: 'eyebrow' }, k),
    h('div', { class: 'mono', style: { fontSize: '15px' } }, v),
  );
}
