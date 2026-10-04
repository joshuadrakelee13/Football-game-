// The importer from start to finish, as plain functions. The import screen and the Node
// tests both call these, so the tests check exactly what Simon's browser does.
//
//   analyseFile  read a file, find its headings, guess its type and match its columns
//   setFileType  Simon changes the guessed type: columns are matched again for that type
//   validate     anything that blocks the import (unmatched required fields, odd file sets)
//   runImport    clean, join and check: everything up to, but not including, saving

import { readFile } from './read.js';
import { analyseGrid, autoMap, missingRequired } from './identify.js';
import { FILE_TYPES, FIELDS } from './fields.js';
import { cleanFile } from './clean.js';
import { buildDataset, detectJoin } from './join.js';
import { buildCheck } from './check.js';

export const MAX_FILES = 4;

let nextId = 1;

export function analyseFile(XLSX, data, name, size = 0) {
  const read = readFile(XLSX, data, name);
  const a = analyseGrid(read.grid);
  return { id: `f${nextId++}`, name, size, ...read, ...a };
}

export function setFileType(file, typeId) {
  file.typeId = typeId;
  file.mapping = autoMap(file.columns, typeId);
}

// Apply a saved profile entry to a file.
export function applyProfileEntry(file, entry) {
  file.typeId = entry.typeId;
  file.mapping = { ...entry.mapping };
}

export function validate(files) {
  const blockers = [];
  const perFile = new Map();
  for (const f of files) {
    const missing = missingRequired(f.mapping, f.typeId);
    perFile.set(f.id, missing);
    if (missing.length) {
      blockers.push(`${f.name}: match a column to ${missing.map((m) => FIELDS[m].label.toLowerCase()).join(', ')}, or change what kind of file it is.`);
    }
  }
  const count = (t) => files.filter((f) => f.typeId === t).length;
  for (const t of Object.keys(FILE_TYPES)) {
    if (count(t) > 1) blockers.push(`${count(t)} files are set as "${FILE_TYPES[t].label}". Import one of each kind at a time.`);
  }
  if (count('invoice_lines') && !count('invoice_headers')) blockers.push('Invoice lines need the invoice headers file too, for the customer and date of each invoice.');
  if (count('invoice_headers') && !count('invoice_lines')) blockers.push('Invoice headers need the invoice lines file too, for the products and values.');
  if (count('sales_lines') && (count('invoice_lines') || count('invoice_headers'))) {
    blockers.push('Use either one combined sales file, or invoice headers with invoice lines, not both.');
  }
  return { blockers, missing: perFile };
}

// options: { vatChoice, removeDuplicates, padCodes, cashCodes }
export function runImport(files, options = {}) {
  const cleaned = files.map((f) => cleanFile(f, f.typeId, f.mapping, options));
  const dataset = buildDataset(cleaned, options);
  const check = buildCheck(cleaned, dataset);

  // The join the files themselves suggest, shown beside the match rate.
  const find = (t) => files.find((f) => f.typeId === t);
  const suggest = (a, b, field) => {
    if (!a || !b) return null;
    const j = detectJoin(a.grid, a.headerRow, b.grid, b.headerRow);
    if (!j) return null;
    return {
      columnA: a.columns[j.colA]?.heading,
      columnB: b.columns[j.colB]?.heading,
      rate: j.rate,
      agrees: a.mapping[field] === j.colA && b.mapping[field] === j.colB,
    };
  };
  check.suggestedJoins = {
    account: suggest(find('customers'), find('sales_lines') || find('invoice_headers'), 'account_code'),
    invoice: suggest(find('invoice_headers'), find('invoice_lines'), 'invoice_no'),
  };

  const needsVat = cleaned.some((c) => c.vat?.method === 'ask');
  return { cleaned, dataset, check, needsVat };
}
