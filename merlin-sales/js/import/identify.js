// Working out what is in a file: which row holds the column headings, what kind of file it
// is, and which column matches each of our fields.

import { FIELDS, FILE_TYPES, AVAILABLE_TYPES, ALL_SYNONYMS, normaliseHeading, synonymsFor } from './fields.js';
import { cellText, isBlank, parseNumber } from './values.js';
import { looksLikeDate } from './dates.js';

const SAMPLE_ROWS = 200;

function headingScore(h) {
  if (!h) return 0;
  if (ALL_SYNONYMS.has(h)) return 2;
  for (const s of ALL_SYNONYMS) if (s.length > 3 && (` ${h} `).includes(` ${s} `)) return 1;
  return 0;
}

// The heading row is the one near the top whose cells read most like column headings.
// Report titles and blank rows above it are skipped (and counted) by the cleaner.
export function findHeaderRow(grid) {
  let best = { row: 0, score: -1 };
  const limit = Math.min(grid.length, 40);
  for (let r = 0; r < limit; r++) {
    const row = grid[r];
    const filled = row.filter((v) => !isBlank(v));
    if (filled.length < 2) continue;
    const textCells = filled.filter((v) => typeof v === 'string' && parseNumber(v)?.error && !looksLikeDate(v));
    if (textCells.length / filled.length < 0.6) continue;
    const score = filled.reduce((s, v) => s + headingScore(normaliseHeading(v)), 0) + textCells.length * 0.05;
    if (score > best.score) best = { row: r, score };
  }
  return best.row;
}

// What the values in each column look like, from the first 200 data rows.
export function profileColumns(grid, headerRow) {
  const width = Math.max(0, ...grid.slice(headerRow, headerRow + SAMPLE_ROWS + 1).map((r) => r.length));
  const rows = grid.slice(headerRow + 1, headerRow + 1 + SAMPLE_ROWS);
  const cols = [];
  for (let c = 0; c < width; c++) {
    let filled = 0, numeric = 0, dates = 0;
    const samples = [];
    const heading = normaliseHeading(grid[headerRow]?.[c]);
    for (const row of rows) {
      const v = row[c];
      // Skip blanks, and the heading itself where page breaks repeat it inside the data.
      if (isBlank(v) || (heading && normaliseHeading(v) === heading)) continue;
      filled++;
      if (looksLikeDate(v) || /^\d{4}-\d{2}-\d{2}$/.test(cellText(v))) dates++;
      else {
        const n = parseNumber(v);
        if (n && !n.error) numeric++;
      }
      if (samples.length < 4 && !samples.includes(cellText(v))) samples.push(cellText(v));
    }
    cols.push({
      index: c,
      heading: cellText(grid[headerRow]?.[c]),
      key: normaliseHeading(grid[headerRow]?.[c]),
      filled,
      numericShare: filled ? numeric / filled : 0,
      dateShare: filled ? dates / filled : 0,
      samples,
    });
  }
  return cols;
}

function nameScore(key, synonyms) {
  if (!key) return 0;
  let best = 0;
  for (const s of synonyms) {
    if (key === s) return 10 + s.length / 100;
    if (s.length > 2 && (` ${key} `).includes(` ${s} `)) best = Math.max(best, 5 + s.length / 100);
  }
  return best;
}

// Does a column's content fit the kind of field? Dates must look like dates, money and
// quantities like numbers. A heading match with the wrong content scores much lower.
function contentFit(col, kind) {
  if (!col.filled) return 0.5;
  if (kind === 'date') return col.dateShare >= 0.5 ? 1 : 0.2;
  if (kind === 'money' || kind === 'number') return col.numericShare >= 0.6 ? 1 : 0.2;
  if (kind === 'text' || kind === 'postcode') return col.numericShare > 0.9 ? 0.5 : 1;
  return 1;
}

// Match columns to fields for a given file type. Returns { field: columnIndex }.
export function autoMap(columns, typeId) {
  const type = FILE_TYPES[typeId];
  const pairs = [];
  type.fields.forEach((field, order) => {
    const syns = synonymsFor(typeId, field);
    for (const col of columns) {
      const s = nameScore(col.key, syns);
      if (s > 0) {
        const required = type.required.includes(field) ? 0.5 : 0;
        pairs.push({ field, col: col.index, score: s * contentFit(col, FIELDS[field].kind) + required, order });
      }
    }
  });
  pairs.sort((a, b) => b.score - a.score || a.order - b.order);
  const mapping = {};
  const usedCols = new Set();
  for (const p of pairs) {
    if (mapping[p.field] !== undefined || usedCols.has(p.col)) continue;
    mapping[p.field] = p.col;
    usedCols.add(p.col);
  }
  return mapping;
}

// Required fields that are not mapped. `anyOf` groups need at least one of their fields.
export function missingRequired(mapping, typeId) {
  const type = FILE_TYPES[typeId];
  const missing = type.required.filter((f) => mapping[f] === undefined);
  for (const group of type.anyOf || []) {
    if (!group.some((f) => mapping[f] !== undefined)) missing.push(group[0]);
  }
  return missing;
}

// Which kind of file is this? Each type is scored on how many of its fields the columns
// match, with heavy weight on required fields, and marked down for fields that belong to
// other kinds of file (a stock file has no invoice numbers). Returns types best first.
export function identifyType(columns) {
  const scores = AVAILABLE_TYPES.map((typeId) => {
    const type = FILE_TYPES[typeId];
    const mapping = autoMap(columns, typeId);
    const mapped = Object.keys(mapping);
    let score = mapped.length;
    score += 4 * type.required.filter((f) => mapping[f] !== undefined).length;
    score -= 6 * missingRequired(mapping, typeId).length;
    for (const f of type.against) {
      const syns = synonymsFor(Object.keys(FILE_TYPES).find((t) => FILE_TYPES[t].fields.includes(f)) || typeId, f);
      if (columns.some((c) => nameScore(c.key, syns) >= 10)) score -= 4;
    }
    return { typeId, score, mapping };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

// Read a file's structure: heading row, columns, best guess at its type and mapping.
export function analyseGrid(grid) {
  const headerRow = findHeaderRow(grid);
  const columns = profileColumns(grid, headerRow);
  const guesses = identifyType(columns);
  return { headerRow, columns, guesses, typeId: guesses[0].typeId, mapping: guesses[0].mapping };
}
