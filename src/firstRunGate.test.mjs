// src/firstRunGate.test.mjs — Unit tests for First-Run Gate
import test from 'node:test';
import assert from 'node:assert';
import {
  isGauntletLocked,
  isDojoLocked,
  isFirstSpin,
  getFirstSpinBeast,
  unlockFirstCompanion,
  createFreshAlbumState,
} from './firstRunGate.js';

test('first-run gate: fresh state => Gauntlet and Dojo are locked', () => {
  const fresh = createFreshAlbumState();
  assert.strictEqual(isGauntletLocked(fresh), true, 'Gauntlet must be locked for fresh player');
  assert.strictEqual(isDojoLocked(fresh), true, 'Dojo must be locked for fresh player');
  assert.strictEqual(isFirstSpin(fresh), true, 'Must identify as first spin');
  assert.strictEqual(fresh.activeCompanionId, null, 'No pre-granted companion on fresh save');
});

test('first-run gate: getFirstSpinBeast always selects a T4 or T5 starter', () => {
  const testPool = [
    { id: '1', name: 'Warlock', rarity: 1 },
    { id: '6', name: 'Gorgon', rarity: 2 },
    { id: '11', name: 'Vampire', rarity: 3 },
    { id: '16', name: 'Banshee', rarity: 4 },
    { id: '71', name: 'Golem', rarity: 5 },
  ];

  for (let seed = 0; seed < 30; seed++) {
    const rng = () => (seed * 0.137) % 1;
    const starter = getFirstSpinBeast(testPool, rng);
    assert.ok(starter.rarity >= 4, `Starter must be T4 or T5, got T${starter.rarity} (${starter.name})`);
  }
});

test('first-run gate: after first capture => Gauntlet and Dojo unlocked, active companion set', () => {
  const album = createFreshAlbumState();
  const capturedBeast = { id: '71', name: 'Golem', rarity: 5, tier: 5, type: 'Brute' };

  const updated = unlockFirstCompanion(album, capturedBeast);
  assert.strictEqual(isGauntletLocked(updated), false, 'Gauntlet must be unlocked after first capture');
  assert.strictEqual(isDojoLocked(updated), false, 'Dojo must be unlocked after first capture');
  assert.strictEqual(isFirstSpin(updated), false, 'First spin flag must clear');
  assert.strictEqual(updated.activeCompanionId, '71', 'Companion must be auto-set');
  assert.deepStrictEqual(updated.caughtIds, ['71']);
});

test('first-run gate: reset => locked again with zero companions', () => {
  let album = createFreshAlbumState();
  album = unlockFirstCompanion(album, { id: '16', name: 'Banshee', rarity: 4 });
  assert.strictEqual(isGauntletLocked(album), false);

  // Reset
  const resetState = createFreshAlbumState();
  assert.strictEqual(isGauntletLocked(resetState), true, 'Reset must re-lock Gauntlet');
  assert.strictEqual(resetState.activeCompanionId, null);
  assert.strictEqual(resetState.caughtIds.length, 0);
});
