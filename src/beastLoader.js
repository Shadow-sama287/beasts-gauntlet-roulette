// src/beastLoader.js — Load beasts from public/my-beasts.json and baked onchain art
import { generateSigilDataUri } from './roulette.js';
import { resolveBeastArtSync } from './art/beastArt.js';

let manifestCache = null;
const artCache = new Map();

export async function fetchArtWithTimeout(url, timeoutMs = 2000) {
  if (!url) return null;
  if (artCache.has(url)) return artCache.get(url);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      artCache.set(url, url);
      return url;
    }
  } catch {
    // Timeout or network error
  }
  return null;
}

export async function loadManifest() {
  if (manifestCache) return manifestCache;
  try {
    const res = await fetch('/beasts/manifest.json');
    if (res.ok) {
      manifestCache = await res.json();
      return manifestCache;
    }
  } catch {}
  try {
    const res = await fetch('/beasts/art/manifest.json');
    if (res.ok) {
      manifestCache = await res.json();
      return manifestCache;
    }
  } catch {}
  manifestCache = {};
  return manifestCache;
}

export function getCombatTypeForId(id, rarity = 5) {
  const num = Number(id);
  if (num >= 1 && num <= 25) return 'Magical';
  if (num >= 26 && num <= 50) return 'Hunter';
  if (num >= 51 && num <= 75) return 'Brute';
  // Custom beasts distribution
  return rarity % 3 === 0 ? 'Brute' : rarity % 3 === 1 ? 'Magical' : 'Hunter';
}

export function artForBeast(id, manifest = manifestCache || {}) {
  const strId = String(id);
  if (manifest && manifest[strId]) {
    const val = manifest[strId];
    const file = typeof val === 'string' ? val : (val.file || `${strId}.svg`);
    if (file.startsWith('/')) return file;
    if (file.startsWith('beasts/')) return `/${file}`;
    return `/beasts/art/${file}`;
  }
  const num = Number(id);
  if ((num >= 1 && num <= 75) || (num >= 10012 && num <= 10041)) {
    return `/beasts/art/${strId}.svg`;
  }
  return null;
}

export const FALLBACK_BEASTS = [
  { id: '1', name: 'Warlock', rarity: 1 },
  { id: '2', name: 'Typhon', rarity: 1 },
  { id: '6', name: 'Gorgon', rarity: 2 },
  { id: '11', name: 'Vampire', rarity: 3 },
  { id: '16', name: 'Banshee', rarity: 4 },
  { id: '26', name: 'Griffin', rarity: 1 },
  { id: '31', name: 'Manticore', rarity: 2 },
  { id: '36', name: 'Harpy', rarity: 3 },
  { id: '51', name: 'Dragon', rarity: 1 },
  { id: '56', name: 'Behemoth', rarity: 2 },
  { id: '61', name: 'Juggernaut', rarity: 3 },
  { id: '71', name: 'Golem', rarity: 5 },
].map((b) => ({
  id: String(b.id),
  name: b.name,
  rarity: b.rarity,
  tier: b.rarity,
  type: getCombatTypeForId(b.id, b.rarity),
  isOnchain: true,
  art: `/beasts/art/${b.id}.svg`,
}));

export async function loadBeasts() {
  const manifest = await loadManifest();

  try {
    const res = await fetch('/my-beasts.json');
    if (!res.ok) {
      return enrichBeastList(FALLBACK_BEASTS, manifest);
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.beasts) || data.beasts.length === 0) {
      return enrichBeastList(FALLBACK_BEASTS, manifest);
    }

    return enrichBeastList(data.beasts, manifest);
  } catch (err) {
    return enrichBeastList(FALLBACK_BEASTS, manifest);
  }
}

function enrichBeastList(rawBeasts, manifest) {
  return rawBeasts.map((b, idx) => {
    const id = String(b.id || idx + 1);
    const rarity = Number(b.rarity) >= 1 && Number(b.rarity) <= 5 ? Number(b.rarity) : 5;
    const type = b.type || getCombatTypeForId(id, rarity);
    const tokenId = b.tokenId || (manifest && manifest[id] ? (typeof manifest[id] === 'object' ? manifest[id].tokenId : null) : null);

    const artResolution = resolveBeastArtSync({ id, name: b.name, rarity, tokenId });
    const isOnchain = artResolution.kind === 'local' || artResolution.kind === 'onchain' || Boolean(manifest && manifest[id]) || (Number(id) >= 1 && Number(id) <= 75);

    let art = b.art;
    if (artResolution.kind === 'local' || artResolution.kind === 'onchain') {
      art = artResolution.src;
    } else if (Number(id) >= 1 && Number(id) <= 75) {
      art = `/beasts/art/${id}.svg`;
    } else if (!art) {
      art = artResolution.src || generateSigilDataUri(id, b.name, rarity);
    }

    return {
      id,
      name: String(b.name || `Beast #${idx + 1}`),
      rarity,
      tier: rarity,
      type,
      art,
      isOnchain,
      tokenId,
      artKind: artResolution.kind,
      isArtathon: Boolean(b.isArtathon || Number(id) >= 10000),
      catalog: b.catalog || (Number(id) >= 10000 ? 'Community' : 'Genesis'),
    };
  });
}

/**
 * Safe fallback image error handler. Never loops or makes network requests.
 */
export function handleArtError(img, beast) {
  if (!img) return;
  const id = beast?.id ? String(beast.id) : null;
  const num = Number(id);
  // If failed loading onchain SVG from primary path, try fallback path
  if (img.src && !img.src.includes('fallback') && ((num >= 1 && num <= 75) || (num >= 10012 && num <= 10041))) {
    img.src = `/beasts/fallback/${id}.svg`;
    return;
  }
  img.onerror = null; // Prevent loop
  img.src = generateSigilDataUri(beast?.id || '0', beast?.name || 'Beast', beast?.rarity || beast?.tier || 5);
}
