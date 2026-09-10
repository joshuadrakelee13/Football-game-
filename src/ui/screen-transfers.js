// Transfers: the market, incoming bids, free agents and your own outgoings.

import { h, clubChip, ratingPill, panel, emptyState } from './dom.js';
import { money, num } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { squadRating, weeklyWages } from '../model/club.js';
import { sellPlayer } from '../engine/transfers.js';
import { canOpenNegotiation } from '../engine/negotiation.js';
import { visiblePotential, scoutPlayer, scoutCost, marketSizeBonus } from '../engine/scouting.js';
import { transferBudget } from '../engine/finance.js';
import { persist, render, game } from '../main.js';
import { openModal, closeModal, confirmDialog } from './modal.js';
import { openBuyNegotiation, openSellNegotiation } from './negotiation-modal.js';
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
      tabButton('bids', `Offers received (${bids.length})`),
    ),

    tab === 'market' ? marketPanel(world, you)
      : tab === 'free' ? freeAgentPanel(world, you)
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
        return h('tr', { class: 'clickable', onclick: () => openTarget(world, you, p) },
          h('td', { class: 'strong' },
            p.name,
            p.fromClub ? h('span', { class: 'tag muted', style: { marginLeft: '6px' } }, world.clubs[p.fromClub]?.abbr || '') : null,
          ),
          h('td', null, p.position),
          h('td', { class: 'num' }, p.age),
          h('td', { class: 'num' }, ratingPill(p.overall, { context: avg })),
          h('td', null, h('span', { class: 'pot-range' + (pot.exact ? ' exact' : '') },
            pot.exact ? pot.min : `${pot.min}–${pot.max}`)),
          h('td', null, h('span', { style: { fontSize: '11.5px', color: 'var(--text-3)' } }, p.archetype)),
          h('td', { class: 'num' }, p.askingPrice ? money(p.askingPrice) : 'Free'),
          h('td', { class: 'num' }, money(p.wage)),
          h('td', null, check.ok
            ? h('span', { class: 'tag pitch' }, 'Available')
            : h('span', { class: 'tag muted', title: check.reasons.join('; ') }, shortReason(check.reasons[0]))),
        );
      })),
    ),
  );
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

function openTarget(world, you, player) {
  const check = canOpenNegotiation(world, you, player);
  const pot = visiblePotential(you, player);
  const cost = scoutCost(you, player);
  const attrs = ['pace', 'finishing', 'passing', 'tackling', 'physical', 'technique'];

  openModal({
    title: player.name,
    wide: true,
    body: h('div', null,
      h('div', { style: { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' } },
        info('Position', player.position),
        info('Age', player.age),
        info('Overall', Math.round(player.overall)),
        info('Potential', pot.exact ? pot.min : `${pot.min}–${pot.max}`),
        info('Fee', player.askingPrice ? money(player.askingPrice) : 'Free'),
        info('Wage', money(player.wage) + '/wk'),
      ),
      h('p', { style: { color: 'var(--text-2)', fontSize: '13px', margin: '0 0 16px' } },
        `${player.archetype}. `,
        player.fromClub ? `Currently at ${world.clubs[player.fromClub]?.name}. ` : '',
        pot.exact ? 'Fully scouted.' : `Your scouts put his ceiling somewhere between ${pot.min} and ${pot.max}.`,
      ),
      h('div', { class: 'grid cols-2' }, ...attrs.map((a) => attrRow(a, player.attributes[a]))),
      !check.ok
        ? h('div', { style: { marginTop: '16px', padding: '10px 12px', border: '1px solid var(--danger-dim)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: '12.5px' } },
            check.reasons.join(' · '))
        : null,
    ),
    actions: [
      !player.scouted ? h('button', {
        class: 'btn ghost',
        onclick: () => {
          const result = scoutPlayer(world, you, player);
          closeModal();
          if (result.ok) toast('Scout report', `${player.name}'s ceiling is ${result.potential}.`);
          else toast('Cannot scout', result.reason, { tone: 'danger' });
          persist(); render();
        },
      }, `Scout · ${money(cost)}`) : null,
      h('button', {
        class: 'btn primary',
        disabled: !check.ok,
        onclick: () => {
          closeModal();
          openBuyNegotiation(world, you, player);
        },
      }, !player.askingPrice ? 'Discuss personal terms'
        : player.fromClub ? `Negotiate · asking ${money(player.askingPrice)}`
        : `Sign for ${money(player.askingPrice)}`),
    ],
  });
}

function attrRow(name, value) {
  const tone = value >= 75 ? 'var(--pitch)' : value >= 55 ? 'var(--text)' : value >= 40 ? 'var(--warn)' : 'var(--danger)';
  return h('div', null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      h('span', { class: 'eyebrow' }, name),
      h('span', { class: 'mono', style: { fontSize: '12px', color: tone } }, Math.round(value)),
    ),
    h('div', { class: 'meter' }, h('i', { style: { width: (value / 99 * 100) + '%', background: tone } })),
  );
}

function info(k, v) {
  return h('div', null, h('div', { class: 'eyebrow' }, k), h('div', { class: 'mono', style: { fontSize: '15px' } }, v));
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
            h('td', null, clubChip(world.clubs[bid.buyerId], { short: false })),
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
