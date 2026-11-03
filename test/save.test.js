import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_CORRUPT_KEY, SAVE_VERSION } from '../src/idle/data.js';
import { createState } from '../src/idle/core.js';
import { load, save, backupNow, listBackups, restoreBackup } from '../src/idle/save.js';

// Fake localStorage (docs/STABILITY-DESIGN.md section 3): the save module
// only ever uses getItem/setItem/removeItem.
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    clear: () => m.clear(),
  };
}
let storage;
function resetStorage() {
  storage = makeStorage();
  globalThis.localStorage = storage;
}
function makeState(tokens, lifetime) {
  const s = createState();
  s.tokens = tokens;
  s.lifetime = lifetime;
  return s;
}
function mainPayload(state, savedAt) {
  return JSON.stringify({ version: SAVE_VERSION, savedAt, state });
}
function readSlot(key) {
  const raw = storage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}
const MIN = 60 * 1000;
const T0 = 1_700_000_000_000;

test('backupNow: rotation keeps the 3 newest', () => {
  resetStorage();
  for (let i = 0; i < 4; i++) {
    // 6-minute gaps so the non-forced gap check never blocks.
    assert.equal(backupNow(makeState(100 * (i + 1), 1000 * (i + 1)), T0 + i * 6 * MIN, false), true);
  }
  const b1 = readSlot(SAVE_KEY + ':b1');
  const b2 = readSlot(SAVE_KEY + ':b2');
  const b3 = readSlot(SAVE_KEY + ':b3');
  assert.equal(b1.data.state.tokens, 400); // newest
  assert.equal(b2.data.state.tokens, 300);
  assert.equal(b3.data.state.tokens, 200); // oldest kept; the first backup is gone
  assert.equal(b1.lifetime, 4000);
  assert.equal(b1.savedAt, T0 + 3 * 6 * MIN);
  assert.equal(b1.data.version, SAVE_VERSION);
});

test('backupNow: the 5-minute gap is respected', () => {
  resetStorage();
  assert.equal(backupNow(makeState(1, 10), T0, false), true);
  // 4 minutes later: too soon, no backup.
  assert.equal(backupNow(makeState(2, 20), T0 + 4 * MIN, false), false);
  assert.equal(readSlot(SAVE_KEY + ':b1').data.state.tokens, 1);
  // Exactly 5 minutes later: allowed, and the old b1 rotates into b2.
  assert.equal(backupNow(makeState(3, 30), T0 + 5 * MIN, false), true);
  assert.equal(readSlot(SAVE_KEY + ':b1').data.state.tokens, 3);
  assert.equal(readSlot(SAVE_KEY + ':b2').data.state.tokens, 1);
  assert.equal(storage.getItem(SAVE_KEY + ':b3'), null);
});

test('backupNow: a forced backup bypasses the gap', () => {
  resetStorage();
  assert.equal(backupNow(makeState(1, 10), T0, true), true);
  assert.equal(backupNow(makeState(2, 20), T0 + 1000, true), true);
  assert.equal(readSlot(SAVE_KEY + ':b1').data.state.tokens, 2);
  assert.equal(readSlot(SAVE_KEY + ':b2').data.state.tokens, 1);
});

test('load: a corrupt main save falls back to b1', () => {
  resetStorage();
  assert.equal(backupNow(makeState(12345, 999), T0, true), true);
  storage.setItem(SAVE_KEY, '{not json');
  const r = load();
  assert.equal(r.restoredFrom, 'b1');
  assert.equal(r.state.tokens, 12345);
  assert.equal(r.savedAt, T0);
  // The bad main save is kept under the corrupt key for diagnosis, and
  // the main save is repaired from the backup.
  assert.equal(storage.getItem(SAVE_CORRUPT_KEY), '{not json');
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).state.tokens, 12345);
});

test('load: an empty b1 falls back to b2', () => {
  resetStorage();
  assert.equal(backupNow(makeState(111, 10), T0, true), true);
  assert.equal(backupNow(makeState(222, 20), T0 + 6 * MIN, false), true); // b1=222, b2=111
  storage.removeItem(SAVE_KEY + ':b1');
  storage.setItem(SAVE_KEY, 'nope');
  const r = load();
  assert.equal(r.restoredFrom, 'b2');
  assert.equal(r.state.tokens, 111);
  assert.equal(r.savedAt, T0);
});

test('load: a healthy main save is used, no fallback', () => {
  resetStorage();
  save(makeState(777, 7), T0);
  const r = load();
  assert.equal(r.restoredFrom, null);
  assert.equal(r.state.tokens, 777);
  assert.equal(r.savedAt, T0);
  assert.equal(storage.getItem(SAVE_CORRUPT_KEY), null);
});

test('restoreBackup: replaces the main save', () => {
  resetStorage();
  assert.equal(backupNow(makeState(111, 10), T0, true), true);
  assert.equal(backupNow(makeState(222, 20), T0 + 6 * MIN, false), true); // b1=222
  storage.setItem(SAVE_KEY, mainPayload(makeState(333, 30), T0 + 12 * MIN));
  const s = restoreBackup('b1');
  assert.equal(s.tokens, 222);
  const main = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(main.state.tokens, 222); // the main save was replaced
  assert.equal(restoreBackup('b9'), null); // unknown slot
  assert.equal(restoreBackup('b3'), null); // empty slot
});

test('listBackups: lists the three slots, b1 newest first', () => {
  resetStorage();
  assert.equal(backupNow(makeState(1, 10), T0, true), true);
  assert.equal(backupNow(makeState(2, 20), T0 + 6 * MIN, false), true);
  const list = listBackups();
  assert.equal(list.length, 3);
  assert.equal(list[0].slot, 'b1');
  assert.equal(list[0].savedAt, T0 + 6 * MIN);
  assert.equal(list[0].lifetime, 20);
  assert.equal(list[1].slot, 'b2');
  assert.equal(list[1].lifetime, 10);
  assert.equal(list[2], null);
});
