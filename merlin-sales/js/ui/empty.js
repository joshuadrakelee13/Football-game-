// Empty states that tell Simon what to do next.

import { html } from './html.js';

export function noDataYet(what) {
  return html`
    <div class="empty">
      <h2>No sales data yet</h2>
      <p>${what}</p>
      <p>Import your Merlin ERP exports to fill this screen.</p>
      <a class="btn btn--primary" href="#/import">Go to Import</a>
    </div>`;
}

export function pageHead(title, intro, actions = '') {
  return html`
    <div class="page-head">
      <div class="page-head__text">
        <h1>${title}</h1>
        ${intro ? html`<p>${intro}</p>` : ''}
      </div>
      ${actions ? html`<div class="page-head__actions">${actions}</div>` : ''}
    </div>`;
}
