// Turrets: static weapons mounted in the slots on your base.
//
// They only ever shoot the units walking at you. Neither base moves into the
// other's turret range, so a turret is purely defensive - which is what makes
// the turtle strategy every Impossible-mode guide recommends actually work.

import { TURRETS } from '../data/balance.js';
import { unitDef } from '../model/state.js';
import { fireAt } from './projectiles.js';
import { spendGold } from './economy.js';
import { splashDamage, damageUnit } from './combat.js';

export function buildTurret(side, slotIndex, key) {
  const def = TURRETS[key];
  const slot = side.slots[slotIndex];
  spendGold(side, def.cost);
  slot.turret = { key, reload: 0, buildT: def.buildTime, ready: false };
  return true;
}

export function sellTurret(side, slotIndex) {
  const slot = side.slots[slotIndex];
  if (!slot || !slot.turret) return false;
  side.gold += Math.floor(TURRETS[slot.turret.key].cost * 0.5);
  slot.turret = null;
  return true;
}

export function tickTurrets(state, dt) {
  for (const side of state.sides) {
    const foe = state.sides[1 - side.index];
    for (const slot of side.slots) {
      const t = slot.turret;
      if (!t) continue;
      if (!t.ready) {
        t.buildT -= dt;
        if (t.buildT > 0) continue;
        t.ready = true;
      }

      const def = TURRETS[t.key];
      t.reload -= dt;
      if (t.reload > 0) continue;

      const target = nearestInRange(foe, slot, def.range);
      if (!target) continue;

      t.reload = 1 / def.attackSpeed;

      if (def.attack.pierce) {
        // The Laser Cannon burns through the whole column rather than one unit.
        pierceLine(state, foe, slot, def);
        if (state.emitEvents) {
          state.events.push({
            type: 'beam', side: side.index, x0: slot.x, y0: slot.y,
            x1: target.x, y1: 440, life: def.attack.beam ?? 0.12, source: 'turret',
          });
        }
      } else {
        fireAt(state, side, def, { x: slot.x, y: slot.y }, target, foe, 'turret');
      }

      if (state.emitEvents) {
        state.events.push({ type: 'turretFire', side: side.index, slot: slot.index, key: t.key });
      }
    }
  }
}

// ---------------------------------------------------------------------------

function nearestInRange(foe, slot, range) {
  let best = null;
  let bestD = Infinity;
  for (const u of foe.units) {
    if (u.dead) continue;
    const d = Math.abs(u.x - slot.x) - unitDef(u).size.radius;
    if (d <= range && d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function pierceLine(state, foe, slot, def) {
  for (const u of foe.units) {
    if (u.dead) continue;
    if (Math.abs(u.x - slot.x) - unitDef(u).size.radius > def.range) continue;
    if (def.splash > 0) splashDamage(state, foe, u.x, def.splash, def.damage);
    else damageUnit(state, u, def.damage);
  }
}
