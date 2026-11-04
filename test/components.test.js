// Tests for the DOM-free parts of src/idle/components.js and the number
// format's edge cases (docs/COMPONENTS.md). The DOM parts are covered by
// tools/smoke.js. Run with: node --test test/components.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampFraction, percent, accessibleName, variantClass } from '../src/idle/components.js';
import { fmt } from '../src/idle/fmt.js';

test('clampFraction: have / need within [0, 1]', () => {
  assert.equal(clampFraction(5, 10), 0.5);
  assert.equal(clampFraction(20, 10), 1);
  assert.equal(clampFraction(0, 10), 0);
  assert.equal(clampFraction(-3, 10), 0);
});

test('clampFraction: missing or bad input never throws and never exceeds 1', () => {
  assert.equal(clampFraction(5, 0), 1, 'nothing needed counts as done');
  assert.equal(clampFraction(5, -1), 1);
  assert.equal(clampFraction(5, undefined), 1);
  assert.equal(clampFraction(NaN, 10), 0);
  assert.equal(clampFraction(Infinity, 10), 0);
  assert.equal(clampFraction(undefined, 10), 0);
  assert.equal(clampFraction(1e308, 1e300), 1);
});

test('percent: whole numbers 0 to 100', () => {
  assert.equal(percent(0.333), 33);
  assert.equal(percent(0.999), 100);
  assert.equal(percent(2), 100);
  assert.equal(percent(-1), 0);
  assert.equal(percent(NaN), 0);
});

test('accessibleName: joins the visible parts and skips empty ones', () => {
  assert.equal(accessibleName('Buy 25 → 50', '105.1K'), 'Buy 25 → 50, 105.1K');
  assert.equal(accessibleName('Hire', ''), 'Hire');
  assert.equal(accessibleName(' Needs 1 ', null, 'Datacenter'), 'Needs 1, Datacenter');
  assert.equal(accessibleName(), '');
  assert.equal(accessibleName(0, 'tokens'), '0, tokens');
});

test('variantClass: the one button grammar', () => {
  assert.equal(variantClass('primary'), 'afford');
  assert.equal(variantClass('done'), 'done');
  assert.equal(variantClass('lock'), 'lock');
  assert.equal(variantClass('danger'), 'danger');
  assert.equal(variantClass('default'), '');
  assert.equal(variantClass(undefined), '');
});

test('fmt: short scale up to Dc, then scientific, never wider than a row', () => {
  assert.equal(fmt(999.9), '999');
  assert.equal(fmt(1000), '1.0K');
  assert.equal(fmt(1.5e15), '1.5Q');
  assert.equal(fmt(2e18), '2.0Qi');
  assert.equal(fmt(3e21), '3.0Sx');
  assert.equal(fmt(4.2e33), '4.2Dc');
  assert.equal(fmt(1e36), '1.00e36');
  assert.equal(fmt(1e308), '1.00e308');
  for (const n of [1e18, 1e25, 1e33, 1e40, 1e100, 1e300]) {
    assert.ok(fmt(n).length <= 8, `${n} -> ${fmt(n)}`);
  }
});

test('fmt: rounding never shows 1000.0 of a unit', () => {
  assert.equal(fmt(999960), '1.0M');
  assert.equal(fmt(999.96e15), '1.0Qi');
});

test('fmt: bad input reads as 0, infinities stay infinite, negatives keep their sign', () => {
  assert.equal(fmt(NaN), '0');
  assert.equal(fmt(undefined), '0');
  assert.equal(fmt(null), '0');
  assert.equal(fmt('junk'), '0');
  assert.equal(fmt('12'), '12');
  assert.equal(fmt(Infinity), '∞');
  assert.equal(fmt(-Infinity), '-∞');
  assert.equal(fmt(-1500), '-1.5K');
  assert.equal(fmt(-5), '-5');
  assert.equal(fmt(0), '0');
  assert.equal(fmt(0.4), '0.4');
});
