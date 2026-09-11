// Shared imperative handlers for player transactions. Both tab content and
// context menus call into these — never duplicating the transaction logic
// itself — so the fix this pass makes (Renew, Sell, and the youth prospect
// Sell/Release now all correctly confirm, where before only squad-Sell did)
// can't drift back apart between two call sites.

import { confirmDialog } from './modal.js';
import { toast } from './toast.js';
import { money } from '../core/format.js';
import { persist, render, goBack } from '../main.js';
import { renewContract, renewalDemand, sellPlayer } from '../engine/transfers.js';
import { scoutPlayer } from '../engine/scouting.js';
import { openBuyNegotiation } from './negotiation-modal.js';

export async function renewPlayer(club, player) {
  const demand = renewalDemand(player);
  const ok = await confirmDialog('Offer a new contract?',
    `Offer ${player.name} ${money(demand.wage)}/week for ${demand.years} year${demand.years === 1 ? '' : 's'}?`,
    'Offer');
  if (!ok) return;
  const result = renewContract(club, player.id, demand.wage, demand.years);
  if (result.ok) toast('Contract renewed', `${player.name} signs for ${money(demand.wage)}/wk`);
  else toast('Renewal failed', result.reasons[0], { tone: 'danger' });
  persist(); render();
}

export async function sellSquadPlayer(world, club, player) {
  const ok = await confirmDialog('Sell player?',
    `Sell ${player.name} for around ${money(player.value)}? Your squad will drop to ${club.squad.length - 1} players.`,
    'Sell');
  if (!ok) return;
  const result = sellPlayer(world, club, player.id, player.value);
  if (result.ok) toast('Player sold', `${player.name} leaves for ${money(player.value)}`, { tone: 'gold' });
  else toast('Cannot sell', result.reasons[0], { tone: 'danger' });
  persist(); goBack();
}

export function scoutTarget(world, club, player) {
  const result = scoutPlayer(world, club, player);
  if (result.ok) toast('Scout report', `${player.name}'s ceiling is ${result.potential}.`);
  else toast('Cannot scout', result.reason, { tone: 'danger' });
  persist(); render();
}

export function negotiateFor(world, club, player) {
  openBuyNegotiation(world, club, player);
}
