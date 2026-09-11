// Transfers: the market, incoming bids, free agents and your own outgoings.

import { h, clubChip, ratingPill, panel, emptyState } from './dom.js';
import { money, num } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { squadRating, weeklyWages } from '../model/club.js';
import { sellPlayer } from '../engine/transfers.js';
import { canOpenNegotiation } from '../engine/negotiation.js';
import { visiblePotential, scoutCost } from '../engine/scouting.js';
import { transferBudget } from '../engine/finance.js';
import { persist, render, game, openContext } from '../main.js';
import { confirmDialog } from './modal.js';
import { openContextMenu } from './context-menu.js';
import { scoutTarget, negotiateFor, toggleShortlist } from './player-actions.js';
import { openSellNegotiation } from './negotiation-modal.js';
import { toast } from './toast.js';

let tab = 'market';
let posFilter = 'ALL';

export function renderTransfers(world) {
  const you = playerClub(world);
  const bids = world.pendingBids || [];

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, 'Transfers'),
      h('span', { class: 'sub' },
        `${money(transferBudget(you))} to spend · ${money(Math.max(0, you.wageBudget - weeklyWages(you)))}/wk of wage room`),
    ),

    h('div', { class: 'formation-picker', style: { marginBottom: 'var(--space-4)' } },
      tabButton('market', 'Transfer market'),
      tabButton('free', `Free agents (${(world.freeAgents || []).length})`),
      tabButton('shortlist', `Shortlist (${(world.shortlist || []).length})`),
      tabButton('bids', `Offers received (${bids.length})`),
    ),

    tab === 'market' ? marketPanel(world, you)
      : tab === 'free' ? freeAgentPanel(world, you)
      : tab === 'shortlist' ? shortlistPanel(world, you)
      : bidsPanel(world, you, bids),
  );
}

function tabButton(key, label) {
  return h('button', {
    class: 'formation-option' + (tab === key ? ' active' : ''),
    onclick: () => { tab = key; render(); },
  }, label);
}

// ---------------------------------------------------------------------------

const POSITIONS = ['ALL', 'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];

function marketPanel(world, you) {
  const all = world.transferMarket || [];
  const list = posFilter === 'ALL' ? all : all.filter((p) => p.position === posFilter);
  const sorted = [...list].sort((a, b) => b.overall - a.overall);

  return h('div', null,
    h('div', { class: 'formation-picker', style: { marginBottom: 'var(--space-3)' } },
      ...POSITIONS.map((p) => h('button', {
        class: 'formation-option' + (posFilter === p ? ' active' : ''),
        onclick: () => { posFilter = p; render(); },
      }, p)),
    ),
    panel('Available players',
      sorted.length ? playerTable(world, you, sorted, 'buy') : emptyState('Nobody matches that filter right now.'),
      h('span', { style: { fontSize: '11px', color: 'var(--text-3)' } },
        `The market rotates twice a season · scouting level ${you.facilities.scouting}`),
    ),
  );
}

function freeAgentPanel(world, you) {
  const list = [...(world.freeAgents || [])].sort((a, b) => b.overall - a.overall);
  return panel('Free agents',
    list.length ? playerTable(world, you, list, 'free') : emptyState('No free agents available.'),
    h('span', { style: { fontSize: '11px', color: 'var(--text-3)' } }, 'No fee — you pay wages only'),
  );
}

function shortlistPanel(world, you) {
  const ids = new Set(world.shortlist || []);
  const marketHits = (world.transferMarket || []).filter((p) => ids.has(p.id));
  const freeHits = (world.freeAgents || []).filter((p) => ids.has(p.id));
  const staleCount = ids.size - marketHits.length - freeHits.length;

  if (!marketHits.length && !freeHits.length) {
    return panel('Shortlist', emptyState('Nothing shortlisted yet — use the ⋯ menu or Actions on a market or free-agent listing.'));
  }

  return h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
    marketHits.length ? panel('Shortlisted — transfer market', playerTable(world, you, marketHits, 'buy')) : null,
    freeHits.length ? panel('Shortlisted — free agents', playerTable(world, you, freeHits, 'free')) : null,
    staleCount > 0 ? h('p', { style: { color: 'var(--text-3)', fontSize: '12px' } },
      `${staleCount} shortlisted player${staleCount === 1 ? '' : 's'} no longer available.`) : null,
  );
}

function playerTable(world, you, list, mode) {
  const avg = squadRating(you);
  return h('div', { class: 'table-scroll' },
    h('table', { class: 'data' },
      h('thead', null, h('tr', null,
        h('th', null, 'Player'), h('th', null, 'Pos'),
        h('th', { class: 'num' }, 'Age'), h('th', { class: 'num' }, 'OVR'), h('th', null, 'POT'),
        h('th', null, 'Style'),
        h('th', { class: 'num' }, mode === 'free' ? 'Fee' : 'Asking'), h('th', { class: 'num' }, 'Wage'),
        h('th', null, ''),
      )),
      h('tbody', null, ...list.map((p) => {
        const check = canOpenNegotiation(world, you, p);
        const pot = visiblePotential(you, p);
        return h('tr', {
          class: 'clickable',
          onclick: () => openContext('player', { playerId: p.id, source: { kind: mode === 'free' ? 'freeAgents' : 'market' } }),
        },
          h('td', { class: 'strong' },
            p.name,
            p.fromClub ? h('span', {
              class: 'tag muted',
              style: { marginLeft: '6px', cursor: 'pointer' },
              onclick: (e) => { e.stopPropagation(); openContext('club', { clubId: p.fromClub }); },
            }, world.clubs[p.fromClub]?.abbr || '') : null,
          ),
          h('td', null, p.position),
          h('td', { class: 'num' }, p.age),
          h('td', { class: 'num' }, ratingPill(p.overall, { context: avg })),
          h('td', null, h('span', { class: 'pot-range' + (pot.exact ? ' exact' : '') },
            pot.exact ? pot.min : `${pot.min}–${pot.max}`)),
          h('td', null, h('span', { style: { fontSize: '11.5px', color: 'var(--text-3)' } }, p.archetype)),
          h('td', { class: 'num' }, p.askingPrice ? money(p.askingPrice) : 'Free'),
          h('td', { class: 'num' }, money(p.wage)),
          h('td', null, h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' } },
            check.ok
              ? h('span', { class: 'tag pitch' }, 'Available')
              : h('span', { class: 'tag muted', title: check.reasons.join('; ') }, shortReason(check.reasons[0])),
            h('button', {
              class: 'btn sm ghost',
              onclick: (e) => { e.stopPropagation(); openContextMenu(e.currentTarget, targetRowMenu(world, you, p, mode)); },
            }, '⋯'),
          )),
        );
      })),
    ),
  );
}

function targetRowMenu(world, you, player, mode) {
  const source = { kind: mode === 'free' ? 'freeAgents' : 'market' };
  const items = [
    { label: 'View profile', onClick: () => openContext('player', { playerId: player.id, source }) },
  ];
  if (!player.scouted) {
    items.push({ divider: true }, { label: `Scout · ${money(scoutCost(you, player))}`, onClick: () => scoutTarget(world, you, player) });
  }
  if (canOpenNegotiation(world, you, player).ok) {
    items.push({ divider: true }, { label: 'Negotiate', onClick: () => negotiateFor(world, you, player) });
  }
  items.push({ divider: true }, {
    label: (world.shortlist || []).includes(player.id) ? 'Remove from shortlist' : 'Add to shortlist',
    onClick: () => toggleShortlist(world, player.id),
  });
  return items;
}

function shortReason(reason) {
  if (!reason) return '—';
  if (reason.includes('Transfer budget')) return 'Too costly';
  if (reason.includes('Wage')) return 'Wages';
  if (reason.includes('Not interested')) return 'Won’t come';
  if (reason.includes('Squad is full')) return 'Squad full';
  return reason;
}

// ---------------------------------------------------------------------------

function bidsPanel(world, you, bids) {
  if (!bids.length) {
    return panel('Offers received',
      emptyState('No club has made an offer for your players. Win some games and that will change.'));
  }

  return panel('Offers received',
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', null, h('tr', null,
          h('th', null, 'Player'), h('th', { class: 'num' }, 'OVR'),
          h('th', null, 'Interested club'),
          h('th', { class: 'num' }, 'Valued'), h('th', { class: 'num' }, 'Offer'),
          h('th', null, ''),
        )),
        h('tbody', null, ...bids.map((bid) => {
          const player = you.squad.find((p) => p.id === bid.playerId);
          const premium = player ? Math.round((bid.offer / Math.max(1, player.value) - 1) * 100) : 0;
          return h('tr', null,
            h('td', { class: 'strong' }, bid.playerName),
            h('td', { class: 'num' }, bid.playerOverall),
            h('td', {
              style: { cursor: 'pointer' },
              onclick: (e) => { e.stopPropagation(); openContext('club', { clubId: bid.buyerId }); },
            }, clubChip(world.clubs[bid.buyerId], { short: false })),
            h('td', { class: 'num' }, money(bid.value)),
            h('td', { class: 'num strong', style: { color: 'var(--gold)' } },
              money(bid.offer),
              premium > 0 ? h('span', { style: { color: 'var(--text-3)', fontSize: '11px' } }, ` +${premium}%`) : null),
            h('td', null,
              h('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
                h('button', {
                  class: 'btn sm',
                  onclick: (e) => {
                    e.stopPropagation();
                    if (!player) return;
                    openSellNegotiation(world, you, bid);
                  },
                }, 'Negotiate'),
                h('button', {
                  class: 'btn sm primary',
                  onclick: async (e) => {
                    e.stopPropagation();
                    if (!player) return;
                    const ok = await confirmDialog('Accept the bid?',
                      `Sell ${bid.playerName} to ${bid.buyerName} for ${money(bid.offer)}? The dressing room will notice.`,
                      'Accept');
                    if (!ok) return;
                    const result = sellPlayer(world, you, bid.playerId, bid.offer, bid.buyerId);
                    if (result.ok) toast('Sold', `${bid.playerName} joins ${bid.buyerName} for ${money(bid.offer)}`, { tone: 'gold' });
                    else toast('Cannot sell', result.reasons[0], { tone: 'danger' });
                    world.pendingBids = world.pendingBids.filter((b) => b !== bid);
                    persist(); render();
                  },
                }, 'Accept'),
                h('button', {
                  class: 'btn sm ghost',
                  onclick: (e) => {
                    e.stopPropagation();
                    world.pendingBids = world.pendingBids.filter((b) => b !== bid);
                    if (player) player.morale = Math.max(5, player.morale - 5);
                    toast('Bid rejected', `${bid.playerName} stays — for now.`);
                    persist(); render();
                  },
                }, 'Reject'),
              ),
            ),
          );
        })),
      ),
    ),
  );
}
