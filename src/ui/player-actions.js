// Shared imperative handlers for player transactions. Both tab content and
// context menus call into these — never duplicating the transaction logic
// itself — so the fix this pass makes (Renew, Sell, and the youth prospect
// Sell/Release now all correctly confirm, where before only squad-Sell did)
// can't drift back apart between two call sites.

import { confirmDialog } from './modal.js';
import { toast } from './toast.js';
import { money } from '../core/format.js';
import { persist, render, goBack, retargetPlayerContext } from '../main.js';
import { playerClub } from '../model/world.js';
import { renewContract, renewalDemand, sellPlayer } from '../engine/transfers.js';
import { scoutPlayer } from '../engine/scouting.js';
import { promoteProspect } from '../engine/youth.js';
import { receiveTransferFee } from '../engine/finance.js';
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

export function promoteYouthProspect(world, prospect) {
  const club = playerClub(world);
  const result = promoteProspect(club, prospect);
  if (!result.ok) { toast('Cannot promote', result.reason, { tone: 'danger' }); return; }
  world.youthProspects = (world.youthProspects || []).filter((p) => p !== prospect);
  toast('Promoted', `${prospect.name} joins the senior squad.`);
  persist();
  // If a context is open on this prospect, follow him into the squad rather
  // than resolving to "no longer available" — a safe no-op if none is open.
  retargetPlayerContext(prospect.id, { kind: 'squad', clubId: club.id });
  render();
}

export async function sellYouthProspect(world, prospect) {
  const fee = Math.round(prospect.value * 1.3);
  const ok = await confirmDialog('Sell prospect?',
    `Sell ${prospect.name} for ${money(fee)}? He will never make the first team.`, 'Sell');
  if (!ok) return;
  receiveTransferFee(playerClub(world), fee, world.seasonNumber, `Sold academy player ${prospect.name}`);
  world.youthProspects = (world.youthProspects || []).filter((p) => p !== prospect);
  toast('Sold', `${prospect.name} leaves for ${money(fee)}.`, { tone: 'gold' });
  persist(); goBack();
}

export function toggleShortlist(world, playerId) {
  world.shortlist = world.shortlist || [];
  const i = world.shortlist.indexOf(playerId);
  if (i === -1) { world.shortlist.push(playerId); toast('Added to shortlist'); }
  else { world.shortlist.splice(i, 1); toast('Removed from shortlist'); }
  persist(); render();
}

export async function releaseYouthProspect(world, prospect) {
  const ok = await confirmDialog('Release prospect?',
    `Release ${prospect.name} from the academy? This cannot be undone.`, 'Release');
  if (!ok) return;
  world.youthProspects = (world.youthProspects || []).filter((p) => p !== prospect);
  toast('Released', `${prospect.name} has left the academy.`);
  persist(); goBack();
}
