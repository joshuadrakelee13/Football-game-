// The age special: one button that clears the field.
//
// It is paid for in experience, out of the same pool that buys the next age, and
// that competition is the strategic core of the game. Firing it into a big crowd
// pays most of its cost straight back in kill bounties, which is exactly why
// every walkthrough tells you to hold it until the line is stacked.
//
// Specials never touch the base. Only units.

import { specialOfAge } from '../data/balance.js';
import { damageUnit } from './combat.js';
import { spendXp } from './economy.js';

export function fireSpecial(state, side) {
  const special = specialOfAge(side.age);
  if (!special || side.specialCooldown > 0 || side.xp < special.xpCost) return false;

  spendXp(side, special.xpCost);
  side.specialCooldown = special.cooldown;
  state.stats.specialsFired[side.index]++;

  // The telegraph is a real delay, not decoration: the enemy keeps walking while
  // the meteors fall, so a special fired too early catches nothing.
  state.specials.push({
    side: side.index,
    key: special.key,
    damage: special.damage,
    remaining: special.telegraph,
  });

  if (state.emitEvents) {
    state.events.push({ type: 'special', side: side.index, key: special.key, telegraph: special.telegraph });
  }
  return true;
}

export function tickSpecials(state, dt) {
  for (const side of state.sides) {
    if (side.specialCooldown > 0) side.specialCooldown = Math.max(0, side.specialCooldown - dt);
  }

  if (state.specials.length === 0) return;
  let any = false;
  for (const s of state.specials) {
    s.remaining -= dt;
    if (s.remaining > 0) continue;
    s.done = true;
    any = true;
    const foe = state.sides[1 - s.side];
    for (const u of foe.units) {
      if (u.dead) continue;
      damageUnit(state, u, s.damage);
    }
    if (state.emitEvents) state.events.push({ type: 'specialLand', side: s.side, key: s.key });
  }
  if (any) state.specials = state.specials.filter((s) => !s.done);
}
