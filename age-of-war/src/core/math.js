// Small numeric helpers shared by the simulation and the renderer.
//
// `towards` is the one that earns its place: the two sides march in opposite
// directions, so almost every comparison in the engine is "which of these two
// positions is further back towards my own base". Writing that as min or max
// inline is how you get a bug that only affects the right-hand army.

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// The nearer of a and b measured against my own base, given my march direction.
export const towards = (dir, a, b) => (dir > 0 ? Math.min(a, b) : Math.max(a, b));

// Move v at most maxDelta towards target.
export function approach(v, target, maxDelta) {
  const d = target - v;
  if (Math.abs(d) <= maxDelta) return target;
  return v + Math.sign(d) * maxDelta;
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInQuad = (t) => t * t;

export const TAU = Math.PI * 2;
