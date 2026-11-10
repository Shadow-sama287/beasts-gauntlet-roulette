// src/chain/ownership.js — Read-only NFT ownership check for Starknet Sepolia
// Uses owner_of(u256) with 2s timeout, concurrency 8, cached per address in localStorage

import { SEPOLIA, toU256Calldata } from '../onchain.js';

const ENTRYPOINT_OWNER_OF_SELECTOR = '0x3552df12bdc6089cf963c40c4cf56fbfd4bd14680c244d1c5494c2790f1ea5c';
const DEFAULT_RPC = 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe';

// In-memory cache: address -> Set of owned beast/token IDs
const ownershipCache = new Map();

export function normalizeAddress(addr) {
  if (!addr) return '';
  try {
    return '0x' + BigInt(addr).toString(16).toLowerCase();
  } catch {
    return String(addr).toLowerCase();
  }
}

/**
 * Load cached owned beasts from localStorage
 */
export function loadCachedOwnership(address) {
  if (!address || typeof window === 'undefined') return new Set();
  const normalized = normalizeAddress(address);
  if (ownershipCache.has(normalized)) return ownershipCache.get(normalized);

  try {
    const raw = localStorage.getItem(`br.owned.${normalized}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      const set = new Set(Array.isArray(parsed) ? parsed : []);
      ownershipCache.set(normalized, set);
      return set;
    }
  } catch (err) {
    console.warn('[ownership] Failed to read localStorage:', err);
  }
  return new Set();
}

/**
 * Save cached owned beasts to localStorage
 */
export function saveCachedOwnership(address, ownedSet) {
  if (!address || typeof window === 'undefined') return;
  const normalized = normalizeAddress(address);
  ownershipCache.set(normalized, ownedSet);
  try {
    localStorage.setItem(`br.owned.${normalized}`, JSON.stringify([...ownedSet]));
  } catch (err) {
    console.warn('[ownership] Failed to write localStorage:', err);
  }
}

/**
 * Check owner_of for one token ID via starknet_call with timeout
 */
export async function checkTokenOwner(tokenId, rpcUrl = DEFAULT_RPC, timeoutMs = 2000) {
  if (!tokenId) return null;
  const calldata = toU256Calldata(tokenId);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'starknet_call',
        params: [
          {
            contract_address: SEPOLIA.nft,
            entry_point_selector: ENTRYPOINT_OWNER_OF_SELECTOR,
            calldata,
          },
          'latest',
        ],
      }),
      signal: controller?.signal,
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error || !json.result || !json.result[0]) return null;
    return json.result[0];
  } catch {
    if (timer) clearTimeout(timer);
    return null;
  }
}

/**
 * Concurrency helper for running promises with max concurrent workers
 */
async function poolAll(tasks, limit = 8) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.allSettled(results);
}

/**
 * Scan a list of beasts to check which ones are owned by userAddress.
 * Returns { ownedIds: Set<string>, checkedCount: number, error: string|null }
 */
export async function checkRosterOwnership({ beasts, userAddress, rpcUrl = DEFAULT_RPC }) {
  if (!userAddress) {
    return { ownedIds: new Set(), checkedCount: 0, error: 'No address provided' };
  }

  const normalizedUser = normalizeAddress(userAddress);
  const cached = loadCachedOwnership(normalizedUser);

  // Filter beasts that have a valid token ID or numeric id that can be queried
  const candidates = (beasts || []).filter((b) => b && (b.tokenId || (Number(b.id) >= 1 && Number(b.id) <= 75)));

  if (candidates.length === 0) {
    return { ownedIds: cached, checkedCount: 0, error: null };
  }

  const newlyFound = new Set(cached);

  const tasks = candidates.map((b) => async () => {
    const tid = b.tokenId || b.id;
    const owner = await checkTokenOwner(tid, rpcUrl, 2000);
    if (owner && normalizeAddress(owner) === normalizedUser) {
      newlyFound.add(String(b.id));
    }
  });

  try {
    await poolAll(tasks, 8);
    saveCachedOwnership(normalizedUser, newlyFound);
    return { ownedIds: newlyFound, checkedCount: candidates.length, error: null };
  } catch (err) {
    console.warn('[ownership] Check failed:', err);
    return { ownedIds: cached, checkedCount: candidates.length, error: err.message };
  }
}

