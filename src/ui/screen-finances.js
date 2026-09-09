// Finances: what came in, what went out, and what you can actually spend.

import { h, panel, meter, statTile, emptyState } from './dom.js';
import { money, moneyFull, num } from '../core/format.js';
import { playerClub } from '../model/world.js';
import { DIVISION_BY_TIER, leaguePrize } from '../data/competitions.js';
import { seasonSummary, weeklyRunningCost, transferBudget } from '../engine/finance.js';
import { weeklyWages } from '../model/club.js';
import { standings } from '../engine/league.js';

const CATEGORY_LABELS = {
  matchday: 'Matchday', sponsorship: 'Sponsorship', prize: 'Prize money',
  transfers: 'Transfers', wages: 'Player wages', stadium: 'Stadium',
  facilities: 'Facilities', operations: 'Staff and operations', scouting: 'Scouting',
  youth: 'Youth academy',
};

const CATEGORY_COLOURS = {
  matchday: '#7BDB56', sponsorship: '#5AA7F5', prize: '#F0C24D', transfers: '#C084FC',
  wages: '#FF5D6C', stadium: '#E8853B', facilities: '#8A94A6', operations: '#6E7B75',
  scouting: '#3BA55C', youth: '#4A6BF5',
};

export function renderFinances(world) {
  const you = playerClub(world);
  const div = DIVISION_BY_TIER[you.tier];
  const summary = seasonSummary(you, world.seasonNumber);
  const cost = weeklyRunningCost(you);
  const wageRatio = weeklyWages(you) / Math.max(1, you.wageBudget);

  const table = standings(world.tables[you.tier], (id) => world.clubs[id]?.name || id);
  const position = table.findIndex((r) => r.clubId === you.id) + 1;
  const projectedPrize = position ? leaguePrize(you.tier, position) : 0;

  const incomeRows = Object.entries(summary.groups).filter(([, g]) => g.income > 0);
  const expenseRows = Object.entries(summary.groups).filter(([, g]) => g.expense > 0);
  const ledger = (you.ledger || []).filter((l) => l.season === world.seasonNumber).slice(-40).reverse();

  return h('div', { class: 'stagger' },
    h('div', { class: 'screen-title' },
      h('h1', null, 'Finances'),
      h('span', { class: 'sub' }, `Season ${world.seasonNumber} · ${div.name}`),
    ),

    h('div', { class: 'grid cols-4' },
      statTile('Bank balance', money(you.balance), { tone: you.balance < 0 ? 'bad' : 'money' }),
      statTile('Transfer budget', money(transferBudget(you)), { tone: 'money', note: 'Board allowance' }),
      statTile('Running cost', money(cost.total) + '/wk', { note: `${money(cost.total * 52)} a year` }),
      statTile('Season so far', (summary.net >= 0 ? '+' : '') + money(summary.net),
        { tone: summary.net >= 0 ? 'good' : 'bad', note: `${money(summary.income)} in, ${money(summary.expense)} out` }),
    ),

    h('div', { class: 'grid split', style: { marginTop: 'var(--space-4)' } },
      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        panel('Income and expenditure',
          h('div', { class: 'panel-body' },
            h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, 'Income'),
            h('div', { class: 'finance-bar', style: { marginBottom: '12px' } },
              ...incomeRows.map(([cat, g]) => h('i', {
                style: { width: (g.income / Math.max(1, summary.income) * 100) + '%', background: CATEGORY_COLOURS[cat] || 'var(--text-3)' },
                title: `${CATEGORY_LABELS[cat] || cat}: ${money(g.income)}`,
              })),
            ),
            ...incomeRows.sort((a, b) => b[1].income - a[1].income).map(([cat, g]) =>
              breakdownRow(cat, g.income, summary.income, 'in')),

            h('div', { class: 'eyebrow', style: { margin: '20px 0 8px' } }, 'Expenditure'),
            h('div', { class: 'finance-bar', style: { marginBottom: '12px' } },
              ...expenseRows.map(([cat, g]) => h('i', {
                style: { width: (g.expense / Math.max(1, summary.expense) * 100) + '%', background: CATEGORY_COLOURS[cat] || 'var(--text-3)' },
                title: `${CATEGORY_LABELS[cat] || cat}: ${money(g.expense)}`,
              })),
            ),
            ...expenseRows.sort((a, b) => b[1].expense - a[1].expense).map(([cat, g]) =>
              breakdownRow(cat, g.expense, summary.expense, 'out')),
          ),
        ),

        panel('Recent transactions',
          ledger.length
            ? h('div', null, ...ledger.map((row) => h('div', { class: 'ledger-row' },
                h('span', { class: 'desc' }, row.description),
                h('span', { class: 'amt ' + (row.amount >= 0 ? 'in' : 'out') },
                  (row.amount >= 0 ? '+' : '') + moneyFull(row.amount)),
              )))
            : emptyState('Nothing recorded yet this season.'),
        ),
      ),

      h('div', { class: 'grid', style: { gap: 'var(--space-4)' } },
        panel('Wage budget',
          h('div', { class: 'panel-body' },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' } },
              h('span', { class: 'mono', style: { fontSize: '15px' } }, money(weeklyWages(you))),
              h('span', { class: 'mono', style: { fontSize: '13px', color: 'var(--text-3)' } }, 'of ' + money(you.wageBudget)),
            ),
            meter(wageRatio, wageRatio > 1 ? 'danger' : wageRatio > 0.92 ? 'warn' : ''),
            h('p', { style: { color: 'var(--text-3)', fontSize: '12.5px', margin: '10px 0 0' } },
              wageRatio > 1
                ? 'You are over budget. The board will not sanction more signings until wages come down.'
                : `${money(Math.max(0, you.wageBudget - weeklyWages(you)))} a week of room for new signings.`),
          ),
        ),

        panel('Where the money comes from',
          h('div', { class: 'panel-body', style: { display: 'grid', gap: 'var(--space-3)' } },
            projectionRow('Sponsorship', you.sponsor?.name || '—', money(you.sponsor?.value || 0) + '/yr'),
            projectionRow('League prize', position ? `Currently ${position}${suffix(position)}` : '—', money(projectedPrize)),
            projectionRow('Ticket price', div.name, money(div.ticketPrice) + ' a seat'),
            you.parachuteYears > 0
              ? projectionRow('Parachute payment', `${you.parachuteYears} year(s) left`, 'Premier League')
              : null,
          ),
        ),

        panel('Weekly outgoings',
          h('div', { class: 'panel-body', style: { display: 'grid', gap: 'var(--space-2)' } },
            outRow('Player wages', cost.wages),
            outRow('Staff and operations', cost.operations),
            outRow('Stadium', cost.stadium),
            outRow('Facilities', cost.facilities),
            h('div', { style: { borderTop: '1px solid var(--line)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' } },
              h('span', { style: { fontWeight: 600 } }, 'Total'),
              h('span', { class: 'mono', style: { color: 'var(--danger)' } }, money(cost.total) + '/wk'),
            ),
          ),
        ),
      ),
    ),
  );
}

function breakdownRow(category, amount, total, direction) {
  const share = total > 0 ? amount / total : 0;
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '4px 0' } },
    h('i', { style: { width: '8px', height: '8px', borderRadius: '2px', background: CATEGORY_COLOURS[category] || 'var(--text-3)', flex: 'none' } }),
    h('span', { style: { flex: 1, fontSize: '12.5px', color: 'var(--text-2)' } }, CATEGORY_LABELS[category] || category),
    h('span', { class: 'mono', style: { fontSize: '12px', color: 'var(--text-3)' } }, Math.round(share * 100) + '%'),
    h('span', { class: 'mono', style: { fontSize: '12.5px', minWidth: '72px', textAlign: 'right', color: direction === 'in' ? 'var(--pitch)' : 'var(--danger)' } },
      money(amount)),
  );
}

function projectionRow(label, detail, value) {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'baseline' } },
    h('span', null,
      h('div', { style: { fontSize: '13px' } }, label),
      h('div', { style: { fontSize: '11.5px', color: 'var(--text-3)' } }, detail),
    ),
    h('span', { class: 'mono', style: { fontSize: '13px', color: 'var(--gold)', whiteSpace: 'nowrap' } }, value),
  );
}

function outRow(label, amount) {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' } },
    h('span', { style: { color: 'var(--text-2)' } }, label),
    h('span', { class: 'mono' }, money(amount)),
  );
}

function suffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
