import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTRAITS, PORTRAIT_V } from '../src/idle/data.js';

// sw.js is a classic script and cannot import ES modules, so it keeps its own
// copy of the portrait list and version. This test keeps the two in sync
// (docs/ART-PORTRAITS.md, task 4).
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

test('sw.js: PORTRAITS mirrors PORTRAITS in data.js', () => {
  assert.deepEqual(listFromSw('PORTRAITS'), PORTRAITS);
});

test('sw.js: PORTRAIT_V mirrors PORTRAIT_V in data.js', () => {
  assert.equal(numFromSw('PORTRAIT_V'), PORTRAIT_V);
});
