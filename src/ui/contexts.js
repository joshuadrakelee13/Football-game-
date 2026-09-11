// The object-context registry — mirrors screens.js's shape (SCREENS/SCREEN_ORDER)
// but for things you drill INTO from a screen rather than navigate to directly.
// Each entry implements { resolve, title, tabs, render, actionItems } — see
// context-player.js for the concrete shape. Adding a new context type (an agent,
// a club, a competition) is "add an entry here plus its module," same as screens.js.
//
// Note: this file is imported by main.js, and (once context-player.js exists)
// context-player.js imports persist/render/goBack/game back from main.js — a
// circular import, structurally identical to the pre-existing main.js <-> shell.js
// cycle already in this codebase. Safe because nothing here is used at module-
// evaluation time, only inside function bodies called later, after both modules
// have finished initialising.

import { playerContext } from './context-player.js';

export const CONTEXTS = { player: playerContext };
