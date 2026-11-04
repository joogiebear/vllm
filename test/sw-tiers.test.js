import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIER_ART, TIER_ART_V } from '../src/idle/data.js';

// sw.js is a classic script and cannot import ES modules, so it keeps its own
// copy of the tier icon list and version. This test keeps the two in sync
// (docs/ART-TIERS.md, task 4).
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

function listFromSw(name) {
  const m = sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `${name} array not found in sw.js`);
  const ids = m[1].match(/'([^']+)'/g);
  assert.ok(ids, `no ids found in ${name}`);
  return ids.map((s) => s.slice(1, -1));
}

function numFromSw(name) {
  const m = sw.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(m, `${name} not found in sw.js`);
  return Number(m[1]);
}

test('sw.js: TIER_ART mirrors TIER_ART in data.js', () => {
  assert.deepEqual(listFromSw('TIER_ART'), TIER_ART);
});

test('sw.js: TIER_ART_V mirrors TIER_ART_V in data.js', () => {
  assert.equal(numFromSw('TIER_ART_V'), TIER_ART_V);
});
