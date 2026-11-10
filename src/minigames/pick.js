// src/minigames/pick.js

/**
 * Weighted random game picker respecting tier, beast type, and encounter history.
 * Rules:
 * - Never repeats the same game twice in a row.
 * - Cools down games seen in the last 3 encounters (w *= 0.4).
 * - Matches beast tier.
 * @param {import('./types.js').MiniGame[]} registry
 * @param {{ tier?: number, rarity?: number, type?: string }} beast
 * @param {() => number} rng
 * @param {string[]} history
 * @returns {import('./types.js').MiniGame}
 */
export function pickGame(registry, beast, rng = Math.random, history = []) {
  const tier = Number(beast?.tier ?? beast?.rarity ?? 5);
  const type = beast?.type || 'Magical';
  const last = history[history.length - 1];

  const pool = registry
    .filter((g) => g.tiers.includes(tier))
    .map((g) => {
      let w = (g.weights && g.weights[type]) ?? 1;
      if (g.id === last) {
        w = 0; // never the same game twice in a row
      } else if (history.slice(-3).includes(g.id)) {
        w *= 0.4; // cool down recently seen games
      }
      return { g, w };
    })
    .filter((x) => x.w > 0);

  if (!pool.length) {
    return registry.find((g) => g.tiers.includes(tier)) || registry[0];
  }

  const totalWeight = pool.reduce((s, x) => s + x.w, 0);
  let r = rng() * totalWeight;
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) return x.g;
  }
  return pool[pool.length - 1].g;
}
