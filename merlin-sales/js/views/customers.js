// Customers (built in a later step).

import { html, render as paint } from '../ui/html.js';
import { noDataYet, pageHead } from '../ui/empty.js';

export const title = 'Customers';

export async function render(el, { app }) {
  paint(el, html`${pageHead('Customers', 'Every account with this year’s sales against the same period last year.')}
    ${app.data.sales.length ? html`<p class="muted">This screen is built in a later step.</p>` : noDataYet('Once sales are imported, every account is listed here with its sales, last order and health.')}`);
}

