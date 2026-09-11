// The Player context: Profile / Attributes / Contract / Development / Medical for
// your own squad, or Profile / Attributes / Reports / Contract for a target
// (market listing, free agent, or academy prospect) — replacing the old
// everything-in-one-modal view from screen-squad.js/screen-transfers.js.

import { h, emptyState, attrBadge, meter } from './dom.js';
import { money } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { isAvailable } from '../model/player.js';
import { visiblePotential, scoutCost } from '../engine/scouting.js';
import { renewalDemand } from '../engine/transfers.js';
import { canOpenNegotiation } from '../engine/negotiation.js';
import { renewPlayer, sellSquadPlayer, scoutTarget, negotiateFor, promoteYouthProspect, sellYouthProspect, releaseYouthProspect, toggleShortlist } from './player-actions.js';

function resolve(world, entry) {
  const { source, playerId } = entry;
  if (!source) return null;
  if (source.kind === 'squad') return world.clubs[source.clubId]?.squad.find((p) => p.id === playerId) || null;
  if (source.kind === 'market') return (world.transferMarket || []).find((p) => p.id === playerId) || null;
  if (source.kind === 'freeAgents') return (world.freeAgents || []).find((p) => p.id === playerId) || null;
  if (source.kind === 'prospect') return (world.youthProspects || []).find((p) => p.id === playerId) || null;
  return null;
}

export const playerContext = {
  resolve,

  title(world, entry) {
    return resolve(world, entry)?.name ?? 'Player';
  },

  tabs(world, entry) {
    if (!resolve(world, entry)) return [{ key: 'gone', label: 'Player' }];
    if (entry.source.kind === 'squad') {
      return [
        { key: 'profile', label: 'Profile' },
        { key: 'attributes', label: 'Attributes' },
        { key: 'contract', label: 'Contract' },
        { key: 'development', label: 'Development' },
        { key: 'medical', label: 'Medical' },
      ];
    }
    if (entry.source.kind === 'prospect') {
      // No Reports tab — a prospect is already yours, there's nothing to scout.
      return [
        { key: 'profile', label: 'Profile' },
        { key: 'attributes', label: 'Attributes' },
        { key: 'contract', label: 'Contract' },
      ];
    }
    return [
      { key: 'profile', label: 'Profile' },
      { key: 'attributes', label: 'Attributes' },
      { key: 'reports', label: 'Reports' },
      { key: 'contract', label: 'Contract' },
    ];
  },

  render(world, entry) {
    const player = resolve(world, entry);
    if (!player) return goneView();
    switch (entry.tab) {
      case 'attributes': return attributesTab(player);
      case 'contract': return contractTab(world, entry, player);
      case 'development': return developmentTab(player);
      case 'medical': return medicalTab(player);
      case 'reports': return reportsTab(world, player);
      case 'profile':
      default: return profileTab(world, entry, player);
    }
  },

  // For the in-context "Actions" button — omits "View profile" since you're
  // already looking at it. Row-level context menus (squadTable, playerTable,
  // prospectRow) build their own similarly-shaped list that DOES include it,
  // but both call into the exact same player-actions.js functions underneath.
  actionItems(world, entry) {
    const player = resolve(world, entry);
    if (!player) return [];

    if (entry.source.kind === 'squad') {
      if (entry.source.clubId !== world.playerClubId) return [];
      const club = world.clubs[entry.source.clubId];
      const demand = renewalDemand(player);
      return [
        { label: `Renew · ${money(demand.wage)}/wk`, onClick: () => renewPlayer(club, player) },
        { label: 'Sell', tone: 'danger', onClick: () => sellSquadPlayer(world, club, player) },
      ];
    }

    if (entry.source.kind === 'market' || entry.source.kind === 'freeAgents') {
      const you = playerClub(world);
      const items = [];
      if (!player.scouted) items.push({ label: `Scout · ${money(scoutCost(you, player))}`, onClick: () => scoutTarget(world, you, player) });
      if (canOpenNegotiation(world, you, player).ok) items.push({ label: 'Negotiate', onClick: () => negotiateFor(world, you, player) });
      items.push({
        label: (world.shortlist || []).includes(player.id) ? 'Remove from shortlist' : 'Add to shortlist',
        onClick: () => toggleShortlist(world, player.id),
      });
      return items;
    }

    if (entry.source.kind === 'prospect') {
      return [
        { label: 'Promote to senior squad', onClick: () => promoteYouthProspect(world, player) },
        { label: 'Sell', onClick: () => sellYouthProspect(world, player) },
        { label: 'Release', tone: 'danger', onClick: () => releaseYouthProspect(world, player) },
      ];
    }

    return [];
  },
};

function goneView() {
  return emptyState('This player is no longer available.');
}

function profileTab(world, entry, player) {
  const pot = visiblePotential(playerClub(world), player);
  const isSquad = entry.source.kind === 'squad';
  return h('div', null,
    h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
      pill('Position', player.position),
      pill('Age', player.age),
      pill('Overall', Math.round(player.overall)),
      pill('Potential', pot.exact ? pot.min : `${pot.min}–${pot.max}`),
    ),
    h('p', { style: { color: 'var(--text-2)', fontSize: '13px', margin: 0 } },
      `${player.archetype}. `,
      isSquad
        ? (player.joinedFrom ? `Joined from ${player.joinedFrom}. ` : '')
        : (player.fromClub ? `Currently at ${world.clubs[player.fromClub]?.name}. ` : ''),
      isSquad ? `${player.seasonApps} appearances this season, ${player.seasonGoals} goals and ${player.seasonAssists} assists.` : '',
      isSquad && !isAvailable(player) ? ` Currently out for ${player.injuredFor} weeks (${player.injuryType}).` : '',
    ),
  );
}

function reportsTab(world, player) {
  const you = playerClub(world);
  const pot = visiblePotential(you, player);
  const cost = scoutCost(you, player);
  return h('div', null,
    h('p', { style: { color: 'var(--text-2)', fontSize: '13px', marginTop: 0 } },
      pot.exact ? 'Fully scouted.' : `Your scouts put his ceiling somewhere between ${pot.min} and ${pot.max}.`,
    ),
    !player.scouted ? h('button', {
      class: 'btn ghost',
      onclick: () => scoutTarget(world, you, player),
    }, `Scout · ${money(cost)}`) : null,
  );
}

function attributesTab(player) {
  const attrs = ['pace', 'finishing', 'passing', 'tackling', 'physical', 'technique'];
  if (player.position === 'GK') attrs.push('handling', 'reflexes');
  return h('div', { class: 'attr-list grid cols-2' }, ...attrs.map((a) =>
    h('div', { class: 'attr-row' },
      h('span', { class: 'name' }, a),
      attrBadge(player.attributes[a]),
    ),
  ));
}

function contractTab(world, entry, player) {
  if (entry.source.kind === 'squad') {
    const club = world.clubs[entry.source.clubId];
    const demand = renewalDemand(player);
    const canManage = entry.source.clubId === world.playerClubId;
    return h('div', null,
      h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
        pill('Value', money(player.value)),
        pill('Wage', money(player.wage) + '/wk'),
        pill('Contract', player.contractYears <= 0 ? 'Expired' : `${player.contractYears} yr`),
      ),
      canManage ? h('div', { style: { display: 'flex', gap: 'var(--space-2)' } },
        h('button', { class: 'btn', onclick: () => renewPlayer(club, player) }, `Renew · ${money(demand.wage)}/wk`),
        h('button', { class: 'btn danger', onclick: () => sellSquadPlayer(world, club, player) }, 'Sell'),
      ) : null,
    );
  }
  if (entry.source.kind === 'market' || entry.source.kind === 'freeAgents') {
    const you = playerClub(world);
    const check = canOpenNegotiation(world, you, player);
    return h('div', null,
      h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
        pill('Fee', player.askingPrice ? money(player.askingPrice) : 'Free'),
        pill('Wage', money(player.wage) + '/wk'),
      ),
      !check.ok ? h('div', {
        style: {
          marginBottom: 'var(--space-4)', padding: '10px 12px', border: '1px solid var(--danger-dim)',
          borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: '12.5px',
        },
      }, check.reasons.join(' · ')) : null,
      h('button', {
        class: 'btn primary',
        disabled: !check.ok,
        onclick: () => negotiateFor(world, you, player),
      }, !player.askingPrice ? 'Discuss personal terms'
        : player.fromClub ? `Negotiate · asking ${money(player.askingPrice)}`
        : `Sign for ${money(player.askingPrice)}`),
    );
  }

  if (entry.source.kind === 'prospect') {
    const fee = Math.round(player.value * 1.3);
    return h('div', null,
      h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
        pill('Wage', money(player.wage) + '/wk'),
        pill('Sell for', money(fee)),
      ),
      h('div', { style: { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' } },
        h('button', { class: 'btn primary', onclick: () => promoteYouthProspect(world, player) }, 'Promote to senior squad'),
        h('button', { class: 'btn', onclick: () => sellYouthProspect(world, player) }, `Sell · ${money(fee)}`),
        h('button', { class: 'btn ghost', onclick: () => releaseYouthProspect(world, player) }, 'Release'),
      ),
    );
  }

  return emptyState('Nothing to show yet.');
}

function developmentTab(player) {
  const headroom = Math.max(0, player.potential - player.overall);
  const growthNote = player.age <= 23 && headroom > 0
    ? `Still developing — ${headroom} points of headroom left to his ceiling.`
    : player.age <= 28 && headroom > 0
      ? `Modest room left to grow (${headroom} points) before he settles.`
      : 'At or near his ceiling — from here it is fine-tuning, not growth.';
  return h('div', null,
    h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' } },
      pill('Current', Math.round(player.overall)),
      pill('Potential', player.potential),
      pill('Headroom', headroom),
    ),
    h('div', { style: { maxWidth: '280px', marginBottom: 'var(--space-3)' } },
      meter((player.overall - 20) / Math.max(1, player.potential - 20), 'gold'),
    ),
    h('p', { style: { color: 'var(--text-2)', fontSize: '13px', margin: 0 } }, growthNote),
  );
}

function medicalTab(player) {
  const injured = !isAvailable(player);
  return h('div', null,
    h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
      pill('Fitness', `${Math.round(player.fitness)}%`),
    ),
    h('div', { style: { maxWidth: '280px', marginBottom: 'var(--space-4)' } },
      meter(player.fitness / 100, player.fitness >= 88 ? '' : player.fitness >= 70 ? 'warn' : 'danger'),
    ),
    injured
      ? h('div', { class: 'tag danger' }, `${player.injuryType} — out for ${player.injuredFor} week${player.injuredFor === 1 ? '' : 's'}`)
      : h('p', { style: { color: 'var(--text-3)', fontSize: '13px', margin: 0 } }, 'No current injury concerns.'),
  );
}

function pill(k, v) {
  return h('div', null, h('div', { class: 'eyebrow' }, k), h('div', { class: 'mono', style: { fontSize: '15px' } }, v));
}
