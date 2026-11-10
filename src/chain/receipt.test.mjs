// src/chain/receipt.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRunHash, buildTypedData, createRunReceipt } from './receipt.js';

test('receipt: computeRunHash produces 31-byte felt-compatible hex', async () => {
  const logs = [
    { spinIndex: 0, beastId: '1', result: 'tamed', blockHash: '0x123' },
    { spinIndex: 1, beastId: '26', result: 'escaped', blockHash: '0x456' },
  ];

  const hash1 = await computeRunHash(logs);
  const hash2 = await computeRunHash(logs);

  assert.equal(hash1.startsWith('0x'), true);
  // '0x' + 62 hex chars = 64 length = 31 bytes
  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);

  // Different logs produce different hash
  const hash3 = await computeRunHash([{ spinIndex: 0, beastId: '51', result: 'tamed' }]);
  assert.notEqual(hash1, hash3);
});

test('receipt: buildTypedData matches SNIP-12 structure', () => {
  const typed = buildTypedData({
    player: '0x1234',
    runHash: '0xabcdef',
    tamed: 4,
    spins: 10,
    timestamp: 1700000000,
  });

  assert.equal(typed.primaryType, 'RunReceipt');
  assert.ok(typed.types.StarknetDomain);
  assert.ok(typed.types.RunReceipt);
  assert.equal(typed.message.player, '0x1234');
  assert.equal(typed.message.tamed, '4');
  assert.equal(typed.message.spins, '10');
});

test('receipt: createRunReceipt creates unsigned guest receipt when no account', async () => {
  const res = await createRunReceipt({
    account: null,
    player: 'guest',
    runLogs: [{ spinIndex: 0, beastId: '1', result: 'tamed' }],
    tamed: 1,
    spins: 1,
  });

  assert.ok(res.receipt);
  assert.equal(res.signature, null);
  assert.equal(res.status, 'off-chain signed receipt (guest mode)');
  assert.equal(res.receipt.verification.guarantee, 'Zero wallet transaction / zero gas');
});

test('receipt: createRunReceipt signs with account.signMessage when present', async () => {
  const mockAccount = {
    signMessage: async (typed) => ['0xmock_r', '0xmock_s'],
  };

  const res = await createRunReceipt({
    account: mockAccount,
    player: '0x1111',
    runLogs: [{ spinIndex: 0, beastId: '1', result: 'tamed' }],
    tamed: 1,
    spins: 1,
  });

  assert.deepEqual(res.signature, ['0xmock_r', '0xmock_s']);
  assert.equal(res.status, 'signed (SNIP-12 gas-free)');
});

