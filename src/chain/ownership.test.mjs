// src/chain/ownership.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddress, checkRosterOwnership } from './ownership.js';

test('ownership: normalizeAddress handles hex and decimal numbers', () => {
  assert.equal(normalizeAddress('0x049D'), '0x49d');
  assert.equal(normalizeAddress('0x0001'), '0x1');
  assert.equal(normalizeAddress(''), '');
  assert.equal(normalizeAddress(null), '');
});

test('ownership: checkRosterOwnership returns empty set when no address', async () => {
  const res = await checkRosterOwnership({ beasts: [], userAddress: null });
  assert.equal(res.ownedIds.size, 0);
  assert.equal(res.error, 'No address provided');
});

test('ownership: checkRosterOwnership handles network timeout gracefully', async () => {
  const beasts = [{ id: '1', name: 'Warlock', tokenId: '1' }];
  const res = await checkRosterOwnership({
    beasts,
    userAddress: '0x1234',
    rpcUrl: 'http://127.0.0.1:9999/dummy-rpc',
  });
  // Degrades gracefully without throwing
  assert.ok(res.ownedIds instanceof Set);
  assert.equal(res.checkedCount, 1);
});

