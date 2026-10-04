// Reps (built in a later step).

import { html, render as paint } from '../ui/html.js';
import { noDataYet, pageHead } from '../ui/empty.js';

export const title = 'Reps';

export async function render(el, { app }) {
  paint(el, html`${pageHead('Reps', 'Each rep’s accounts, sales against last year and accounts that need attention.')}
    ${app.data.sales.length ? html`<p class="muted">This screen is built in a later step.</p>` : noDataYet('Once sales are imported, each rep’s accounts and sales are shown here.')}`);
}

