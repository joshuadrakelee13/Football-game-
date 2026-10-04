// Import (brief section 6). Three stages:
//   1. Drop files
//   2. Check what each file is and which column feeds each field (skipped when a saved
//      mapping recognises the files)
//   3. Check the totals against Merlin ERP's own report, then import
//
// The work is done by the plain functions in js/import/; this file is only the screen.

import { html, render as paint, raw } from '../ui/html.js';
import { pageHead } from '../ui/empty.js';
import { money, number, percent, ukDate, monthLabel, plural, fileSize, dateTime } from '../ui/format.js';
import { loadScript } from '../ui/load-script.js';
import { FIELDS, FILE_TYPES, AVAILABLE_TYPES } from '../import/fields.js';
import { analyseFile, setFileType, applyProfileEntry, validate, runImport, MAX_FILES } from '../import/pipeline.js';
import { skippedRowsCsv } from '../import/check.js';
import { makeProfile, matchProfile } from '../import/profiles.js';
import { planSave } from '../import/save-plan.js';
import { applySavePlan, loadProfiles, saveProfile } from '../db/store.js';

export const title = 'Import';

const DEFAULT_PROFILE_NAME = 'Merlin ERP standard exports';

function todayIso() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function columnLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export async function render(el, { app }) {
  const state = {
    stage: 'drop',
    files: [],
    errors: [],
    profile: null,
    options: { removeDuplicates: false, padCodes: true, vatChoice: undefined },
    mode: 'replace',
    merlinTotal: '',
    saveProfile: true,
    profileName: DEFAULT_PROFILE_NAME,
    result: null,
    saved: null,
    busy: '',
  };
  let skippedUrl = null;

  const hasStoredSales = () => app.data.sales.length > 0;

  function compute() {
    state.result = runImport(state.files, state.options);
    const existing = { customers: app.data.customers, sales: app.data.sales, stock: app.data.stock, meta: app.data.meta };
    state.preview = planSave({
      existing,
      dataset: state.result.dataset,
      mode: state.mode,
      overrides: app.data.overrides,
      today: todayIso(),
      files: state.files.map((f) => f.name),
      profileName: state.saveProfile ? state.profileName : state.profile?.name || null,
    });
    if (skippedUrl) URL.revokeObjectURL(skippedUrl);
    const csv = skippedRowsCsv(state.result.cleaned, {
      ...state.result.dataset,
      extraSkips: state.result.dataset.extraSkips.concat(state.preview.skipped),
    });
    skippedUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  }

  function draw() {
    paint(el, html`
      ${pageHead('Import', 'Bring in your Merlin ERP exports. Nothing is saved until you have checked the totals.')}
      <ol class="steps" aria-label="Import steps">
        <li ${state.stage === 'drop' ? raw('aria-current="step"') : ''}>Drop files</li>
        <li ${state.stage === 'map' ? raw('aria-current="step"') : ''}>Check columns</li>
        <li ${state.stage === 'check' ? raw('aria-current="step"') : ''}>Check totals and import</li>
      </ol>
      ${state.stage === 'drop' ? dropStage() : ''}
      ${state.stage === 'map' ? mapStage() : ''}
      ${state.stage === 'check' ? checkStage() : ''}
      ${state.stage === 'done' ? doneStage() : ''}
    `);
    if (state.stage === 'drop') wireDrop();
  }

  // ---------- Stage 1: drop ----------

  function dropStage() {
    const last = app.data.meta.lastImport;
    return html`
      ${state.errors.length ? html`<div class="notice notice--error" role="alert"><ul>${state.errors.map((e) => html`<li>${e}</li>`)}</ul></div><p></p>` : ''}
      <div class="dropzone" id="dropzone">
        <div class="dropzone__title">Drop your Merlin exports here</div>
        <p>Customer list, sales lines (or invoice headers and lines) and stock, as .csv, .xlsx or .xls.
        Up to ${MAX_FILES} files at once.</p>
        <label class="btn btn--primary btn--large" for="file-input">Choose files</label>
        <input type="file" id="file-input" class="visually-hidden" multiple accept=".csv,.xlsx,.xls,.txt">
        ${state.busy ? html`<p class="progress" role="status">${state.busy}</p>` : ''}
      </div>
      <p class="small muted" style="margin-top: var(--s3)">The files are read in this browser. They are not uploaded anywhere.</p>
      ${last ? html`<p class="small muted">Last import ${dateTime(last.at)}: ${last.files.join(', ')}.</p>` : ''}
    `;
  }

  function wireDrop() {
    const zone = el.querySelector('#dropzone');
    const input = el.querySelector('#file-input');
    input.addEventListener('change', () => takeFiles([...input.files]));
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
      takeFiles([...e.dataTransfer.files]);
    });
  }

  async function takeFiles(list) {
    state.errors = [];
    if (!list.length) return;
    if (list.length > MAX_FILES) {
      state.errors = [`That was ${list.length} files. Drop up to ${MAX_FILES} at once: for example customers, sales lines and stock.`];
      draw();
      return;
    }
    const bad = list.filter((f) => !/\.(csv|xlsx|xls|txt)$/i.test(f.name));
    if (bad.length) {
      state.errors = bad.map((f) => `${f.name} is not a .csv, .xlsx or .xls file.`);
      draw();
      return;
    }
    state.busy = 'Reading files…';
    draw();
    try {
      await loadScript('vendor/sheetjs/xlsx.full.min.js');
    } catch {
      state.busy = '';
      state.errors = ['The spreadsheet reader (vendor/sheetjs) could not be loaded. Check the app folder is complete.'];
      draw();
      return;
    }
    const files = [];
    for (const f of list) {
      try {
        const buf = await f.arrayBuffer();
        const a = analyseFile(window.XLSX, buf, f.name, f.size);
        if (!a.grid.length) state.errors.push(`${f.name} looks empty.`);
        else files.push(a);
      } catch (err) {
        state.errors.push(`${f.name} could not be read: ${err.message}`);
      }
    }
    state.busy = '';
    if (!files.length) { draw(); return; }
    state.files = files;

    // A saved mapping that recognises every file skips straight to the totals.
    const match = matchProfile(await loadProfiles(), files);
    if (match) {
      files.forEach((f, i) => applyProfileEntry(f, match.entries[i]));
      state.profile = match.profile;
      state.profileName = match.profile.name;
      state.options = { ...state.options, ...match.profile.options };
      state.mode = match.profile.options.mode === 'append' && hasStoredSales() ? 'append' : 'replace';
      if (!validate(files).blockers.length) {
        state.stage = 'check';
        compute();
        draw();
        return;
      }
    } else {
      state.mode = 'replace';
    }
    state.stage = 'map';
    draw();
  }

  // ---------- Stage 2: map ----------

  function mapStage() {
    const v = validate(state.files);
    return html`
      ${state.errors.length ? html`<div class="notice notice--warn"><ul>${state.errors.map((e) => html`<li>${e}</li>`)}</ul></div><p></p>` : ''}
      <p>Check what each file is and which of its columns holds each piece of information.
      Fields marked <span class="req">*</span> are needed.</p>
      ${state.files.map((f) => fileCard(f, v.missing.get(f.id) || []))}
      ${v.blockers.length ? html`<div class="notice notice--error section" role="alert"><strong>Before you can continue</strong>
        <ul>${v.blockers.map((b) => html`<li>${b}</li>`)}</ul></div>` : ''}
      <div class="cluster section">
        <button class="btn btn--primary btn--large" data-action="to-check" ${v.blockers.length ? 'disabled' : ''}>Check totals</button>
        <button class="btn" data-action="restart">Start again with different files</button>
      </div>
    `;
  }

  function fileCard(f, missing) {
    const type = FILE_TYPES[f.typeId];
    const used = new Set(Object.values(f.mapping));
    const unused = f.columns.filter((c) => !used.has(c.index) && c.heading);
    const dataRows = f.grid.length - f.headerRow - 1;
    return html`
      <div class="file-card">
        <div class="file-card__head">
          <span class="file-card__name">${f.name}</span>
          <span class="file-card__meta">${fileSize(f.size)} · ${plural(dataRows, 'row')}${f.sheetNames.length > 1 ? ` · sheet "${f.sheetName}" of ${f.sheetNames.length}` : ''}</span>
          <label class="file-card__type">This file is
            <select class="select" data-file="${f.id}" data-role="type">
              ${AVAILABLE_TYPES.map((t) => html`<option value="${t}" ${t === f.typeId ? 'selected' : ''}>${FILE_TYPES[t].label}</option>`)}
            </select>
          </label>
        </div>
        <div class="file-card__body">
          <p class="small muted">Column headings found on row ${f.headerRow + 1}${f.headerRow ? `; the ${plural(f.headerRow, 'row')} above ${f.headerRow === 1 ? 'is' : 'are'} skipped as report titles` : ''}.
          ${f.guesses[0].typeId === f.typeId ? 'The kind of file was worked out from its columns.' : ''}</p>
          <div class="table-wrap">
            <table class="ledger ledger--compact map-table">
              <thead><tr><th scope="col">Our field</th><th scope="col">Column in this file</th><th scope="col">First values</th></tr></thead>
              <tbody>
                ${type.fields.map((field) => {
                  const col = f.mapping[field];
                  const isMissing = missing.includes(field);
                  const req = type.required.includes(field) || (type.anyOf || []).some((g) => g[0] === field);
                  const samples = col !== undefined ? f.columns[col]?.samples || [] : [];
                  return html`<tr class="${isMissing ? 'is-missing' : ''}">
                    <td><label for="m-${f.id}-${field}">${FIELDS[field].label}</label>${req ? html`<span class="req" aria-label="needed">*</span>` : ''}${isMissing ? html` <span class="small">needed</span>` : ''}</td>
                    <td>
                      <select class="select" id="m-${f.id}-${field}" data-file="${f.id}" data-role="map" data-field="${field}">
                        <option value="">Not in this file</option>
                        ${f.columns.filter((c) => c.heading || c.filled).map((c) => html`<option value="${c.index}" ${c.index === col ? 'selected' : ''}>${c.heading || '(no heading)'} (column ${columnLetter(c.index)})</option>`)}
                      </select>
                    </td>
                    <td class="preview" title="${samples.join(', ')}">${samples.join(', ') || html`<span class="muted">–</span>`}</td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>
          ${unused.length ? html`<p class="small muted" style="margin-top: var(--s2)">Not used: ${unused.map((c) => c.heading).join(', ')}.</p>` : ''}
        </div>
      </div>`;
  }

  // ---------- Stage 3: check ----------

  function checkStage() {
    const r = state.result;
    const c = r.check;
    const p = state.preview;
    const s = c.sales;
    const blockers = [];
    if (r.needsVat) blockers.push('Answer the VAT question above.');
    const nothing = !c.sales && !c.customers && !c.stock;
    if (nothing) blockers.push('No usable rows were found in these files.');
    const importLabel = `Import ${plural(state.files.length, 'file')}`;

    return html`
      ${state.profile ? html`<div class="notice notice--ok"><strong>Recognised as “${state.profile.name}”.</strong>
        The columns were matched from your saved mapping. <button class="btn btn--quiet" data-action="to-map">Change column matches</button></div>` : ''}

      ${r.needsVat ? vatQuestion() : ''}

      ${s ? html`
        <section class="section" aria-labelledby="totals-h">
          <div class="section__head"><h2 id="totals-h">Sales in these files</h2>
            <p>${ukDate(s.from)} to ${ukDate(s.to)}</p></div>
          <dl class="figures">
            <div><dt>Total net sales</dt><dd class="num" style="text-align:left">${money(s.net, { exact: true })}</dd></div>
            <div><dt>Total quantity</dt><dd>${number(s.quantity, { decimals: true })}</dd></div>
            <div><dt>Invoices</dt><dd>${number(s.invoices)}</dd></div>
            <div><dt>Customers</dt><dd>${number(s.customers)}</dd></div>
            <div><dt>Invoice lines</dt><dd>${number(s.lines)}</dd></div>
          </dl>
          ${reconcile(s)}
        </section>` : ''}

      <div class="split section">
        <div>${s ? monthTable(s) : ''}${c.stock ? stockSection(c.stock) : ''}</div>
        <div>${filesSection(c)}</div>
      </div>

      ${thingsToCheck(c, s)}

      ${modeSection(c, p)}

      <section class="section" aria-labelledby="profile-h">
        <h2 id="profile-h" class="visually-hidden">Save the column matches</h2>
        <label class="check"><input type="checkbox" data-role="save-profile" ${state.saveProfile ? 'checked' : ''}>
          <span>${state.profile ? 'Update the saved mapping' : 'Save these column matches for next time'}, as
          <input class="input" data-role="profile-name" value="${state.profileName}" aria-label="Name of the saved mapping" style="width: 28ch"></span></label>
        <p class="small muted" style="margin: var(--s1) 0 0 24px">Next time, the same exports go straight to this check.</p>
      </section>

      ${blockers.length ? html`<div class="notice notice--error section" role="alert"><ul>${blockers.map((b) => html`<li>${b}</li>`)}</ul></div>` : ''}
      <div class="cluster section">
        <button class="btn btn--primary btn--large" data-action="import" ${blockers.length || state.busy ? 'disabled' : ''}>${importLabel}</button>
        <button class="btn" data-action="to-map">Back to columns</button>
        <button class="btn" data-action="restart">Start again</button>
        ${state.busy ? html`<span class="progress" role="status">${state.busy}</span>` : ''}
      </div>
    `;
  }

  function vatQuestion() {
    return html`
      <section class="section" aria-labelledby="vat-h">
        <div class="notice notice--warn">
          <h2 id="vat-h" style="font-size: var(--fs-l)">Do these values include VAT?</h2>
          <p>The sales file has a value column that looks VAT-inclusive, and no net or VAT column.</p>
          <div class="radio-cards">
            <label class="radio-card"><input type="radio" name="vat" value="divide" data-role="vat" ${state.options.vatChoice === 'divide' ? 'checked' : ''}>
              <span><strong>Yes, they include VAT at 20%</strong><span>Each value is divided by 1.2 to get net.</span></span></label>
            <label class="radio-card"><input type="radio" name="vat" value="net" data-role="vat" ${state.options.vatChoice === 'net' ? 'checked' : ''}>
              <span><strong>No, they are already net</strong><span>The values are used as they are.</span></span></label>
          </div>
        </div>
      </section>`;
  }

  function diffRows(s) {
    const typed = state.merlinTotal.trim();
    if (!typed) return '';
    const parsed = Number(typed.replace(/[£,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
    if (!Number.isFinite(parsed)) {
      return html`<tr><td colspan="2" class="small" style="color: var(--risk)">That does not look like an amount. Type it like 12,345.67</td></tr>`;
    }
    const diff = Math.round((s.net - parsed) * 100) / 100;
    if (diff === 0) {
      return html`<tr class="recon__diff is-zero"><td>Difference</td><td class="num">${money(0, { exact: true })}</td></tr>
        <tr><td colspan="2" class="small" style="color: var(--good)">No difference. These files agree with Merlin’s report.</td></tr>`;
    }
    return html`<tr class="recon__diff is-off"><td>Difference</td><td class="num">${money(diff, { exact: true })}</td></tr>
      <tr><td colspan="2" class="small">These files come to ${money(Math.abs(diff), { exact: true })} ${diff > 0 ? 'more' : 'less'} than Merlin’s report.
      Check the report covers ${ukDate(s.from)} to ${ukDate(s.to)}, and look at the skipped rows.</td></tr>`;
  }

  function reconcile(s) {
    return html`
      <div class="recon section">
        <table class="ledger">
          <caption>Check against Merlin ERP</caption>
          <tbody>
            <tr><td>Total net sales in these files</td><td class="num">${money(s.net, { exact: true })}</td></tr>
            <tr><td><label for="merlin-total">Total from Merlin report (optional)</label></td>
              <td class="num"><input class="input input--money" id="merlin-total" data-role="merlin-total" inputmode="decimal" placeholder="0.00" value="${state.merlinTotal}"></td></tr>
          </tbody>
          <tbody id="recon-diff" aria-live="polite">${diffRows(s)}</tbody>
        </table>
        <p class="small muted">Run a Merlin ERP sales report for ${ukDate(s.from)} to ${ukDate(s.to)} and type its net total. A zero difference means nothing was lost.</p>
      </div>`;
  }

  function monthTable(s) {
    return html`
      <section aria-labelledby="month-h">
        <h2 id="month-h" style="font-size: var(--fs-l); margin-bottom: var(--s3)">Totals by month</h2>
        <div class="table-wrap"><table class="ledger ledger--compact">
          <thead><tr><th scope="col">Month</th><th scope="col" class="num">Net sales</th><th scope="col" class="num">Quantity</th><th scope="col" class="num">Invoices</th></tr></thead>
          <tbody>${s.byMonth.map((m) => html`<tr><td>${monthLabel(m.ym)}</td><td class="num">${money(m.net, { exact: true })}</td><td class="num">${number(m.quantity, { decimals: true })}</td><td class="num">${number(m.invoices)}</td></tr>`)}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${money(s.net, { exact: true })}</td><td class="num">${number(s.quantity, { decimals: true })}</td><td class="num">${number(s.invoices)}</td></tr></tfoot>
        </table></div>
      </section>`;
  }

  function filesSection(c) {
    const totalSkipped = c.files.reduce((n, f) => n + f.rowsSkipped, 0) + state.preview.skipped.length;
    return html`
      <section aria-labelledby="rows-h">
        <h2 id="rows-h" style="font-size: var(--fs-l); margin-bottom: var(--s3)">Rows</h2>
        <div class="table-wrap"><table class="ledger ledger--compact">
          <thead><tr><th scope="col">File</th><th scope="col" class="num">Read</th><th scope="col" class="num">Used</th><th scope="col" class="num">Skipped</th></tr></thead>
          <tbody>${c.files.map((f) => html`<tr><td>${f.name}<br><span class="small muted">${f.typeLabel}</span></td>
            <td class="num">${number(f.rowsRead)}</td><td class="num">${number(f.rowsUsed)}</td><td class="num">${number(f.rowsSkipped)}</td></tr>`)}</tbody>
        </table></div>
        ${c.files.map((f) => (f.reasons.length || f.changes.length || f.dates.length) ? html`
          <div style="margin-top: var(--s3)">
            <h3 class="small" style="font-weight: 600">${f.name}</h3>
            <ul class="small" style="margin: var(--s1) 0 0; padding-left: var(--s5)">
              ${f.reasons.map((r) => html`<li>Skipped: ${r.label} (${number(r.n)})</li>`)}
              ${f.changes.map((ch) => html`<li>Kept, tidied: ${ch.label} (${number(ch.n)})</li>`)}
              ${f.dates.map((d) => html`<li>${FIELDS[d.field].label} read as ${d.label}${d.ambiguous ? ' (every date could be read either way; UK order used)' : ''}</li>`)}
            </ul>
          </div>` : '')}
        ${totalSkipped ? html`<p style="margin-top: var(--s3)"><a class="btn" href="${skippedUrl}" download="skipped-rows.csv">Download the ${plural(totalSkipped, 'skipped row')}</a></p>` : ''}
      </section>`;
  }

  function stockSection(st) {
    return html`
      <section class="section" aria-labelledby="stock-h">
        <h2 id="stock-h" style="font-size: var(--fs-l); margin-bottom: var(--s3)">Stock</h2>
        <div class="table-wrap"><table class="ledger ledger--compact"><tbody>
          <tr><td>Stock lines</td><td class="num">${number(st.lines)}</td></tr>
          <tr><td>Stock as at</td><td class="num">${ukDate(todayIso())}</td></tr>
          ${st.negative.lines ? html`<tr><td>Lines with negative stock (included)</td><td class="num">${number(st.negative.lines)} · ${money(st.negative.value, { exact: true })}</td></tr>` : ''}
          ${st.noCost ? html`<tr><td>Lines with no cost (valued at £0)</td><td class="num">${number(st.noCost)}</td></tr>` : ''}
          ${st.salesNoStock ? html`<tr><td>Products sold but not in the stock file</td><td class="num">${number(st.salesNoStock.length)}</td></tr>` : ''}
          ${st.stockNoSales !== null ? html`<tr><td>Stock lines with no sales in these files</td><td class="num">${number(st.stockNoSales)}</td></tr>` : ''}
          <tr class="total"><td>Stock value at cost</td><td class="num">${money(st.value, { exact: true })}</td></tr>
        </tbody></table></div>
        ${st.salesNoStock?.length ? html`<details style="margin-top: var(--s2)"><summary class="small">Products sold but not in the stock file</summary>
          <p class="small">${st.salesNoStock.slice(0, 200).join(', ')}${st.salesNoStock.length > 200 ? ` and ${st.salesNoStock.length - 200} more` : ''}</p></details>` : ''}
      </section>`;
  }

  function listDetails(summary, items, fmt = (x) => html`${x.name} <span class="muted">${x.account_code}</span>`) {
    return html`<details><summary>${summary}</summary><ul>${items.slice(0, 300).map((x) => html`<li>${fmt(x)}</li>`)}${items.length > 300 ? html`<li>and ${number(items.length - 300)} more</li>` : ''}</ul></details>`;
  }

  function thingsToCheck(c, s) {
    const items = [];
    const lz = c.leadingZeros;
    if (lz?.fixable) {
      items.push(html`<div class="notice notice--warn"><strong>Account codes have lost their leading zeros.</strong>
        ${number(lz.affected)} codes in the ${lz.file === 'sales' ? 'sales' : 'customer'} file are shorter than the ${lz.padTo}-digit codes in the other file
        (Excel turns codes like 000123 into 123).
        <div style="margin-top: var(--s2)"><label class="check"><input type="checkbox" data-role="pad" ${state.options.padCodes !== false ? 'checked' : ''}>
        <span>Restore the leading zeros (${number(lz.fixable)} codes then match)</span></label></div></div>`);
    } else if (lz && lz.file === null) {
      items.push(html`<div class="notice notice--warn"><strong>Account codes are different lengths in the two files</strong>
        (customer file: ${lz.customerLengths} digits, sales file: ${lz.salesLengths}). If Excel has removed leading zeros, re-export as .csv.</div>`);
    }
    if (c.joins?.account) {
      const j = c.joins.account;
      const sj = c.suggestedJoins.account;
      items.push(html`<div class="notice ${j.rate < 0.9 ? 'notice--warn' : 'notice--ok'}"><strong>${percent(j.rate)} of sales lines matched an account in the customer file.</strong>
        ${sj && !sj.agrees ? html` The files share most values between “${sj.columnA}” and “${sj.columnB}”; check the account code columns are right.` : ''}</div>`);
    }
    if (c.joins?.invoice) {
      const j = c.joins.invoice;
      items.push(html`<div class="notice ${j.rate < 0.99 ? 'notice--warn' : 'notice--ok'}"><strong>${percent(j.rate)} of invoice lines matched an invoice header.</strong>
        ${j.total - j.matched ? ` ${plural(j.total - j.matched, 'line')} with no header ${j.total - j.matched === 1 ? 'is' : 'are'} skipped and listed in the download.` : ''}</div>`);
    }
    if (s?.duplicates.lines) {
      items.push(html`<div class="notice notice--warn"><strong>${plural(s.duplicates.lines, 'line')} look${s.duplicates.lines === 1 ? 's' : ''} like ${s.duplicates.lines === 1 ? 'a duplicate' : 'duplicates'}</strong>
        (same invoice, line, product, quantity and value as another line, ${money(s.duplicates.net, { exact: true })} in all). They are kept in the totals unless you remove them.
        <div style="margin-top: var(--s2)"><label class="check"><input type="checkbox" data-role="dups" ${state.options.removeDuplicates ? 'checked' : ''}><span>Remove the duplicate lines</span></label></div></div>`);
    } else if (state.options.removeDuplicates) {
      items.push(html`<div class="notice"><label class="check"><input type="checkbox" data-role="dups" checked><span>Duplicate lines removed (untick to keep them)</span></label></div>`);
    }
    if (s?.credits.lines) {
      items.push(html`<div class="notice">${plural(s.credits.lines, 'credit or return line')} (${money(s.credits.net, { exact: true })}) ${s.credits.lines === 1 ? 'is' : 'are'} kept and included in the totals.</div>`);
    }
    if (s?.cash.lines) {
      items.push(html`<div class="notice">Cash and counter sales of ${money(s.cash.net, { exact: true })} (${s.cash.accounts.join(', ')}) are included in the totals,
        and left out of customer health, the map and alerts.</div>`);
    }
    if (s && s.noGroup) {
      items.push(html`<div class="notice notice--warn">${plural(s.noGroup, 'sales line')} ${s.noGroup === 1 ? 'has' : 'have'} no product group. Product group comparisons and cross-sell need it.${s.groupsFilled ? ` ${number(s.groupsFilled)} more were filled in from the stock file.` : ''}</div>`);
    } else if (s?.groupsFilled) {
      items.push(html`<div class="notice">${plural(s.groupsFilled, 'sales line')} had no product group; it was filled in from the stock file.</div>`);
    }
    const cu = c.customers;
    if (cu) {
      if (!c.has.customers) {
        items.push(html`<div class="notice">No customer file in this import. Customer names come from the sales file where it has them.
          Drop the customer export too to see addresses, postcodes, reps and trade types.</div>`);
      }
      if (cu.unmatched.length) {
        items.push(html`<div class="notice notice--warn"><strong>${plural(cu.unmatched.length, 'account')} in the sales ${cu.unmatched.length === 1 ? 'is' : 'are'} not in the customer file</strong>
          (${plural(cu.unmatched.reduce((n, u) => n + u.lines, 0), 'line')}, ${money(cu.unmatched.reduce((n, u) => n + u.net, 0), { exact: true })}). Their sales are kept, listed under the account code.
          ${listDetails('Show them', cu.unmatched, (u) => html`${u.account_code}: ${plural(u.lines, 'line')}, ${money(u.net, { exact: true })}`)}</div>`);
      }
      if (cu.noSales.length) {
        items.push(html`<div class="notice">${plural(cu.noSales.length, 'customer')} in the customer file ${cu.noSales.length === 1 ? 'has' : 'have'} no sales in these files.
          ${listDetails('Show them', cu.noSales)}</div>`);
      }
      if (c.has.customers) {
        const gaps = [
          ['postcode', cu.missingPostcode, 'They cannot go on the map until they have one.'],
          ['rep', cu.missingRep, ''],
          ['trade type', cu.missingTrade, 'Cross-sell compares customers of the same trade type.'],
        ].filter(([, list]) => list.length);
        if (gaps.length) {
          items.push(html`<div class="notice notice--warn"><strong>Some customers are missing details that matter most.</strong>
            You can fill them in by hand after importing; your entries are kept through future imports.
            ${gaps.map(([what, list, why]) => html`<div style="margin-top: var(--s1)">${listDetails(`${plural(list.length, 'customer')} with no ${what}`, list)}${why ? html`<span class="muted">${why}</span>` : ''}</div>`)}
            <p style="margin-top: var(--s2)"><a href="#/customers/bulk">Fill in missing details</a> (after importing)</p></div>`);
        }
      }
      if (cu.duplicates) items.push(html`<div class="notice notice--warn">${plural(cu.duplicates, 'account code')} appear${cu.duplicates === 1 ? 's' : ''} twice in the customer file; the first entry is used.</div>`);
    }
    if (state.preview.conflicts.length) {
      const n = state.preview.conflicts.length;
      items.push(html`<div class="notice notice--warn"><strong>${plural(n, 'manual value')} ${n === 1 ? 'differs' : 'differ'} from the latest export: review.</strong>
        Your manual values are kept.
        ${listDetails('Show the differences', state.preview.conflicts, (x) => html`${x.name} (${x.account_code}), ${x.label.toLowerCase()}: you entered “${x.manual}”, the export says “${x.imported}”`)}</div>`);
    }
    if (c.stock?.duplicates) items.push(html`<div class="notice notice--warn">${plural(c.stock.duplicates, 'product code')} appear${c.stock.duplicates === 1 ? 's' : ''} twice in the stock file; the first entry is used.</div>`);
    if (!items.length) return '';
    return html`<section class="section" aria-labelledby="things-h"><h2 id="things-h" style="font-size: var(--fs-l); margin-bottom: var(--s3)">Things to check</h2>${items}</section>`;
  }

  function modeSection(c, p) {
    if (!c.has.sales) {
      return html`<section class="section"><p>${c.has.stock ? 'The stock file replaces the previous stock snapshot, which is kept for comparison.' : ''}
        ${c.has.customers ? ' Customers in this file are added or updated; manual edits are kept.' : ''}</p></section>`;
    }
    const stored = hasStoredSales();
    const latest = stored ? app.data.sales.reduce((m, x) => (x.invoice_date > m ? x.invoice_date : m), '') : '';
    return html`
      <section class="section" aria-labelledby="mode-h">
        <h2 id="mode-h" style="font-size: var(--fs-l); margin-bottom: var(--s3)">How to save it</h2>
        <div class="radio-cards">
          <label class="radio-card"><input type="radio" name="mode" value="replace" data-role="mode" ${state.mode === 'replace' ? 'checked' : ''}>
            <span><strong>Replace everything</strong><span>${stored ? `The ${number(app.data.sales.length)} invoice lines stored now are replaced by these files.` : 'Nothing is stored yet.'} Manual edits and notes are kept.</span></span></label>
          <label class="radio-card"><input type="radio" name="mode" value="append" data-role="mode" ${state.mode === 'append' ? 'checked' : ''} ${stored ? '' : 'disabled'}>
            <span><strong>Add newer data</strong><span>${stored ? `Adds only invoices dated after ${ukDate(latest)}, the latest stored. Invoices already held are skipped.` : 'Available once some sales are stored.'}</span></span></label>
        </div>
        ${state.mode === 'append' && p.summary.sales ? html`<p class="small" style="margin-top: var(--s2)">
          ${plural(p.summary.sales.added, 'line')} will be added. ${p.summary.sales.skippedOld ? `${plural(p.summary.sales.skippedOld, 'line')} dated on or before ${ukDate(latest)} will be skipped. ` : ''}
          ${p.summary.sales.skippedHeld ? `${plural(p.summary.sales.skippedHeld, 'line')} on invoices already held will be skipped.` : ''}</p>` : ''}
      </section>`;
  }

  // ---------- Done ----------

  function doneStage() {
    const d = state.saved;
    return html`
      <div class="notice notice--ok" role="status"><strong>Imported and saved on this computer.</strong></div>
      <div class="table-wrap section" style="max-width: 560px"><table class="ledger ledger--compact"><tbody>
        ${d.summary.sales ? html`<tr><td>Invoice lines added</td><td class="num">${number(d.summary.sales.added)}</td></tr>` : ''}
        ${d.summary.customers ? html`<tr><td>Customers added</td><td class="num">${number(d.summary.customers.added)}</td></tr>
          <tr><td>Customers updated</td><td class="num">${number(d.summary.customers.updated)}</td></tr>` : ''}
        ${d.summary.stock ? html`<tr><td>Stock lines</td><td class="num">${number(d.summary.stock.lines)}</td></tr>` : ''}
        <tr><td>Invoice lines now stored</td><td class="num">${number(app.data.sales.length)}</td></tr>
        <tr><td>Sales now cover</td><td class="num">${app.data.meta.lastImport?.salesFrom ? `${ukDate(app.data.meta.lastImport.salesFrom)} to ${ukDate(app.data.meta.lastImport.salesTo)}` : '–'}</td></tr>
      </tbody></table></div>
      ${d.profile ? html`<p>Column matches saved as “${d.profile}”. Next time, dropping the same exports goes straight to the totals.</p>` : ''}
      <div class="cluster section">
        <a class="btn btn--primary" href="#/attention">Go to Needs attention</a>
        <a class="btn" href="#/customers">Go to Customers</a>
        <button class="btn" data-action="restart">Import more files</button>
      </div>`;
  }

  async function doImport() {
    state.busy = 'Saving…';
    draw();
    try {
      compute();
      const { plan, summary } = state.preview;
      const check = state.result.check;
      const log = {
        at: Date.now(),
        files: state.files.map((f) => ({ name: f.name, type: f.typeId, rowsRead: f.grid.length - 1 })),
        mode: state.mode,
        sales: check.sales ? { lines: check.sales.lines, net: check.sales.net, from: check.sales.from, to: check.sales.to } : null,
        stockValue: check.stock?.value ?? null,
        merlinTotal: state.merlinTotal || null,
        summary,
      };
      await applySavePlan(plan, log);
      let profileName = null;
      if (state.saveProfile && state.profileName.trim()) {
        const profiles = await loadProfiles();
        const existing = state.profile || profiles.find((x) => x.name === state.profileName.trim());
        await saveProfile(makeProfile({
          name: state.profileName.trim(),
          files: state.files,
          options: { ...state.options, mode: state.mode },
          existing,
        }));
        profileName = state.profileName.trim();
      }
      await app.reload();
      state.saved = { summary, profile: profileName };
      state.stage = 'done';
      state.busy = '';
      draw();
    } catch (err) {
      console.error(err);
      state.busy = '';
      draw();
      el.insertAdjacentHTML('afterbegin', `<div class="notice notice--error" role="alert"><strong>The import was not saved.</strong> ${String(err.message).replace(/</g, '&lt;')}</div>`);
    }
  }

  // ---------- Events ----------

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'restart') {
      Object.assign(state, { stage: 'drop', files: [], errors: [], profile: null, result: null, merlinTotal: '', profileName: DEFAULT_PROFILE_NAME, saveProfile: true,
        options: { removeDuplicates: false, padCodes: true, vatChoice: undefined } });
      draw();
    } else if (a === 'to-map') {
      state.stage = 'map';
      draw();
    } else if (a === 'to-check') {
      state.stage = 'check';
      compute();
      draw();
    } else if (a === 'import') {
      doImport();
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target;
    const role = t.dataset.role;
    const file = t.dataset.file && state.files.find((f) => f.id === t.dataset.file);
    if (role === 'type' && file) {
      setFileType(file, t.value);
      draw();
    } else if (role === 'map' && file) {
      const field = t.dataset.field;
      if (t.value === '') delete file.mapping[field];
      else {
        const col = Number(t.value);
        // A column feeds one field: take it away from any other field first.
        for (const [f, c] of Object.entries(file.mapping)) if (c === col) delete file.mapping[f];
        file.mapping[field] = col;
      }
      draw();
      el.querySelector(`#m-${file.id}-${field}`)?.focus();
    } else if (role === 'vat') {
      state.options.vatChoice = t.value;
      compute();
      draw();
    } else if (role === 'pad') {
      state.options.padCodes = t.checked;
      compute();
      draw();
    } else if (role === 'dups') {
      state.options.removeDuplicates = t.checked;
      compute();
      draw();
    } else if (role === 'mode') {
      state.mode = t.value;
      compute();
      draw();
    } else if (role === 'save-profile') {
      state.saveProfile = t.checked;
    }
  });

  el.addEventListener('input', (e) => {
    const role = e.target.dataset.role;
    if (role === 'profile-name') state.profileName = e.target.value;
    else if (role === 'merlin-total') {
      // Only the difference rows are redrawn, so the box keeps focus while typing.
      state.merlinTotal = e.target.value;
      if (state.result?.check.sales) paint(el.querySelector('#recon-diff'), diffRows(state.result.check.sales));
    }
  });

  draw();
}
