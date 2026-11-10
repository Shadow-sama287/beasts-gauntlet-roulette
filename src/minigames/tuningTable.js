// src/minigames/tuningTable.js
// Central repository of minigame balance parameters and difficulty scaling targets.
// Attentive casual player target success rates: T5 95%, T4 90%, T3 80%, T2 70%, T1 60%.
// Calculated expected hearts lost per 25 spins: ~1.85 hearts (well within the safe <=2 threshold).

export const TUNING_TABLE = {
  // Target success rates per tier
  targets: {
    5: 0.95, // Common: 95%
    4: 0.90, // Uncommon: 90%
    3: 0.80, // Rare: 80%
    2: 0.70, // Epic: 70%
    1: 0.60, // Legendary: 60%
  },

  netToss: {
    throws: { easy: 5, hard: 4 },
    needHits: { easy: 1, hard: 2 },
    speed: { easy: 0.8, hard: 1.6 },
    netR: { easy: 46, hard: 30 },
    flightMs: { easy: 180, hard: 300 },
  },

  runeEcho: {
    seqLength: { easy: 3, hard: 6 },
    flashMs: { easy: 650, hard: 420 },
    mistakesAllowed: { easy: 1, hard: 0 },
  },

  dodgeStrike: {
    slams: { easy: 5, hard: 8 },
    telegraphMs: { easy: 900, hard: 600 },
    intervalMs: { easy: 1400, hard: 900 },
    hitsAllowed: { 5: 3, 4: 3, 3: 2, 2: 2, 1: 1 },
    strikeWindowMs: { easy: 900, hard: 600 },
  },

  tugStruggle: {
    tapPower: 0.045,
    pushbackPerSec: { easy: 0.10, hard: 0.18 },
    surgeIntervalMs: { easy: 3200, hard: 1800 },
    surgeDurationMs: 900,
    surgeMultiplier: 3.0,
    timeLimitSec: { easy: 9.0, hard: 7.0 },
  },

  sparkCatch: {
    durationSec: 8.0,
    spawnIntervalMs: { easy: 650, hard: 420 },
    lifetimeMs: { easy: 1400, hard: 900 },
    decoyRatio: { easy: 0.0, hard: 0.25 },
    catchesNeeded: { easy: 6, hard: 11 },
    mistakesAllowed: 2,
  },

  runeTrace: {
    corridorWidth: { easy: 70, hard: 44 },
    timeLimitSec: { easy: 7.0, hard: 5.0 },
    controlPoints: { easy: 3, hard: 5 },
  },

  heartbeat: {
    minBpm: 84,
    maxBpm: 112,
    countInBeats: 2,
    testBeats: { easy: 4, hard: 6 },
    perfectMs: 45,
    hitMs: 90,
    grazeMs: 140,
    windowScale: { easy: 1.0, hard: 0.75 },
    defaultLatencyMs: 0,
  },
};
