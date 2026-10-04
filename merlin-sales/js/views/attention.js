// Needs attention (built in a later step).

import { html, render as paint } from '../ui/html.js';
import { noDataYet, pageHead } from '../ui/empty.js';

export const title = 'Needs attention';

export async function render(el, { app }) {
  paint(el, html`${pageHead('Needs attention', 'Customers who need a call, and why, ranked by the money at stake.')}
    ${app.data.sales.length ? html`<p class="muted">This screen is built in a later step.</p>` : noDataYet('Once sales are imported, this list shows customers who are overdue, spending less or no longer buying a product group.')}`);
}

