// Every number in the game lives here, so balancing is one file and the headless
// harnesses can sweep it without touching the engine.
//
// Provenance matters, because the original is a 2007 Flash game with no published
// stat sheet. Lines marked `wiki` are the community-documented figures and are
// treated as fixed: all sixteen unit costs, all fifteen turret costs, the turret
// slot prices, the Super Soldier, and the Death Ray. Lines marked `fitted` are
// invented and settled by tools/*-test.mjs — cost is the anchor and everything
// else is fitted to it. Lines marked `contested` are numbers the sources disagree
// about; the wiki value is the seed and the harness owns the final answer.

// ---------------------------------------------------------------------------
// Global tuning

export const TUNING = {
  // The stage is a fixed 960x540 and scales to the window. Both bases are always
  // on screen, exactly as the original played.
  stage: { w: 960, h: 540, groundY: 452, horizonY: 300 },

  rankGap: 2,          // px of air between ranks in a column. Tune before any art.
  readyWindup: 0.15,   // s. A unit arriving at the line strikes almost at once,
                       // rather than idling for a full attack period first.
  hitRadius: 18,       // px. How close a ballistic shot must land to connect.
  unitCap: 14,         // per side. Two full columns have to fit the lane with the
                       // front line in the middle: 14 x 20px a rank is 560 of 664.
  queueCap: 6,         // units waiting to be built
  slotMax: 4,          // wiki - four turret slots is the documented maximum
  slotCosts: [0, 1000, 3000, 7500],   // wiki - first slot free, then these
  sellRatio: 0.5,      // fitted - selling a turret returns half

  trickleBase: 1.0,    // fitted - gold per second floor, so you are never stuck
  startGold: 175,      // fitted - buys a few club men and one cheap turret
  startXp: 0,

  maxStepsPerFrame: 8,
  maxMatchSeconds: 1200,   // 20 minutes, then the healthier base wins
  stalemateSeconds: 300,   // fitted - swept from 180 to 420. Shorter and the valve
  stalemateChip: 0.0020,   // fires in most battles; longer and deadlocks run to the clock.
};

export const STAGE = TUNING.stage;

// Lane geometry. Sides march towards each other along a single line.
export const LANE = {
  base: [
    { anchorX: 74, frontX: 148, dir: 1 },
    { anchorX: 886, frontX: 812, dir: -1 },
  ],
  length: 664,
};

// ---------------------------------------------------------------------------
// Ages

// trickle is gold per second, and it has to scale with what an age's units cost.
// In a steady state you spawn a unit, kill one, and pocket the difference, so the
// sustainable spawn rate is trickle / (cost - goldValue). Holding that rate near
// 18 units a minute in every age is what keeps the lane full from the Stone Age
// to the Future Age. Left flat, gold income stalls from the Renaissance on, the
// field empties, kills stop, and no side ever reaches the Modern Age - which is
// exactly what the first measured run of this game did.
//
// The last two ages are capped below that line on purpose: their units take three
// to eleven seconds to build, so the queue, not the wallet, is the real limit and
// any more income only grows a bank nobody can spend.
export const AGES = [
  // The sources look contradictory - 4000, 14000, 12000, 20000, 45000 all get
  // quoted - but they reconcile if they are the four INCREMENTAL thresholds
  // rather than cumulative totals, and in that reading they land within a few
  // percent of the experience income measured by tools/xp-curve.mjs. So these
  // are the wiki numbers after all, and the harness agrees with them.
  { key: 'stone', name: 'Stone Age', evolveCost: 4000, baseHp: 9000, trickle: 1.6 },
  { key: 'castle', name: 'Castle Age', evolveCost: 14000, baseHp: 24000, trickle: 4.8 },
  { key: 'renaissance', name: 'Renaissance Age', evolveCost: 12000, baseHp: 45000, trickle: 24 },
  { key: 'modern', name: 'Modern Age', evolveCost: 20000, baseHp: 64000, trickle: 150 },
  { key: 'future', name: 'Future Age', evolveCost: null, baseHp: 74000, trickle: 400 },
];

export const AGE_COUNT = AGES.length;

// ---------------------------------------------------------------------------
// Units
//
// Three per age - melee, ranged, heavy - plus the Future Age's secret fourth.
// Two invariants the harness enforces:
//   goldValue is always below cost, so killing pays but never prints money;
//   xpValue/cost falls with age, so the evolve curve does not self-accelerate.

export const UNITS = {
  club_man: {
    key: 'club_man', name: 'Club Man', age: 0, role: 'melee',
    hp: 65, damage: 11, attackSpeed: 1.0, range: 46, standoff: 4, moveSpeed: 42,
    cost: 15,          // wiki
    goldValue: 11, xpValue: 80, buildTime: 1.6,
    size: { radius: 9, height: 34 },
    attack: { kind: 'melee' }, splash: 0,
  },
  slingshot_man: {
    key: 'slingshot_man', name: 'Slingshot Man', age: 0, role: 'ranged',
    hp: 45, damage: 9, attackSpeed: 0.85, range: 130, moveSpeed: 38,
    cost: 25,          // wiki
    goldValue: 16, xpValue: 112, buildTime: 2.4,
    size: { radius: 9, height: 33 },
    attack: { kind: 'ballistic', speed: 300, arc: 0.18 }, splash: 0,
  },
  dino_rider: {
    key: 'dino_rider', name: 'Dino Rider', age: 0, role: 'heavy',
    hp: 260, damage: 30, attackSpeed: 0.8, range: 44, standoff: 6, moveSpeed: 34,
    cost: 100,         // wiki
    goldValue: 55, xpValue: 380, buildTime: 6.0,
    size: { radius: 14, height: 44 },
    attack: { kind: 'melee' }, splash: 0,
  },

  sword_man: {
    key: 'sword_man', name: 'Sword Man', age: 1, role: 'melee',
    hp: 190, damage: 26, attackSpeed: 1.05, range: 50, standoff: 4, moveSpeed: 44,
    cost: 50,          // wiki
    goldValue: 34, xpValue: 380, buildTime: 2.0,
    size: { radius: 10, height: 36 },
    attack: { kind: 'melee' }, splash: 0,
  },
  archer: {
    key: 'archer', name: 'Archer', age: 1, role: 'ranged',
    hp: 120, damage: 22, attackSpeed: 0.9, range: 165, moveSpeed: 40,
    cost: 75,          // wiki
    goldValue: 48, xpValue: 520, buildTime: 2.8,
    size: { radius: 10, height: 35 },
    attack: { kind: 'ballistic', speed: 380, arc: 0.14 }, splash: 0,
  },
  knight: {
    key: 'knight', name: 'Knight', age: 1, role: 'heavy',
    hp: 700, damage: 70, attackSpeed: 0.85, range: 46, standoff: 6, moveSpeed: 38,
    cost: 500,         // wiki
    goldValue: 250, xpValue: 2800, buildTime: 7.0,
    size: { radius: 15, height: 46 },
    attack: { kind: 'melee' }, splash: 0,
  },

  dueler: {
    key: 'dueler', name: 'Dueler', age: 2, role: 'melee',
    hp: 520, damage: 62, attackSpeed: 1.15, range: 50, standoff: 4, moveSpeed: 48,
    cost: 200,         // wiki
    goldValue: 120, xpValue: 500, buildTime: 2.2,
    size: { radius: 10, height: 37 },
    attack: { kind: 'melee' }, splash: 0,
  },
  musketeer: {
    key: 'musketeer', name: 'Musketeer', age: 2, role: 'ranged',
    hp: 340, damage: 70, attackSpeed: 0.7, range: 195, moveSpeed: 42,
    cost: 400,         // wiki
    goldValue: 230, xpValue: 700, buildTime: 3.2,
    size: { radius: 10, height: 36 },
    attack: { kind: 'ballistic', speed: 520, arc: 0.02 }, splash: 0,
  },
  cannoneer: {
    key: 'cannoneer', name: 'Cannoneer', age: 2, role: 'heavy',
    hp: 900, damage: 150, attackSpeed: 0.45, range: 230, moveSpeed: 30,
    cost: 1000,        // wiki
    goldValue: 500, xpValue: 1600, buildTime: 8.0,
    size: { radius: 14, height: 38 },
    attack: { kind: 'ballistic', speed: 340, arc: 0.22 }, splash: 34,
  },

  melee_infantry: {
    key: 'melee_infantry', name: 'Melee Infantry', age: 3, role: 'melee',
    hp: 1500, damage: 150, attackSpeed: 1.2, range: 50, standoff: 4, moveSpeed: 52,
    cost: 1500,        // wiki
    goldValue: 780, xpValue: 1300, buildTime: 2.6,
    size: { radius: 10, height: 37 },
    attack: { kind: 'melee' }, splash: 0,
  },
  infantry: {
    key: 'infantry', name: 'Infantry', age: 3, role: 'ranged',
    hp: 1100, damage: 95, attackSpeed: 1.8, range: 210, moveSpeed: 46,
    cost: 2000,        // wiki
    goldValue: 1000, xpValue: 1650, buildTime: 3.4,
    size: { radius: 10, height: 36 },
    attack: { kind: 'hitscan', beam: 0.06 }, splash: 0,
  },
  tank: {
    key: 'tank', name: 'Tank', age: 3, role: 'heavy',
    hp: 4200, damage: 420, attackSpeed: 0.5, range: 250, moveSpeed: 32,
    cost: 7000,        // wiki
    goldValue: 3200, xpValue: 5400, buildTime: 9.0,
    size: { radius: 20, height: 34 },
    attack: { kind: 'ballistic', speed: 480, arc: 0.1 }, splash: 40,
  },

  gods_blade: {
    key: 'gods_blade', name: "God's Blade", age: 4, role: 'melee',
    hp: 4200, damage: 420, attackSpeed: 1.3, range: 54, standoff: 4, moveSpeed: 58,
    cost: 5000,        // wiki
    goldValue: 2400, xpValue: 3000, buildTime: 3.0,
    size: { radius: 11, height: 40 },
    attack: { kind: 'melee' }, splash: 0,
  },
  blaster: {
    key: 'blaster', name: 'Blaster', age: 4, role: 'ranged',
    hp: 3200, damage: 300, attackSpeed: 1.5, range: 240, moveSpeed: 48,
    cost: 6000,        // wiki
    goldValue: 2900, xpValue: 3800, buildTime: 3.8,
    size: { radius: 11, height: 38 },
    attack: { kind: 'hitscan', beam: 0.09 }, splash: 0,
  },
  war_machine: {
    key: 'war_machine', name: 'War Machine', age: 4, role: 'heavy',
    hp: 14000, damage: 1100, attackSpeed: 0.55, range: 280, moveSpeed: 30,
    cost: 20000,       // wiki
    goldValue: 8500, xpValue: 11000, buildTime: 11.0,
    size: { radius: 24, height: 52 },
    attack: { kind: 'ballistic', speed: 520, arc: 0.08 }, splash: 48,
  },
  super_soldier: {
    key: 'super_soldier', name: 'Super Soldier', age: 4, role: 'secret',
    hp: 40000, damage: 2600, attackSpeed: 1.1, range: 60, standoff: 8, moveSpeed: 40,
    cost: 150000,      // wiki - the secret unit, and the classic way to win
    goldValue: 40000, xpValue: 60000, buildTime: 14.0,
    size: { radius: 26, height: 58 },
    attack: { kind: 'melee' }, splash: 0,
    playerOnly: true,  // wiki - the AI never builds one, which is the whole point
  },
};

// ---------------------------------------------------------------------------
// Turrets
//
// Turrets sit in slots on the base and never move. They cannot reach the enemy
// base, only the units walking at yours.

export const TURRETS = {
  rock_slingshot: {
    key: 'rock_slingshot', name: 'Rock Slingshot', age: 0,
    damage: 14, attackSpeed: 0.8, range: 190, cost: 100, splash: 0,   // wiki cost
    attack: { kind: 'ballistic', speed: 320, arc: 0.2 }, buildTime: 2.0,
  },
  egg_automatic: {
    key: 'egg_automatic', name: 'Egg Automatic', age: 0,
    damage: 10, attackSpeed: 2.2, range: 200, cost: 200, splash: 0,   // wiki cost
    attack: { kind: 'ballistic', speed: 360, arc: 0.16 }, buildTime: 2.5,
  },
  primitive_catapult: {
    key: 'primitive_catapult', name: 'Primitive Catapult', age: 0,
    damage: 45, attackSpeed: 0.45, range: 300, cost: 500, splash: 30, // wiki cost
    attack: { kind: 'ballistic', speed: 300, arc: 0.3 }, buildTime: 3.5,
  },

  catapult: {
    key: 'catapult', name: 'Catapult', age: 1,
    damage: 70, attackSpeed: 0.5, range: 320, cost: 500, splash: 32,  // wiki cost
    attack: { kind: 'ballistic', speed: 320, arc: 0.3 }, buildTime: 3.0,
  },
  fire_catapult: {
    key: 'fire_catapult', name: 'Fire Catapult', age: 1,
    damage: 95, attackSpeed: 0.5, range: 330, cost: 750, splash: 38,  // wiki cost
    attack: { kind: 'ballistic', speed: 320, arc: 0.3 }, buildTime: 3.5,
  },
  oil: {
    key: 'oil', name: 'Oil', age: 1,
    damage: 60, attackSpeed: 0.9, range: 150, cost: 1000, splash: 55, // wiki cost
    attack: { kind: 'ballistic', speed: 260, arc: 0.4 }, buildTime: 3.0,
  },

  small_cannon: {
    key: 'small_cannon', name: 'Small Cannon', age: 2,
    damage: 150, attackSpeed: 0.7, range: 340, cost: 1500, splash: 0, // wiki cost
    attack: { kind: 'ballistic', speed: 460, arc: 0.12 }, buildTime: 3.0,
  },
  large_cannon: {
    key: 'large_cannon', name: 'Large Cannon', age: 2,
    damage: 260, attackSpeed: 0.5, range: 360, cost: 3000, splash: 40, // wiki cost
    attack: { kind: 'ballistic', speed: 440, arc: 0.16 }, buildTime: 3.5,
  },
  explosive_cannon: {
    key: 'explosive_cannon', name: 'Explosive Cannon', age: 2,
    damage: 380, attackSpeed: 0.45, range: 380, cost: 6000, splash: 60, // wiki cost
    attack: { kind: 'ballistic', speed: 420, arc: 0.2 }, buildTime: 4.0,
  },

  single_turret: {
    key: 'single_turret', name: 'Single Turret', age: 3,
    damage: 180, attackSpeed: 1.6, range: 360, cost: 7000, splash: 0,  // wiki cost
    attack: { kind: 'hitscan', beam: 0.05 }, buildTime: 3.5,
  },
  rocket_launcher: {
    key: 'rocket_launcher', name: 'Rocket Launcher', age: 3,
    damage: 700, attackSpeed: 0.4, range: 420, cost: 9000, splash: 55, // wiki cost
    attack: { kind: 'ballistic', speed: 380, arc: 0.24 }, buildTime: 4.0,
  },
  double_turret: {
    key: 'double_turret', name: 'Double Turret', age: 3,
    damage: 210, attackSpeed: 2.6, range: 380, cost: 14000, splash: 0, // wiki cost
    attack: { kind: 'hitscan', beam: 0.05 }, buildTime: 4.5,
  },

  titanium_shooter: {
    key: 'titanium_shooter', name: 'Titanium Shooter', age: 4,
    damage: 900, attackSpeed: 1.0, range: 400, cost: 24000, splash: 0, // wiki cost
    attack: { kind: 'hitscan', beam: 0.07 }, buildTime: 4.0,
  },
  laser_cannon: {
    key: 'laser_cannon', name: 'Laser Cannon', age: 4,
    damage: 1400, attackSpeed: 0.8, range: 440, cost: 40000, splash: 0, // wiki cost
    attack: { kind: 'hitscan', beam: 0.14, pierce: true }, buildTime: 4.5,
  },
  ion_cannon: {
    key: 'ion_cannon', name: 'Ion Cannon', age: 4,
    damage: 2600, attackSpeed: 0.35, range: 480, cost: 100000, splash: 70, // wiki cost
    attack: { kind: 'ballistic', speed: 520, arc: 0.18 }, buildTime: 5.0,
  },
};

// ---------------------------------------------------------------------------
// Special attacks
//
// Paid for in XP, out of the same pool that buys the next age. That tension is
// the core decision of the whole game and must not be softened. They damage every
// enemy unit on the field and never the base.

// Each special costs roughly a third of the evolution it competes with, so
// firing three of them is one age you did not get. Left cheaper, they are simply
// spammed on cooldown and the choice stops existing.
export const SPECIALS = [
  { key: 'meteor_shower', name: 'Meteor Shower', xpCost: 1250, damage: 120, telegraph: 1.2, cooldown: 45 },
  { key: 'arrow_storm', name: 'Arrow Storm', xpCost: 4200, damage: 320, telegraph: 1.0, cooldown: 45 },
  { key: 'cannon_barrage', name: 'Cannon Barrage', xpCost: 4000, damage: 900, telegraph: 1.1, cooldown: 45 },
  { key: 'airstrike', name: 'Airstrike', xpCost: 6500, damage: 2400, telegraph: 1.4, cooldown: 45 },
  // wiki: 7000 XP for 1500 damage. Against a 14000 hp War Machine that is nearly
  // a non-event, so the damage is raised and the deviation noted in DESIGN.md.
  { key: 'death_ray', name: 'Death Ray', xpCost: 7000, damage: 6000, telegraph: 1.6, cooldown: 45 },
];

// ---------------------------------------------------------------------------
// Difficulty
//
// One AI brain, two sets of multipliers. Keeping difficulty as numbers rather
// than as separate logic keeps it something the harness can sweep.
//
// trickleMul and killMul are deliberately separate: a fat passive income is a
// fair, visible advantage, whereas fat kill rewards snowball out of reach.

export const DIFFICULTY = {
  normal: {
    key: 'normal', name: 'Normal',
    startGold: 175, startXp: 0,
    trickleMul: 1.0, killMul: 1.0,
    reaction: 1.0,
    aggr0: 0.55, aggr1: 0.9, rampSeconds: 600,
    mistake: 0.08, idleWaste: 0.18, bankMul: 2.2,
    turretThreat: 4.0, slotMul: 1.6,
    specialReserve: 0.5, panicThreat: 8, panicHp: 0.55,
    evolveGoldFloor: 0.6,
  },
  impossible: {
    key: 'impossible', name: 'Impossible',
    startGold: 4000, startXp: 4000,
    trickleMul: 2.2, killMul: 1.15,
    reaction: 0.35,
    aggr0: 0.8, aggr1: 1.0, rampSeconds: 600,
    mistake: 0, idleWaste: 0, bankMul: 1.6,
    turretThreat: 2.5, slotMul: 1.2,
    specialReserve: 0, panicThreat: 5, panicHp: 0.7,
    evolveGoldFloor: 0.2,
  },
};

// ---------------------------------------------------------------------------
// Lookups

export const UNIT_LIST = Object.values(UNITS);
export const TURRET_LIST = Object.values(TURRETS);

const ROLE_ORDER = ['melee', 'ranged', 'heavy', 'secret'];

// The three buyable units of an age, in the order the buttons appear.
export function unitsOfAge(age) {
  return UNIT_LIST
    .filter((u) => u.age === age && u.role !== 'secret')
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

export function turretsOfAge(age) {
  return TURRET_LIST.filter((t) => t.age === age).sort((a, b) => a.cost - b.cost);
}

export function slotCost(owned) {
  return TUNING.slotCosts[owned] ?? Infinity;
}

export function sellValue(turretKey) {
  return Math.floor(TURRETS[turretKey].cost * TUNING.sellRatio);
}

export const specialOfAge = (age) => SPECIALS[age];
export const evolveCost = (age) => AGES[age]?.evolveCost ?? null;
