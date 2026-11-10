// src/chain/wallet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { wallet, truncateAddress, SEPOLIA_CHAIN_ID, NETWORK_NAME } from './wallet.js';

test('wallet: initial state is disconnected', () => {
  assert.equal(wallet.state.isConnected, false);
  assert.equal(wallet.state.address, null);
  assert.equal(wallet.state.networkName, NETWORK_NAME);
  assert.equal(wallet.state.wrongNetwork, false);
});

test('wallet: truncateAddress formats addresses cleanly', () => {
  assert.equal(truncateAddress(''), '');
  assert.equal(truncateAddress(null), '');
  assert.equal(truncateAddress('0x1234'), '0x1234');
  assert.equal(
    truncateAddress('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'),
    '0x049d…4dc7'
  );
});

test('wallet: disconnect resets state and notifies listener', async () => {
  let notified = false;
  const unsub = wallet.onChange((st) => {
    notified = true;
  });
  await wallet.disconnect();
  unsub();
  assert.equal(notified, true);
  assert.equal(wallet.state.isConnected, false);
});

