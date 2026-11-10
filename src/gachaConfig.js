// src/gachaConfig.js — Gacha System Configuration per GACHA_SYSTEM_SPEC.md
export const GACHA_CONFIG = {
  spins: {
    startingSpins: 30,
    dailyFreeSpins: 3,
    winSpinThresholds: [1, 4, 8],
  },
  tiers: {
    5: { name: 'Common', weight: 50, creditCost: 40, dupeShards: 5, color: '#f2f2f2' },
    4: { name: 'Uncommon', weight: 28, creditCost: 90, dupeShards: 15, color: '#3ecf6e' },
    3: { name: 'Rare', weight: 15, creditCost: 190, dupeShards: 40, color: '#3d8bff' },
    2: { name: 'Mythic', weight: 5, creditCost: 380, dupeShards: 120, color: '#a45cff' },
    1: { name: 'Legendary', weight: 2, creditCost: 760, dupeShards: 400, color: '#ff8a1f' },
  },
  pity: {
    tier3OrBetterGuaranteedAt: 15, // Force tier <= 3 on 15th spin without one
    tier1GuaranteedAt: 45,         // Force tier 1 on 45th spin without one
  },
  // Deterministic spine (Credit Track / Starr Road progression)
  creditTrack: [5, 5, 4, 5, 4, 3, 4, 3, 2, 3, 2, 1],
  choice: {
    chance: 0.5,
    optionCountWeights: { 2: 0.5714, 3: 0.2857, 4: 0.1429 },
  },
  essence: {
    countWeights: { 1: 30, 2: 30, 3: 20, 4: 12, 5: 8 },
    maxPerOpening: 10,
  },
};

// Validation on load (Fairness & Safety Rule 7.6)
export function validateGachaConfig(cfg = GACHA_CONFIG) {
  if (!cfg.tiers || !cfg.spins || !cfg.pity) {
    throw new Error('Invalid Gacha Config: missing required sections');
  }
  for (let t = 1; t <= 5; t++) {
    const tier = cfg.tiers[t];
    if (!tier || typeof tier.weight !== 'number' || tier.weight <= 0) {
      throw new Error(`Invalid Gacha Config: Tier ${t} must exist and have weight > 0`);
    }
  }
  return true;
}

validateGachaConfig();
