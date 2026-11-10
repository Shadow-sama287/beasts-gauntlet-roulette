// src/art/beastArt.js — Unified Beast Art Resolver
// Order: local file -> onchain image (2s timeout, cached) -> shared sigil fallback
import { generateSigilDataUri } from '../roulette.js';
import { parseTokenUri, SEPOLIA, toU256Calldata, decodeByteArray } from '../onchain.js';

let manifest = {};
const onchainCache = new Map();

// Helper: load local art manifest
export function setArtManifest(m) {
  manifest = m || {};
}

// Pre-populate with known bundled art for all 105 roster beasts
const knownIds = [];
for (let i = 1; i <= 75; i++) knownIds.push(String(i));
for (let i = 10012; i <= 10041; i++) knownIds.push(String(i));

manifest = {};
for (const id of knownIds) {
  manifest[id] = `${id}.svg`;
}

// If in browser, attempt to load latest manifest.json asynchronously
if (typeof window !== 'undefined') {
  fetch('/beasts/manifest.json')
    .then((r) => (r.ok ? r.json() : fetch('/beasts/art/manifest.json').then((r2) => r2.json())))
    .then((m) => {
      if (m && typeof m === 'object') {
        manifest = { ...manifest, ...m };
      }
    })
    .catch(() => {});
}

export function sigilDataUrl(beast) {
  if (!beast) return generateSigilDataUri('0', 'Unknown', 5);
  return generateSigilDataUri(beast.id || '0', beast.name || 'Beast', beast.rarity || 5);
}

export function withTimeout(promise, ms = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

const ENTRYPOINT_TOKEN_URI_SELECTOR = '0x226ad7e84c1fe08eb4c525ed93cccadf9517670341304571e66f7c4f95cbe54';

/**
 * Fetch onchain image from Starknet Sepolia if token ID or RPC is available.
 * Cached to prevent duplicate network calls. Uses native JSON-RPC fetch (zero external packages).
 */
export async function fetchOnchainImage(beast, rpcUrl) {
  if (!beast || !beast.id) return null;
  const idStr = String(beast.id);
  if (onchainCache.has(idStr)) return onchainCache.get(idStr);

  const tokenId = beast.tokenId || (idStr.startsWith('0x') ? idStr : null);
  if (!tokenId) return null;

  try {
    const endpoint = rpcUrl || 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'starknet_call',
        params: [
          {
            contract_address: SEPOLIA.nft,
            entry_point_selector: ENTRYPOINT_TOKEN_URI_SELECTOR,
            calldata: toU256Calldata(tokenId),
          },
          'latest',
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error || !json.result) return null;
    const parsed = parseTokenUri(decodeByteArray(json.result));
    const imgSrc = parsed.imageUrl || (parsed.imageSvg ? `data:image/svg+xml;utf8,${encodeURIComponent(parsed.imageSvg)}` : null);
    if (imgSrc) {
      onchainCache.set(idStr, imgSrc);
      return imgSrc;
    }
  } catch (err) {
    // Network failure or timeout
  }
  return null;
}

function normalizeLocalArtPath(local, idStr) {
  const file = typeof local === 'string' ? local : (local.file || `${idStr}.svg`);
  if (file.startsWith('/')) return file;
  if (file.startsWith('beasts/')) return `/${file}`;
  return `/beasts/art/${file}`;
}

/**
 * Synchronous resolver for instant initial render.
 */
export function resolveBeastArtSync(beast) {
  if (!beast) return { src: sigilDataUrl(beast), kind: 'sigil' };
  const idStr = String(beast.id);

  // 1. Local art file
  const local = manifest[idStr];
  if (local) {
    return { src: normalizeLocalArtPath(local, idStr), kind: 'local' };
  }

  // 2. Cached onchain image
  if (onchainCache.has(idStr)) {
    return { src: onchainCache.get(idStr), kind: 'onchain' };
  }

  // 3. Fallback shared sigil
  return { src: sigilDataUrl(beast), kind: 'sigil' };
}

/**
 * Full resolver: local file -> onchain image (2s timeout, cached) -> shared sigil fallback.
 */
export async function resolveBeastArt(beast, rpcUrl) {
  if (!beast) return { src: sigilDataUrl(beast), kind: 'sigil' };
  const idStr = String(beast.id);

  // 1. Local file
  const local = manifest[idStr];
  if (local) {
    return { src: normalizeLocalArtPath(local, idStr), kind: 'local' };
  }

  // 2. Onchain image with 2s timeout
  try {
    const onchain = await withTimeout(fetchOnchainImage(beast, rpcUrl), 2000).catch(() => null);
    if (onchain) return { src: onchain, kind: 'onchain' };
  } catch {}

  // 3. Shared sigil fallback
  return { src: sigilDataUrl(beast), kind: 'sigil' };
}
