// Gold, experience, and the two things experience buys.
//
// The passive trickle is invented. The original never leaves you permanently
// broke with an empty field and no way back, and without a floor the loser of
// the first engagement simply stops being able to play.

import { AGES, DIFFICULTY, TUNING, evolveCost } from '../data/balance.js';
import { makeSlot } from '../model/state.js';

export function tickEconomy(state, dt) {
  for (const side of state.sides) {
    const mul = side.isAi ? (DIFFICULTY[side.profile]?.trickleMul ?? 1) : 1;
    const rate = (AGES[side.age].trickle + TUNING.trickleBase) * mul;
    side.gold += rate * dt;
  }
}

// Every bounty in the game goes through here, so the difficulty multiplier and
// the stats ledger are applied in exactly one place.
export function award(state, side, gold, xp) {
  const mul = side.isAi ? (DIFFICULTY[side.profile]?.killMul ?? 1) : 1;
  const g = gold * mul;
  side.gold += g;
  side.xp += xp;
  state.stats.goldEarned[side.index] += g;
  state.stats.xpEarned[side.index] += xp;
}

export function spendGold(side, amount) {
  side.gold -= amount;
  if (side.gold < 0) side.gold = 0;
}

export function spendXp(side, amount) {
  side.xp -= amount;
  side.xpSpent += amount;
  if (side.xp < 0) side.xp = 0;
}

// Evolving spends the experience rather than merely requiring it, which is what
// puts it in direct competition with the special attack.
export function evolve(state, side) {
  const cost = evolveCost(side.age);
  if (cost === null || side.xp < cost) return false;
  spendXp(side, cost);
  side.age++;

  // Base HP rescales proportionally. A full heal would make evolving a panic
  // button, which it is not in the original.
  const ratio = side.base.hp / side.base.maxHp;
  side.base.maxHp = AGES[side.age].baseHp;
  side.base.hp = side.base.maxHp * ratio;

  side.specialCooldown = 0;
  state.stats.evolvedAt[side.index].push(state.time);
  if (state.emitEvents) state.events.push({ type: 'evolve', side: side.index, age: side.age });
  return true;
}

export function buySlot(side) {
  const cost = TUNING.slotCosts[side.slotsOwned];
  if (side.slotsOwned >= TUNING.slotMax || side.gold < cost) return false;
  spendGold(side, cost);
  side.slots.push(makeSlot(side.slotsOwned, side.index));
  side.slotsOwned++;
  return true;
}
