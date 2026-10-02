// How a battle ends.
//
// Two evenly matched armies grinding in midfield is a real attractor in this
// design, so there is a sudden-death valve: after a long stretch in which neither
// base has been touched, both start chipping until something gives.
//
// It watches base damage rather than kills on purpose. A deadlocked battle is
// full of kills - that is what a deadlock is - so a valve that waits for total
// inactivity never fires at all, which is exactly what the first version of this
// one did while a third of mirror battles ran to the clock. It is invented, and
// the harness reports how often it fires.

import { TUNING } from '../data/balance.js';

export function checkVictory(state) {
  if (state.over) return;

  const [a, b] = state.sides;
  const aDead = a.base.hp <= 0;
  const bDead = b.base.hp <= 0;
  if (aDead || bDead) {
    const winner = aDead && bDead ? (a.base.hp >= b.base.hp ? 0 : 1) : aDead ? 1 : 0;
    state.over = { winner, reason: 'base', time: state.time };
    return;
  }

  if (state.time - state.lastBaseDamage > TUNING.stalemateSeconds) {
    const chip = TUNING.stalemateChip;
    for (const side of state.sides) side.base.hp -= side.base.maxHp * chip * (1 / 60);
    state.stalemateChipped = true;
  }

  if (state.time >= TUNING.maxMatchSeconds) {
    const fa = a.base.hp / a.base.maxHp;
    const fb = b.base.hp / b.base.maxHp;
    state.over = { winner: fa >= fb ? 0 : 1, reason: 'timeout', time: state.time };
  }
}
