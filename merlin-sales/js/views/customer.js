// Customer (built in a later step).

import { html, render as paint } from '../ui/html.js';
import { noDataYet, pageHead } from '../ui/empty.js';

export const title = 'Customer';

export async function render(el, { app }) {
  paint(el, html`${pageHead('Customer', '')}
    ${app.data.sales.length ? html`<p class="muted">This screen is built in a later step.</p>` : noDataYet('Import your exports to see each customer’s sales, ordering rhythm and product groups.')}`);
}

