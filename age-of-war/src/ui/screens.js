// Title, pause, result, and the turret picker.
//
// These are the only places the game stops, so they are also the only places it
// can explain itself. The title screen carries the rules in four lines, because
// the original expected you to learn them by dying and there is no reason to
// inherit that.

import { clock, num } from '../core/format.js';
import { AGES, DIFFICULTY, turretsOfAge } from '../data/balance.js';
import { gold as fmtGold } from '../core/format.js';
import { turretPortrait } from '../render/scene.js';
import { h, mount } from './dom.js';

export function renderTitle(root, { profile, onStart }) {
  const unlocked = profile.impossibleUnlocked;

  const card = h('div', { class: 'screen-card title' },
    h('h1', {}, 'Age of War'),
    h('p', { class: 'lede' },
      'Send men down one lane. Kill theirs, take their gold and their experience, ',
      'and spend it on the next age before they spend it on you.'),
    h('ul', { class: 'rules' },
      h('li', {}, h('b', {}, 'Gold'), ' buys units and turrets. Kills pay it, and a trickle keeps you going.'),
      h('li', {}, h('b', {}, 'Experience'), ' buys the next age ', h('i', {}, 'or'), ' the special attack. Never both.'),
      h('li', {}, h('b', {}, 'Nothing overtakes'), ' the man in front. The lane is a queue, so a line that breaks is a line that loses.'),
      h('li', {}, h('b', {}, 'Five ages'), ', sixteen units, fifteen turrets. Flatten their base to win.')),
    h('div', { class: 'choices' },
      h('button', {
        class: 'action big', type: 'button', onclick: () => onStart('normal'),
      }, h('span', { class: 'action-name' }, 'Normal'),
        h('span', { class: 'action-sub' }, 'A fair fight')),
      h('button', {
        class: `action big ${unlocked ? '' : 'disabled'}`.trim(), type: 'button',
        title: unlocked ? 'The enemy starts an age ahead and earns more than twice your income' : 'Win once on Normal to unlock',
        onclick: () => unlocked && onStart('impossible'),
      }, h('span', { class: 'action-name' }, 'Impossible'),
        h('span', { class: 'action-sub' }, unlocked ? 'It starts an age ahead' : 'Win on Normal to unlock'))),
    statsLine(profile),
    h('p', { class: 'foot' },
      'Keys: ', h('kbd', {}, '1'), h('kbd', {}, '2'), h('kbd', {}, '3'), ' units, ',
      h('kbd', {}, 'Q'), h('kbd', {}, 'W'), h('kbd', {}, 'E'), h('kbd', {}, 'R'), ' turret slots, ',
      h('kbd', {}, 'V'), ' evolve, ', h('kbd', {}, 'S'), ' special, ', h('kbd', {}, 'Space'), ' pause.'),
  );

  mount(root, h('div', { class: 'screen' }, card));
  root.classList.add('on');
}

function statsLine(profile) {
  if (!profile.wins && !profile.losses) return null;
  const parts = [`${profile.wins} won`, `${profile.losses} lost`];
  for (const key of ['normal', 'impossible']) {
    if (profile.best[key]) parts.push(`best ${DIFFICULTY[key].name.toLowerCase()} ${clock(profile.best[key])}`);
  }
  return h('p', { class: 'stats' }, parts.join('  ·  '));
}

// ---------------------------------------------------------------------------

export function renderEnd(root, { state, won, difficulty, onAgain, onMenu, unlockedNow }) {
  const you = state.sides[0];
  const reason = state.over?.reason;
  const card = h('div', { class: `screen-card end ${won ? 'won' : 'lost'}` },
    h('h1', {}, won ? 'Victory' : 'Defeated'),
    h('p', { class: 'lede' },
      reason === 'timeout'
        ? 'Time ran out. The healthier base takes it.'
        : won ? 'Their base is rubble.' : 'Your base is rubble.'),
    unlockedNow ? h('p', { class: 'unlock' }, 'Impossible mode unlocked.') : null,
    h('dl', { class: 'result-stats' },
      stat('Time', clock(state.time)),
      stat('Age reached', AGES[you.age].name),
      stat('Units sent', num(state.stats.spawned[0])),
      stat('Kills', num(state.stats.killed[0])),
      stat('Gold earned', fmtGold(state.stats.goldEarned[0])),
      stat('Specials fired', num(state.stats.specialsFired[0]))),
    h('div', { class: 'choices' },
      h('button', { class: 'action big', type: 'button', onclick: onAgain },
        h('span', { class: 'action-name' }, 'Again'),
        h('span', { class: 'action-sub' }, DIFFICULTY[difficulty].name)),
      h('button', { class: 'action big ghost', type: 'button', onclick: onMenu },
        h('span', { class: 'action-name' }, 'Menu'),
        h('span', { class: 'action-sub' }, 'Change difficulty'))),
  );
  mount(root, h('div', { class: 'screen' }, card));
  root.classList.add('on');
}

function stat(key, value) {
  return h('div', { class: 'result-stat' }, h('dt', {}, key), h('dd', {}, value));
}

// ---------------------------------------------------------------------------

export function renderPause(root, { onResume, onQuit }) {
  mount(root, h('div', { class: 'screen' },
    h('div', { class: 'screen-card pause' },
      h('h1', {}, 'Paused'),
      h('div', { class: 'choices' },
        h('button', { class: 'action big', type: 'button', onclick: onResume },
          h('span', { class: 'action-name' }, 'Resume')),
        h('button', { class: 'action big ghost', type: 'button', onclick: onQuit },
          h('span', { class: 'action-name' }, 'Give up'))))));
  root.classList.add('on');
}

export function hideScreen(root) {
  root.classList.remove('on');
  mount(root);
}

// ---------------------------------------------------------------------------
// The turret picker: what an empty slot offers, at the age you are now.

export function openTurretPicker(host, side, slotIndex, onPick, onClose) {
  const list = turretsOfAge(side.age);
  const card = h('div', { class: 'picker' },
    h('div', { class: 'picker-head' },
      h('span', {}, `Slot ${slotIndex + 1}`),
      h('button', { class: 'chip', type: 'button', onclick: onClose }, 'Close')),
    h('div', { class: 'picker-row' }, list.map((def) => {
      const affordable = side.gold >= def.cost;
      const art = h('span', { class: 'tile-art' });
      art.appendChild(turretPortrait(def.key, side.age, 46));
      return h('button', {
        class: `tile turret ${affordable ? '' : 'disabled'}`.trim(), type: 'button',
        title: `${def.damage} damage every ${(1 / def.attackSpeed).toFixed(1)}s, ${def.range}px range${def.splash ? `, ${def.splash}px splash` : ''}`,
        onclick: () => affordable && onPick(def.key),
      }, art,
        h('span', { class: 'tile-name' }, def.name),
        h('span', { class: 'tile-cost' }, fmtGold(def.cost)));
    })),
  );
  mount(host, card);
  host.classList.add('on');
}

export function closePicker(host) {
  host.classList.remove('on');
  mount(host);
}
