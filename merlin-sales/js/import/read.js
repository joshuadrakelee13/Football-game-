// Reading .csv, .xlsx and .xls files into a plain grid of cell values with SheetJS.
// SheetJS is passed in (window.XLSX in the browser, the same file loaded in Node for tests).
//
// Cell values in the grid are: text, numbers, or 'yyyy-mm-dd' for cells Excel formatted as
// dates. CSV cells are always kept as text, so leading zeros and date text survive untouched.

import { serialToIso } from './dates.js';

// ERP exports are often Windows-1252 rather than UTF-8 (the £ sign shows the difference).
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    text = new TextDecoder('windows-1252').decode(u8);
  }
  return text.replace(/^﻿/, '');
}

function cellValue(XLSX, cell) {
  if (!cell) return '';
  switch (cell.t) {
    case 's':
    case 'str':
      return cell.v ?? '';
    case 'n': {
      // A number Excel shows with leading zeros (format "000000") keeps them.
      if (cell.z && /^0+$/.test(String(cell.z)) && cell.w) return cell.w;
      if (cell.z && XLSX.SSF.is_date(cell.z)) return serialToIso(cell.v) ?? cell.v;
      return cell.v;
    }
    case 'b':
      return cell.v ? 'TRUE' : 'FALSE';
    case 'd':
      return cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : String(cell.v);
    case 'e':
      return '';
    default:
      return cell.v ?? '';
  }
}

function sheetToGrid(XLSX, ws) {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const grid = [];
  const dense = Array.isArray(ws['!data']);
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = dense ? ws['!data'][r]?.[c] : ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cellValue(XLSX, cell));
    }
    grid.push(row);
  }
  // Drop trailing empty rows and columns
  while (grid.length && grid[grid.length - 1].every((v) => v === '' || v === null)) grid.pop();
  let width = 0;
  for (const row of grid) {
    for (let c = row.length - 1; c >= width; c--) {
      if (row[c] !== '' && row[c] !== null) { width = c + 1; break; }
    }
  }
  return grid.map((row) => row.slice(0, width));
}

function countFilled(grid) {
  let n = 0;
  for (const row of grid) for (const v of row) if (v !== '' && v !== null) n++;
  return n;
}

// Read one file. `data` is an ArrayBuffer or Uint8Array of the file's bytes.
export function readFile(XLSX, data, name) {
  const isText = /\.(csv|txt|tsv)$/i.test(name);
  let wb;
  if (isText) {
    const text = decodeText(data);
    wb = XLSX.read(text, { type: 'string', raw: true, dense: true });
  } else {
    wb = XLSX.read(data instanceof ArrayBuffer ? new Uint8Array(data) : data, { type: 'array', cellDates: false, cellNF: true, cellText: true, dense: true });
  }
  // Use the sheet with the most data; note the others.
  let best = null;
  for (const sheetName of wb.SheetNames) {
    const grid = sheetToGrid(XLSX, wb.Sheets[sheetName]);
    const filled = countFilled(grid);
    if (!best || filled > best.filled) best = { sheetName, grid, filled };
  }
  return {
    name,
    sheetName: best?.sheetName || '',
    sheetNames: wb.SheetNames,
    grid: best?.grid || [],
  };
}
