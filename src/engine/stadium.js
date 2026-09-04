// Stadium expansion. Each step costs more and returns more, and the upkeep rises
// with it, so building too early genuinely hurts.

export const STADIUM_TIERS = [
  { capacity: 2000,  cost: 0,           label: 'Non-league ground' },
  { capacity: 3000,  cost: 320_000,     label: 'Small terraced ground' },
  { capacity: 5000,  cost: 850_000,     label: 'Modest all-seater' },
  { capacity: 8000,  cost: 2_100_000,   label: 'Lower-league stadium' },
  { capacity: 12000, cost: 4_800_000,   label: 'Established stadium' },
  { capacity: 20000, cost: 11_500_000,  label: 'Championship-grade ground' },
  { capacity: 35000, cost: 32_000_000,  label: 'Major stadium' },
  { capacity: 60000, cost: 95_000_000,  label: 'Elite arena' },
];

export function currentTier(capacity) {
  let found = STADIUM_TIERS[0];
  for (const tier of STADIUM_TIERS) if (capacity >= tier.capacity) found = tier;
  return found;
}

export function nextTier(capacity) {
  return STADIUM_TIERS.find((t) => t.capacity > capacity) || null;
}

export function canExpand(club) {
  const next = nextTier(club.stadiumCapacity);
  if (!next) return { ok: false, reason: 'The ground is already at its maximum size' };
  if (club.balance < next.cost) return { ok: false, reason: 'Not enough money in the bank', next };
  return { ok: true, next };
}
