// The canvas, and the one piece of maths that keeps the battlefield honest.
//
// Everything is drawn in a fixed 960x540 space and scaled to whatever the window
// is, letterboxed. That is how the original played - both bases always visible,
// no scrolling - and it matters for more than nostalgia: if the battlefield grew
// with the browser window, engagement distances and weapon ranges would mean
// something different on every monitor.

import { STAGE } from '../data/balance.js';

export function createStage(canvas, wrap) {
  const ctx = canvas.getContext('2d');
  const state = { scale: 1, dpr: 1, ctx, canvas, wrap };

  function fit() {
    // Capped at 2: a phone reporting 3 or 4 turns this into a slideshow for no
    // visible gain at these line weights.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(wrap.clientWidth / STAGE.w, wrap.clientHeight / STAGE.h) || 1;

    canvas.style.width = `${Math.round(STAGE.w * scale)}px`;
    canvas.style.height = `${Math.round(STAGE.h * scale)}px`;
    canvas.width = Math.round(STAGE.w * scale * dpr);
    canvas.height = Math.round(STAGE.h * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    state.scale = scale;
    state.dpr = dpr;
    wrap.style.setProperty('--stage-scale', String(scale));
  }

  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(wrap);
  window.addEventListener('orientationchange', fit);

  state.fit = fit;
  state.destroy = () => observer.disconnect();
  return state;
}

// Pointer coordinates back through the same transform.
export function toStageCoords(event, canvas) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - r.left) / (r.width / STAGE.w),
    y: (event.clientY - r.top) / (r.height / STAGE.h),
  };
}

// Reset the transform for a frame, allowing for the current device pixel ratio.
export function frameTransform(stage) {
  stage.ctx.setTransform(stage.scale * stage.dpr, 0, 0, stage.scale * stage.dpr, 0, 0);
}
