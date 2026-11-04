import test from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADES, X5_UPGRADES, WEIGHT_UPGRADES, upgradeEffect, weightUpgradeEffect } from '../src/idle/data.js';

// Internal codes that must never leak into an effect line: booleans,
// undefined, NaN and raw tier ids (the trailing space keeps "pi" from
// matching inside a word).
const BAD_TOKENS = ['true', 'false', 'undefined', 'NaN', 'gamer', 'pi '];

function assertClean(line, name) {
  for (const bad of BAD_TOKENS) {
    assert.ok(!line.includes(bad), `${name}: "${line}" contains "${bad}"`);
  }
}

test('no upgrade effect line shows an internal code', () => {
  for (const u of [...UPGRADES, ...X5_UPGRADES]) {
    const line = upgradeEffect(u);
    assertClean(line, u.id);
  }
});

test('no Weight upgrade effect line shows an internal code', () => {
  for (const u of WEIGHT_UPGRADES) {
    const line = weightUpgradeEffect(u);
    assertClean(line, u.id);
  }
});

test('upgrade effect lines use the tier display name and plain wording', () => {
  const byId = (id) => UPGRADES.find((u) => u.id === id);
  const x5ById = (id) => X5_UPGRADES.find((u) => u.id === id);
  assert.equal(upgradeEffect(byId('quant')), 'All production x1.5');
  assert.equal(upgradeEffect(byId('gamer3')), 'Gaming GPU output x3');
  assert.equal(upgradeEffect(byId('pi3')), 'Raspberry Pi output x3');
  assert.equal(upgradeEffect(byId('prefix1')), '+25% tokens from the prompt cache');
  assert.equal(upgradeEffect(x5ById('gamer5')), 'Gaming GPU output x5');
  assert.equal(upgradeEffect(x5ById('pi5')), 'Raspberry Pi output x5');
});

test('Weight upgrade effect lines are plain English', () => {
  const byId = (id) => WEIGHT_UPGRADES.find((u) => u.id === id);
  assert.equal(weightUpgradeEffect(byId('seed')), 'Start every run with 1,000 tokens');
  assert.equal(weightUpgradeEffect(byId('night')), 'Earn 75% of your rate while away');
  assert.equal(weightUpgradeEffect(byId('warm')), '+25% tokens from the prompt cache');
  assert.equal(weightUpgradeEffect(byId('procure')), 'Unlocks the Buy all button');
  assert.equal(weightUpgradeEffect(byId('long')), 'Earn offline for up to 24 hours');
  assert.equal(weightUpgradeEffect(byId('auto')), 'Start every run with the Cron Job manager hired');
  assert.equal(weightUpgradeEffect(byId('distill')), 'Each Weight gives +13% production instead of +10%');
});
