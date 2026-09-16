// The Player context: Profile / Attributes / Contract / Development / Medical for
// your own squad, or Profile / Attributes / Reports / Contract for a target
// (market listing, free agent, or academy prospect) — replacing the old
// everything-in-one-modal view from screen-squad.js/screen-transfers.js.

import { h, emptyState, attrBadge, meter } from './dom.js';
import { money } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { isAvailable, personalityFor } from '../model/player.js';
import { visiblePotential, scoutCost } from '../engine/scouting.js';
import { anyClub } from '../engine/europe.js';
import { renewalDemand } from '../engine/transfers.js';
import { canOpenNegotiation } from '../engine/negotiation.js';
import { renewPlayer, sellSquadPlayer, scoutTarget, negotiateFor, triggerReleaseClause, promoteYouthProspect, sellYouthProspect, releaseYouthProspect, toggleShortlist, loanPlayerOut, enquireAboutLoan, recallLoanedPlayer } from './player-actions.js';
import { canRecall } from '../engine/loans.js';
import { ROLE_OPTIONS, ROLE_LABELS } from '../data/positions.js';
import {
  VISIBLE_ATTRIBUTES, VISIBLE_ATTRIBUTE_LABELS, ATTRIBUTE_CATEGORY,
  HIDDEN_ATTRIBUTES, HIDDEN_ATTRIBUTE_LABELS, TRAIT_LABELS, roleRating,
} from '../data/attributes.js';

function resolve(world, entry) {
  const { source, playerId } = entry;
  if (!source) return null;
  if (source.kind === 'squad') return anyClub(world, source.clubId)?.squad.find((p) => p.id === playerId) || null;
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
      case 'attributes': return attributesTab(world, player);
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
      const club = world.clubs[entry.source.clubId];
      const canManage = entry.source.clubId === world.playerClubId;
      const isLoaneeHere = !!player.onLoanFrom;
      const isMyLoanedOutPlayer = isLoaneeHere && player.onLoanFrom === world.playerClubId;

      if (canManage && !isLoaneeHere) {
        const demand = renewalDemand(player);
        return [
          { label: `Renew · ${money(demand.wage)}/wk`, onClick: () => renewPlayer(club, player) },
          { label: 'Sell', tone: 'danger', onClick: () => sellSquadPlayer(world, club, player) },
          { label: 'Loan out', onClick: () => loanPlayerOut(world, club, player) },
        ];
      }
      if (isMyLoanedOutPlayer) {
        const loan = (world.loans || []).find((l) => l.playerId === player.id);
        if (!loan || !canRecall(world, loan).ok) return [];
        return [{ label: 'Recall', tone: 'danger', onClick: () => recallLoanedPlayer(world, loan.id) }];
      }
      if (!canManage && !isLoaneeHere) {
        return [{ label: 'Enquire about loan', onClick: () => enquireAboutLoan(world, club, player) }];
      }
      return [];
    }

    if (entry.source.kind === 'market' || entry.source.kind === 'freeAgents') {
      const you = playerClub(world);
      const items = [];
      if (!player.scouted) items.push({ label: `Scout · ${money(scoutCost(you, player))}`, onClick: () => scoutTarget(world, you, player) });
      if (canOpenNegotiation(world, you, player).ok) items.push({ label: 'Negotiate', onClick: () => negotiateFor(world, you, player) });
      if (player.releaseClause && player.fromClub) {
        items.push({ label: `Trigger release clause · ${money(player.releaseClause)}`, onClick: () => triggerReleaseClause(world, you, player) });
      }
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

// FM's own three-column grid: Technical / Mental / Physical, with a goalkeeper's
// Technical column swapped for the goalkeeping-specific attributes plus the three
// (first touch, passing, technique) FM treats as shared between outfield and keeper
// play rather than duplicating — see data/attributes.js's own note on why those three
// live in one group instead of two.
const OUTFIELD_TECHNICAL_KEYS = VISIBLE_ATTRIBUTES.filter((a) => ATTRIBUTE_CATEGORY[a] === 'technical');
const GK_TECHNICAL_KEYS = [
  ...VISIBLE_ATTRIBUTES.filter((a) => ATTRIBUTE_CATEGORY[a] === 'goalkeeping'),
  'firstTouch', 'passing', 'technique',
];
const MENTAL_KEYS = VISIBLE_ATTRIBUTES.filter((a) => ATTRIBUTE_CATEGORY[a] === 'mental');
const PHYSICAL_KEYS = VISIBLE_ATTRIBUTES.filter((a) => ATTRIBUTE_CATEGORY[a] === 'physical');

function attrColumn(title, keys, attributes) {
  return h('div', null,
    h('div', { class: 'eyebrow', style: { marginBottom: 'var(--space-2)' } }, title),
    h('div', { class: 'attr-list' }, ...keys.map((a) =>
      h('div', { class: 'attr-row' },
        h('span', { class: 'name' }, VISIBLE_ATTRIBUTE_LABELS[a]),
        attrBadge(attributes[a]),
      ),
    )),
  );
}

function attributesTab(world, player) {
  const isGk = player.position === 'GK';
  return h('div', null,
    h('div', { class: 'grid cols-3', style: { marginBottom: 'var(--space-5)' } },
      attrColumn(isGk ? 'Goalkeeping' : 'Technical', isGk ? GK_TECHNICAL_KEYS : OUTFIELD_TECHNICAL_KEYS, player.attributes),
      attrColumn('Mental', MENTAL_KEYS, player.attributes),
      attrColumn('Physical', PHYSICAL_KEYS, player.attributes),
    ),
    roleSuitabilitySection(player),
    personalitySection(world, player),
  );
}

// The suitability circles FM's tactics screen shows, over this game's own two roles
// per slot — reads the same roleRating() the tactics/lineup screens use, so a number
// shown here means exactly the same thing there.
function roleSuitabilitySection(player) {
  const roles = ROLE_OPTIONS[player.position] || [];
  if (!roles.length) return null;
  return h('div', { style: { marginBottom: 'var(--space-5)' } },
    h('div', { class: 'eyebrow', style: { marginBottom: 'var(--space-2)' } }, 'Role suitability'),
    h('div', { class: 'attr-list' }, ...roles.map((roleKey) => {
      const rating = roleRating(player, player.position, roleKey);
      return h('div', { class: 'attr-row' },
        h('span', { class: 'name' }, ROLE_LABELS[roleKey] || roleKey),
        rating == null ? null : attrBadge(rating, 99),
      );
    })),
  );
}

// Right/left strength (1-20 each) reduced to the same kind of plain-English label FM
// itself shows rather than two raw numbers — "which foot, and does the other one let
// him down" is the useful read, not the exact gap between them.
function footLabel(foot) {
  if (!foot) return 'Unknown';
  const { left, right } = foot;
  const weakerQuality = (v) => (v >= 16 ? 'strong' : v >= 11 ? 'capable' : v >= 6 ? 'reasonable' : 'weak');
  if (Math.abs(right - left) <= 3) return `Two-footed (${weakerQuality(Math.min(left, right))} on either side)`;
  const dominant = right > left ? 'Right' : 'Left';
  return `${dominant}-footed (${weakerQuality(Math.min(left, right))} other foot)`;
}

// Personality is a derived read of the hidden set (see player.js's personalityFor),
// so it's always shown — but the hidden values it's derived from, like potential,
// stay fogged until this player is actually known: scouted individually, or your
// scouting network is good enough to see everyone at a glance.
function personalitySection(world, player) {
  const you = playerClub(world);
  const known = visiblePotential(you, player).exact;
  const traits = (player.traits || []).map((id) => TRAIT_LABELS[id]).filter(Boolean);

  return h('div', null,
    h('div', { class: 'eyebrow', style: { marginBottom: 'var(--space-2)' } }, 'Personality & traits'),
    h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' } },
      pill('Personality', personalityFor(player.hidden)),
      pill('Preferred foot', footLabel(player.foot)),
    ),
    traits.length
      ? h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
        ...traits.map((t) => h('span', { class: 'tag info' }, t)))
      : h('p', { style: { color: 'var(--text-3)', fontSize: '12.5px', margin: '0 0 var(--space-4) 0' } }, 'No notable playing style traits.'),
    h('div', { class: 'eyebrow', style: { marginBottom: 'var(--space-2)' } }, 'Hidden attributes'),
    known
      ? h('div', { class: 'attr-list grid cols-2' }, ...HIDDEN_ATTRIBUTES.map((key) =>
        h('div', { class: 'attr-row' },
          h('span', { class: 'name' }, HIDDEN_ATTRIBUTE_LABELS[key]),
          attrBadge(player.hidden[key]),
        ),
      ))
      : h('p', { style: { color: 'var(--text-3)', fontSize: '12.5px', margin: 0 } }, 'Scout this player to reveal his hidden attributes.'),
  );
}

function contractTab(world, entry, player) {
  if (entry.source.kind === 'squad') {
    const club = world.clubs[entry.source.clubId];
    const demand = renewalDemand(player);
    const canManage = entry.source.clubId === world.playerClubId;
    // A loanee sitting in `club`'s squad still belongs to whoever holds onLoanFrom —
    // Renew/Sell only ever make sense for a player this club actually owns.
    const isLoaneeHere = !!player.onLoanFrom;
    const isMyLoanedOutPlayer = isLoaneeHere && player.onLoanFrom === world.playerClubId;

    const actions = [];
    if (canManage && !isLoaneeHere) {
      actions.push(
        h('button', { class: 'btn', onclick: () => renewPlayer(club, player) }, `Renew · ${money(demand.wage)}/wk`),
        h('button', { class: 'btn danger', onclick: () => sellSquadPlayer(world, club, player) }, 'Sell'),
        h('button', { class: 'btn ghost', onclick: () => loanPlayerOut(world, club, player) }, 'Loan out'),
      );
    } else if (isMyLoanedOutPlayer) {
      const loan = (world.loans || []).find((l) => l.playerId === player.id);
      const recallCheck = loan ? canRecall(world, loan) : { ok: false, reason: 'Loan not found' };
      actions.push(
        h('button', {
          class: 'btn danger', disabled: !recallCheck.ok, title: recallCheck.ok ? '' : recallCheck.reason,
          onclick: () => recallLoanedPlayer(world, loan.id),
        }, 'Recall'),
      );
    } else if (!canManage && !isLoaneeHere) {
      actions.push(h('button', { class: 'btn ghost', onclick: () => enquireAboutLoan(world, club, player) }, 'Enquire about loan'));
    }

    return h('div', null,
      h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
        pill('Value', money(player.value)),
        pill('Wage', money(player.wage) + '/wk'),
        pill('Contract', player.contractYears <= 0 ? 'Expired' : `${player.contractYears} yr`),
        player.releaseClause ? pill('Release clause', money(player.releaseClause)) : null,
        isLoaneeHere ? pill('On loan from', world.clubs[player.onLoanFrom]?.short || '?') : null,
      ),
      actions.length ? h('div', { style: { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' } }, ...actions) : null,
    );
  }
  if (entry.source.kind === 'market' || entry.source.kind === 'freeAgents') {
    const you = playerClub(world);
    const check = canOpenNegotiation(world, you, player);
    return h('div', null,
      h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
        pill('Fee', player.askingPrice ? money(player.askingPrice) : 'Free'),
        pill('Wage', money(player.wage) + '/wk'),
        player.releaseClause ? pill('Release clause', money(player.releaseClause)) : null,
      ),
      !check.ok ? h('div', {
        style: {
          marginBottom: 'var(--space-4)', padding: '10px 12px', border: '1px solid var(--danger-dim)',
          borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: '12.5px',
        },
      }, check.reasons.join(' · ')) : null,
      h('div', { style: { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' } },
        h('button', {
          class: 'btn primary',
          disabled: !check.ok,
          onclick: () => negotiateFor(world, you, player),
        }, !player.askingPrice ? 'Discuss personal terms'
          : player.fromClub ? `Negotiate · asking ${money(player.askingPrice)}`
          : `Sign for ${money(player.askingPrice)}`),
        player.releaseClause && player.fromClub ? h('button', {
          class: 'btn gold',
          onclick: () => triggerReleaseClause(world, you, player),
        }, `Trigger clause · ${money(player.releaseClause)}`) : null,
      ),
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
