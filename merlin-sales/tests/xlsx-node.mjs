// Loads the vendored SheetJS build in Node, the same file the browser uses.
// The repo's package.json sets "type": "module", so the file cannot simply be require()d;
// running it in a VM context gives the same global XLSX object the browser gets.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../vendor/sheetjs/xlsx.full.min.js', import.meta.url), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx);

export const XLSX = ctx.XLSX;
