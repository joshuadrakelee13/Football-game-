// The world behind the battle.
//
// Painted once per age into an offscreen canvas and then blitted, because the
// sky gradient and two hill layers are the most expensive thing on screen and
// none of it changes until somebody evolves. Clouds and parallax drift on top.

import { STAGE } from '../data/balance.js';
import { paletteFor } from './palette.js';
import { shade } from './figures-draw.js';

const cache = new Map();

export function backdropFor(age) {
  if (cache.has(age)) return cache.get(age);

  const c = document.createElement('canvas');
  c.width = STAGE.w;
  c.height = STAGE.h;
  const g = c.getContext('2d');
  const P = paletteFor(age);

  const sky = g.createLinearGradient(0, 0, 0, STAGE.groundY);
  sky.addColorStop(0, P.sky[0]);
  sky.addColorStop(0.55, P.sky[1]);
  sky.addColorStop(1, P.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, STAGE.w, STAGE.groundY + 2);

  // Two hill layers, deterministic from the age so they never shimmer.
  hills(g, age * 31 + 7, STAGE.horizonY + 40, 70, P.hillFar);
  hills(g, age * 53 + 19, STAGE.horizonY + 84, 52, P.hillNear);

  g.fillStyle = P.ground;
  g.fillRect(0, STAGE.groundY, STAGE.w, STAGE.h - STAGE.groundY);
  g.fillStyle = P.groundDark;
  g.fillRect(0, STAGE.groundY + 46, STAGE.w, STAGE.h - STAGE.groundY - 46);

  g.strokeStyle = P.groundLine;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, STAGE.groundY);
  g.lineTo(STAGE.w, STAGE.groundY);
  g.stroke();

  // Scatter for texture: stones, tufts, whatever the age suggests.
  let seed = age * 977 + 13;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 60; i++) {
    const x = rand() * STAGE.w;
    const y = STAGE.groundY + 6 + rand() * (STAGE.h - STAGE.groundY - 12);
    const r = 1 + rand() * 2.6;
    g.fillStyle = rand() > 0.5 ? shade(P.groundDark, -0.12) : shade(P.ground, 0.08);
    g.beginPath();
    g.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
    g.fill();
  }

  cache.set(age, c);
  return c;
}

function hills(g, seed, baseY, height, color) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, baseY + height);
  let x = 0;
  let y = baseY;
  g.lineTo(0, y);
  while (x < STAGE.w) {
    const w = 90 + rand() * 150;
    const peak = baseY - rand() * height;
    g.quadraticCurveTo(x + w * 0.5, peak, x + w, baseY - rand() * height * 0.3);
    x += w;
  }
  g.lineTo(STAGE.w, baseY + height);
  g.closePath();
  g.fill();
}

// Drifting cloud band, drawn over the cached backdrop.
export function drawSkyDrift(ctx, age, t) {
  const P = paletteFor(age);
  ctx.save();
  ctx.fillStyle = P.haze;
  for (let i = 0; i < 5; i++) {
    const speed = 4 + i * 1.6;
    const x = ((i * 233 + t * speed) % (STAGE.w + 260)) - 130;
    const y = 40 + i * 34;
    const w = 90 + i * 26;
    ctx.beginPath();
    ctx.ellipse(x, y, w, 12 + i * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
