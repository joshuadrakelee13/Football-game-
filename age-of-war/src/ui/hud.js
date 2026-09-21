// The interface, as DOM on top of the canvas rather than drawn into it.
//
// Buttons that can be focused, hovered, disabled and read by a screen reader are
// things the DOM does properly and a canvas reimplements badly, and the original
// game's HUD was a static chrome bar anyway, so nothing is lost by keeping it out
// of the battlefield.
//
// The one place this bends the usual rebuild-everything rule: the HUD updates
// sixty times a second, and tearing it down that often would throw away focus and
// hover state on every frame. So it rebuilds only when the STRUCTURE changes -
// a new age, a new slot, a different turret - and otherwise writes text and
// widths into a handful of cached nodes.

import { gold as fmtGold, clock } from '../core/format.js';
import { AGES, TUNING, TURRETS, slotCost, specialOfAge, turretsOfAge } from '../data/balance.js';
import { buyableUnits, canBuySlot, canEvolve, canFireSpecial, canSpawn } from '../engine/actions.js';
import { unitPortrait, turretPortrait } from '../render/scene.js';
import { bar, h, mount } from './dom.js';

export function hudSignature(state) {
  const you = state.sides[0];
  return [
    you.age, you.slotsOwned, state.sides[1].age,
    you.slots.map((s) => (s.turret ? s.turret.key : '-')).join(','),
    you.secretUnlocked ? 'secret' : '',
  ].join('|');
}

export function buildHud(root, state, actions) {
  const you = state.sides[0];
  const foe = state.sides[1];
  const refs = { sig: hudSignature(state), unitTiles: [], slotTiles: [] };

  // ---- top strip --------------------------------------------------------
  refs.youHp = bar('hp you');
  refs.foeHp = bar('hp foe');
  refs.youHpText = h('span', { class: 'hp-text' });
  refs.foeHpText = h('span', { class: 'hp-text' });
  refs.gold = h('span', { class: 'res-value gold' });
  refs.xp = h('span', { class: 'res-value xp' });
  refs.ageName = h('span', { class: 'age-name' });
  refs.ageBar = bar('age');
  refs.ageText = h('span', { class: 'age-text' });
  refs.clock = h('span', { class: 'clock' });

  refs.speedBtn = h('button', {
    class: 'chip', type: 'button', title: 'Game speed',
    onclick: () => actions.cycleSpeed(),
  }, '1x');
  refs.pauseBtn = h('button', {
    class: 'chip', type: 'button', title: 'Pause (Space)',
    onclick: () => actions.togglePause(),
  }, 'Pause');

  const top = h('div', { class: 'hud-top' },
    h('div', { class: 'side-hp left' },
      h('span', { class: 'side-label' }, 'You'), refs.youHp.el, refs.youHpText),
    h('div', { class: 'centre' },
      h('div', { class: 'resources' },
        h('span', { class: 'res' }, h('span', { class: 'res-key' }, 'Gold'), refs.gold),
        h('span', { class: 'res' }, h('span', { class: 'res-key' }, 'XP'), refs.xp)),
      h('div', { class: 'age-block' }, refs.ageName, refs.ageBar.el, refs.ageText),
      h('div', { class: 'meta' }, refs.clock, refs.speedBtn, refs.pauseBtn)),
    h('div', { class: 'side-hp right' },
      h('span', { class: 'side-label' }, 'Enemy'), refs.foeHp.el, refs.foeHpText),
  );

  // ---- unit buy tiles ---------------------------------------------------
  const units = buyableUnits(you);
  const unitRow = h('div', { class: 'tile-row units' });
  units.forEach((def, i) => {
    const cost = h('span', { class: 'tile-cost' }, fmtGold(def.cost));
    const progress = h('i', { class: 'tile-progress' });
    const count = h('span', { class: 'tile-count' });
    const art = h('span', { class: 'tile-art' });
    art.appendChild(unitPortrait(def.key, 52));
    const el = h('button', {
      class: `tile unit ${def.role}`, type: 'button',
      title: `${def.name} - ${describeUnit(def)}`,
      onclick: () => actions.spawn(def.key),
      oncontextmenu: (e) => { e.preventDefault(); actions.cancelLast(def.key); },
    }, progress, art,
      h('span', { class: 'tile-name' }, def.name),
      cost, count,
      h('kbd', {}, String(i + 1)));
    refs.unitTiles.push({ el, def, cost, progress, count });
    unitRow.appendChild(el);
  });

  // ---- turret slots -----------------------------------------------------
  const slotRow = h('div', { class: 'tile-row slots' });
  you.slots.forEach((slot) => {
    const label = h('span', { class: 'tile-name' });
    const art = h('span', { class: 'tile-art' });
    const sub = h('span', { class: 'tile-cost' });
    const el = h('button', {
      class: 'tile slot', type: 'button',
      onclick: () => actions.slotClicked(slot.index),
      oncontextmenu: (e) => { e.preventDefault(); actions.sellTurret(slot.index); },
    }, art, label, sub, h('kbd', {}, 'QWER'[slot.index] ?? ''));
    refs.slotTiles.push({ el, slot, label, art, sub });
    slotRow.appendChild(el);
  });

  if (you.slotsOwned < TUNING.slotMax) {
    refs.buySlot = h('button', {
      class: 'tile slot add', type: 'button', title: 'Buy another turret slot',
      onclick: () => actions.buySlot(),
    }, h('span', { class: 'tile-art plus' }, '+'),
      h('span', { class: 'tile-name' }, 'Slot'),
      h('span', { class: 'tile-cost' }, fmtGold(slotCost(you.slotsOwned))));
    slotRow.appendChild(refs.buySlot);
  }

  // ---- evolve and special ----------------------------------------------
  refs.evolveBtn = h('button', {
    class: 'action evolve', type: 'button', onclick: () => actions.evolve(),
  }, h('span', { class: 'action-name' }, 'Evolve'), h('span', { class: 'action-sub' }));
  refs.evolveSub = refs.evolveBtn.querySelector('.action-sub');

  refs.specialBtn = h('button', {
    class: 'action special', type: 'button', onclick: () => actions.special(),
  }, h('i', { class: 'cooldown' }),
    h('span', { class: 'action-name' }),
    h('span', { class: 'action-sub' }));
  refs.specialCooldown = refs.specialBtn.querySelector('.cooldown');
  refs.specialName = refs.specialBtn.querySelector('.action-name');
  refs.specialSub = refs.specialBtn.querySelector('.action-sub');

  const bottom = h('div', { class: 'hud-bottom' },
    h('div', { class: 'group' }, h('span', { class: 'group-label' }, 'Units'), unitRow),
    h('div', { class: 'group' }, h('span', { class: 'group-label' }, 'Turrets'), slotRow),
    h('div', { class: 'group actions' }, refs.evolveBtn, refs.specialBtn),
  );

  mount(root, top, bottom);
  return refs;
}

// ---------------------------------------------------------------------------

export function patchHud(refs, state, ui) {
  const you = state.sides[0];
  const foe = state.sides[1];

  setBar(refs.youHp, you.base.hp / you.base.maxHp);
  setBar(refs.foeHp, foe.base.hp / foe.base.maxHp);
  refs.youHpText.textContent = `${Math.max(0, Math.ceil(you.base.hp)).toLocaleString('en-GB')}`;
  refs.foeHpText.textContent = `${Math.max(0, Math.ceil(foe.base.hp)).toLocaleString('en-GB')}`;

  refs.gold.textContent = fmtGold(you.gold);
  refs.xp.textContent = fmtGold(you.xp);
  refs.clock.textContent = clock(state.time);
  refs.speedBtn.textContent = `${ui.speed}x`;
  refs.pauseBtn.textContent = ui.paused ? 'Resume' : 'Pause';

  const age = AGES[you.age];
  refs.ageName.textContent = age.name;
  if (age.evolveCost) {
    setBar(refs.ageBar, you.xp / age.evolveCost);
    refs.ageText.textContent = `${fmtGold(you.xp)} / ${fmtGold(age.evolveCost)} XP`;
  } else {
    setBar(refs.ageBar, 1);
    refs.ageText.textContent = 'Final age';
  }

  for (const tile of refs.unitTiles) {
    const affordable = canSpawn(you, tile.def.key);
    tile.el.classList.toggle('disabled', !affordable);
    tile.el.classList.toggle('poor', you.gold < tile.def.cost);
    const queued = you.queue.filter((q) => q.key === tile.def.key).length;
    tile.count.textContent = queued > 0 ? String(queued) : '';
    tile.count.classList.toggle('on', queued > 0);
    const head = you.queue[0];
    const building = head && head.key === tile.def.key;
    tile.progress.style.transform = building
      ? `scaleY(${1 - head.remaining / head.total})`
      : 'scaleY(0)';
  }

  for (const tile of refs.slotTiles) {
    const slot = you.slots[tile.slot.index];
    if (slot && slot.turret) {
      const def = TURRETS[slot.turret.key];
      if (tile.shown !== slot.turret.key) {
        tile.shown = slot.turret.key;
        mount(tile.art, turretPortrait(slot.turret.key, you.age, 46));
      }
      tile.label.textContent = def.name;
      tile.sub.textContent = slot.turret.ready ? 'Sell' : 'Building';
      tile.el.classList.add('filled');
      tile.el.classList.toggle('building', !slot.turret.ready);
    } else {
      if (tile.shown !== null) { tile.shown = null; mount(tile.art); }
      tile.label.textContent = 'Empty';
      const cheapest = turretsOfAge(you.age)[0];
      tile.sub.textContent = cheapest ? `from ${fmtGold(cheapest.cost)}` : '';
      tile.el.classList.remove('filled', 'building');
    }
  }

  if (refs.buySlot) {
    refs.buySlot.classList.toggle('disabled', !canBuySlot(you));
  }

  const evolvable = canEvolve(you);
  refs.evolveBtn.classList.toggle('disabled', !evolvable);
  refs.evolveBtn.classList.toggle('ready', evolvable);
  refs.evolveSub.textContent = age.evolveCost
    ? (evolvable ? 'Ready' : `${fmtGold(age.evolveCost - you.xp)} XP to go`)
    : 'Final age';

  const special = specialOfAge(you.age);
  if (special) {
    const ready = canFireSpecial(you);
    refs.specialName.textContent = special.name;
    refs.specialSub.textContent = you.specialCooldown > 0
      ? `${Math.ceil(you.specialCooldown)}s`
      : `${fmtGold(special.xpCost)} XP`;
    refs.specialBtn.classList.toggle('disabled', !ready);
    refs.specialBtn.classList.toggle('ready', ready);
    refs.specialCooldown.style.transform = `scaleX(${you.specialCooldown / special.cooldown})`;
  }
}

function setBar(b, frac) {
  const v = Math.max(0, Math.min(1, frac));
  b.fill.style.transform = `scaleX(${v})`;
  b.el.classList.toggle('low', v < 0.3);
}

function describeUnit(def) {
  const kind = def.attack.kind === 'melee' ? 'melee' : `ranged (${def.range}px)`;
  return `${def.hp} hp, ${def.damage} damage, ${kind}, ${def.buildTime}s to build`;
}
