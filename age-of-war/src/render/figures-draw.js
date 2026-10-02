// Drawing a figure.
//
// Every character in the game comes out of this file: sixteen units, fifteen
// turrets, five bases, all from jointed limbs and a handful of proportions. No
// sprites, no image files, nothing to load.
//
// Two decisions carry the look. Everything is drawn twice - once as a thick dark
// outline, once as the fill - which is what gives a cartoon its weight and costs
// nothing but a second pass. And the walk cycle is driven by DISTANCE TRAVELLED
// rather than by time, so feet never skate: a unit that stops dead at the front
// line stops with its feet planted, and a unit at half speed takes half as many
// steps rather than the same steps more slowly.

import { clamp01, easeOutCubic, TAU } from '../core/math.js';
import { BASE_FIGURES, FIGURES, TURRET_FIGURES } from '../data/figures.js';
import { outlineFor, TEAM } from './palette.js';

// ---------------------------------------------------------------------------
// Pose

export function poseFor(u, def, fig) {
  const build = fig.build ?? { height: 34 };
  const stride = (build.height ?? 34) * 0.44;
  const p = (((u.travelled / stride) % 1) + 1) % 1;
  const walking = u.anim === 'walk' ? 1 : 0;

  // Wind back for most of the attack period, then snap forward on the strike.
  const k = clamp01(1 - u.attackTimer * def.attackSpeed);
  const swing = u.anim === 'attack'
    ? (k < 0.7 ? -(k / 0.7) * 0.4 : easeOutCubic((k - 0.7) / 0.3))
    : 0;

  const a = p * TAU;
  return {
    hipL: Math.sin(a) * 0.62 * walking,
    kneeL: Math.max(0, Math.sin(a + 1.1)) * 0.8 * walking,
    hipR: Math.sin(a + Math.PI) * 0.62 * walking,
    kneeR: Math.max(0, Math.sin(a + Math.PI + 1.1)) * 0.8 * walking,
    shoulderL: -Math.sin(a) * 0.45 * walking,
    shoulderR: -0.45 + swing * 1.9,
    elbowR: -0.35 + swing * 0.7,
    bob: Math.abs(Math.sin(a)) * 1.7 * walking,
    lean: (build.lean ?? 0.1) + swing * 0.2,
    swing,
  };
}

export const restPose = () => ({
  hipL: 0, kneeL: 0, hipR: 0, kneeR: 0,
  shoulderL: 0, shoulderR: -0.45, elbowR: -0.35, bob: 0, lean: 0.1, swing: 0,
});

// ---------------------------------------------------------------------------
// Painting helpers. Every one takes a mode: 'outline' draws a fat dark version
// of the same shape, 'fill' draws the real one.

function seg(ctx, x1, y1, x2, y2, w, color, mode, outline) {
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = mode === 'outline' ? w + 2.6 : w;
  ctx.strokeStyle = mode === 'outline' ? outline : color;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function blob(ctx, path, color, mode, outline, weight = 2.6) {
  ctx.beginPath();
  path(ctx);
  if (mode === 'outline') {
    ctx.lineJoin = 'round';
    ctx.lineWidth = weight;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.fillStyle = outline;
    ctx.fill();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
}

const joint = (x, y, angle, len) => [x + Math.sin(angle) * len, y + Math.cos(angle) * len];

// ---------------------------------------------------------------------------
// The public entry point

export function drawUnit(ctx, u, def, age, alpha = 0) {
  const fig = FIGURES[u.key];
  if (!fig) return;
  const pose = poseFor(u, def, fig);
  const outline = outlineFor(age);
  const team = TEAM[u.side];
  const dir = u.side === 0 ? 1 : -1;

  ctx.save();
  ctx.translate(0, -pose.bob);
  ctx.scale(dir, 1);
  if (fig.kind === 'mounted') drawMounted(ctx, fig, pose, outline, team);
  else if (fig.kind === 'vehicle') drawVehicle(ctx, fig, pose, outline, team, u);
  else drawBiped(ctx, fig, pose, outline, team, 1);
  ctx.restore();
}

export function drawFigureByKey(ctx, key, { anim = 'idle', travelled = 0, side = 0, age = 0 } = {}) {
  const fig = FIGURES[key];
  if (!fig) return;
  const fake = { key, anim, travelled, attackTimer: 0, side };
  const def = { attackSpeed: 1 };
  drawUnit(ctx, fake, def, age);
}

// ---------------------------------------------------------------------------
// Bipeds

function drawBiped(ctx, fig, pose, outline, team, scale = 1) {
  ctx.save();
  if (scale !== 1) ctx.scale(scale, scale);
  for (const mode of ['outline', 'fill']) bipedPass(ctx, fig, pose, mode, outline, team);
  ctx.restore();
}

function bipedPass(ctx, fig, pose, mode, outline, team) {
  const b = fig.build;
  const P = fig.palette;
  const h = b.height;
  const hipY = -h * 0.44;
  const shY = -h * 0.76;
  const headY = -h * 0.9;
  const lw = b.limb;

  const lean = pose.lean;
  const shX = Math.sin(lean) * (shY - hipY) * -1;

  // Clothing is pulled towards the army's own colour. A chest ribbon alone is not
  // enough: in a Stone Age melee both mobs are the same beige and you cannot tell
  // at a glance which half of the line is yours.
  const cloth = mix(P.cloth, team.ribbon, 0.34);
  const dark = shade(cloth, -0.24);
  legPair(ctx, 0, hipY, pose.hipR, pose.kneeR, b, lw, dark, mode, outline);
  armPair(ctx, shX, shY, pose.shoulderL, -0.3, b, lw, dark, mode, outline);

  // Front leg.
  legPair(ctx, 0, hipY, pose.hipL, pose.kneeL, b, lw, cloth, mode, outline);

  // Torso.
  blob(ctx, (c) => {
    c.moveTo(-lw * 1.15, hipY + 1);
    c.lineTo(lw * 1.15, hipY + 1);
    c.lineTo(shX + lw * 1.35, shY);
    c.lineTo(shX - lw * 1.35, shY);
    c.closePath();
  }, cloth, mode, outline, 3);

  // A team ribbon across the chest, so two armies of the same age stay apart.
  if (mode === 'fill') {
    ctx.beginPath();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = team.glow;
    ctx.moveTo(shX - lw * 1.2, shY + 3);
    ctx.lineTo(lw * 0.9, hipY - 2);
    ctx.stroke();
  }

  // Head and its one accent.
  const hx = shX + Math.sin(lean) * 3;
  blob(ctx, (c) => c.arc(hx, headY, b.headR, 0, TAU), P.skin, mode, outline, 2.6);
  accent(ctx, fig, hx, headY, b, mode, outline);

  // Front arm, and whatever it is holding.
  const [ex, ey] = joint(shX, shY, pose.shoulderR, b.upperArm);
  const [wx, wy] = joint(ex, ey, pose.shoulderR + pose.elbowR, b.foreArm);
  seg(ctx, shX, shY, ex, ey, lw, P.skin, mode, outline);
  seg(ctx, ex, ey, wx, wy, lw * 0.9, P.skin, mode, outline);
  if (fig.weapon) weapon(ctx, fig, wx, wy, pose.shoulderR + pose.elbowR, mode, outline);
}

function legPair(ctx, x, y, hip, knee, b, lw, color, mode, outline) {
  const [kx, ky] = joint(x, y, hip, b.thigh);
  const [fx, fy] = joint(kx, ky, hip + knee, b.shin);
  seg(ctx, x, y, kx, ky, lw, color, mode, outline);
  seg(ctx, kx, ky, fx, fy, lw * 0.9, color, mode, outline);
  seg(ctx, fx, fy, fx + 3, fy, lw * 0.8, shade(color, -0.3), mode, outline);   // foot
}

function armPair(ctx, x, y, shoulder, elbow, b, lw, color, mode, outline) {
  const [ex, ey] = joint(x, y, shoulder, b.upperArm);
  const [hx, hy] = joint(ex, ey, shoulder + elbow, b.foreArm);
  seg(ctx, x, y, ex, ey, lw * 0.92, color, mode, outline);
  seg(ctx, ex, ey, hx, hy, lw * 0.82, color, mode, outline);
}

function accent(ctx, fig, x, y, b, mode, outline) {
  const a = fig.accent;
  if (!a) return;
  const P = fig.palette;
  const r = b.headR;
  switch (a.kind) {
    case 'hair':
      blob(ctx, (c) => { c.moveTo(x - r, y - r * 0.5); c.quadraticCurveTo(x - r * 1.9, y - r * 2.4, x + r * 0.3, y - r * 1.45); c.closePath(); }, P.accent, mode, outline, 2.2);
      break;
    case 'band':
      seg(ctx, x - r - 1, y - r * 0.35, x + r + 1, y - r * 0.35, 2.2, P.trim, mode, outline);
      break;
    case 'helmet':
      blob(ctx, (c) => { c.arc(x, y - r * 0.18, r * 1.18, Math.PI, TAU); c.closePath(); }, P.accent, mode, outline, 2.4);
      break;
    case 'hood':
      blob(ctx, (c) => { c.arc(x - r * 0.15, y - r * 0.1, r * 1.25, Math.PI * 0.85, TAU + 0.2); c.closePath(); }, P.accent, mode, outline, 2.4);
      break;
    case 'tricorne':
      blob(ctx, (c) => { c.moveTo(x - r * 1.55, y - r * 0.55); c.lineTo(x + r * 1.55, y - r * 0.55); c.lineTo(x, y - r * 1.95); c.closePath(); }, P.accent, mode, outline, 2.4);
      break;
    case 'plume':
      blob(ctx, (c) => { c.arc(x, y - r * 0.25, r * 1.1, Math.PI, TAU); c.closePath(); }, P.accent, mode, outline, 2.2);
      if (mode === 'fill') seg(ctx, x - r * 0.4, y - r * 1.3, x - r * 2.2, y - r * 2.6, 2.4, P.trim, mode, outline);
      break;
    case 'visor':
      blob(ctx, (c) => { c.arc(x, y - r * 0.12, r * 1.16, Math.PI, TAU); c.closePath(); }, P.accent, mode, outline, 2.2);
      if (mode === 'fill') seg(ctx, x - r * 0.3, y + r * 0.1, x + r * 1.05, y + r * 0.1, 2.6, a.color ?? P.trim, mode, outline);
      break;
    default:
      break;
  }
}

function weapon(ctx, fig, x, y, angle, mode, outline) {
  const w = fig.weapon;
  const P = fig.palette;
  const col = w.glow ?? P.trim;
  const [tx, ty] = joint(x, y, angle, w.length);

  switch (w.kind) {
    case 'club':
      seg(ctx, x, y, tx, ty, w.width, P.cloth, mode, outline);
      blob(ctx, (c) => c.arc(tx, ty, w.width * 1.3, 0, TAU), shade(P.cloth, 0.15), mode, outline, 2.2);
      break;
    case 'sling':
      seg(ctx, x, y, tx, ty, w.width, P.trim, mode, outline);
      blob(ctx, (c) => c.arc(tx, ty, 2.4, 0, TAU), '#8A8A8A', mode, outline, 2);
      break;
    case 'sword':
    case 'rapier':
    case 'spear':
    case 'lance':
    case 'knife':
      seg(ctx, x, y, tx, ty, w.width, col, mode, outline);
      if (mode === 'fill' && (w.kind === 'sword' || w.kind === 'rapier')) {
        const [gx, gy] = joint(x, y, angle + Math.PI / 2, 4);
        const [g2x, g2y] = joint(x, y, angle - Math.PI / 2, 4);
        seg(ctx, gx, gy, g2x, g2y, 2, shade(col, -0.3), mode, outline);
      }
      break;
    case 'bow': {
      const [ax, ay] = joint(x, y, angle + Math.PI / 2, w.length * 0.5);
      const [bx, by] = joint(x, y, angle - Math.PI / 2, w.length * 0.5);
      ctx.beginPath();
      ctx.lineWidth = mode === 'outline' ? w.width + 2.4 : w.width;
      ctx.strokeStyle = mode === 'outline' ? outline : col;
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(tx * 0.7, (ay + by) / 2, bx, by);
      ctx.stroke();
      break;
    }
    case 'musket':
    case 'rifle':
      seg(ctx, x, y, tx, ty, w.width, shade(P.trim, -0.25), mode, outline);
      if (mode === 'fill') seg(ctx, x, y, ...joint(x, y, angle, w.length * 0.4), w.width * 1.6, P.cloth, mode, outline);
      break;
    case 'blaster':
      seg(ctx, x, y, tx, ty, w.width, '#7A8190', mode, outline);
      if (mode === 'fill') blob(ctx, (c) => c.arc(tx, ty, 2.6, 0, TAU), col, mode, outline, 2);
      break;
    case 'blade':
      seg(ctx, x, y, tx, ty, w.width, col, mode, outline);
      if (mode === 'fill') {
        ctx.save();
        ctx.globalAlpha = 0.35;
        seg(ctx, x, y, tx, ty, w.width * 2.6, col, 'fill', outline);
        ctx.restore();
      }
      break;
    default:
      seg(ctx, x, y, tx, ty, w.width, col, mode, outline);
  }
}

// ---------------------------------------------------------------------------
// Mounted units: a beast, with a scaled rider sitting on it.

function drawMounted(ctx, fig, pose, outline, team) {
  const m = fig.mount;
  const b = fig.build;
  const legPhase = pose;

  for (const mode of ['outline', 'fill']) {
    const bodyY = -b.seatY;
    // Four legs, alternating with the walk cycle.
    for (let i = 0; i < 4; i++) {
      const at = -m.bodyL * 0.36 + (i % 2) * m.bodyL * 0.62 + (i < 2 ? 0 : 3);
      const ph = i % 2 === 0 ? legPhase.hipL : legPhase.hipR;
      const [fx, fy] = joint(at, bodyY + m.bodyH * 0.4, ph * 0.8, b.seatY * 0.55);
      seg(ctx, at, bodyY + m.bodyH * 0.4, fx, fy, 3.4, i < 2 ? shade(m.color, -0.25) : m.color, mode, outline);
      seg(ctx, fx, fy, fx, fy + b.seatY * 0.42, 3, i < 2 ? shade(m.color, -0.3) : shade(m.color, -0.1), mode, outline);
    }

    // Body, neck and head.
    blob(ctx, (c) => {
      c.ellipse(0, bodyY, m.bodyL * 0.5, m.bodyH, 0, 0, TAU);
    }, m.color, mode, outline, 3);
    const neckX = m.bodyL * 0.42;
    seg(ctx, neckX, bodyY, neckX + 9, bodyY - 10, 5.5, m.color, mode, outline);
    blob(ctx, (c) => c.ellipse(neckX + 12, bodyY - 12, 7, 4.6, -0.3, 0, TAU), m.color, mode, outline, 2.6);
    seg(ctx, -m.bodyL * 0.5, bodyY, -m.bodyL * 0.5 - 10, bodyY - 6, 3.4, shade(m.color, -0.15), mode, outline);  // tail

    if (mode === 'fill' && m.spine) {
      for (let i = -2; i <= 2; i++) {
        const sx = i * 6;
        seg(ctx, sx, bodyY - m.bodyH * 0.85, sx, bodyY - m.bodyH * 1.5, 2.2, m.spine, 'fill', outline);
      }
    }
  }

  // The rider, borrowing another unit's figure and carrying this one's weapon.
  const rider = FIGURES[fig.rider];
  if (!rider) return;
  const mounted = { ...rider, weapon: fig.weapon ?? rider.weapon };
  ctx.save();
  ctx.translate(-2, -fig.build.seatY - fig.mount.bodyH * 0.5);
  drawBiped(ctx, mounted, { ...pose, hipL: 0.5, hipR: -0.5, kneeL: 0.2, kneeR: 0.2, bob: 0 }, outline, team, fig.build.riderScale);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Vehicles

function drawVehicle(ctx, fig, pose, outline, team, u) {
  const c = fig.chassis;
  const y = -c.hullH;

  for (const mode of ['outline', 'fill']) {
    if (c.kind === 'tracked' || c.kind === 'wheeled') {
      const n = c.kind === 'tracked' ? 5 : 2;
      for (let i = 0; i < n; i++) {
        const wx = -c.hullL * 0.4 + (i / Math.max(1, n - 1)) * c.hullL * 0.8;
        // Wheels turn with distance travelled, same principle as the walk cycle.
        const spin = (u?.travelled ?? 0) / c.wheel;
        blob(ctx, (p) => p.arc(wx, -c.wheel, c.wheel, 0, TAU), c.dark, mode, outline, 2.4);
        if (mode === 'fill') seg(ctx, wx, -c.wheel, wx + Math.cos(spin) * c.wheel * 0.8, -c.wheel + Math.sin(spin) * c.wheel * 0.8, 1.6, shade(c.color, 0.25), 'fill', outline);
      }
    }

    blob(ctx, (p) => {
      p.moveTo(-c.hullL * 0.5, y);
      p.lineTo(c.hullL * 0.5, y);
      p.lineTo(c.hullL * 0.42, y - c.hullH);
      p.lineTo(-c.hullL * 0.44, y - c.hullH);
      p.closePath();
    }, c.color, mode, outline, 3);

    if (fig.turret) {
      const t = fig.turret;
      blob(ctx, (p) => {
        p.moveTo(-t.length * 0.5, y - c.hullH);
        p.lineTo(t.length * 0.4, y - c.hullH);
        p.lineTo(t.length * 0.3, y - c.hullH - t.height);
        p.lineTo(-t.length * 0.4, y - c.hullH - t.height);
        p.closePath();
      }, t.color, mode, outline, 2.6);
      seg(ctx, t.length * 0.3, y - c.hullH - t.height * 0.55,
        t.length * 0.3 + fig.barrel.length, y - c.hullH - t.height * 0.55,
        fig.barrel.width, fig.barrel.color, mode, outline);
    } else if (fig.barrel) {
      seg(ctx, 0, y - c.hullH * 0.5, fig.barrel.length, y - c.hullH * 0.5 - 4, fig.barrel.width, fig.barrel.color, mode, outline);
    }

    if (mode === 'fill') {
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = team.ribbon;
      ctx.moveTo(-c.hullL * 0.34, y - c.hullH * 0.45);
      ctx.lineTo(-c.hullL * 0.1, y - c.hullH * 0.45);
      ctx.stroke();
      if (c.kind === 'hover') {
        ctx.globalAlpha = 0.4;
        seg(ctx, -c.hullL * 0.42, y + 3, c.hullL * 0.42, y + 3, 5, fig.glow ?? '#7FD8FF', 'fill', outline);
        ctx.globalAlpha = 1;
      }
    }
  }

  // A crew figure riding on top, for the units that have one.
  if (fig.crew && FIGURES[fig.crew]) {
    ctx.save();
    ctx.translate(-c.hullL * 0.3, -c.hullH * 1.1);
    drawBiped(ctx, FIGURES[fig.crew], { ...pose, hipL: 0.1, hipR: -0.1, bob: 0 }, outline, team, fig.build.crewScale);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Turrets and bases

export function drawTurret(ctx, key, age, aim = 0, recoil = 0) {
  const fig = TURRET_FIGURES[key];
  if (!fig) return;
  const outline = outlineFor(age);

  for (const mode of ['outline', 'fill']) {
    switch (fig.mount) {
      case 'frame':
        seg(ctx, -7, 0, 0, -11, 3.4, fig.dark, mode, outline);
        seg(ctx, 7, 0, 0, -11, 3.4, fig.dark, mode, outline);
        break;
      case 'dome':
        blob(ctx, (p) => p.arc(0, -4, 9, Math.PI, TAU), fig.color, mode, outline, 2.6);
        break;
      case 'box':
        blob(ctx, (p) => { p.rect(-9, -13, 18, 13); }, fig.color, mode, outline, 2.6);
        break;
      case 'pot':
        blob(ctx, (p) => { p.moveTo(-8, -12); p.lineTo(8, -12); p.lineTo(6, 0); p.lineTo(-6, 0); p.closePath(); }, fig.color, mode, outline, 2.6);
        break;
      default:
        seg(ctx, 0, 0, 0, -12, 4.4, fig.dark, mode, outline);
    }

    const by = fig.mount === 'post' ? -12 : -11;
    const bx = -recoil * 4;
    const b = fig.barrel;
    if (b.twin) {
      seg(ctx, bx, by - 2, bx + Math.cos(aim) * b.length, by - 2 + Math.sin(aim) * b.length, b.width, fig.color, mode, outline);
      seg(ctx, bx, by + 2, bx + Math.cos(aim) * b.length, by + 2 + Math.sin(aim) * b.length, b.width, fig.color, mode, outline);
    } else {
      seg(ctx, bx, by, bx + Math.cos(aim) * b.length, by + Math.sin(aim) * b.length, b.width, fig.color, mode, outline);
    }

    if (mode === 'fill') {
      blob(ctx, (p) => p.arc(bx, by, 3.4, 0, TAU), fig.accent, 'fill', outline, 2);
      if (fig.glow) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        blob(ctx, (p) => p.arc(bx + Math.cos(aim) * b.length, by + Math.sin(aim) * b.length, 4, 0, TAU), fig.glow, 'fill', outline, 2);
        ctx.restore();
      }
    }
  }
}

export function drawBase(ctx, age, hpFrac, side) {
  const fig = BASE_FIGURES[age] ?? BASE_FIGURES[0];
  const outline = outlineFor(age);
  const dir = side === 0 ? 1 : -1;
  const team = TEAM[side];
  const w = fig.w;
  const h = fig.h;

  ctx.save();
  ctx.scale(dir, 1);

  for (const mode of ['outline', 'fill']) {
    switch (fig.kind) {
      case 'cave':
        blob(ctx, (p) => { p.moveTo(-w * 0.5, 0); p.quadraticCurveTo(-w * 0.45, -h, 0, -h * 0.95); p.quadraticCurveTo(w * 0.5, -h * 0.85, w * 0.42, 0); p.closePath(); }, fig.color, mode, outline, 3);
        blob(ctx, (p) => { p.moveTo(w * 0.05, 0); p.quadraticCurveTo(w * 0.06, -h * 0.55, w * 0.3, -h * 0.5); p.quadraticCurveTo(w * 0.4, -h * 0.2, w * 0.36, 0); p.closePath(); }, fig.accent, mode, outline, 2.6);
        break;
      case 'castle':
        blob(ctx, (p) => { p.rect(-w * 0.5, -h * 0.72, w * 0.92, h * 0.72); }, fig.color, mode, outline, 3);
        for (let i = 0; i < 5; i++) blob(ctx, (p) => { p.rect(-w * 0.5 + i * w * 0.19, -h * 0.85, w * 0.11, h * 0.14); }, fig.color, mode, outline, 2.4);
        blob(ctx, (p) => { p.rect(-w * 0.62, -h, w * 0.26, h); }, shade(fig.color, -0.12), mode, outline, 3);
        blob(ctx, (p) => { p.moveTo(-w * 0.62, -h); p.lineTo(-w * 0.36, -h); p.lineTo(-w * 0.49, -h * 1.22); p.closePath(); }, fig.trim, mode, outline, 2.4);
        blob(ctx, (p) => { p.moveTo(w * 0.08, 0); p.lineTo(w * 0.08, -h * 0.34); p.quadraticCurveTo(w * 0.22, -h * 0.5, w * 0.36, -h * 0.34); p.lineTo(w * 0.36, 0); p.closePath(); }, fig.accent, mode, outline, 2.6);
        break;
      case 'fort':
        blob(ctx, (p) => { p.moveTo(-w * 0.55, 0); p.lineTo(-w * 0.42, -h * 0.7); p.lineTo(w * 0.42, -h * 0.7); p.lineTo(w * 0.5, 0); p.closePath(); }, fig.color, mode, outline, 3);
        blob(ctx, (p) => { p.rect(-w * 0.16, -h, w * 0.32, h * 0.34); }, shade(fig.color, 0.1), mode, outline, 2.6);
        for (let i = -1; i <= 1; i++) blob(ctx, (p) => { p.rect(i * w * 0.3 - w * 0.05, -h * 0.82, w * 0.1, h * 0.14); }, fig.dark, mode, outline, 2.2);
        blob(ctx, (p) => { p.rect(w * 0.12, -h * 0.4, w * 0.22, h * 0.4); }, fig.accent, mode, outline, 2.6);
        if (mode === 'fill') seg(ctx, 0, -h, 0, -h * 1.2, 2.4, fig.trim, 'fill', outline);
        break;
      case 'bunker':
        blob(ctx, (p) => { p.moveTo(-w * 0.55, 0); p.lineTo(-w * 0.46, -h * 0.62); p.lineTo(w * 0.4, -h * 0.62); p.lineTo(w * 0.5, 0); p.closePath(); }, fig.color, mode, outline, 3);
        blob(ctx, (p) => { p.rect(-w * 0.3, -h * 0.9, w * 0.4, h * 0.3); }, shade(fig.color, 0.12), mode, outline, 2.6);
        blob(ctx, (p) => { p.rect(w * 0.08, -h * 0.44, w * 0.26, h * 0.44); }, fig.accent, mode, outline, 2.6);
        if (mode === 'fill') {
          seg(ctx, -w * 0.34, -h * 0.76, w * 0.06, -h * 0.76, 3.4, fig.dark, 'fill', outline);
          seg(ctx, -w * 0.1, -h * 0.9, -w * 0.1, -h * 1.16, 2, fig.trim, 'fill', outline);
        }
        break;
      default:
        blob(ctx, (p) => { p.moveTo(-w * 0.48, 0); p.lineTo(-w * 0.4, -h * 0.55); p.lineTo(w * 0.34, -h * 0.55); p.lineTo(w * 0.46, 0); p.closePath(); }, fig.color, mode, outline, 3);
        blob(ctx, (p) => { p.moveTo(-w * 0.26, -h * 0.55); p.lineTo(-w * 0.18, -h); p.lineTo(w * 0.14, -h); p.lineTo(w * 0.22, -h * 0.55); p.closePath(); }, shade(fig.color, 0.14), mode, outline, 2.8);
        blob(ctx, (p) => { p.rect(w * 0.06, -h * 0.4, w * 0.24, h * 0.4); }, fig.accent, mode, outline, 2.6);
        if (mode === 'fill') {
          for (let i = 0; i < 4; i++) seg(ctx, -w * 0.22, -h * 0.62 - i * h * 0.1, w * 0.16, -h * 0.62 - i * h * 0.1, 1.6, fig.trim, 'fill', outline);
          ctx.globalAlpha = 0.5;
          seg(ctx, -w * 0.02, -h, -w * 0.02, -h * 1.3, 3, fig.trim, 'fill', outline);
          ctx.globalAlpha = 1;
        }
    }
  }

  // Damage. Scorch marks on the structure itself rather than a wash over the
  // whole area - a translucent rectangle reads as a rendering bug, not as damage.
  const hurt = 1 - hpFrac;
  if (hurt > 0.02) {
    ctx.save();
    const marks = Math.min(7, Math.ceil(hurt * 8));
    for (let i = 0; i < marks; i++) {
      const fx = ((i * 97) % 100) / 100;
      const fy = ((i * 61) % 100) / 100;
      const x = -w * 0.44 + fx * w * 0.86;
      const y = -h * 0.12 - fy * h * 0.72;
      const r = 4 + ((i * 31) % 9);
      ctx.globalAlpha = Math.min(0.72, 0.28 + hurt * 0.5);
      ctx.fillStyle = '#140D08';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.72, 0, 0, TAU);
      ctx.fill();
    }
    // Once it is genuinely failing, it burns.
    if (hurt > 0.55) {
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (hurt - 0.55) * 0.9;
        ctx.fillStyle = i === 0 ? '#E8743A' : '#D9A441';
        ctx.beginPath();
        ctx.ellipse(-w * 0.2 + i * w * 0.22, -h * (0.55 + i * 0.08), 5 - i, 8 - i, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // A standard, so you always know which end is yours.
  ctx.save();
  ctx.globalAlpha = 1;
  seg(ctx, -w * 0.42, -h * 0.72, -w * 0.42, -h * 0.98, 2, outline, 'fill', outline);
  ctx.beginPath();
  ctx.fillStyle = team.ribbon;
  ctx.moveTo(-w * 0.42, -h * 0.98);
  ctx.lineTo(-w * 0.42 + 14 * dir, -h * 0.93);
  ctx.lineTo(-w * 0.42, -h * 0.87);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ---------------------------------------------------------------------------

// Blend two colours. Used to pull an army's clothing towards its own colour
// without losing the age's palette entirely.
export function mix(a, b, amount) {
  const pa = rgb(a);
  const pb = rgb(b);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * amount)}, ${Math.round(pa[1] + (pb[1] - pa[1]) * amount)}, ${Math.round(pa[2] + (pb[2] - pa[2]) * amount)})`;
}

function rgb(color) {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/\d+/g);
  return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
}

export function shade(hex, amount) {
  let [r, g, b] = rgb(hex);
  if (amount >= 0) {
    r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount;
  } else {
    r *= 1 + amount; g *= 1 + amount; b *= 1 + amount;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
