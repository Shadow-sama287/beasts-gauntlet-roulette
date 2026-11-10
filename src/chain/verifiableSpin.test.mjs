// src/chain/verifiableSpin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedFromChain, getSpinSeed, deriveSpin } from './verifiableSpin.js';

test('verifiableSpin: seedFromChain is deterministic across calls', async () => {
  const params = {
    blockHash: '0x01a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80',
    runNonce: 'run-12345',
    spinIndex: 3,
  };
  const seed1 = await seedFromChain(params);
  const seed2 = await seedFromChain(params);
  assert.equal(typeof seed1, 'number');
  assert.ok(seed1 >= 0 && seed1 <= 0xffffffff);
  assert.equal(seed1, seed2);

  // Changing any input changes the seed
  const seed3 = await seedFromChain({ ...params, spinIndex: 4 });
  assert.notEqual(seed1, seed3);
});

test('verifiableSpin: getSpinSeed handles verified and local fallback', async () => {
  // Verified with blockInfo
  const verified = await getSpinSeed({
    runNonce: '1',
    spinIndex: 0,
    blockInfo: { blockHash: '0xabc', blockNumber: 100 },
  });
  assert.equal(verified.source, 'verified');
  assert.equal(verified.blockHash, '0xabc');
  assert.equal(verified.blockNumber, 100);

  // Fallback to local when null
  const local = await getSpinSeed({
    runNonce: '1',
    spinIndex: 0,
    blockInfo: null,
  });
  assert.equal(local.source, 'local');
  assert.equal(local.blockHash, null);
  assert.ok(typeof local.seed === 'number');
});

test('verifiableSpin: deriveSpin yields exact same beast for identical parameters', async () => {
  const beasts = [
    { id: '1', name: 'Warlock', rarity: 1 },
    { id: '2', name: 'Typhon', rarity: 1 },
    { id: '6', name: 'Gorgon', rarity: 2 },
    { id: '11', name: 'Vampire', rarity: 3 },
    { id: '16', name: 'Banshee', rarity: 4 },
    { id: '71', name: 'Golem', rarity: 5 },
  ];

  const replayParams = {
    beasts,
    owned: new Set(),
    blockHash: '0x07f123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    runNonce: 'test-nonce-42',
    spinIndex: 2,
    pityCounter: 0,
  };

  const runA = await deriveSpin(replayParams);
  const runB = await deriveSpin(replayParams);

  assert.equal(runA.beast.id, runB.beast.id);
  assert.equal(runA.beast.name, runB.beast.name);
  assert.equal(runA.seed, runB.seed);
  assert.equal(runA.targetAngle, runB.targetAngle);
});

