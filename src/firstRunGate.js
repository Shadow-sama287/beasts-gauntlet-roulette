// src/firstRunGate.js — First-run progression gate
// A new player cannot tame a first beast or enter the dungeon until they have spun the roulette.

/**
 * Checks if the Gauntlet dungeon is locked.
 * A new player has 0 caught beasts and no companion, so the Gauntlet is locked until first capture.
 * @param {object} albumData
 * @returns {boolean}
 */
export function isGauntletLocked(albumData) {
  if (!albumData) return true;
  const caught = Array.isArray(albumData.caughtIds) ? albumData.caughtIds : [];
  return caught.length === 0;
}

/**
 * Checks if the Dojo training arena is locked.
 * Dojo requires an active companion beast to train with.
 * @param {object} albumData
 * @returns {boolean}
 */
export function isDojoLocked(albumData) {
  return isGauntletLocked(albumData);
}

/**
 * Checks if this is the user's first-ever spin (tutorial run).
 * @param {object} albumData
 * @returns {boolean}
 */
export function isFirstSpin(albumData) {
  return isGauntletLocked(albumData);
}

/**
 * Derives a guaranteed T4 (Uncommon) or T5 (Common) starter beast for the first spin.
 * Ensures the first spin provides a friendly, accessible companion.
 * @param {Array} beasts
 * @param {function} rng
 * @returns {object}
 */
export function getFirstSpinBeast(beasts = [], rng = Math.random) {
  if (!beasts || beasts.length === 0) {
    return { id: '71', name: 'Golem', rarity: 5, tier: 5, type: 'Brute' };
  }
  // Filter for T4 and T5
  const starters = beasts.filter((b) => (b.rarity || b.tier) >= 4);
  const pool = starters.length > 0 ? starters : beasts;
  const randVal = typeof rng === 'function' ? rng() : Math.random();
  const idx = Math.floor(randVal * pool.length);
  return pool[idx] || pool[0];
}

/**
 * Unlocks the first captured companion:
 * Auto-sets as active companion, adds to caught collection.
 * @param {object} albumData
 * @param {object} beast
 * @returns {object} updated albumData
 */
export function unlockFirstCompanion(albumData, beast) {
  const data = albumData || {
    caughtIds: [],
    caughtAt: {},
    capturedNamed: [],
    activeCompanionId: null,
    companionStrikeBonus: 0,
    discoveredIds: [],
    friendliness: {},
  };
  const beastId = String(beast.id);
  if (!data.caughtIds) data.caughtIds = [];
  if (!data.caughtIds.includes(beastId)) {
    data.caughtIds.push(beastId);
  }
  if (!data.caughtAt) data.caughtAt = {};
  data.caughtAt[beastId] = Date.now();
  data.activeCompanionId = beastId;

  if (!data.friendliness) data.friendliness = {};
  if (data.friendliness[beastId] === undefined) {
    data.friendliness[beastId] = Math.floor(Math.random() * 20) + 1;
  }
  if (!data.discoveredIds) data.discoveredIds = [];
  if (!data.discoveredIds.includes(beastId)) {
    data.discoveredIds.push(beastId);
  }
  return data;
}

/**
 * Resets the gate back to fresh locked state.
 * @returns {object}
 */
export function createFreshAlbumState() {
  return {
    caughtIds: [],
    caughtAt: {},
    capturedNamed: [],
    activeCompanionId: null,
    companionStrikeBonus: 0,
    discoveredIds: [],
    friendliness: {},
  };
}
