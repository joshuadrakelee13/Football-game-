// Screen registry. The rail is generated from SCREEN_ORDER, so adding a screen is
// one entry here plus its module.

import { renderOverview } from './screen-overview.js';
import { renderInbox } from './screen-inbox.js';
import { renderSquad } from './screen-squad.js';
import { renderTransfers } from './screen-transfers.js';
import { renderFixtures } from './screen-fixtures.js';
import { renderTable } from './screen-table.js';
import { renderStadium } from './screen-stadium.js';
import { renderTraining } from './screen-training.js';
import { renderYouth } from './screen-youth.js';
import { renderFinances } from './screen-finances.js';
import { renderClub } from './screen-club.js';
import { unreadInboxCount } from '../engine/inbox.js';

export const SCREENS = {
  overview:  { name: 'Overview',      icon: '◉', render: renderOverview },
  inbox:     { name: 'Inbox',         icon: '✉', render: renderInbox,
               badge: (w) => unreadInboxCount(w) },
  squad:     { name: 'Squad',         icon: '▤', render: renderSquad },
  transfers: { name: 'Transfers',     icon: '⇄', render: renderTransfers,
               badge: (w) => (w.pendingBids || []).length },
  fixtures:  { name: 'Fixtures',      icon: '▦', render: renderFixtures },
  table:     { name: 'League Table',  icon: '☰', render: renderTable },
  stadium:   { name: 'Stadium',       icon: '⌂', render: renderStadium },
  training:  { name: 'Training',      icon: '◈', render: renderTraining },
  youth:     { name: 'Youth Academy', icon: '✦', render: renderYouth,
               badge: (w) => (w.youthProspects || []).length },
  finances:  { name: 'Finances',      icon: '£', render: renderFinances },
  club:      { name: 'Club',          icon: '★', render: renderClub },
};

export const SCREEN_ORDER = [
  'overview', 'inbox', 'squad', 'transfers', 'fixtures', 'table',
  'stadium', 'training', 'youth', 'finances', 'club',
];
