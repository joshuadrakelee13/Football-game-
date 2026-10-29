/*  LANTERN WALL — LEVELS (gameplay)
    Laid out after the 1983 arcade game Hunchback: fifteen fixed screens of castle wall,
    each ending in a bell, then a last screen inside the bell tower where four bells hang
    on ropes over a fire pit, with the queen's tower at its far end. The game then starts
    again, faster and with less time.

    Only the first two screens are documented exactly (one fireball from the right, then a
    rope swing over a fire pit). The rest follow the original's described pattern: three
    or four basic set-ups (projectiles, rope over fire, breaches, pikemen in the ramparts)
    that come back with more hazards added as you get closer to the tower.

    The screen is 488 px wide. The hero starts at x 14 and the bell rope hangs at x 462,
    so keep hazards between x 40 and 430.

    gaps:      [x, width]                    breaches in the walkway (jump them)
    firePits:  [x, width]                    burning chasms, crossed on a rope
    chains:    {x, len, amp, period, phase}  a rope swinging over a pit
                                             (amp in radians, period in frames at 60 per second)
    bellRopes: {x, len}                      still ropes with a bell on top (the bell tower);
                                             grab one to ring its bell, jump to let go
    guards:    [x, period, upFrames, offset] a pikeman in a 20 px gap in the ramparts;
                                             his pike is up for upFrames of every period
    shots:     {kind, from, high, every, offset, speed}
                                             a stream of fireballs (kind 'fire') or arrows ('arrow')
                                             flying in from the 'right' or 'left', low (jump it)
                                             or high (stay on the ground), one every `every` frames
    wall:      0, 1 or 2                     brick colour set from skin.js (changes by area)
    time:      seconds before the climbing knight reaches the top (default from `time` below)

    Also supported by the engine, though Hunchback has none of them:
    crumbles [x, width], lifts {from, to, w, period}, spikes [x, width, period, up, offset],
    flasks [x, height].
*/
window.LEVELS = {
  loopSpeedUp: 0.15,    // each full round makes every hazard this much faster
  maxSpeed: 1.75,
  crumbleDelay: 22,

  // The climbing knight is the clock. He starts at the bottom left of every screen and climbs
  // the wall face; when time runs out he reaches the top and walks after you with his torch.
  time: { start: 22, loopCut: 3, min: 14 },   // seconds, and how much less each round
  bonus: { start: 3000, loopAdd: 1000 },      // the bonus drains to 0 as the knight climbs
  knight: { walk: 0.55 },                     // walking speed once he is up (the hero runs at 1.0)

  bellsForLife: 5,                            // bells in a row, rung in time and without dying
  superBonus: [10000, 20000, 30000],          // paid with that extra life, by round
  towerBell: 1000,                            // each bell in the bell tower

  sections: [
    { name: 'THE FIRST FIREBALL', wall: 0,
      shots: [{ kind: 'fire', from: 'right', every: 150, offset: 90, speed: 1.2 }] },

    { name: 'THE FIRE PIT', wall: 0,
      firePits: [[200, 80]],
      chains: [{ x: 240, len: 56, amp: 0.62, period: 140 }] },

    { name: 'THE BREACHES', wall: 0,
      gaps: [[150, 26], [290, 28]] },

    { name: 'THE PIKEMEN', wall: 0,
      guards: [[140, 120, 40, 0], [240, 120, 40, 40], [340, 120, 40, 80]] },

    { name: 'ARROW SLITS', wall: 0,
      gaps: [[230, 24]],
      shots: [
        { kind: 'arrow', from: 'right', every: 110, offset: 40, speed: 1.4 },
        { kind: 'arrow', from: 'right', high: true, every: 110, offset: 95, speed: 1.4 },
      ] },

    { name: 'FIRE AND ROPE', wall: 1,
      firePits: [[200, 80]],
      chains: [{ x: 240, len: 56, amp: 0.62, period: 140 }],
      shots: [{ kind: 'fire', from: 'right', every: 170, offset: 60, speed: 1.3 }] },

    { name: 'PIKES AND ARROWS', wall: 1,
      guards: [[140, 110, 40, 0], [240, 110, 40, 36], [340, 110, 40, 72]],
      shots: [{ kind: 'arrow', from: 'right', high: true, every: 130, offset: 70, speed: 1.4 }] },

    { name: 'THE CRUMBLED WALL', wall: 1,
      gaps: [[110, 24], [220, 28], [330, 26]],
      shots: [{ kind: 'fire', from: 'right', every: 160, offset: 80, speed: 1.3 }] },

    { name: 'CROSSFIRE', wall: 1,
      gaps: [[240, 24]],
      shots: [
        { kind: 'fire', from: 'right', every: 140, offset: 40, speed: 1.3 },
        { kind: 'arrow', from: 'left', high: true, every: 160, offset: 120, speed: 1.3 },
        { kind: 'arrow', from: 'left', every: 200, offset: 10, speed: 1.5 },
      ] },

    { name: 'TWIN PITS', wall: 1,
      firePits: [[110, 60], [290, 60]],
      chains: [
        { x: 140, len: 50, amp: 0.65, period: 120 },
        { x: 320, len: 50, amp: 0.65, period: 120, phase: Math.PI },
      ] },

    { name: 'THE GUARD HOUSE', wall: 2,
      guards: [[110, 100, 40, 0], [190, 100, 40, 25], [270, 100, 40, 50], [350, 100, 40, 75]] },

    { name: 'THE GAUNTLET', wall: 2,
      gaps: [[100, 26]],
      guards: [[190, 110, 40, 0], [260, 110, 40, 55]],
      firePits: [[330, 80]],
      chains: [{ x: 370, len: 56, amp: 0.62, period: 140 }] },

    { name: 'ROPE UNDER FIRE', wall: 2,
      firePits: [[180, 80]],
      chains: [{ x: 220, len: 56, amp: 0.62, period: 140 }],
      shots: [
        { kind: 'arrow', from: 'right', high: true, every: 120, offset: 60, speed: 1.4 },
        { kind: 'fire', from: 'left', every: 150, offset: 20, speed: 1.2 },
      ] },

    { name: 'PIKES IN CROSSFIRE', wall: 2,
      guards: [[140, 110, 40, 0], [240, 110, 40, 40], [340, 110, 40, 80]],
      shots: [
        { kind: 'fire', from: 'left', every: 150, offset: 30, speed: 1.3 },
        { kind: 'arrow', from: 'right', high: true, every: 130, offset: 90, speed: 1.5 },
      ] },

    { name: 'THE LAST WALL', wall: 2,
      gaps: [[70, 26]],
      firePits: [[150, 80]],
      chains: [{ x: 190, len: 56, amp: 0.62, period: 140 }],
      guards: [[280, 110, 40, 0], [350, 110, 40, 55]],
      shots: [
        { kind: 'fire', from: 'right', every: 170, offset: 50, speed: 1.3 },
        { kind: 'arrow', from: 'left', high: true, every: 190, offset: 140, speed: 1.4 },
      ] },

    { name: 'THE BELL TOWER', wall: 2, tower: true, time: 30,
      firePits: [[146, 156]],
      bellRopes: [{ x: 170, len: 60 }, { x: 206, len: 60 }, { x: 242, len: 60 }, { x: 278, len: 60 }],
      shots: [
        { kind: 'arrow', from: 'right', high: true, every: 140, offset: 70, speed: 1.3 },
        { kind: 'arrow', from: 'left', every: 180, offset: 150, speed: 1.3 },
      ] },
  ],
};
