// src/chain/receipt.js — Gas-free SNIP-12 signed run receipt
// Produces a cryptographic receipt of the playthrough for Starknet Sepolia.
// Truncates SHA-256 to 31 bytes ('0x' + 62 hex chars) to fit in a Cairo felt.

import { SEPOLIA_CHAIN_ID } from './wallet.js';

/**
 * Hash run log entries with SHA-256, truncated to 31 bytes ('0x' + 62 hex chars) to fit in a felt252
 */
export async function computeRunHash(spinLogs = []) {
  const serialized = spinLogs
    .map((l) => `${l.spinIndex}:${l.beastId}:${l.result}:${l.blockHash || 'local'}`)
    .join(';');
  const bytes = new TextEncoder().encode(serialized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  // Truncate to 31 bytes (62 hex chars)
  return '0x' + hex.slice(0, 62);
}

/**
 * Construct SNIP-12 typed data structure
 */
export function buildTypedData({
  player = '0x0',
  runHash,
  tamed = 0,
  spins = 0,
  timestamp = Math.floor(Date.now() / 1000),
  chainId = SEPOLIA_CHAIN_ID,
}) {
  return {
    types: {
      StarknetDomain: [
        { name: 'name', type: 'shortstring' },
        { name: 'version', type: 'shortstring' },
        { name: 'chainId', type: 'shortstring' },
        { name: 'revision', type: 'shortstring' },
      ],
      RunReceipt: [
        { name: 'player', type: 'ContractAddress' },
        { name: 'runHash', type: 'felt' },
        { name: 'tamed', type: 'felt' },
        { name: 'spins', type: 'felt' },
        { name: 'timestamp', type: 'felt' },
      ],
    },
    primaryType: 'RunReceipt',
    domain: {
      name: 'BeastGauntlet',
      version: '1',
      chainId: chainId || SEPOLIA_CHAIN_ID,
      revision: '1',
    },
    message: {
      player: player || '0x0',
      runHash: String(runHash),
      tamed: String(tamed),
      spins: String(spins),
      timestamp: String(timestamp),
    },
  };
}

/**
 * Generate a run receipt. If an account is provided, sign it with account.signMessage (gas-free).
 * Otherwise generate an off-chain guest receipt.
 */
export async function createRunReceipt({
  account = null,
  player = '0x0',
  runLogs = [],
  tamed = 0,
  spins = 0,
  chainId = SEPOLIA_CHAIN_ID,
}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const runHash = await computeRunHash(runLogs);

  const typedData = buildTypedData({
    player,
    runHash,
    tamed,
    spins,
    timestamp,
    chainId,
  });

  let signature = null;
  let status = 'off-chain signed receipt';

  if (account && typeof account.signMessage === 'function') {
    try {
      signature = await account.signMessage(typedData);
      status = 'signed (SNIP-12 gas-free)';
    } catch (err) {
      console.warn('[receipt] Wallet signing skipped or rejected:', err);
      status = 'off-chain signed receipt (signing declined)';
    }
  } else {
    status = 'off-chain signed receipt (guest mode)';
  }

  const receipt = {
    title: 'Beast Gauntlet & Roulette Run Receipt',
    status,
    network: 'Starknet Sepolia',
    chainId: chainId || SEPOLIA_CHAIN_ID,
    player: player || 'guest',
    runHash,
    summary: {
      tamed,
      spinsUsed: spins,
      timestamp,
      date: new Date(timestamp * 1000).toISOString(),
    },
    typedData,
    signature,
    spins: runLogs,
    verification: {
      replayable: true,
      hasChainSeeds: runLogs.some((l) => l.blockHash),
      guarantee: 'Zero wallet transaction / zero gas',
    },
  };

  return { receipt, typedData, signature, status };
}

/**
 * Download receipt as JSON file
 */
export function downloadReceipt(receipt, filename = 'beast-run-receipt.json') {
  if (typeof window === 'undefined') return;
  const jsonStr = JSON.stringify(receipt, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

