// Integrity. Does the same seed produce the same battle, and do the rules the
// rest of the game leans on actually hold on every single tick?
//
// The front-line invariant is the important one. A side's unit array is supposed
// to stay sorted from the front of the column to the back for the entire battle,
// because nothing can overtake the ally in front of it - and half the engine
// treats units[0] as "the front line" on the strength of that. If it ever breaks,
// movement has a bug, and this is what catches it.

import { Rng } from '../src/core/rng.js';
import { LANE, TUNING } from '../src/data/balance.js';
import { createState, hashState, unitDef } from '../src/model/state.js';
import { DT, step } from '../src/engine/step.js';
import { tickAi } from '../src/engine/ai.js';

const SEEDS = Number(process.env.SEEDS || 20);
const TICKS = Number(process.env.TICKS || 40000);

let hashMismatch = 0;
let callMismatch = 0;
let sortViolations = 0;
let overtakes = 0;
let nanFields = 0;
let negativeResources = 0;
let capViolations = 0;
let outOfBounds = 0;
let deadLeftOver = 0;
let totalTicks = 0;

for (let s = 0; s < SEEDS; s++) {
  const seed = 9001 + s * 613;

  const a = play(seed, TICKS, true);
  const b = play(seed, TICKS, false);

  if (a.hash !== b.hash) hashMismatch++;
  if (a.calls !== b.calls) callMismatch++;
  sortViolations += a.sortViolations;
  overtakes += a.overtakes;
  nanFields += a.nanFields;
  negativeResources += a.negativeResources;
  capViolations += a.capViolations;
  outOfBounds += a.outOfBounds;
  deadLeftOver += a.deadLeftOver;
  totalTicks += a.ticks;
}

function play(seed, ticks, audit) {
  const rng = new Rng(seed);
  const state = createState({ seed, difficulty: 'normal' });
  state.emitEvents = false;
  state.sides[0].isAi = true;
  state.sides[0].profile = 'normal';

  const out = {
    sortViolations: 0, overtakes: 0, nanFields: 0,
    negativeResources: 0, capViolations: 0, outOfBounds: 0, deadLeftOver: 0, ticks: 0,
  };

  const minX = Math.min(LANE.base[0].frontX, LANE.base[1].frontX) - 40;
  const maxX = Math.max(LANE.base[0].frontX, LANE.base[1].frontX) + 40;

  while (!state.over && state.tick < ticks) {
    step(state, DT, rng);
    out.ticks++;
    if (!audit) continue;

    for (const side of state.sides) {
      if (side.gold < -1e-6 || side.xp < -1e-6) out.negativeResources++;
      if (side.units.length > TUNING.unitCap) out.capViolations++;

      let prev = null;
      for (const u of side.units) {
        if (u.dead) out.deadLeftOver++;
        if (!Number.isFinite(u.x) || !Number.isFinite(u.hp)) out.nanFields++;
        if (u.x < minX || u.x > maxX) out.outOfBounds++;

        if (prev) {
          // Sorted front to back, in this side's marching direction.
          const aheadOfMe = side.dir > 0 ? prev.x >= u.x - 1e-6 : prev.x <= u.x + 1e-6;
          if (!aheadOfMe) out.sortViolations++;

          // And never standing inside the ally in front.
          const need = unitDef(prev).size.radius + unitDef(u).size.radius;
          if (Math.abs(prev.x - u.x) < need - 1) out.overtakes++;
        }
        prev = u;
      }
    }
  }

  return { hash: hashState(state), calls: rng.calls, ...out };
}

// ---------------------------------------------------------------------------

console.log(`\n  Age of War - integrity over ${SEEDS} battles, ${totalTicks.toLocaleString('en-GB')} ticks\n`);

const checks = [];
checks.push(['same seed, same battle', hashMismatch === 0, `${SEEDS - hashMismatch}/${SEEDS} identical`]);
checks.push(['same seed, same random draws', callMismatch === 0, `${SEEDS - callMismatch}/${SEEDS} identical`]);
checks.push(['columns stay sorted front to back', sortViolations === 0, String(sortViolations)]);
checks.push(['no unit overtakes the ally in front', overtakes === 0, String(overtakes)]);
checks.push(['no unit leaves the lane', outOfBounds === 0, String(outOfBounds)]);
checks.push(['no NaN or Infinity in any unit', nanFields === 0, String(nanFields)]);
checks.push(['gold and experience never go negative', negativeResources === 0, String(negativeResources)]);
checks.push(['unit cap respected', capViolations === 0, String(capViolations)]);
checks.push(['dead units removed every tick', deadLeftOver === 0, String(deadLeftOver)]);

let failed = 0;
for (const [label, ok, value] of checks) {
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(40)} ${value}`);
}
console.log('');
if (failed) {
  console.log(`  ${failed} check${failed === 1 ? '' : 's'} failed\n`);
  process.exit(1);
}
console.log('  The simulation is sound.\n');
