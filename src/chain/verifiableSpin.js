// src/chain/verifiableSpin.js — Verifiable block-hash spin seeding and replay
// Seeds spins from public Starknet Sepolia block hashes for replayability.
// Degrades to crypto.getRandomValues ("Local RNG") when RPC is unavailable.

import { mulberry32, spin } from '../roulette.js';

export const DEFAULT_SEPOLIA_RPC = 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe';

let cachedBlock = null;
let isRefreshing = false;

/**
 * Fetch latest block hash and number via JSON-RPC starknet_blockHashAndNumber
 */
export async function fetchLatestBlock(rpcUrl = DEFAULT_SEPOLIA_RPC, timeoutMs = 2000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'starknet_blockHashAndNumber',
        params: [],
      }),
      signal: controller?.signal,
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error || !json.result) return null;
    const result = {
      blockHash: json.result.block_hash,
      blockNumber: Number(json.result.block_number),
      timestamp: Date.now(),
    };
    cachedBlock = result;
    return result;
  } catch {
    if (timer) clearTimeout(timer);
    return null;
  }
}

/**
 * Refresh block cache in the background so spins never block
 */
export function triggerBlockRefresh(rpcUrl = DEFAULT_SEPOLIA_RPC) {
  if (isRefreshing) return;
  isRefreshing = true;
  fetchLatestBlock(rpcUrl)
    .catch(() => null)
    .finally(() => {
      isRefreshing = false;
    });
}

export function getCachedBlock() {
  return cachedBlock;
}

export function setCachedBlock(block) {
  cachedBlock = block;
}

/**
 * Derive a 32-bit uint seed from (blockHash, runNonce, spinIndex)
 */
export async function seedFromChain({ blockHash, runNonce, spinIndex }) {
  const bytes = new TextEncoder().encode(`${blockHash}:${runNonce}:${spinIndex}`);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
}

/**
 * Acquire seed for a spin — uses chain block if available, else local secure random
 */
export async function getSpinSeed({ runNonce, spinIndex, blockInfo = cachedBlock }) {
  if (blockInfo && blockInfo.blockHash) {
    try {
      const seed = await seedFromChain({
        blockHash: blockInfo.blockHash,
        runNonce,
        spinIndex,
      });
      return {
        seed,
        source: 'verified',
        blockHash: blockInfo.blockHash,
        blockNumber: blockInfo.blockNumber,
        runNonce,
        spinIndex,
      };
    } catch {
      // Fallback to local
    }
  }

  // Local RNG fallback
  const arr = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    arr[0] = (Math.random() * 0xffffffff) >>> 0;
  }

  return {
    seed: arr[0],
    source: 'local',
    blockHash: null,
    blockNumber: null,
    runNonce,
    spinIndex,
  };
}

/**
 * Re-derive the exact spin outcome deterministically from chain seed
 */
export async function deriveSpin({
  beasts,
  owned = new Set(),
  blockHash,
  runNonce,
  spinIndex,
  pityCounter = 0,
}) {
  const seed = await seedFromChain({ blockHash, runNonce, spinIndex });
  const rng = mulberry32(seed);

  // Construct replay state with exact pity and seed
  const replayState = {
    beasts,
    owned: new Set(owned),
    pityCounter,
    luckyActive: false,
    rng,
    spinsUsed: spinIndex,
    spinsMax: 25,
    hearts: 3,
    essence: 0,
  };

  const spinOutcome = spin(replayState);
  return {
    beast: spinOutcome.beast,
    targetAngle: spinOutcome.targetAngle,
    seed,
    pityTriggered: spinOutcome.pityTriggered,
  };
}

