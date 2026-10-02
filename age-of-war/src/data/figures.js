// What each unit, turret and base looks like - as data, not as drawing code.
//
// A figure is a handful of proportions, a palette and one accent, and
// render/figures-draw.js turns any of them into a jointed, animated character.
// That split is what makes sixteen units affordable: a unit is twenty lines of
// numbers rather than a sprite sheet, and a silhouette can be adjusted without
// touching a single canvas call.
//
// The one rule that matters for readability at this size: every figure gets
// exactly one accent shape - a helmet, a hat, a shield, a muzzle flare - in a
// colour nothing else on it uses. That single shape is what makes a knight read
// as a knight at thirty pixels tall.

export const FIGURES = {
  // ---- Stone Age ----------------------------------------------------------
  club_man: {
    kind: 'biped',
    palette: { skin: '#C99A6B', cloth: '#7A5230', trim: '#9C3F2E', accent: '#3E2C1C' },
    build: { height: 34, headR: 5.4, torso: 12, upperArm: 7, foreArm: 7, thigh: 8, shin: 8, lean: 0.14, limb: 3.2 },
    weapon: { kind: 'club', length: 14, width: 5 },
    accent: { kind: 'hair' },
  },
  slingshot_man: {
    kind: 'biped',
    palette: { skin: '#C99A6B', cloth: '#6B4A2F', trim: '#B0752F', accent: '#E8D8B0' },
    build: { height: 33, headR: 5.2, torso: 12, upperArm: 7, foreArm: 7, thigh: 8, shin: 8, lean: 0.1, limb: 3 },
    weapon: { kind: 'sling', length: 10, width: 2.5 },
    accent: { kind: 'band' },
  },
  dino_rider: {
    kind: 'mounted',
    mount: { kind: 'dino', bodyL: 34, bodyH: 13, legs: 4, color: '#6E8B4A', dark: '#4E6534', spine: '#C8B45A' },
    rider: 'club_man',
    build: { height: 44, riderScale: 0.72, seatY: 20 },
    weapon: { kind: 'spear', length: 18, width: 3 },
  },

  // ---- Castle Age ---------------------------------------------------------
  sword_man: {
    kind: 'biped',
    palette: { skin: '#C99A6B', cloth: '#6E7480', trim: '#9AA3B0', accent: '#C9CED6' },
    build: { height: 36, headR: 5.3, torso: 13, upperArm: 7.5, foreArm: 7.5, thigh: 8.5, shin: 8.5, lean: 0.1, limb: 3.3 },
    weapon: { kind: 'sword', length: 16, width: 3 },
    accent: { kind: 'helmet' },
  },
  archer: {
    kind: 'biped',
    palette: { skin: '#C99A6B', cloth: '#4E6B43', trim: '#7E5A33', accent: '#A8C08A' },
    build: { height: 35, headR: 5.2, torso: 13, upperArm: 7.5, foreArm: 7.5, thigh: 8.5, shin: 8.5, lean: 0.08, limb: 3.1 },
    weapon: { kind: 'bow', length: 15, width: 2.2 },
    accent: { kind: 'hood' },
  },
  knight: {
    kind: 'mounted',
    mount: { kind: 'horse', bodyL: 32, bodyH: 12, legs: 4, color: '#5A4636', dark: '#3E3024', spine: '#2C2119' },
    rider: 'sword_man',
    build: { height: 46, riderScale: 0.74, seatY: 21 },
    weapon: { kind: 'lance', length: 24, width: 3 },
  },

  // ---- Renaissance Age ----------------------------------------------------
  dueler: {
    kind: 'biped',
    palette: { skin: '#D2A87C', cloth: '#3D4E7A', trim: '#C9A24E', accent: '#E8DCC0' },
    build: { height: 37, headR: 5.2, torso: 13, upperArm: 8, foreArm: 8, thigh: 9, shin: 9, lean: 0.12, limb: 3.1 },
    weapon: { kind: 'rapier', length: 19, width: 2 },
    accent: { kind: 'plume' },
  },
  musketeer: {
    kind: 'biped',
    palette: { skin: '#D2A87C', cloth: '#6B2F3C', trim: '#C8A24E', accent: '#E8DCC0' },
    build: { height: 36, headR: 5.2, torso: 13, upperArm: 8, foreArm: 8, thigh: 9, shin: 9, lean: 0.08, limb: 3.1 },
    weapon: { kind: 'musket', length: 20, width: 2.6 },
    accent: { kind: 'tricorne' },
  },
  cannoneer: {
    kind: 'vehicle',
    chassis: { kind: 'wheeled', hullL: 26, hullH: 10, wheel: 7, color: '#6B5638', dark: '#4A3B27' },
    barrel: { length: 22, width: 6, color: '#4C4A46' },
    crew: 'musketeer',
    build: { height: 38, crewScale: 0.62 },
  },

  // ---- Modern Age ---------------------------------------------------------
  melee_infantry: {
    kind: 'biped',
    palette: { skin: '#C9A078', cloth: '#5A6242', trim: '#3E4430', accent: '#7C855E' },
    build: { height: 37, headR: 5.2, torso: 13, upperArm: 8, foreArm: 8, thigh: 9, shin: 9, lean: 0.14, limb: 3.3 },
    weapon: { kind: 'knife', length: 11, width: 3 },
    accent: { kind: 'helmet' },
  },
  infantry: {
    kind: 'biped',
    palette: { skin: '#C9A078', cloth: '#4E5640', trim: '#33392A', accent: '#6E7856' },
    build: { height: 36, headR: 5.2, torso: 13, upperArm: 8, foreArm: 8, thigh: 9, shin: 9, lean: 0.06, limb: 3.2 },
    weapon: { kind: 'rifle', length: 19, width: 2.8 },
    accent: { kind: 'helmet' },
  },
  tank: {
    kind: 'vehicle',
    chassis: { kind: 'tracked', hullL: 46, hullH: 13, wheel: 5, color: '#5C6449', dark: '#3C4230' },
    turret: { length: 22, height: 9, color: '#67704F' },
    barrel: { length: 24, width: 5, color: '#44483A' },
    build: { height: 34 },
  },

  // ---- Future Age ---------------------------------------------------------
  gods_blade: {
    kind: 'biped',
    palette: { skin: '#D8E4F0', cloth: '#E6EDF6', trim: '#7FD8FF', accent: '#4FC3F7' },
    build: { height: 40, headR: 5.4, torso: 14, upperArm: 8.5, foreArm: 8.5, thigh: 9.5, shin: 9.5, lean: 0.16, limb: 3.4 },
    weapon: { kind: 'blade', length: 22, width: 3.5, glow: '#7FD8FF' },
    accent: { kind: 'visor', color: '#7FD8FF' },
    glow: '#7FD8FF',
  },
  blaster: {
    kind: 'biped',
    palette: { skin: '#D8E4F0', cloth: '#C9D3E2', trim: '#B085F5', accent: '#9575CD' },
    build: { height: 38, headR: 5.3, torso: 13, upperArm: 8.5, foreArm: 8.5, thigh: 9, shin: 9, lean: 0.06, limb: 3.3 },
    weapon: { kind: 'blaster', length: 18, width: 4, glow: '#C9A7FF' },
    accent: { kind: 'visor', color: '#C9A7FF' },
    glow: '#C9A7FF',
  },
  war_machine: {
    kind: 'vehicle',
    chassis: { kind: 'hover', hullL: 52, hullH: 18, wheel: 0, color: '#3D4A6B', dark: '#28314A' },
    turret: { length: 24, height: 12, color: '#4E5C82' },
    barrel: { length: 28, width: 6, color: '#7FD8FF' },
    build: { height: 52 },
    glow: '#7FD8FF',
  },
  super_soldier: {
    kind: 'biped',
    palette: { skin: '#F0E6C8', cloth: '#FFD54F', trim: '#FF8A50', accent: '#FFF3C4' },
    build: { height: 58, headR: 7, torso: 20, upperArm: 12, foreArm: 12, thigh: 13, shin: 13, lean: 0.18, limb: 5 },
    weapon: { kind: 'blade', length: 32, width: 6, glow: '#FFD54F' },
    accent: { kind: 'visor', color: '#FFE082' },
    glow: '#FFD54F',
  },
};

// ---------------------------------------------------------------------------
// Turrets. Drawn mounted on a base slot, so they need a mount and a barrel only.

export const TURRET_FIGURES = {
  rock_slingshot: { mount: 'post', barrel: { length: 13, width: 3 }, color: '#7A5230', dark: '#553A22', accent: '#C0A472' },
  egg_automatic: { mount: 'post', barrel: { length: 11, width: 5 }, color: '#8C6A3F', dark: '#5F472A', accent: '#E8D9B8' },
  primitive_catapult: { mount: 'frame', barrel: { length: 19, width: 4 }, color: '#6B4A2C', dark: '#49321D', accent: '#9C7A47' },

  catapult: { mount: 'frame', barrel: { length: 20, width: 4 }, color: '#6E5638', dark: '#4A3A25', accent: '#9AA3B0' },
  fire_catapult: { mount: 'frame', barrel: { length: 20, width: 4 }, color: '#6E4638', dark: '#4A2E25', accent: '#E8743A' },
  oil: { mount: 'pot', barrel: { length: 9, width: 8 }, color: '#4A4038', dark: '#2E2822', accent: '#D9A441' },

  small_cannon: { mount: 'post', barrel: { length: 18, width: 5 }, color: '#4C4A46', dark: '#2F2E2B', accent: '#C8A24E' },
  large_cannon: { mount: 'frame', barrel: { length: 23, width: 7 }, color: '#4C4A46', dark: '#2F2E2B', accent: '#C8A24E' },
  explosive_cannon: { mount: 'frame', barrel: { length: 25, width: 8 }, color: '#46443F', dark: '#2A2926', accent: '#E8743A' },

  single_turret: { mount: 'dome', barrel: { length: 20, width: 4 }, color: '#5C6449', dark: '#3C4230', accent: '#8E9A6E' },
  rocket_launcher: { mount: 'box', barrel: { length: 18, width: 9 }, color: '#55604A', dark: '#363E2E', accent: '#D9622B' },
  double_turret: { mount: 'dome', barrel: { length: 21, width: 3.5, twin: true }, color: '#5C6449', dark: '#3C4230', accent: '#8E9A6E' },

  titanium_shooter: { mount: 'dome', barrel: { length: 22, width: 5 }, color: '#4E5C82', dark: '#313C58', accent: '#7FD8FF', glow: '#7FD8FF' },
  laser_cannon: { mount: 'box', barrel: { length: 26, width: 4 }, color: '#4A4270', dark: '#2E294A', accent: '#C9A7FF', glow: '#C9A7FF' },
  ion_cannon: { mount: 'dome', barrel: { length: 30, width: 9 }, color: '#3D4A6B', dark: '#28314A', accent: '#7FE0C8', glow: '#7FE0C8' },
};

// ---------------------------------------------------------------------------
// Bases. One silhouette per age, plus the colours the damage states wash out to.

export const BASE_FIGURES = [
  { kind: 'cave', w: 104, h: 96, color: '#6B4A32', dark: '#452D1D', accent: '#2A1A10', trim: '#8C6A45' },
  { kind: 'castle', w: 110, h: 118, color: '#8A8E93', dark: '#5E6367', accent: '#3E4245', trim: '#B94A3A' },
  { kind: 'fort', w: 116, h: 106, color: '#7E7458', dark: '#56503C', accent: '#38341F', trim: '#C8A24E' },
  { kind: 'bunker', w: 120, h: 92, color: '#5E6650', dark: '#3E4436', accent: '#2A2E24', trim: '#8E9A6E' },
  { kind: 'arcology', w: 124, h: 130, color: '#3D4A6B', dark: '#26304A', accent: '#161C2E', trim: '#7FD8FF' },
];
