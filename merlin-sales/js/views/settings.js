// Settings. Thresholds, rep names and trade types are added in step 8; data deletion and
// saved import profiles are here from the start.

import { html, render as paint } from '../ui/html.js';
import { pageHead } from '../ui/empty.js';
import { number, dateTime } from '../ui/format.js';
import { deleteAllData, del } from '../db/db.js';
import { loadProfiles } from '../db/store.js';

export const title = 'Settings';

export async function render(el, { app }) {
  const d = app.data;
  const profiles = (await loadProfiles()).sort((a, b) => a.name.localeCompare(b.name));

  paint(el, html`
    ${pageHead('Settings', 'Saved import mappings and the data held on this computer.')}

    <section class="section" aria-labelledby="profiles-h">
      <div class="section__head"><h2 id="profiles-h">Saved import mappings</h2>
        <p>A saved mapping lets the same export files import in one click.</p></div>
      ${profiles.length ? html`
        <div class="table-wrap"><table class="ledger">
          <thead><tr><th>Name</th><th>Files</th><th>Saved</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>${profiles.map((p) => html`<tr>
            <td>${p.name}</td>
            <td>${p.files.map((f) => f.label).join(', ')}</td>
            <td class="nowrap">${dateTime(p.updated || p.created)}</td>
            <td class="num"><button class="btn btn--quiet" data-delete-profile="${p.id}">Delete mapping</button></td>
          </tr>`)}</tbody>
        </table></div>`
      : html`<p class="muted">None yet. You can save one on the import check.</p>`}
    </section>

    <section class="section" aria-labelledby="data-h">
      <h2 id="data-h">Data on this computer</h2>
      <p class="muted">Everything you import is kept in this browser on this computer, and nowhere else.</p>
      <dl class="figures">
        <div><dt>Customers</dt><dd>${number(d.customers.length)}</dd></div>
        <div><dt>Invoice lines</dt><dd>${number(d.sales.length)}</dd></div>
        <div><dt>Stock lines</dt><dd>${number(d.stock.length)}</dd></div>
        <div><dt>Manual edits</dt><dd>${number(d.overrides.size)}</dd></div>
      </dl>
      <div class="section" id="delete-area">
        <button class="btn btn--danger" data-action="ask-delete">Delete all data from this computer</button>
      </div>
    </section>
  `);

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.deleteProfile) {
      await del('profiles', t.dataset.deleteProfile);
      app.go('#/settings');
    } else if (t.dataset.action === 'ask-delete') {
      paint(el.querySelector('#delete-area'), html`
        <div class="notice notice--error" role="alert">
          <p><strong>Delete everything?</strong> This removes all imported sales, customers and stock,
          your manual edits, notes, saved mappings and settings from this computer. It cannot be undone.
          Your Merlin ERP exports are not affected.</p>
          <div class="cluster">
            <button class="btn btn--danger" data-action="confirm-delete">Delete everything</button>
            <button class="btn" data-action="cancel-delete">Keep my data</button>
          </div>
        </div>`);
      el.querySelector('[data-action="cancel-delete"]').focus();
    } else if (t.dataset.action === 'cancel-delete') {
      app.go('#/settings');
    } else if (t.dataset.action === 'confirm-delete') {
      t.disabled = true;
      try {
        await deleteAllData();
        await app.reload();
        app.go('#/import');
      } catch (err) {
        paint(el.querySelector('#delete-area'), html`<div class="notice notice--error">${err.message}</div>`);
      }
    }
  });
}
