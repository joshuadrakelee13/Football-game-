// Damage, splash and death payouts.
//
// There is deliberately no randomness anywhere in combat - no crits, no misses,
// no damage rolls. Three reasons: the balance harness's variance then comes from
// decisions rather than dice, "why did my knight lose that fight" has an
// arithmetic answer, and the random stream stays stable when only art changes.

import { unitDef } from '../model/state.js';
import { compact } from '../core/ids.js';
import { award } from './economy.js';

export function damageUnit(state, victim, amount) {
  if (victim.dead) return 0;
  const dealt = Math.min(amount, victim.hp);
  victim.hp -= amount;
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.dead = true;          // flagged now, paid out once in resolveDeaths
  }
  if (state.emitEvents) {
    state.events.push({ type: 'hit', x: victim.x, yOff: victim.yOff, side: victim.side, amount: dealt });
  }
  return dealt;
}

export function damageBase(state, side, amount) {
  if (side.base.hp <= 0) return 0;
  const dealt = Math.min(amount, side.base.hp);
  side.base.hp -= dealt;
  state.lastActivity = state.time;
  state.lastBaseDamage = state.time;
  if (state.emitEvents) {
    state.events.push({ type: 'baseHit', side: side.index, amount: dealt, hp: side.base.hp, maxHp: side.base.maxHp });
  }
  return dealt;
}

// Splash hits everything of the target side within `radius` of the impact point.
// Columns are short (the unit cap is 20) so a straight scan is cheaper than any
// cleverness would be.
export function splashDamage(state, foe, x, radius, amount) {
  for (const u of foe.units) {
    if (u.dead) continue;
    const def = unitDef(u);
    if (Math.abs(u.x - x) > radius + def.size.radius) continue;
    damageUnit(state, u, amount);
  }
}

// ---------------------------------------------------------------------------

// Runs once per tick, after every source of damage. A unit killed by a turret
// shell and a sword blow in the same tick pays exactly one bounty, because
// `dead` is a flag and removal happens here rather than at the point of damage.
export function resolveDeaths(state) {
  for (const side of state.sides) {
    const foe = state.sides[1 - side.index];
    let any = false;
    for (const u of side.units) {
      if (!u.dead) continue;
      any = true;
      const def = unitDef(u);
      award(state, foe, def.goldValue, def.xpValue);
      state.stats.killed[foe.index]++;
      if (state.emitEvents) {
        state.events.push({
          type: 'death', x: u.x, yOff: u.yOff, key: u.key, side: u.side,
          gold: def.goldValue, xp: def.xpValue,
        });
      }
    }
    if (any) {
      state.lastActivity = state.time;
      compact(side.units);
    }
  }
}
