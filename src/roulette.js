// src/roulette.js — Pure game logic for Beast Roulette. No DOM, seeded RNG.
import { mulberry32 } from './engine.js';
import { GACHA_CONFIG } from './gachaConfig.js';

export { mulberry32, GACHA_CONFIG };

export const MINIGAME_TYPES = {
  1: 'convergence', // T1 Legendary: Harmonic Convergence (dual converging needles)
  2: 'duallock',    // T2 Epic: Dual Lock (two-stage rapid strike)
  3: 'movingbar',   // T3 Rare: Drifting Sanctuary (moving target zone)
  4: 'focusring',   // T4 Uncommon: Focus Ring (radial contracting pulse ring)
  5: 'timingbar',   // T5 Common: Steady Sweep (classic timing bar)
};

export const MINIGAME_INFO = {
  convergence: {
    name: 'Harmonic Convergence',
    instruction: 'Stop the twin energy needles as they converge inside the central Nexus!',
    actionText: 'CONVERGE (Space)',
  },
  duallock: {
    name: 'Dual Ward Lock',
    instruction: 'Break through the epic beast’s twin wards! Strike 2 consecutive locks.',
    actionText: 'LOCK WARD (Space)',
  },
  movingbar: {
    name: 'Drifting Sanctuary',
    instruction: 'The target zone is drifting! Time your strike as the needle enters the moving zone.',
    actionText: 'TAME (Space)',
  },
  focusring: {
    name: 'Focus Ring',
    instruction: 'Time your pulse! Strike when the contracting ring aligns with the target circle.',
    actionText: 'PULSE (Space)',
  },
  timingbar: {
    name: 'Steady Sweep',
    instruction: 'Time your strike when the sweeping needle is inside the target zone.',
    actionText: 'TAME (Space)',
  },
};

export function getMinigameForTier(rarity) {
  return MINIGAME_TYPES[rarity] || 'timingbar';
}

/**
 * Resolves Focus Ring timing.
 * @param {number} currentRadius - Current radius of contracting ring (e.g. 10 to 100)
 * @param {number} targetRadius - Radius of static target ring
 * @param {number} tolerance - Allowed margin
 * @param {boolean} luckyActive - Expands tolerance by 1.6x
 */
export function resolveFocusRing(currentRadius, targetRadius, tolerance = 12, luckyActive = false) {
  const allowed = luckyActive ? tolerance * 1.6 : tolerance;
  return Math.abs(currentRadius - targetRadius) <= allowed;
}

/**
 * Resolves Convergence timing.
 * Checks whether both converging needles have entered the central nexus.
 */
export function resolveConvergence(leftPos, rightPos, nexusStart, nexusEnd, luckyActive = false) {
  const nexusCenter = (nexusStart + nexusEnd) / 2;
  const nexusWidth = (nexusEnd - nexusStart) * (luckyActive ? 1.6 : 1.0);
  const start = nexusCenter - nexusWidth / 2;
  const end = nexusCenter + nexusWidth / 2;

  const leftIn = leftPos >= start - 1e-4 && leftPos <= end + 1e-4;
  const rightIn = rightPos >= start - 1e-4 && rightPos <= end + 1e-4;
  return leftIn && rightIn;
}

export const RARITY_WEIGHTS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 15 };
export const TAME_ZONE_WIDTHS = { 1: 0.08, 2: 0.12, 3: 0.18, 4: 0.26, 5: 0.36 };
export const TIER_NAMES = { 1: 'Legendary', 2: 'Epic', 3: 'Rare', 4: 'Uncommon', 5: 'Common' };
export const TIER_COLORS = { 1: '#ff8a1f', 2: '#a45cff', 3: '#3d8bff', 4: '#3ecf6e', 5: '#f2f2f2' };

/**
 * Builds wheel slices with weights and angles.
 * Slices are ordered to preserve input order; angles span 0 to 360 deg.
 */
export function buildWheel(beasts = [], owned = new Set()) {
  if (!beasts || beasts.length === 0) return [];
  const ownedSet = owned instanceof Set ? owned : new Set(Array.isArray(owned) ? owned : []);

  const totalWeight = beasts.reduce((sum, b) => sum + (RARITY_WEIGHTS[b.rarity] || 1), 0);
  let currentAngle = 0;

  return beasts.map((beast, index) => {
    const weight = RARITY_WEIGHTS[beast.rarity] || 1;
    const fraction = weight / totalWeight;
    const spanAngle = fraction * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + spanAngle;
    currentAngle = endAngle;

    return {
      index,
      beast,
      rarity: beast.rarity,
      weight,
      fraction,
      startAngle,
      endAngle,
      startAngleRad: (startAngle * Math.PI) / 180,
      endAngleRad: (endAngle * Math.PI) / 180,
      midAngle: (startAngle + endAngle) / 2,
      isOwned: ownedSet.has(beast.id),
    };
  });
}

/**
 * Returns tame zone width as fraction of the bar (0.0 to 1.0).
 */
export function tameZoneWidth(rarity) {
  return TAME_ZONE_WIDTHS[rarity] ?? 0.26;
}

/**
 * Resolves a tame attempt.
 * @param {number} markerPos - Marker position on the bar (0.0 to 1.0)
 * @param {{start: number, end?: number, width?: number}} zone - Zone boundaries
 * @param {boolean} luckyActive - If true, zone is 1.6x wider
 * @returns {boolean} True if hit, false if miss
 */
export function resolveTame(markerPos, zone, luckyActive = false) {
  if (typeof markerPos !== 'number' || Number.isNaN(markerPos)) return false;
  if (!zone) return false;

  let start = 0;
  let end = 0;

  if (typeof zone.start === 'number' && typeof zone.end === 'number') {
    const origWidth = zone.end - zone.start;
    const center = (zone.start + zone.end) / 2;
    const width = luckyActive ? origWidth * 1.6 : origWidth;
    start = center - width / 2;
    end = center + width / 2;
  } else if (typeof zone.start === 'number' && typeof zone.width === 'number') {
    const origWidth = zone.width;
    const center = zone.start + origWidth / 2;
    const width = luckyActive ? origWidth * 1.6 : origWidth;
    start = center - width / 2;
    end = center + width / 2;
  } else if (typeof zone.center === 'number' && typeof zone.width === 'number') {
    const width = luckyActive ? zone.width * 1.6 : zone.width;
    start = zone.center - width / 2;
    end = zone.center + width / 2;
  } else {
    return false;
  }

  // Small epsilon for floating point edges
  return markerPos >= start - 1e-6 && markerPos <= end + 1e-6;
}

/**
 * Generates a random tame zone for a beast rarity.
 */
export function createTameZone(rarity, rng = Math.random, luckyActive = false) {
  const baseWidth = tameZoneWidth(rarity);
  const width = luckyActive ? Math.min(1.0, baseWidth * 1.6) : baseWidth;
  const maxStart = Math.max(0, 1.0 - width);
  const randVal = typeof rng === 'function' ? rng() : Math.random();
  // Keep zone somewhat centered, not hard up against the edges
  const minPad = 0.05;
  const availableSpan = Math.max(0, maxStart - minPad * 2);
  const start = minPad + randVal * availableSpan;

  return {
    start,
    end: start + width,
    width,
    baseWidth,
    luckyActive,
  };
}

/**
 * Initializes state:
 * hearts: 3, essence: 0, credits: 0, creditTrackIndex: 0, pityCounter: 0, owned: Set, spinsUsed: 0, spinsMax: 30.
 * Conforms to GACHA_SYSTEM_SPEC.md.
 */
export function createRouletteState(options = {}) {
  const {
    beasts = [],
    seed = 42,
    hearts = 3,
    essence = 0,
    credits = 0,
    creditTrackIndex = 0,
    pityCounter = 0,
    pityT4Counter = 0,
    pityT3Counter = 0,
    pityT2Counter = 0,
    pityT1Counter = 0,
    spinsSinceTier3OrBetter = 0,
    spinsSinceTier1 = 0,
    owned = new Set(),
    spinsUsed = 0,
    spinsMax = 30, // 30 free spins for new players
  } = options;

  const rng = typeof seed === 'function' ? seed : mulberry32(typeof seed === 'number' ? seed : 42);

  return {
    beasts,
    hearts,
    essence,
    credits,
    creditTrackIndex,
    pityCounter, // legacy consecutive spins without rarity <= 2
    pityT4Counter,
    pityT3Counter,
    pityT2Counter,
    pityT1Counter,
    spinsSinceTier3OrBetter,
    spinsSinceTier1,
    owned: owned instanceof Set ? new Set(owned) : new Set(Array.isArray(owned) ? owned : []),
    spinsUsed,
    spinsMax,
    luckyActive: essence >= 10,
    rng,
    seed: typeof seed === 'number' ? seed : 42,
    gameOver: false,
    currentRotation: 0,
    history: [],
  };
}

export function getPityStatus(state) {
  if (!state) {
    return {
      tier3In: 15,
      tier1In: 45,
      spinsRemaining: 30,
      credits: 0,
      targetTier: 5,
      targetTierName: 'Common',
      targetCost: 40,
      creditProgressPct: 0,
      canClaim: false,
    };
  }

  const spinsSinceT3 = state.spinsSinceTier3OrBetter || 0;
  const spinsSinceT1 = state.spinsSinceTier1 || 0;
  const track = GACHA_CONFIG.creditTrack;
  const trackIdx = state.creditTrackIndex || 0;
  const targetTier = track[trackIdx % track.length];
  const targetCost = GACHA_CONFIG.tiers[targetTier]?.creditCost || 40;
  const currentCredits = state.credits || 0;

  return {
    tier3In: Math.max(1, GACHA_CONFIG.pity.tier3OrBetterGuaranteedAt - spinsSinceT3),
    tier1In: Math.max(1, GACHA_CONFIG.pity.tier1GuaranteedAt - spinsSinceT1),
    spinsRemaining: Math.max(0, (state.spinsMax ?? 30) - (state.spinsUsed ?? 0)),
    credits: currentCredits,
    targetTier,
    targetTierName: GACHA_CONFIG.tiers[targetTier]?.name || 'Common',
    targetCost,
    creditProgressPct: Math.min(100, Math.round((currentCredits / targetCost) * 100)),
    canClaim: currentCredits >= targetCost,
  };
}

/**
 * Claims a beast from the deterministic Credit Track (Starr Road).
 */
export function claimCreditTrackBeast(state, beasts = []) {
  const track = GACHA_CONFIG.creditTrack;
  const trackIdx = state.creditTrackIndex || 0;
  const targetTier = track[trackIdx % track.length];
  const targetCost = GACHA_CONFIG.tiers[targetTier].creditCost;

  if ((state.credits || 0) < targetCost) {
    return { success: false, reason: 'Not enough credits' };
  }

  // Deduct credits & advance track
  state.credits -= targetCost;
  state.creditTrackIndex = trackIdx + 1;

  const candidates = beasts.filter((b) => b.rarity === targetTier);
  const unowned = candidates.filter((b) => !state.owned.has(b.id));
  const pool = unowned.length > 0 ? unowned : candidates;
  const chosen = pool[Math.floor((state.rng ? state.rng() : Math.random()) * pool.length)] || candidates[0];

  state.owned.add(chosen.id);

  const nextTier = track[(trackIdx + 1) % track.length];
  return {
    success: true,
    beast: chosen,
    tier: targetTier,
    tierName: GACHA_CONFIG.tiers[targetTier].name,
    nextTier,
    nextCost: GACHA_CONFIG.tiers[nextTier].creditCost,
  };
}

/**
 * Spins the wheel based on state.
 * Implements GACHA_SYSTEM_SPEC.md:
 * - Pity: Tier <= 3 guaranteed at 15 spins without one (Section 4.3)
 * - Pity: Tier 1 guaranteed at 45 spins without one
 * - Unowned beast preference: unowned beasts have 3x higher weight (Section 4.4)
 * Returns { beast, targetAngle, slice, sliceIndex, pityTriggered, pityType, luckyActive }.
 */
export function spin(state) {
  if (state.spinsUsed >= state.spinsMax) {
    state.gameOver = true;
    return null;
  }

  const allSlices = buildWheel(state.beasts, state.owned);
  if (allSlices.length === 0) return null;

  // Pity check per GACHA_SYSTEM_SPEC.md Section 4.3 (single source of truth: GACHA_CONFIG.pity)
  let targetRarityCap = null;
  let pityType = null;

  if ((state.spinsSinceTier1 || 0) >= GACHA_CONFIG.pity.tier1GuaranteedAt - 1) {
    targetRarityCap = 1;
    pityType = 'T1';
  } else if ((state.spinsSinceTier3OrBetter || 0) >= GACHA_CONFIG.pity.tier3OrBetterGuaranteedAt - 1) {
    targetRarityCap = 3;
    pityType = 'T3';
  }

  let pool = allSlices;
  if (targetRarityCap !== null) {
    const filteredPool = allSlices.filter((s) => s.beast.rarity <= targetRarityCap);
    if (filteredPool.length > 0) {
      pool = filteredPool;
    }
  }

  // Weight selection with unowned beast preference (Section 4.4: 3x weight for unowned)
  const totalPoolWeight = pool.reduce((sum, s) => {
    const prefMult = s.isOwned ? 1 : 3;
    return sum + s.weight * prefMult;
  }, 0);

  const randVal = (state.rng() || 0.0001) * totalPoolWeight;

  let acc = 0;
  let chosenSlice = pool[0];
  for (const s of pool) {
    const prefMult = s.isOwned ? 1 : 3;
    acc += s.weight * prefMult;
    if (randVal <= acc) {
      chosenSlice = s;
      break;
    }
  }

  // Update counters
  const chosenRarity = chosenSlice.beast.rarity;
  state.spinsUsed += 1;

  if (chosenRarity <= 1) {
    state.spinsSinceTier1 = 0;
    state.spinsSinceTier3OrBetter = 0;
    state.pityT1Counter = 0;
    state.pityT2Counter = 0;
    state.pityT3Counter = 0;
    state.pityT4Counter = 0;
    state.pityCounter = 0;
  } else if (chosenRarity <= 2) {
    state.spinsSinceTier1 = (state.spinsSinceTier1 || 0) + 1;
    state.spinsSinceTier3OrBetter = 0;
    state.pityT1Counter = (state.pityT1Counter || 0) + 1;
    state.pityT2Counter = 0;
    state.pityT3Counter = 0;
    state.pityT4Counter = 0;
    state.pityCounter = 0;
  } else if (chosenRarity <= 3) {
    state.spinsSinceTier1 = (state.spinsSinceTier1 || 0) + 1;
    state.spinsSinceTier3OrBetter = 0;
    state.pityT1Counter = (state.pityT1Counter || 0) + 1;
    state.pityT2Counter = (state.pityT2Counter || 0) + 1;
    state.pityT3Counter = 0;
    state.pityT4Counter = 0;
    state.pityCounter = (state.pityCounter || 0) + 1;
  } else if (chosenRarity <= 4) {
    state.spinsSinceTier1 = (state.spinsSinceTier1 || 0) + 1;
    state.spinsSinceTier3OrBetter = (state.spinsSinceTier3OrBetter || 0) + 1;
    state.pityT1Counter = (state.pityT1Counter || 0) + 1;
    state.pityT2Counter = (state.pityT2Counter || 0) + 1;
    state.pityT3Counter = (state.pityT3Counter || 0) + 1;
    state.pityT4Counter = 0;
    state.pityCounter = (state.pityCounter || 0) + 1;
  } else {
    // T5 Common
    state.spinsSinceTier1 = (state.spinsSinceTier1 || 0) + 1;
    state.spinsSinceTier3OrBetter = (state.spinsSinceTier3OrBetter || 0) + 1;
    state.pityT1Counter = (state.pityT1Counter || 0) + 1;
    state.pityT2Counter = (state.pityT2Counter || 0) + 1;
    state.pityT3Counter = (state.pityT3Counter || 0) + 1;
    state.pityT4Counter = (state.pityT4Counter || 0) + 1;
    state.pityCounter = (state.pityCounter || 0) + 1;
  }

  // Check lucky spin status for upcoming tame
  const luckyActive = state.essence >= 10;
  if (luckyActive) {
    state.essence -= 10;
  }

  // Target angle for 12 o'clock alignment
  const midAngle = chosenSlice.midAngle;
  const normalizedTarget = (360 - (midAngle % 360)) % 360;

  const currentRot = state.currentRotation || 0;
  const currentFull = Math.floor(currentRot / 360);
  const targetAngle = (currentFull + 5) * 360 + normalizedTarget;
  state.currentRotation = targetAngle;

  return {
    beast: chosenSlice.beast,
    targetAngle,
    slice: chosenSlice,
    sliceIndex: chosenSlice.index,
    pityTriggered: targetRarityCap !== null,
    pityType,
    luckyActive,
  };
}

/**
 * Resolves a catch. Duplicates convert to Credits + Essence (Section 4.5).
 */
export function catchBeast(state, beast) {
  const isDuplicate = state.owned.has(beast.id);
  let essenceGained = 0;
  let creditsGained = 0;

  if (isDuplicate) {
    essenceGained = Math.max(1, 6 - beast.rarity);
    creditsGained = GACHA_CONFIG.tiers[beast.rarity]?.dupeShards || 10;
    state.essence += essenceGained;
    state.credits = (state.credits || 0) + creditsGained;
  } else {
    state.owned.add(beast.id);
  }

  state.luckyActive = state.essence >= 10;
  const isGameOver = state.spinsUsed >= state.spinsMax;
  state.gameOver = isGameOver;

  return {
    isDuplicate,
    essenceGained,
    essenceEarned: essenceGained, // backwards compatibility
    creditsGained,
    credits: state.credits || 0,
    beast,
    essence: state.essence,
    totalOwned: state.owned.size,
    gameOver: isGameOver,
  };
}

/**
 * Resolves a miss. Grants consolation credits and essence per brief Section 2.4.
 */
export function missBeast(state) {
  state.hearts = Math.max(0, state.hearts - 1);
  const isGameOver = state.hearts <= 0 || state.spinsUsed >= state.spinsMax;
  state.gameOver = isGameOver;

  const creditsGained = 5;
  const essenceGained = 1;
  state.credits = (state.credits || 0) + creditsGained;
  state.essence = Math.min(10, (state.essence || 0) + essenceGained);

  return {
    hearts: state.hearts,
    gameOver: isGameOver,
    creditsGained,
    essenceGained,
  };
}

/**
 * Creates SVG sigil string for fallback or placeholder art.
 * Deterministic color from string id hash.
 */
export function generateSigilSvg(id, name = 'Unknown', rarity = 5) {
  // Hash id to HSL color
  let hash = 0;
  const str = String(id);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const tierColor = TIER_COLORS[rarity] || '#f2f2f2';
  const initials = (name || 'B').slice(0, 2).toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <defs>
      <radialGradient id="bg-${id}" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="hsl(${hue}, 60%, 20%)" />
        <stop offset="100%" stop-color="#0a0a12" />
      </radialGradient>
      <filter id="glow-${id}" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <rect width="200" height="200" rx="16" fill="url(#bg-${id})" stroke="${tierColor}" stroke-width="3" />
    <circle cx="100" cy="90" r="54" fill="none" stroke="hsl(${hue}, 70%, 50%)" stroke-width="2" stroke-dasharray="6,4" opacity="0.6" />
    <polygon points="100,45 138,80 124,135 76,135 62,80" fill="none" stroke="${tierColor}" stroke-width="2.5" filter="url(#glow-${id})" />
    <polygon points="100,55 130,85 118,125 82,125 70,85" fill="hsl(${hue}, 50%, 30%)" opacity="0.4" />
    <circle cx="100" cy="90" r="18" fill="hsl(${hue}, 75%, 60%)" />
    <text x="100" y="96" font-family="ui-monospace, monospace" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">${initials}</text>
    <text x="100" y="172" font-family="ui-serif, Georgia, serif" font-size="12" font-weight="600" fill="${tierColor}" text-anchor="middle" letter-spacing="1">T${rarity} · ${name.slice(0, 14)}</text>
  </svg>`;
}

/**
 * Builds a reel strip of beasts with the winner placed at winnerIndex.
 */
export function buildReelStrip(winner, pool, rng = Math.random, length = 64, winnerIndex = 52) {
  if (!pool || pool.length === 0) return [winner];
  const r = typeof rng === 'function' ? rng : Math.random;
  const strip = Array.from({ length }, () => pool[Math.floor(r() * pool.length)]);
  strip[winnerIndex] = winner;
  return strip;
}

/**
 * Calculates target pixel offset for the horizontal reel landing.
 */
export function reelTargetX(winnerIndex, cardW, gap, viewportW, rng = Math.random) {
  const r = typeof rng === 'function' ? rng : Math.random;
  const step = cardW + gap;
  const jitter = (r() - 0.5) * cardW * 0.7; // land anywhere inside the card, never on its edge
  return winnerIndex * step + cardW / 2 - viewportW / 2 + jitter;
}

export function generateSigilDataUri(id, name, rarity) {
  const svg = generateSigilSvg(id, name, rarity);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

