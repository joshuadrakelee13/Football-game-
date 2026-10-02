// Pure validators and pricers for everything a side can do.
//
// The HUD greys a button out with these and the intent layer enforces with the
// same calls, so what the player is offered and what the game allows can never
// drift apart.

import { AGES, TUNING, UNITS, evolveCost, slotCost, specialOfAge, turretsOfAge, unitsOfAge } from '../data/balance.js';

export function buyableUnits(side) {
  const list = unitsOfAge(side.age);
  if (side.age === AGES.length - 1 && side.secretUnlocked) list.push(UNITS.super_soldier);
  return list;
}

export function canSpawn(side, key) {
  const def = UNITS[key];
  if (!def) return false;
  if (def.age !== side.age) return false;
  if (def.playerOnly && side.isAi) return false;
  if (def.role === 'secret' && !side.secretUnlocked) return false;
  if (side.queue.length >= TUNING.queueCap) return false;
  if (side.units.length + side.queue.length >= TUNING.unitCap) return false;
  return side.gold >= def.cost;
}

export function canEvolve(side) {
  const cost = evolveCost(side.age);
  return cost !== null && side.xp >= cost;
}

export function canBuySlot(side) {
  if (side.slotsOwned >= TUNING.slotMax) return false;
  return side.gold >= slotCost(side.slotsOwned);
}

export function canBuyTurret(side, key, slotIndex) {
  const def = turretsOfAge(side.age).find((t) => t.key === key);
  if (!def) return false;
  const slot = side.slots[slotIndex];
  if (!slot || slot.turret) return false;
  return side.gold >= def.cost;
}

export function canSellTurret(side, slotIndex) {
  const slot = side.slots[slotIndex];
  return Boolean(slot && slot.turret);
}

export function canFireSpecial(side) {
  const special = specialOfAge(side.age);
  if (!special) return false;
  if (side.specialCooldown > 0) return false;
  return side.xp >= special.xpCost;
}

export { slotCost, evolveCost, specialOfAge };
