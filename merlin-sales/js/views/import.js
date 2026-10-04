// Import (built in step 3).

import { html, render as paint } from '../ui/html.js';
import { pageHead } from '../ui/empty.js';

export const title = 'Import';

export async function render(el) {
  paint(el, html`${pageHead('Import', 'Drop your Merlin ERP exports to bring in customers, sales and stock.')}
    <p class="muted">The importer is built in step 3.</p>`);
}
