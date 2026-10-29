/*  LANTERN WALL — LEVELS (gameplay)
    A round is a run of wall SECTIONS. Each section is built from two PIECES laid end to end
    (each piece 224 px of wall) plus a short stretch at the end, and the screen is exactly one
    section wide, so the whole wall is always in view, the way Hunchback shows a whole screen.
    Every section but the last ends in a belfry: touch the bell rope to ring it, collect
    the bell and move on. The last section ends at the tower where the queen is held.

    Piece positions are pixels from the left edge of that piece. The hero starts each
    piece at x 14, so keep hazards between x 32 and 190.

    gaps:     [x, width]                       breaches in the walkway
    crumbles: [x, width]                       loose stones that drop away soon after you step on them
    chains:   {x, len, amp, period, phase}     a chain swinging over a gap
                                               (amp in radians, period in frames at 60 per second)
    lifts:    {from, to, w, period}            a plank sliding across a gap
    spikes:   [x, width, period, upFrames, offset]
    shots:    {beat, pattern, offset, speed}   things flying in from the right while you are on this piece,
                                               one pattern letter per beat:
                L = low bolt (jump it)   H = high bolt (don't jump)   B = bat   . = nothing
    flasks:   [x, height above the walkway]    lamp oil worth 300

    Sections:
    pieces:      two piece names, left to right
    tower:       true for the final section (the queen's tower instead of a belfry)
    knightDelay: frames before the climbing knight first appears (default knight.delay)
*/
window.LEVELS = {
  loopSpeedUp: 0.15,    // each full round makes every hazard (and the knight) this much faster
  maxSpeed: 1.75,
  crumbleDelay: 22,     // frames a loose stone holds after you step on it
  bonusPerPiece: 2500,  // a section's time bonus is this times its number of pieces
  bonusLoopCut: 250,    // per piece, this much lower each round
  bonusMinPerPiece: 1500,
  bellsForLife: 5,      // bells in a row (without dying) for an extra life

  // The climbing knight comes up the wall face behind you (the way he does in Hunchback),
  // hauls himself onto the walkway and comes after you.
  // Speeds are pixels per frame; the hero runs at 1.0.
  knight: {
    delay: 150,         // frames into a section before he first appears
    behind: 90,         // he climbs up this far behind the hero (never further back than the screen edge)
    climb: 0.36,        // up and down the wall face
    climbAcross: 0.3,   // sideways on the wall face
    walk: 0.52,         // along the walkway
  },

  pieces: {
    rampart: {
      gaps: [[72, 16], [148, 20]],
      flasks: [[158, 26]],
    },
    gatehouse: {
      gaps: [[96, 24]],
      flasks: [[108, 30]],
    },
    slits: {
      gaps: [[60, 24], [140, 28]],
      shots: { beat: 50, pattern: 'L...', offset: 40, speed: 1.4 },
    },
    chain: {
      gaps: [[72, 80]],
      chains: [{ x: 112, len: 56, amp: 0.62, period: 140 }],
      flasks: [[112, 12]],
    },
    spikes: {
      spikes: [[56, 16, 110, 46, 0], [104, 16, 110, 46, 40], [152, 16, 110, 46, 80]],
      shots: { beat: 70, pattern: '..L', offset: 100, speed: 1.3 },
    },
    loose: {
      crumbles: [[56, 24], [120, 40]],
      shots: { beat: 60, pattern: 'L..', offset: 120, speed: 1.4 },
      flasks: [[100, 30]],
    },
    bats: {
      gaps: [[100, 24]],
      shots: { beat: 40, pattern: 'B..L..B...H...', offset: 30, speed: 1.4 },
    },
    hoist: {
      gaps: [[60, 100]],
      lifts: [{ from: 60, to: 136, w: 24, period: 260 }],
      shots: { beat: 55, pattern: 'H..', offset: 60, speed: 1.3 },
    },
    twin: {
      gaps: [[40, 60], [124, 60]],
      chains: [
        { x: 70, len: 50, amp: 0.65, period: 120 },
        { x: 154, len: 50, amp: 0.65, period: 120, phase: Math.PI },
      ],
      flasks: [[112, 30]],
    },
    gauntlet: {
      crumbles: [[44, 24]],
      spikes: [[100, 16, 100, 40, 0]],
      gaps: [[150, 28]],
      flasks: [[164, 32]],
    },
  },

  sections: [
    { name: 'THE GATEHOUSE', pieces: ['rampart', 'gatehouse'], knightDelay: 300 },
    { name: 'ARROW SLITS', pieces: ['slits', 'chain'] },
    { name: 'SPIKE WALK', pieces: ['spikes', 'loose'] },
    { name: 'BELFRY BATS', pieces: ['bats', 'gatehouse'] },
    { name: 'THE HOIST', pieces: ['hoist', 'slits'] },
    { name: 'TWIN CHAINS', pieces: ['twin', 'spikes'] },
    { name: 'THE GAUNTLET', pieces: ['gauntlet', 'loose'] },
    { name: "THE QUEEN'S TOWER", pieces: ['bats', 'twin'], tower: true },
  ],
};
