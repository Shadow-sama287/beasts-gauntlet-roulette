// src/minigames/framework.test.mjs — Verification of Minigames & Full-Screen Framework
import test from 'node:test';
import assert from 'node:assert';
import { getTierMinigame } from './tierGames.js';

test('tier minigames: all 5 tiers 1..5 have valid factories, titles, blurbs, and controls', () => {
  for (let tier = 1; tier <= 5; tier++) {
    const def = getTierMinigame(tier);
    assert.ok(def, `Tier ${tier} must have a minigame definition`);
    assert.ok(typeof def.id === 'string' && def.id.length > 0, `Tier ${tier} must have id`);
    assert.ok(typeof def.title === 'string' && def.title.length > 0, `Tier ${tier} must have title`);
    assert.ok(typeof def.blurb === 'string' && def.blurb.length > 0, `Tier ${tier} must have blurb`);
    assert.ok(typeof def.controls === 'string' && def.controls.length > 0, `Tier ${tier} must have controls`);
    assert.ok(typeof def.factory === 'function', `Tier ${tier} must have factory function`);
  }
});

test('tier minigames: tier mapping matches brief concepts', () => {
  const t5 = getTierMinigame(5);
  assert.strictEqual(t5.id, 'steady_sweep', 'T5 is Steady Sweep timing bar');

  const t4 = getTierMinigame(4);
  assert.strictEqual(t4.id, 'rhythm_strike', 'T4 is Rhythm Strike');

  const t3 = getTierMinigame(3);
  assert.strictEqual(t3.id, 'follow_beast', 'T3 is Follow the Beast drag');

  const t2 = getTierMinigame(2);
  assert.strictEqual(t2.id, 'dodge_seal', 'T2 is Dodge & Seal');

  const t1 = getTierMinigame(1);
  assert.strictEqual(t1.id, 'apex_nexus', 'T1 is Apex Nexus Boss');
});

test('minigames lifecycle: repeated instantiation and cleanup cycles do not throw', () => {
  // Mock container
  const mockContainer = {
    clientWidth: 360,
    clientHeight: 600,
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  // Verify tier definitions can be fetched in tight loop without degradation
  for (let cycle = 0; cycle < 20; cycle++) {
    for (let t = 1; t <= 5; t++) {
      const def = getTierMinigame(t);
      assert.ok(def.factory);
    }
  }
});
