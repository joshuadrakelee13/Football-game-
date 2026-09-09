// The transfer market: buying, selling, contracts, free agents and AI bidding.

import { clamp } from '../core/rng.js';
import { generatePlayer, valueOf, wageOf, refreshDerived, isAvailable } from '../model/player.js';
import { ratingForPrestige, weeklyWages, squadRating, pickBestXI } from '../model/club.js';
import { spendTransferFee, receiveTransferFee, transferBudget, canAffordWage } from './finance.js';
import { DIVISION_BY_TIER } from '../data/competitions.js';
import { pushInboxEntry } from './inbox.js';

export const MARKET_SIZE = 34;
export const FREE_AGENT_SIZE = 10;

// A rotating market pitched at the player's level: mostly their own division, with
// bargains from below and a few players they cannot yet afford from above.
export function generateTransferMarket(world, rng) {
  const you = world.clubs[world.playerClubId];
  const baseRating = ratingForPrestige(Math.max(10, you.reputation));
  const market = [];

  for (let i = 0; i < MARKET_SIZE; i++) {
    // Weighted toward the player's own level, with a long tail in both directions.
    const band = rng.weighted([-6, -2, 2, 6, 11, 17], [10, 22, 30, 22, 12, 4]);
    const tier = clamp(you.tier + (band > 6 ? -1 : band < -6 ? 1 : 0), 0, 4);
    const position = rng.weighted(
      ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'],
      [7, 14, 7, 7, 8, 13, 8, 9, 9, 18]
    );
    const ageBias = rng.chance(0.16) ? 'youth' : null;
    const player = generatePlayer(rng, {
      tier, position,
      targetOverall: clamp(baseRating + band, 30, 90),
      ageBias,
    });
    player.askingPrice = askingPrice(player, rng);
    player.fromClub = null;
    market.push(player);
  }

  // Genuine squad players that AI clubs have made available, so the market is not
  // purely synthetic and you can raid a real club.
  const candidateClubs = Object.values(world.clubs)
    .filter((c) => !c.isPlayerClub && Math.abs(c.tier - you.tier) <= 1 && c.squad.length > 21);
  const listed = rng.shuffle(candidateClubs).slice(0, 10);

  for (const club of listed) {
    const surplus = [...club.squad]
      .sort((a, b) => a.overall - b.overall)
      .slice(0, 6)
      .filter((p) => p.overall >= 30);
    if (!surplus.length) continue;
    const player = rng.pick(surplus);
    if (market.some((m) => m.id === player.id)) continue;
    market.push({ ...player, askingPrice: askingPrice(player, rng, 1.15), fromClub: club.id, listedBy: club.id });
  }

  return market;
}

export function askingPrice(player, rng, premium = 1) {
  const noise = rng.float(0.85, 1.25);
  return Math.max(1000, Math.round((player.value * premium * noise) / 1000) * 1000);
}

// Out-of-contract players, signable for wages alone.
export function generateFreeAgents(world, rng) {
  const you = world.clubs[world.playerClubId];
  const baseRating = ratingForPrestige(Math.max(10, you.reputation));
  const agents = [];

  for (let i = 0; i < FREE_AGENT_SIZE; i++) {
    // Free agents skew older or lower-rated: there is usually a reason they are free.
    const band = rng.weighted([-12, -7, -3, 1, 5], [22, 30, 26, 16, 6]);
    const player = generatePlayer(rng, {
      tier: you.tier,
      position: rng.pick(['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']),
      targetOverall: clamp(baseRating + band, 28, 82),
    });
    player.askingPrice = 0;
    player.freeAgent = true;
    player.contractYears = 0;
    agents.push(player);
  }
  return agents;
}

// ---------------------------------------------------------------------------
// Player-initiated moves
// ---------------------------------------------------------------------------

// Average squad rating of a division, cached per matchday. Recomputing it for every
// row of the transfer market would mean re-rating a few thousand players each render.
export function divisionStrength(world, tier) {
  const stamp = `${world.seasonNumber}:${world.matchdayIndex}`;
  if (world._divisionStrengthStamp !== stamp) {
    world._divisionStrengthStamp = stamp;
    world._divisionStrength = {};
  }
  if (world._divisionStrength[tier] !== undefined) return world._divisionStrength[tier];

  const ids = world.divisions[tier] || [];
  const total = ids.reduce((sum, id) => sum + squadRating(world.clubs[id]), 0);
  const average = ids.length ? total / ids.length : 50;
  world._divisionStrength[tier] = average;
  return average;
}

export function canSign(world, club, player) {
  const fee = player.askingPrice ?? player.value;
  const reasons = [];
  if (club.squad.length >= 30) reasons.push('Squad is full (30 players)');
  if (fee > transferBudget(club)) reasons.push('Transfer budget too low');
  if (!canAffordWage(club, player.wage)) reasons.push('Wage budget too low');

  // What a player will accept is driven by the division as much as by the club: people
  // sign for a Championship club because it is a Championship club. Judging purely on
  // reputation made every promotion a trapdoor, because a freshly promoted side could
  // not sign anyone good enough for the league it had just reached. Reputation still
  // matters — it is what lets a big club reach above its division for a star.
  const reputationPull = ratingForPrestige(club.reputation);
  const divisionPull = divisionStrength(world, club.tier) - 2;
  const pull = Math.max(reputationPull, divisionPull);
  if (player.overall > pull + 9) reasons.push('Not interested in a club this size');

  return { ok: reasons.length === 0, reasons, fee };
}

export function signPlayer(world, club, player, rng) {
  const check = canSign(world, club, player);
  if (!check.ok) return { ok: false, reasons: check.reasons };

  const signed = { ...player };
  signed.askingPrice = undefined;
  signed.freeAgent = undefined;
  signed.contractYears = signed.contractYears > 0 ? signed.contractYears : rng.int(2, 4);
  signed.morale = clamp(72 + rng.int(-6, 12), 30, 100);
  signed.fitness = clamp(signed.fitness, 70, 100);
  signed.joinedFrom = player.fromClub ? world.clubs[player.fromClub]?.short : 'Free agent';
  refreshDerived(signed);

  club.squad.push(signed);
  club.transfersIn.push({ playerId: signed.id, name: signed.name, fee: check.fee, season: world.seasonNumber });

  if (check.fee > 0) {
    spendTransferFee(club, check.fee, world.seasonNumber, `Signed ${signed.name}`);
    const seller = player.fromClub ? world.clubs[player.fromClub] : null;
    if (seller) {
      receiveTransferFee(seller, check.fee, world.seasonNumber, `Sold ${signed.name}`);
      seller.squad = seller.squad.filter((p) => p.id !== player.id);
      seller.lineup = pickBestXI(seller);
    }
  }

  club.lineup = pickBestXI(club);
  return { ok: true, player: signed, fee: check.fee };
}

export function sellPlayer(world, club, playerId, fee, buyerId = null) {
  const player = club.squad.find((p) => p.id === playerId);
  if (!player) return { ok: false, reasons: ['Player not in squad'] };
  if (club.squad.length <= 16) return { ok: false, reasons: ['Squad would drop below 16 players'] };

  club.squad = club.squad.filter((p) => p.id !== playerId);
  club.transfersOut.push({ playerId, name: player.name, fee, season: world.seasonNumber });
  receiveTransferFee(club, fee, world.seasonNumber, `Sold ${player.name}`);

  const buyer = buyerId ? world.clubs[buyerId] : null;
  if (buyer) {
    buyer.squad.push({ ...player, morale: 75, joinedFrom: club.short });
    spendTransferFee(buyer, fee, world.seasonNumber, `Signed ${player.name}`);
    buyer.lineup = pickBestXI(buyer);
  }

  // Selling a favourite unsettles the dressing room.
  const wasKeyPlayer = player.overall >= squadRating(club) + 3;
  if (wasKeyPlayer) {
    for (const p of club.squad) p.morale = clamp(p.morale - 5, 5, 100);
  }

  club.lineup = pickBestXI(club);
  return { ok: true, player, fee };
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

// What a player will accept to re-sign: better players ask for more, and anyone whose
// ability has outgrown their deal wants a rise.
export function renewalDemand(player) {
  const marketWage = wageOf(player);
  const ambition = 1 + Math.max(0, player.overall - 55) * 0.012;
  const moraleFactor = player.morale < 45 ? 1.25 : player.morale > 78 ? 0.95 : 1.08;
  const demand = Math.round((marketWage * ambition * moraleFactor) / 50) * 50;
  return { wage: Math.max(marketWage, demand), years: player.age >= 31 ? 1 : player.age >= 28 ? 2 : 3 };
}

export function renewContract(club, playerId, offeredWage, years) {
  const player = club.squad.find((p) => p.id === playerId);
  if (!player) return { ok: false, reasons: ['Player not in squad'] };

  const demand = renewalDemand(player);
  if (offeredWage < demand.wage * 0.92) {
    player.morale = clamp(player.morale - 6, 5, 100);
    return { ok: false, reasons: [`Wants at least £${demand.wage.toLocaleString('en-GB')}/week`], demand };
  }
  const projected = weeklyWages(club) - player.wage + offeredWage;
  if (projected > club.wageBudget * 1.15) {
    return { ok: false, reasons: ['That would break the wage budget'], demand };
  }

  player.wage = offeredWage;
  player.contractYears = years;
  player.morale = clamp(player.morale + 10, 5, 100);
  return { ok: true, player, demand };
}

// Contracts that ran out. Players leave for nothing, which is the point of the system.
export function processExpiringContracts(world, rng) {
  const departures = [];
  for (const club of Object.values(world.clubs)) {
    const leaving = club.squad.filter((p) => p.contractYears <= 0);
    if (!leaving.length) continue;

    for (const player of leaving) {
      // AI clubs mostly re-sign anyone they still want.
      if (!club.isPlayerClub && rng.chance(0.75)) {
        const demand = renewalDemand(player);
        player.wage = demand.wage;
        player.contractYears = demand.years;
        continue;
      }
      if (club.squad.length <= 17 && !club.isPlayerClub) {
        player.contractYears = 2;
        continue;
      }
      club.squad = club.squad.filter((p) => p.id !== player.id);
      departures.push({ clubId: club.id, player });
    }
    club.lineup = pickBestXI(club);
  }
  return departures;
}

// ---------------------------------------------------------------------------
// AI bidding for your players
// ---------------------------------------------------------------------------

// Bigger clubs come calling for your best players. Accepting is a genuine decision:
// the money is real, and so is the hole it leaves.
export function generateBids(world, rng) {
  const you = world.clubs[world.playerClubId];
  if (you.squad.length <= 17) return [];

  const targets = [...you.squad]
    .filter((p) => p.overall >= squadRating(you) - 1 || p.potential >= p.overall + 12)
    .sort((a, b) => (b.overall + b.potential) - (a.overall + a.potential))
    .slice(0, 6);
  if (!targets.length) return [];

  const bids = [];
  for (const player of targets) {
    if (!rng.chance(0.22)) continue;

    // Interest comes from clubs a level or two above where you are now.
    const suitors = Object.values(world.clubs).filter((c) =>
      !c.isPlayerClub &&
      c.tier <= you.tier &&
      c.reputation > you.reputation + 4 &&
      ratingForPrestige(c.reputation) > player.overall - 8 &&
      transferBudget(c) > player.value * 0.8
    );
    if (!suitors.length) continue;

    const buyer = rng.pick(suitors);
    // A wealthy suitor pays over the odds for a young player with a ceiling.
    const potentialPremium = 1 + Math.max(0, player.potential - player.overall) * 0.03;
    const offer = Math.round((player.value * rng.float(0.85, 1.45) * potentialPremium) / 1000) * 1000;

    bids.push({
      playerId: player.id,
      playerName: player.name,
      playerOverall: player.overall,
      buyerId: buyer.id,
      buyerName: buyer.name,
      buyerTier: buyer.tier,
      offer,
      value: player.value,
    });
  }
  return bids;
}

// ---------------------------------------------------------------------------
// AI clubs improving themselves between seasons
// ---------------------------------------------------------------------------

// AI clubs spend their allowance on the positions they are weakest in, which is what
// keeps every division competitive as the player climbs.
// A season's worth of same-tier AI activity alone runs into the hundreds of
// signings (~20 clubs x up to 4 each) — nowhere near "news," just squad depth.
// Capping the inbox's take keeps rival transfer news to a skimmable handful
// per season rather than swamping every other kind of entry.
const MAX_RIVAL_SIGNING_NEWS = 6;

export function runAiTransferWindow(world, rng) {
  const you = world.clubs[world.playerClubId];
  let rivalNewsLogged = 0;
  for (const club of Object.values(world.clubs)) {
    if (club.isPlayerClub) continue;

    // News-worthy only from the player's direct rivals, and only up to the cap above.
    const relevant = club.tier === you.tier;
    const target = ratingForPrestige(club.reputation);
    let budget = transferBudget(club);
    let signings = 0;

    while (budget > 0 && signings < 4 && club.squad.length < 27) {
      const weakest = [...club.squad].sort((a, b) => a.overall - b.overall)[0];
      if (!weakest) break;

      const wanted = clamp(target + rng.int(-3, 5), 28, 92);
      const recruit = generatePlayer(rng, {
        tier: club.tier,
        position: weakest.position,
        targetOverall: wanted,
        ageBias: rng.chance(0.2) ? 'youth' : null,
      });
      const fee = recruit.value;
      if (fee > budget) break;
      if (weeklyWages(club) - weakest.wage + recruit.wage > club.wageBudget * 1.2) break;
      if (recruit.overall <= weakest.overall) break;

      club.squad = club.squad.filter((p) => p.id !== weakest.id);
      club.squad.push(recruit);
      spendTransferFee(club, fee, world.seasonNumber, `Signed ${recruit.name}`);
      if (relevant && rivalNewsLogged < MAX_RIVAL_SIGNING_NEWS) {
        rivalNewsLogged++;
        pushInboxEntry(world, {
          type: 'rival_signing', tone: 'neutral', title: 'Transfer news',
          body: `${club.name} have signed ${recruit.name} (${recruit.position}).`,
        });
      }
      budget -= fee;
      signings++;
    }
    club.lineup = pickBestXI(club);
  }
}
