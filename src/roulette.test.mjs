import test from 'node:test';
import assert from 'node:assert';
import {
  buildWheel,
  spin,
  tameZoneWidth,
  resolveTame,
  createRouletteState,
  catchBeast,
  missBeast,
  getMinigameForTier,
  resolveFocusRing,
  resolveConvergence,
  RARITY_WEIGHTS,
  TAME_ZONE_WIDTHS,
  buildReelStrip,
  reelTargetX,
  claimCreditTrackBeast,
  GACHA_CONFIG,
} from './roulette.js';

test('dynamic minigames: tier mapping, focus ring, and convergence resolvers', () => {
  assert.strictEqual(getMinigameForTier(1), 'convergence');
  assert.strictEqual(getMinigameForTier(2), 'duallock');
  assert.strictEqual(getMinigameForTier(3), 'movingbar');
  assert.strictEqual(getMinigameForTier(4), 'focusring');
  assert.strictEqual(getMinigameForTier(5), 'timingbar');

  // Focus ring tests
  assert.strictEqual(resolveFocusRing(50, 50, 10, false), true, 'Exact alignment should hit');
  assert.strictEqual(resolveFocusRing(58, 50, 10, false), true, 'Within tolerance should hit');
  assert.strictEqual(resolveFocusRing(65, 50, 10, false), false, 'Outside normal tolerance should miss');
  assert.strictEqual(resolveFocusRing(65, 50, 10, true), true, 'Lucky expansion (16px) should turn 15px diff into hit');

  // Convergence tests
  assert.strictEqual(resolveConvergence(0.48, 0.52, 0.45, 0.55, false), true, 'Both needles inside nexus is hit');
  assert.strictEqual(resolveConvergence(0.43, 0.52, 0.45, 0.55, false), false, 'Left needle outside normal nexus is miss');
  assert.strictEqual(resolveConvergence(0.43, 0.52, 0.45, 0.55, true), true, 'Lucky nexus expansion enables hit');
});

test('weights: buildWheel assigns correct weights and angles', () => {
  const beasts = [
    { id: '1', name: 'Legendary Beast', rarity: 1 },
    { id: '2', name: 'Epic Beast', rarity: 2 },
    { id: '3', name: 'Rare Beast', rarity: 3 },
    { id: '4', name: 'Uncommon Beast', rarity: 4 },
    { id: '5', name: 'Common Beast', rarity: 5 },
  ];

  const slices = buildWheel(beasts, new Set(['2']));
  assert.strictEqual(slices.length, 5);

  // Weights must match {1:1, 2:2, 3:4, 4:8, 5:15} (higher tiers rarer)
  assert.strictEqual(slices[0].weight, 1);
  assert.strictEqual(slices[1].weight, 2);
  assert.strictEqual(slices[2].weight, 4);
  assert.strictEqual(slices[3].weight, 8);
  assert.strictEqual(slices[4].weight, 15);

  const totalWeight = 1 + 2 + 4 + 8 + 15; // 30
  assert.strictEqual(slices[0].fraction, 1 / 30);
  assert.strictEqual(slices[4].fraction, 15 / 30);

  // Angles must cover 0 to 360 continuously
  assert.strictEqual(slices[0].startAngle, 0);
  assert.ok(Math.abs(slices[4].endAngle - 360) < 1e-6);

  // Check owned flag
  assert.strictEqual(slices[0].isOwned, false);
  assert.strictEqual(slices[1].isOwned, true);
});

test('pity: guarantees rarity <= 3 per GACHA_CONFIG.pity at 15 spins without one', () => {
  const beasts = [
    { id: '1', name: 'Legendary', rarity: 1 },
    { id: '2', name: 'Epic', rarity: 2 },
    { id: '3', name: 'Rare A', rarity: 3 },
    { id: '4', name: 'Common B', rarity: 5 },
  ];

  // Set spinsSinceTier3OrBetter to 14 (meaning 14 previous spins did not hit rarity <= 3)
  const state = createRouletteState({
    beasts,
    seed: 12345,
    spinsSinceTier3OrBetter: 14,
  });

  const res = spin(state);
  assert.ok(res !== null);
  assert.strictEqual(res.pityTriggered, true, 'Pity must trigger on 15th spin without rare');
  assert.ok(res.beast.rarity <= 3, `Expected rarity <= 3 on pity, got ${res.beast.rarity}`);
  assert.strictEqual(state.spinsSinceTier3OrBetter, 0, 'Pity counter must reset after rarity <= 3');

  // Test that non-rare spins increment pity counter
  const commonOnlyState = createRouletteState({
    beasts: [{ id: '9', name: 'Common C', rarity: 5 }],
    seed: 42,
    spinsSinceTier3OrBetter: 0,
  });
  spin(commonOnlyState);
  assert.strictEqual(commonOnlyState.spinsSinceTier3OrBetter, 1);
});

test('zone: tameZoneWidth and resolveTame validation', () => {
  // Check expected widths
  assert.strictEqual(tameZoneWidth(1), 0.08);
  assert.strictEqual(tameZoneWidth(2), 0.12);
  assert.strictEqual(tameZoneWidth(3), 0.18);
  assert.strictEqual(tameZoneWidth(4), 0.26);
  assert.strictEqual(tameZoneWidth(5), 0.36);

  // Zone hit / miss
  const zone = { start: 0.4, end: 0.6 };
  assert.strictEqual(resolveTame(0.5, zone, false), true, 'Center should hit');
  assert.strictEqual(resolveTame(0.4, zone, false), true, 'Boundary should hit');
  assert.strictEqual(resolveTame(0.6, zone, false), true, 'Boundary should hit');
  assert.strictEqual(resolveTame(0.39, zone, false), false, 'Outside boundary should miss');
  assert.strictEqual(resolveTame(0.61, zone, false), false, 'Outside boundary should miss');

  // Lucky Active (x1.6 width):
  // Center is 0.5, original width is 0.2. Lucky width is 0.32 -> range [0.34, 0.66]
  assert.strictEqual(resolveTame(0.35, zone, false), false, 'Without lucky, 0.35 is a miss');
  assert.strictEqual(resolveTame(0.35, zone, true), true, 'With lucky, 0.35 is a hit');
});

test('duplicates: duplicate catches give essence = 6 - rarity and 10 essence activates lucky spin', () => {
  const beast = { id: 'rarity-2-beast', name: 'Epic Gryphon', rarity: 2 };
  const state = createRouletteState({
    beasts: [beast],
    hearts: 3,
    essence: 0,
    owned: new Set(),
  });

  // First catch: new beast
  const catch1 = catchBeast(state, beast);
  assert.strictEqual(catch1.isDuplicate, false);
  assert.strictEqual(catch1.essenceGained, 0);
  assert.strictEqual(state.owned.has(beast.id), true);
  assert.strictEqual(state.essence, 0);

  // Second catch: duplicate! Essence = 6 - rarity = 6 - 2 = 4
  const catch2 = catchBeast(state, beast);
  assert.strictEqual(catch2.isDuplicate, true);
  assert.strictEqual(catch2.essenceGained, 4);
  assert.strictEqual(state.essence, 4);

  // Third catch: duplicate! Essence = 4 + 4 = 8
  const catch3 = catchBeast(state, beast);
  assert.strictEqual(catch3.essenceGained, 4);
  assert.strictEqual(state.essence, 8);
  assert.strictEqual(state.luckyActive, false);

  // Fourth catch: duplicate! Essence = 8 + 4 = 12 >= 10 -> luckyActive is true
  const catch4 = catchBeast(state, beast);
  assert.strictEqual(state.essence, 12);
  assert.strictEqual(state.luckyActive, true);
});

test('state: hearts loss on miss and game over conditions', () => {
  const state = createRouletteState({ hearts: 3, spinsMax: 2 });
  assert.strictEqual(state.hearts, 3);
  assert.strictEqual(state.gameOver, false);

  missBeast(state);
  assert.strictEqual(state.hearts, 2);

  missBeast(state);
  assert.strictEqual(state.hearts, 1);

  missBeast(state);
  assert.strictEqual(state.hearts, 0);
  assert.strictEqual(state.gameOver, true, 'Zero hearts triggers game over');
});

test('duplicates: essence field is a finite number for all five tiers', () => {
  for (let tier = 1; tier <= 5; tier++) {
    const beast = { id: `test-tier-${tier}`, name: `Beast Tier ${tier}`, rarity: tier };
    const state = createRouletteState({
      beasts: [beast],
      owned: new Set([beast.id]), // Already owned so it's a duplicate
    });

    const res = catchBeast(state, beast);
    assert.strictEqual(res.isDuplicate, true);
    assert.strictEqual(Number.isFinite(res.essenceGained), true, `Tier ${tier} essenceGained must be finite`);
    assert.strictEqual(Number.isFinite(res.essenceEarned), true, `Tier ${tier} essenceEarned must be finite`);
    assert.strictEqual(res.essenceGained, 6 - tier, `Tier ${tier} duplicate should give 6 - ${tier} = ${6 - tier}`);
    assert.strictEqual(res.essenceEarned, res.essenceGained, 'essenceEarned must equal essenceGained');
  }
});

test('reel: buildReelStrip places winner at winnerIndex and reelTargetX lands within card bounds', () => {
  const winner = { id: '42', name: 'Winner Beast', rarity: 1 };
  const pool = [
    { id: '1', name: 'Pool 1', rarity: 5 },
    { id: '2', name: 'Pool 2', rarity: 4 },
  ];

  const strip = buildReelStrip(winner, pool, Math.random, 64, 52);
  assert.strictEqual(strip.length, 64);
  assert.strictEqual(strip[52].id, '42');

  // Verify targetX math over multiple RNG iterations
  const cardW = 120;
  const gap = 12;
  const viewportW = 480;
  for (let i = 0; i < 50; i++) {
    const targetX = reelTargetX(52, cardW, gap, viewportW, Math.random);
    const step = cardW + gap;
    const cardCenter = 52 * step + cardW / 2;
    const diff = Math.abs(cardCenter - (targetX + viewportW / 2));
    assert.strictEqual(diff <= cardW * 0.35 + 1e-4, true, 'Jitter should stay safely within card bounds');
  }
});

test('gacha system: pity per GACHA_SYSTEM_SPEC.md guarantees Rare+ in 15 and Legendary in 45', () => {
  const beasts = [
    { id: '1', name: 'Legendary Beast', rarity: 1 },
    { id: '2', name: 'Mythic Beast', rarity: 2 },
    { id: '3', name: 'Rare Beast', rarity: 3 },
    { id: '4', name: 'Uncommon Beast', rarity: 4 },
    { id: '5', name: 'Common A', rarity: 5 },
    { id: '6', name: 'Common B', rarity: 5 },
  ];

  // 1. Initial starter free spins = 30
  const initialState = createRouletteState({ beasts });
  assert.strictEqual(initialState.spinsMax, 30, 'New players must receive 30 free spins');

  // 2. Rare or better pity (at 14 previous non-rare spins, 15th guarantees Tier <= 3)
  const t3PityState = createRouletteState({
    beasts,
    seed: 555,
    spinsSinceTier3OrBetter: 14,
  });
  const resT3 = spin(t3PityState);
  assert.strictEqual(resT3.pityTriggered, true, 'Rare+ pity must trigger on 15th spin without rare');
  assert.ok(resT3.beast.rarity <= 3, `Expected rarity <= 3, got ${resT3.beast.rarity}`);
  assert.strictEqual(t3PityState.spinsSinceTier3OrBetter, 0, 'Counter must reset after hitting Rare+');

  // 3. Legendary pity (at 44 previous non-legendary spins, 45th guarantees Tier 1)
  const t1PityState = createRouletteState({
    beasts,
    seed: 333,
    spinsSinceTier1: 44,
  });
  const resT1 = spin(t1PityState);
  assert.strictEqual(resT1.pityTriggered, true, 'Legendary pity must trigger on 45th spin');
  assert.strictEqual(resT1.beast.rarity, 1, 'Expected Tier 1 Legendary on pity');
  assert.strictEqual(t1PityState.spinsSinceTier1, 0, 'Legendary counter must reset');
});

test('gacha duplicates & credit track: converts duplicates to credits and unlocks track beasts', () => {
  const beastCommon = { id: 'common-1', name: 'Common Slug', rarity: 5 };
  const beastUncommon = { id: 'uncommon-1', name: 'Forest Spriggan', rarity: 4 };
  const allBeasts = [beastCommon, beastUncommon];

  const state = createRouletteState({
    beasts: allBeasts,
    owned: new Set([beastCommon.id]), // Already owned
    credits: 0,
  });

  // 1. Duplicate catch converts to credits (T5 gives 5 credits)
  const catchRes = catchBeast(state, beastCommon);
  assert.strictEqual(catchRes.isDuplicate, true);
  assert.strictEqual(catchRes.creditsGained, 5);
  assert.strictEqual(state.credits, 5);

  // 2. Add enough credits to claim first Starr Track beast (T5 costs 40 credits)
  state.credits = 50;
  const claimRes = claimCreditTrackBeast(state, allBeasts);
  assert.strictEqual(claimRes.success, true);
  assert.strictEqual(claimRes.tier, 5);
  assert.strictEqual(state.credits, 10); // 50 - 40 = 10
  assert.strictEqual(state.creditTrackIndex, 1);
});



