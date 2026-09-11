// The role/duty popover for a starting-XI pitch slot. Deliberately NOT part of
// the tabbed Player context: a market/free-agent/prospect player has no role or
// duty at all (club.playerTactics is keyed by squad membership), so it can't be
// a uniform tab across every relationship — this is a tactical/formation-slot
// concern, not a durable property of the player worth showing everywhere he
// appears.

import { h } from './dom.js';
import { openAnchoredPanel } from './context-menu.js';
import { persist, render, openContext } from '../main.js';
import { pickBestXI } from '../model/club.js';
import { ROLE_OPTIONS, ROLE_LABELS, DUTY_OPTIONS } from '../data/positions.js';

// slotIndex is a stable DOM lookup key (data-pitch-slot on the anchor button),
// not the anchor element itself — render() fully re-mounts the Squad screen on
// every change here, which would otherwise leave `apply` holding a detached,
// stale anchor reference the moment it tries to re-open this same popover.
export function openRoleDutyPopover(slotIndex, world, club, player, slot) {
  const anchorEl = document.querySelector(`[data-pitch-slot="${slotIndex}"]`);
  if (!anchorEl) return;
  openAnchoredPanel(anchorEl, (close) => body(slotIndex, world, club, player, slot, close), { extraClass: 'role-duty-popover' });
}

function body(slotIndex, world, club, player, slot, close) {
  const roles = ROLE_OPTIONS[slot] || [];
  const current = club.playerTactics[player.id] || { role: null, duty: 'support' };

  const apply = (patch) => {
    club.playerTactics[player.id] = { ...current, ...patch };
    club.lineup = pickBestXI(club);
    persist();
    render();
    // Re-open the SAME popover in place with the new state — the same
    // "refresh in place" pattern this app already used for the old modal
    // version, just re-resolving the anchor fresh since render() replaced it.
    openRoleDutyPopover(slotIndex, world, club, player, slot);
  };

  return h('div', null,
    h('div', { style: { fontWeight: 600, marginBottom: 'var(--space-1)' } }, player.name),
    h('div', { style: { color: 'var(--text-3)', fontSize: '11.5px', marginBottom: 'var(--space-3)' } }, slot),
    h('div', null,
      h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Role'),
      h('div', { class: 'formation-picker' },
        h('button', {
          class: 'formation-option' + (!current.role ? ' active' : ''),
          onclick: () => apply({ role: null }),
        }, 'Natural'),
        ...roles.map((role) => h('button', {
          class: 'formation-option' + (current.role === role ? ' active' : ''),
          onclick: () => apply({ role }),
        }, ROLE_LABELS[role])),
      ),
    ),
    // A goalkeeper's duty is a structural no-op — omitted rather than shown as
    // buttons that would silently do nothing.
    slot !== 'GK' ? h('div', { style: { marginTop: 'var(--space-3)' } },
      h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Duty'),
      h('div', { class: 'formation-picker' },
        ...DUTY_OPTIONS.map((duty) => h('button', {
          class: 'formation-option' + (current.duty === duty ? ' active' : ''),
          onclick: () => apply({ duty }),
        }, duty[0].toUpperCase() + duty.slice(1))),
      ),
    ) : null,
    h('button', {
      class: 'profile-link',
      style: { marginTop: 'var(--space-3)' },
      onclick: () => { close(); openContext('player', { playerId: player.id, source: { kind: 'squad', clubId: club.id } }); },
    }, 'View full profile →'),
  );
}
