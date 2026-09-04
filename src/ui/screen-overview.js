// The dashboard. Its only job is to make the next useful action obvious.

import { h, clubChip, formGuide, meter, panel, emptyState } from './dom.js';
import { money, compact, ordinal, seasonLabel, matchDate, num } from '../core/format.js';
import { playerClub, fixtureForClubOnMatchday } from '../model/world.js';
import { DIVISION_BY_TIER } from '../data/competitions.js';
import { squadRating, squadMorale, weeklyWages, overallStrength } from '../model/club.js';
import { standings } from '../engine/league.js';
import { currentMatchday, playerFixture } from '../engine/season.js';
import { currentObjective, seasonExpectation } from '../engine/objectives.js';
import { attendanceFor } from '../engine/finance.js';
import { advance, simToNextFixture, autoPlaySeason, goTo } from '../main.js';
import { openModal, closeModal } from './modal.js';

export function renderOverview(world) {
  const you = playerClub(world);
  const div = DIVISION_BY_TIER[you.tier];
  const next = playerFixture(world);
  const md = currentMatchday(world);

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, you.name),
      h('span', { class: 'sub' }, `${div.name} · Season ${world.seasonNumber} · ${seasonLabel(world.startYear)}`),
    ),

    nextMatchHero(world, you, next, md),
    objectiveStrip(world),

    h('div', { class: 'grid split' },
      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        miniTable(world, you),
        recentResults(world, you),
      ),
      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        clubSnapshot(world, you),
        topPerformers(world, you),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------

function nextMatchHero(world, you, next, md) {
  if (!next) {
    return h('div', { class: 'hero' },
      h('div', { class: 'eyebrow' }, 'Season complete'),
      h('h2', { style: { fontSize: '22px', marginTop: '6px' } }, 'All fixtures played'),
      h('p', { style: { color: 'var(--text-3)', margin: '8px 0 16px' } },
        'Wrap the season up to see the final tables, prize money and who goes up.'),
      h('button', { class: 'btn primary lg', onclick: () => advance('quick') }, 'End the season'),
    );
  }

  const { fixture, matchday } = next;
  const isHome = fixture.home === you.id;
  const opponentId = isHome ? fixture.away : fixture.home;
  const opponent = world.clubs[opponentId] || world.europeClubs?.[opponentId];
  const compLabel = competitionLabel(fixture, matchday, world);
  const gate = isHome ? attendanceFor(you, opponent, world) : null;

  const gap = opponent ? overallStrength(you) - overallStrength(opponent) : 0;
  const oddsWord = gap > 6 ? 'Favourites' : gap > 1.5 ? 'Slight favourites' : gap > -1.5 ? 'Evenly matched' : gap > -6 ? 'Slight underdogs' : 'Underdogs';

  return h('div', { class: 'hero' },
    h('div', { class: 'eyebrow' }, `${compLabel} · ${matchDate(matchday.day, world.startYear)}`),
    h('div', { class: 'next-match', style: { marginTop: '14px' } },
      h('div', { class: 'versus' },
        // Left is always the home side, so the fixture reads the way it would on a
        // scoreboard rather than always leading with the player's club.
        h('div', { class: 'side' },
          h('span', { class: 'club-name' }, isHome ? you.short : opponent?.short || '—'),
          h('span', { class: 'meta' }, isHome ? 'Home' : (opponent ? DIVISION_BY_TIER[opponent.tier]?.short || 'Europe' : '')),
        ),
        h('span', { class: 'vs' }, 'v'),
        h('div', { class: 'side' },
          h('span', { class: 'club-name' }, isHome ? opponent?.short || '—' : you.short),
          h('span', { class: 'meta' }, isHome ? (opponent ? DIVISION_BY_TIER[opponent.tier]?.short || 'Europe' : '') : 'Away'),
        ),
      ),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary lg', onclick: () => advance('live') }, 'Play match'),
        h('button', { class: 'btn', onclick: () => advance('quick') }, 'Quick sim'),
        h('button', { class: 'btn ghost', onclick: () => openSimMenu(world) }, 'Sim ahead'),
      ),
    ),
    h('div', { style: { display: 'flex', gap: 'var(--space-5)', marginTop: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-3)' } },
      h('span', null, h('span', { class: 'eyebrow' }, 'Verdict '), ' ', oddsWord),
      opponent && h('span', null, h('span', { class: 'eyebrow' }, 'Their form '), ' ', formGuide(opponent.form, 5)),
      gate && h('span', null, h('span', { class: 'eyebrow' }, 'Expected gate '), ` ${num(gate.attendance)}${gate.soldOut ? ' (sell-out)' : ''}`),
    ),
  );
}

function competitionLabel(fixture, matchday, world) {
  const comp = fixture.competition;
  if (comp === 'LEAGUE') return `${DIVISION_BY_TIER[fixture.tier].name} · Matchday ${fixture.leagueRound}`;
  if (comp === 'FA') return `FA Cup · ${fixture.roundLabel}`;
  if (comp === 'EFL') return `Carabao Cup · ${fixture.roundLabel}`;
  const euro = { UCL: 'Champions League', UEL: 'Europa League', UECL: 'Conference League' }[comp];
  return euro ? `${euro} · ${fixture.roundLabel}` : comp;
}

function openSimMenu(world) {
  const go = (fn) => { closeModal(); fn(); };
  openModal({
    title: 'Sim ahead',
    body: h('div', { class: 'choice-list' },
      h('button', { class: 'choice', onclick: () => go(() => simToNextFixture()) },
        h('span', null, h('div', { class: 'label' }, 'To my next fixture'),
          h('div', { style: { color: 'var(--text-3)', fontSize: '12px' } }, 'Play out everyone else’s games and stop when I am next in action')),
      ),
      h('button', { class: 'choice', onclick: () => go(() => autoPlaySeason()) },
        h('span', null, h('div', { class: 'label' }, 'Auto-play the rest of the season'),
          h('div', { style: { color: 'var(--text-3)', fontSize: '12px' } }, 'Hand every remaining fixture to the engine and jump to the season review')),
      ),
    ),
  });
}

// ---------------------------------------------------------------------------

function objectiveStrip(world) {
  const objective = currentObjective(world);
  const expectation = seasonExpectation(world);
  return h('div', { class: 'grid cols-2' },
    h('div', { class: 'objective-row' },
      h('div', { class: 'text' },
        h('div', { class: 'name' }, objective.name),
        h('div', { class: 'desc' }, objective.description),
      ),
      meter(objective.ratio, objective.complete ? '' : 'gold'),
    ),
    h('div', { class: 'objective-row' },
      h('div', { class: 'text' },
        h('div', { class: 'name' }, 'Board expectation'),
        h('div', { class: 'desc' }, expectation.text),
      ),
      h('span', { class: 'tag ' + (expectation.tone === 'high' ? 'pitch' : expectation.tone === 'low' ? 'danger' : 'info') },
        expectation.tone === 'high' ? 'Ambitious' : expectation.tone === 'low' ? 'Survival' : 'Steady'),
    ),
  );
}

// ---------------------------------------------------------------------------

function miniTable(world, you) {
  const table = standings(world.tables[you.tier], (id) => world.clubs[id]?.name || id);
  const index = table.findIndex((r) => r.clubId === you.id);
  const div = DIVISION_BY_TIER[you.tier];

  // Show a window around the player rather than the top of the table, which is
  // what actually matters when you are 17th.
  const start = Math.max(0, Math.min(index - 3, table.length - 8));
  const window_ = table.slice(start, start + 8);

  return panel(div.short,
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', null, h('tr', null,
          h('th', null, '#'), h('th', null, 'Club'),
          h('th', { class: 'num' }, 'P'), h('th', { class: 'num' }, 'GD'), h('th', { class: 'num' }, 'Pts'),
          h('th', null, 'Form'),
        )),
        h('tbody', null, ...window_.map((row) => {
          const club = world.clubs[row.clubId];
          const pos = table.indexOf(row) + 1;
          return h('tr', { class: (club.isPlayerClub ? 'you ' : '') + zoneClass(pos, div, table.length) },
            h('td', { class: 'pos num' }, pos),
            h('td', { class: 'strong' }, clubChip(club)),
            h('td', { class: 'num' }, row.played),
            h('td', { class: 'num' }, signedNum(row.goalsFor - row.goalsAgainst)),
            h('td', { class: 'num strong' }, row.points),
            h('td', null, formGuide(row.form, 5)),
          );
        })),
      ),
    ),
    h('button', { class: 'btn ghost sm', onclick: () => goTo('table') }, 'Full table'),
  );
}

export function zoneClass(position, div, size) {
  if (div.tier > 0 && position <= div.autoPromoted) return 'zone-promo';
  if (div.playoffPlaces.includes(position)) return 'zone-playoff';
  if (div.relegated > 0 && position > size - div.relegated) return 'zone-releg';
  if (div.tier === 0 && position <= 4) return 'zone-promo';
  return '';
}

export function signedNum(n) {
  return (n > 0 ? '+' : '') + n;
}

// ---------------------------------------------------------------------------

function recentResults(world, you) {
  const results = (world.results || []).slice(-6).reverse();
  if (!results.length) return panel('Recent results', emptyState('No matches played yet this season.'));

  return panel('Recent results',
    h('div', null, ...results.map((r) => {
      const isHome = r.home === you.id;
      const opponentId = isHome ? r.away : r.home;
      const opponent = world.clubs[opponentId] || world.europeClubs?.[opponentId];
      const gf = isHome ? r.homeGoals : r.awayGoals;
      const ga = isHome ? r.awayGoals : r.homeGoals;
      const outcome = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
      return h('div', { class: 'result-row' },
        h('span', { class: `score ${outcome}` }, `${gf}–${ga}`),
        h('span', { class: 'opponent' }, isHome ? 'v ' : 'at ', opponent?.short || '—'),
        h('span', { class: 'comp' }, r.competition === 'LEAGUE' ? 'League' : r.competition),
      );
    })),
  );
}

// ---------------------------------------------------------------------------

function clubSnapshot(world, you) {
  const wages = weeklyWages(you);
  const morale = squadMorale(you);
  const capacityUse = you.fans / Math.max(1, you.stadiumCapacity);

  return panel('Club',
    h('div', { class: 'panel-body', style: { display: 'grid', gap: 'var(--space-3)' } },
      snapshotRow('Squad rating', squadRating(you).toFixed(1), squadRating(you) / 90),
      snapshotRow('Squad morale', Math.round(morale) + '%', morale / 100, morale < 42 ? 'danger' : ''),
      snapshotRow('Wage bill', `${money(wages)} of ${money(you.wageBudget)}`, wages / Math.max(1, you.wageBudget), wages > you.wageBudget ? 'danger' : ''),
      snapshotRow('Ground', `${num(you.fans)} of ${num(you.stadiumCapacity)}`, capacityUse, capacityUse > 0.95 ? 'gold' : ''),
      snapshotRow('Reputation', Math.round(you.reputation) + ' / 100', you.reputation / 100, 'gold'),
    ),
  );
}

function snapshotRow(label, value, ratio, tone = '') {
  return h('div', null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '5px' } },
      h('span', { class: 'eyebrow' }, label),
      h('span', { class: 'mono', style: { fontSize: '12px' } }, value),
    ),
    meter(ratio, tone),
  );
}

// ---------------------------------------------------------------------------

function topPerformers(world, you) {
  const scorers = [...you.squad]
    .filter((p) => p.seasonGoals > 0 || p.seasonAssists > 0)
    .sort((a, b) => (b.seasonGoals * 2 + b.seasonAssists) - (a.seasonGoals * 2 + a.seasonAssists))
    .slice(0, 5);

  if (!scorers.length) return panel('Top performers', emptyState('Nobody has scored yet.'));

  return panel('Top performers',
    h('table', { class: 'data' },
      h('thead', null, h('tr', null,
        h('th', null, 'Player'), h('th', null, 'Pos'),
        h('th', { class: 'num' }, 'Apps'), h('th', { class: 'num' }, 'G'), h('th', { class: 'num' }, 'A'),
      )),
      h('tbody', null, ...scorers.map((p) => h('tr', null,
        h('td', { class: 'strong' }, p.name),
        h('td', null, p.position),
        h('td', { class: 'num' }, p.seasonApps),
        h('td', { class: 'num strong' }, p.seasonGoals),
        h('td', { class: 'num' }, p.seasonAssists),
      ))),
    ),
  );
}
