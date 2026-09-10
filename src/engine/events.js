// Random events. Weighted, with streak protection, and every one of them offers the
// player a genuine choice rather than just an announcement.

import { clamp } from '../core/rng.js';
import { money } from '../core/format.js';
import { squadRating, weeklyWages, pickBestXI } from '../model/club.js';
import { renewalDemand, sellPlayer } from './transfers.js';
import { generateProspect, promoteProspect } from './youth.js';
import { recordLedger, receiveTransferFee } from './finance.js';
import { STADIUM_TIERS } from './stadium.js';
import { pushInboxEntry } from './inbox.js';

function contractCandidates(club) {
  const bar = squadRating(club);
  return club.squad.filter((p) => {
    if (p.overall < bar || p.contractYears > 2) return false;
    const demand = renewalDemand(p);
    return demand.wage - p.wage >= Math.max(50, p.wage * 0.1);
  });
}

// tone: 'good' | 'bad' | 'neutral' — used for streak protection and UI colour.
const EVENT_POOL = [
  {
    id: 'contract_demand', weight: 16, tone: 'bad',
    // Only worth raising if the player actually wants meaningfully more than he earns.
    applicable: (world, club) => contractCandidates(club).length > 0,
    build(world, club, rng) {
      const candidates = contractCandidates(club);
      const player = rng.pick(candidates);
      const demand = renewalDemand(player);
      const rise = demand.wage - player.wage;
      return {
        title: 'Contract demand',
        body: `${player.name} (${player.position}, ${player.overall}) is unhappy with his deal. His agent wants ${money(demand.wage)} a week — a rise of ${money(rise)}.`,
        subject: { playerId: player.id },
        choices: [
          {
            label: 'Give him the rise',
            detail: `${money(demand.wage)}/week, ${demand.years} years`,
            apply: () => {
              const p = club.squad.find((x) => x.id === player.id);
              if (!p) return 'He has already left.';
              p.wage = demand.wage;
              p.contractYears = demand.years;
              p.morale = clamp(p.morale + 16, 5, 100);
              return `${p.name} signs a new deal and is delighted.`;
            },
          },
          {
            label: 'Refuse',
            detail: 'Saves money, costs morale',
            apply: () => {
              const p = club.squad.find((x) => x.id === player.id);
              if (!p) return 'He has already left.';
              p.morale = clamp(p.morale - 24, 5, 100);
              for (const other of club.squad) other.morale = clamp(other.morale - 2, 5, 100);
              return `${p.name} is furious, and the dressing room has noticed.`;
            },
          },
          {
            label: 'Sell him',
            detail: `Around ${money(player.value)}`,
            apply: () => {
              const p = club.squad.find((x) => x.id === player.id);
              if (!p) return 'He has already left.';
              const result = sellPlayer(world, club, p.id, p.value);
              if (!result.ok) return result.reasons[0];
              return `${p.name} is sold for ${money(p.value)}.`;
            },
          },
        ],
      };
    },
  },
  {
    id: 'training_injury', weight: 11, tone: 'bad',
    applicable: (world, club) => club.squad.filter((p) => p.injuredFor <= 0).length > 14,
    build(world, club, rng) {
      const fit = club.squad.filter((p) => p.injuredFor <= 0);
      const player = rng.pick(fit);
      const weeks = rng.weighted([2, 4, 7, 12], [40, 32, 20, 8]);
      return {
        title: 'Injury in training',
        body: `${player.name} has picked up a knock in training and will be out for around ${weeks} weeks.`,
        auto: () => {
          const p = club.squad.find((x) => x.id === player.id);
          if (!p) return '';
          p.injuredFor = weeks;
          p.injuryType = weeks >= 8 ? 'Serious injury' : 'Muscle injury';
          club.lineup = pickBestXI(club);
          return `${p.name} is out for ${weeks} weeks.`;
        },
        choices: [
          { label: 'Rest him properly', detail: 'Full recovery, no setbacks', apply: () => `${player.name} begins his rehabilitation.` },
          {
            label: 'Rush him back', detail: 'Half the layoff, risk of recurrence',
            apply: () => {
              const p = club.squad.find((x) => x.id === player.id);
              if (!p) return '';
              p.injuredFor = Math.max(1, Math.round(weeks / 2));
              if (rng.chance(0.4)) {
                p.injuredFor += rng.int(3, 8);
                return `${p.name} breaks down again. He is out even longer.`;
              }
              p.morale = clamp(p.morale - 4, 5, 100);
              return `${p.name} is back in half the time.`;
            },
          },
        ],
      };
    },
  },
  {
    id: 'youth_discovery', weight: 14, tone: 'good',
    applicable: (world, club) => club.squad.length < 29,
    build(world, club, rng) {
      const prospect = generateProspect(world, club, rng);
      return {
        title: 'Academy discovery',
        body: `The academy has produced ${prospect.name}, a ${prospect.age}-year-old ${prospect.position} rated ${prospect.overall} with a ceiling of ${prospect.potential}.`,
        subject: { prospect },
        choices: [
          {
            label: 'Promote to the senior squad',
            detail: `${money(prospect.wage)}/week`,
            apply: () => {
              const res = promoteProspect(club, prospect);
              return res.ok ? `${prospect.name} joins the first-team squad.` : res.reason;
            },
          },
          {
            label: 'Sell him now',
            detail: `${money(Math.round(prospect.value * 1.3))} up front`,
            apply: () => {
              const fee = Math.round(prospect.value * 1.3);
              receiveTransferFee(club, fee, world.seasonNumber, `Sold academy player ${prospect.name}`);
              return `${prospect.name} is sold for ${money(fee)}. You may regret that.`;
            },
          },
          { label: 'Leave him in the academy', detail: 'No cost, no benefit yet', apply: () => `${prospect.name} stays with the under-21s.` },
        ],
      };
    },
  },
  {
    id: 'sponsor_offer', weight: 12, tone: 'good',
    applicable: () => true,
    build(world, club, rng) {
      const current = club.sponsor?.value || 0;
      const uplift = Math.round(current * rng.float(1.15, 1.55));
      const bonus = Math.round(current * rng.float(0.4, 0.9));
      return {
        title: 'Sponsorship offer',
        body: `A backer wants to put their name on the shirt. Your current deal is worth ${money(current)} a season.`,
        choices: [
          {
            label: 'Take the bigger annual deal',
            detail: `${money(uplift)} per season`,
            apply: () => { club.sponsor.value = uplift; return `Shirt deal upgraded to ${money(uplift)} a season.`; },
          },
          {
            label: 'Take a one-off payment',
            detail: `${money(bonus)} now`,
            apply: () => {
              recordLedger(club, world.seasonNumber, 'sponsorship', 'One-off sponsorship payment', bonus);
              return `${money(bonus)} lands in the bank immediately.`;
            },
          },
          { label: 'Decline', detail: 'Hold out for something better', apply: () => 'You turn them down.' },
        ],
      };
    },
  },
  {
    id: 'stadium_demand', weight: 10, tone: 'neutral',
    applicable: (world, club) => club.fans > club.stadiumCapacity * 0.92 && club.stadiumCapacity < 60000,
    build(world, club, rng) {
      const next = STADIUM_TIERS.find((t) => t.capacity > club.stadiumCapacity);
      return {
        title: 'Selling out every week',
        body: `Every home game is a sell-out and supporters are being turned away. ${next ? `Expanding to ${next.capacity.toLocaleString('en-GB')} would cost ${money(next.cost)}.` : 'The ground cannot be expanded further.'}`,
        choices: [
          {
            label: next ? 'Approve the expansion' : 'Note it',
            detail: next ? money(next.cost) : '',
            apply: () => {
              if (!next) return 'Nothing to be done.';
              if (club.balance < next.cost) return 'The board cannot fund it right now.';
              recordLedger(club, world.seasonNumber, 'stadium', `Expansion to ${next.capacity.toLocaleString('en-GB')}`, -next.cost);
              club.stadiumCapacity = next.capacity;
              return `Capacity increased to ${next.capacity.toLocaleString('en-GB')}.`;
            },
          },
          {
            label: 'Raise ticket prices instead',
            detail: 'More money now, fewer fans later',
            apply: () => {
              const gain = Math.round(club.fans * 45);
              recordLedger(club, world.seasonNumber, 'matchday', 'Ticket price increase', gain);
              club.fans = Math.round(club.fans * 0.94);
              return `${money(gain)} raised, but some supporters are priced out.`;
            },
          },
          { label: 'Do nothing', detail: 'Keep the atmosphere', apply: () => 'The waiting list grows.' },
        ],
      };
    },
  },
  {
    id: 'transfer_interest', weight: 11, tone: 'neutral',
    applicable: (world, club) => club.squad.length > 18 && club.squad.some((p) => p.overall >= squadRating(club) + 2),
    build(world, club, rng) {
      const targets = club.squad.filter((p) => p.overall >= squadRating(club) + 2);
      const player = rng.pick(targets);
      const suitors = Object.values(world.clubs).filter((c) => !c.isPlayerClub && c.reputation > club.reputation + 6);
      const buyer = suitors.length ? rng.pick(suitors) : null;
      const offer = Math.round(player.value * rng.float(1.1, 1.7));
      return {
        title: 'Transfer interest',
        body: `${buyer ? buyer.name : 'A bigger club'} have bid ${money(offer)} for ${player.name} (${player.position}, ${player.overall}). He is valued at ${money(player.value)}.`,
        choices: [
          {
            label: 'Accept the bid',
            detail: money(offer),
            apply: () => {
              const p = club.squad.find((x) => x.id === player.id);
              if (!p) return 'He has already gone.';
              const result = sellPlayer(world, club, p.id, offer, buyer?.id ?? null);
              if (!result.ok) return result.reasons[0];
              for (const other of club.squad) other.morale = clamp(other.morale - 4, 5, 100);
              return `${p.name} is sold for ${money(offer)}.`;
            },
          },
          {
            label: 'Reject it',
            detail: 'Keep your best player',
            apply: () => {
              const p = club.squad.find((x) => x.id === player.id);
              if (p) p.morale = clamp(p.morale - 8, 5, 100);
              return `You turn the bid down. ${player.name} is not thrilled.`;
            },
          },
        ],
      };
    },
  },
  {
    id: 'morale_boost', weight: 8, tone: 'good',
    applicable: () => true,
    build(world, club, rng) {
      const cost = Math.round(weeklyWages(club) * rng.float(0.4, 0.9));
      return {
        title: 'Squad bonding',
        body: 'The senior players have asked for a team-building trip before the next run of fixtures.',
        choices: [
          {
            label: 'Fund the trip',
            detail: money(cost),
            apply: () => {
              if (club.balance < cost) return 'You cannot afford it.';
              recordLedger(club, world.seasonNumber, 'operations', 'Team-building trip', -cost);
              for (const p of club.squad) p.morale = clamp(p.morale + 11, 5, 100);
              return 'The squad comes back noticeably happier.';
            },
          },
          {
            label: 'Refuse — we have work to do',
            detail: 'Free, mildly unpopular',
            apply: () => {
              for (const p of club.squad) p.morale = clamp(p.morale - 3, 5, 100);
              return 'The players get on with it.';
            },
          },
        ],
      };
    },
  },
  {
    id: 'windfall', weight: 6, tone: 'good',
    applicable: () => true,
    build(world, club, rng) {
      const amount = Math.round(club.sponsor?.value * rng.float(0.2, 0.5) || 50_000);
      return {
        title: 'Unexpected income',
        body: `A local business wants to sponsor the training ground for ${money(amount)}.`,
        choices: [
          {
            label: 'Take the money',
            detail: money(amount),
            apply: () => {
              recordLedger(club, world.seasonNumber, 'sponsorship', 'Training ground sponsor', amount);
              return `${money(amount)} added to the bank.`;
            },
          },
          {
            label: 'Ask for facilities instead',
            detail: 'Improves training quality this season',
            apply: () => {
              for (const p of club.squad) p.fitness = clamp(p.fitness + 6, 25, 100);
              return 'New equipment arrives. The squad is sharper.';
            },
          },
        ],
      };
    },
  },
  {
    id: 'board_confidence', weight: 7, tone: 'neutral',
    applicable: (world, club) => club.form.length >= 5,
    build(world, club, rng) {
      const recent = club.form.slice(-6);
      const wins = recent.filter((r) => r === 'W').length;
      const losses = recent.filter((r) => r === 'L').length;
      const positive = wins >= 3;
      return {
        title: positive ? 'The board is pleased' : 'The board wants answers',
        body: positive
          ? `A run of ${wins} wins in ${recent.length} has caught the board's attention. They are willing to back you.`
          : `${losses} defeats in the last ${recent.length} has the board concerned about the direction of the season.`,
        choices: positive
          ? [
              {
                label: 'Ask for transfer funds',
                detail: 'Boosts the transfer budget',
                apply: () => {
                  const extra = Math.round(club.sponsor?.value * 0.35 || 40_000);
                  club.transferBudget += extra;
                  return `The board adds ${money(extra)} to your transfer budget.`;
                },
              },
              {
                label: 'Ask for a bigger wage budget',
                detail: 'Raises the weekly ceiling',
                apply: () => {
                  const extra = Math.round(club.wageBudget * 0.12);
                  club.wageBudget += extra;
                  return `Weekly wage budget raised by ${money(extra)}.`;
                },
              },
            ]
          : [
              {
                label: 'Promise improvement',
                detail: 'Squad responds to the pressure',
                apply: () => {
                  for (const p of club.squad) p.morale = clamp(p.morale + 5, 5, 100);
                  return 'You back your players publicly. They appreciate it.';
                },
              },
              {
                label: 'Blame the squad',
                detail: 'Buys you time, costs morale',
                apply: () => {
                  for (const p of club.squad) p.morale = clamp(p.morale - 9, 5, 100);
                  return 'The board is placated. The dressing room is not.';
                },
              },
            ],
      };
    },
  },
];

// Fire an event, respecting cooldown and never landing two bad ones in a row.
export function maybeFireEvent(world, rng) {
  const club = world.clubs[world.playerClubId];
  if (world.pendingEvent) return null;
  if (world.eventCooldown > 0) { world.eventCooldown--; return null; }
  if (!rng.chance(0.42)) return null;

  const pool = EVENT_POOL.filter((e) => {
    if (!e.applicable(world, club)) return false;
    // Streak protection: a bad event never immediately follows another bad one.
    if (world.lastEventBad && e.tone === 'bad') return false;
    return true;
  });
  if (!pool.length) return null;

  const def = rng.weighted(pool, pool.map((e) => e.weight));
  const event = def.build(world, club, rng);
  event.id = def.id;
  event.tone = def.tone;

  world.pendingEvent = event;
  world.lastEventBad = def.tone === 'bad';
  world.eventCooldown = rng.int(2, 5);
  return event;
}

export function resolveEvent(world, choiceIndex) {
  const event = world.pendingEvent;
  if (!event) return null;
  const choice = event.choices[choiceIndex];
  world.pendingEvent = null;
  if (!choice) return null;
  const outcome = choice.apply();
  pushInboxEntry(world, {
    type: 'event',
    tone: event.tone,
    title: event.title,
    body: `${choice.label} — ${outcome}`,
  });
  return { title: event.title, choice: choice.label, outcome };
}
