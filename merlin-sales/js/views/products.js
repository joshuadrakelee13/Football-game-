// Products and stock (built in a later step).

import { html, render as paint } from '../ui/html.js';
import { noDataYet, pageHead } from '../ui/empty.js';

export const title = 'Products and stock';

export async function render(el, { app }) {
  paint(el, html`${pageHead('Products and stock', 'Sales by product group, top and falling products, and stock on hand.')}
    ${app.data.sales.length ? html`<p class="muted">This screen is built in a later step.</p>` : noDataYet('Import a sales export to see product groups, and a stock export to see stock value, slow movers and cover.')}`);
}

