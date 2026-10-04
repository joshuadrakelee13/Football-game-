// Map (built in a later step).

import { html, render as paint } from '../ui/html.js';
import { noDataYet, pageHead } from '../ui/empty.js';

export const title = 'Map';

export async function render(el, { app }) {
  paint(el, html`${pageHead('Map', 'Customers placed by postcode and coloured by health.')}
    ${app.data.sales.length ? html`<p class="muted">This screen is built in a later step.</p>` : noDataYet('Import a customer export with postcodes to place customers on the map.')}`);
}

