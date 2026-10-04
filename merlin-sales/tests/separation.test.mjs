// Simon's app and the demo must never share data, storage or code paths (brief section 2.1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DEMO = join(APP, '..', 'merlin-sales-demo');

function walk(dir, skip = []) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (skip.some((s) => p.startsWith(s))) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, skip));
    else out.push(p);
  }
  return out;
}

const dbName = (dir) => readFileSync(join(dir, 'js', 'config.js'), 'utf8').match(/DB_NAME = '([^']+)'/)[1];

test("Simon's app has no sample data, sample generator or 'try sample' option", () => {
  // tests/ holds fake fixtures that the app never loads, and tools/make-demo.mjs builds the
  // demo; neither is part of the running app.
  const files = walk(APP, [join(APP, 'tests'), join(APP, 'vendor'), join(APP, 'tools')]);
  for (const f of files) {
    const rel = relative(APP, f);
    assert.ok(!/sample/i.test(rel), `no sample files in the app: ${rel}`);
    if (!/\.(js|html|css)$/.test(f)) continue;
    const src = readFileSync(f, 'utf8');
    assert.ok(!/make-sample|sample-customers|sample-sales|generateSample|try sample/i.test(src), `no sample data code in ${rel}`);
    assert.ok(!/merlin-sales-demo/.test(src), `the app never refers to the demo: ${rel}`);
    assert.ok(!/tests\/fixtures/.test(src), `the app never loads test fixtures: ${rel}`);
  }
});

test("Simon's app uses its own database name", () => {
  assert.equal(dbName(APP), 'merlin-sales');
});

test('the demo, once built, uses a different database name', { skip: !existsSync(DEMO) && 'demo not built yet (step 10)' }, () => {
  assert.notEqual(dbName(DEMO), dbName(APP));
});
