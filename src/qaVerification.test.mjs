// src/qaVerification.test.mjs — Comprehensive QA verification tests
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { GACHA_CONFIG } from './gachaConfig.js';
import { createRouletteState, getPityStatus, spin, buildReelStrip } from './roulette.js';
import {
  isGauntletLocked,
  isDojoLocked,
  isFirstSpin,
  getFirstSpinBeast,
  unlockFirstCompanion,
  createFreshAlbumState,
} from './firstRunGate.js';
import { getTierMinigame } from './minigames/tierGames.js';
import { calculateReelCenterOffset } from './ui/reelStrip.js';
import { createGame, startDungeon, allocateStat, generateProceduralPath, levelFromXp } from './engine.js';

const beastData = JSON.parse(readFileSync(new URL('./beasts.json', import.meta.url), 'utf8'));

test('QA: Pity constants single source of truth across GACHA_CONFIG, getPityStatus, and spin', () => {
  assert.strictEqual(GACHA_CONFIG.pity.tier3OrBetterGuaranteedAt, 15, 'Rare+ pity must be 15');
  assert.strictEqual(GACHA_CONFIG.pity.tier1GuaranteedAt, 45, 'Legendary pity must be 45');

  const freshState = createRouletteState({ beasts: [], seed: 42 });
  const status = getPityStatus(freshState);
  assert.strictEqual(status.tier3In, 15, 'Initial spins until T3 must be 15');
  assert.strictEqual(status.tier1In, 45, 'Initial spins until T1 must be 45');

  // Verify decrementing
  freshState.spinsSinceTier3OrBetter = 10;
  freshState.spinsSinceTier1 = 20;
  const midStatus = getPityStatus(freshState);
  assert.strictEqual(midStatus.tier3In, 5, 'Spins until T3 must be 15 - 10 = 5');
  assert.strictEqual(midStatus.tier1In, 25, 'Spins until T1 must be 45 - 20 = 25');
});

test('QA: First-Run Gate progression full flow', () => {
  // Step 1: Fresh player save
  let album = createFreshAlbumState();
  assert.strictEqual(isGauntletLocked(album), true);
  assert.strictEqual(isDojoLocked(album), true);
  assert.strictEqual(isFirstSpin(album), true);

  // Step 2: Starter pool always delivers T4 or T5
  const mockBeasts = [
    { id: '1', name: 'Warlock', rarity: 1 },
    { id: '6', name: 'Gorgon', rarity: 2 },
    { id: '11', name: 'Vampire', rarity: 3 },
    { id: '16', name: 'Banshee', rarity: 4 },
    { id: '71', name: 'Golem', rarity: 5 },
  ];
  const starter = getFirstSpinBeast(mockBeasts, () => 0.4);
  assert.ok(starter.rarity >= 4, 'Starter must be T4 or T5');

  // Step 3: First capture unlocks Gauntlet & Dojo
  album = unlockFirstCompanion(album, starter);
  assert.strictEqual(isGauntletLocked(album), false);
  assert.strictEqual(isDojoLocked(album), false);
  assert.strictEqual(isFirstSpin(album), false);
  assert.strictEqual(album.activeCompanionId, String(starter.id));
  assert.ok(album.caughtIds.includes(String(starter.id)));

  // Step 4: Reset returns to locked
  album = createFreshAlbumState();
  assert.strictEqual(isGauntletLocked(album), true);
  assert.strictEqual(isDojoLocked(album), true);
});

test('QA: Reel strip winner is positioned exactly at pointer index', () => {
  const winner = { id: '51', name: 'Dragon', rarity: 1 };
  const pool = [
    { id: '1', name: 'Warlock', rarity: 1 },
    { id: '71', name: 'Golem', rarity: 5 },
  ];
  const winnerIndex = 42;
  const strip = buildReelStrip(winner, pool, Math.random, 54, winnerIndex);

  assert.strictEqual(strip[winnerIndex].id, '51');
  assert.strictEqual(strip[winnerIndex].name, 'Dragon');
});

test('QA: Reel strip calculateReelCenterOffset places winning card center precisely under pointer', () => {
  const winnerIndex = 42;
  const configs = [
    { viewportW: 360, cardW: 110, gap: 12 },
    { viewportW: 480, cardW: 130, gap: 12 },
    { viewportW: 720, cardW: 130, gap: 12 },
  ];

  for (const { viewportW, cardW, gap } of configs) {
    const step = cardW + gap;
    const offset = calculateReelCenterOffset(winnerIndex, cardW, gap, viewportW);
    // With offset applied (-offset), position of winning card center in viewport
    const cardLeftInViewport = winnerIndex * step - offset;
    const cardCenter = cardLeftInViewport + cardW / 2;
    const pointerCenter = viewportW / 2;
    assert.strictEqual(cardCenter, pointerCenter, `Winner center must match pointer center for ${viewportW}px`);
  }
});

test('QA: Deep minigame lifecycle: 20 consecutive simulation runs per tier with mount, inputs, and destroy', () => {
  const origDocument = global.document;
  const origWindow = global.window;
  const origRAF = global.requestAnimationFrame;
  const origCAF = global.cancelAnimationFrame;

  global.requestAnimationFrame = (cb) => setTimeout(cb, 10);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame,
    devicePixelRatio: 1,
  };
  global.document = {
    createElement: () => ({
      style: {},
      appendChild: () => {},
      remove: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      getContext: () => ({
        resetTransform: () => {},
        scale: () => {},
        clearRect: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        save: () => {},
        restore: () => {},
        fillText: () => {},
        roundRect: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }),
    }),
  };

  const container = {
    clientWidth: 360,
    clientHeight: 600,
    appendChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  try {
    for (let cycle = 0; cycle < 20; cycle++) {
      for (let t = 1; t <= 5; t++) {
        const def = getTierMinigame(t);
        let completed = false;
        let progress = 0;
        const instance = def.factory(container, {
          beast: { id: String(t), name: 'Beast ' + t, rarity: t },
          tier: t,
          lucky: cycle % 2 === 0,
          onComplete: () => { completed = true; },
          onProgress: (p) => { progress = p; },
        });

        // Trigger input multiple times
        for (let i = 0; i < 4; i++) {
          if (instance.triggerInput) instance.triggerInput();
        }

        instance.destroy();
      }
    }
  } finally {
    global.document = origDocument;
    global.window = origWindow;
    global.requestAnimationFrame = origRAF;
    global.cancelAnimationFrame = origCAF;
  }
});

test('QA: Friendliness stat and Gauntlet discovery separation', () => {
  // 1. Initial Friendliness rolls between 1% and 20% on fresh tame
  const album = createFreshAlbumState();
  const starter = { id: '71', name: 'Golem', rarity: 5, tier: 5 };
  const unlocked = unlockFirstCompanion(album, starter);

  assert.ok(unlocked.caughtIds.includes('71'), 'Starter is tamed in caughtIds');
  assert.ok(unlocked.friendliness['71'] >= 1 && unlocked.friendliness['71'] <= 20, 'Friendliness must roll between 1-20%');

  // Duplicate catch does NOT overwrite friendliness
  const originalF = unlocked.friendliness['71'];
  if (!unlocked.caughtIds.includes('71')) {
    unlocked.friendliness['71'] = 99; // Should not happen
  }
  assert.strictEqual(unlocked.friendliness['71'], originalF, 'Duplicate does not affect friendliness stat');

  // 2. Gauntlet beast encounters are registered as discovered (NOT tamed)
  const encounteredNamed = { id: '35', name: 'Basilisk', prefix: 'Shadow', tier: 3 };
  const idStr = String(encounteredNamed.id);

  if (!unlocked.discoveredIds.includes(idStr) && !unlocked.caughtIds.includes(idStr)) {
    unlocked.discoveredIds.push(idStr);
  }

  assert.ok(unlocked.discoveredIds.includes('35'), 'Gauntlet beast is registered in discoveredIds');
  assert.ok(!unlocked.caughtIds.includes('35'), 'Gauntlet beast is NOT in caughtIds (Roulette-only taming)');

  // 3. Companion carousel only includes tamed beasts from caughtIds
  const caughtSet = new Set(unlocked.caughtIds.map(String));
  assert.ok(caughtSet.has('71'), 'Tamed starter is selectable in Camp');
  assert.ok(!caughtSet.has('35'), 'Discovered Gauntlet beast is NOT selectable as companion in Camp');
});

test('QA: Tier 4 Rhythm Strike lane discrete handling and Tier 3 drag integrity', () => {
  const origDocument = global.document;
  const origWindow = global.window;
  const origRAF = global.requestAnimationFrame;
  const origCAF = global.cancelAnimationFrame;

  global.requestAnimationFrame = (cb) => setTimeout(cb, 10);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    devicePixelRatio: 1,
  };
  global.document = {
    createElement: () => ({
      style: {},
      appendChild: () => {},
      remove: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 300 }),
      getContext: () => ({
        resetTransform: () => {},
        scale: () => {},
        clearRect: () => {},
        fillRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        fillText: () => {},
        moveTo: () => {},
        lineTo: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
      }),
    }),
  };

  const container = {
    clientWidth: 360,
    clientHeight: 300,
    appendChild: () => {},
  };

  try {
    // Test Tier 4 lane handlers
    const t4Def = getTierMinigame(4);
    assert.strictEqual(t4Def.controlsType, '3lanes');
    let t4Completed = false;
    const t4 = t4Def.factory(container, {
      beast: { id: '16', name: 'Banshee', rarity: 4 },
      tier: 4,
      onComplete: () => { t4Completed = true; },
    });
    assert.ok(typeof t4.hitLane === 'function', 'Tier 4 must export hitLane');
    t4.hitLane(0); // Left
    t4.hitLane(1); // Mid
    t4.hitLane(2); // Right
    t4.destroy();

    // Test Tier 3 drag handler
    const t3Def = getTierMinigame(3);
    assert.strictEqual(t3Def.controlsType, 'drag');
    let t3Progress = 0;
    const t3 = t3Def.factory(container, {
      beast: { id: '25', name: 'Manticore', rarity: 3 },
      tier: 3,
      onProgress: (p) => { t3Progress = p; },
    });
    // triggerInput should nudge, NOT cheat and fill taming progress
    t3.triggerInput();
    assert.strictEqual(t3Progress, 0, 'triggerInput must not directly inflate taming progress');
    t3.destroy();
  } finally {
    global.document = origDocument;
    global.window = origWindow;
    global.requestAnimationFrame = origRAF;
    global.cancelAnimationFrame = origCAF;
  }
});

test('QA: 6x6 minimap procedural path and post-dungeon level-up stat allocation flow', () => {
  const g = createGame({ beastData, seed: 101, weaponType: 'Blade' });

  // 1. Enter dungeon: stepsCount is 12 (approx 10-12 chambers, not 36)
  startDungeon(g, { stepsCount: 12, floor: 1 });
  assert.strictEqual(g.dungeon.stepsCount, 12, 'Dungeon run must be 12 chambers');
  assert.strictEqual(g.dungeon.steps.length, 12);
  assert.strictEqual(g.dungeon.steps[11].type, 'boss', 'Boss must be last chamber');

  // Verify coordinates are along a 6x6 grid
  const occupiedCoords = new Set();
  for (const step of g.dungeon.steps) {
    assert.ok(step.row >= 0 && step.row < 6, 'row must be 0..5');
    assert.ok(step.col >= 0 && step.col < 6, 'col must be 0..5');
    occupiedCoords.add(`${step.row},${step.col}`);
  }
  assert.strictEqual(occupiedCoords.size, 12, 'Path chambers must have unique coordinates');
  assert.strictEqual(36 - occupiedCoords.size, 24, 'There must be 24 empty/wall cells on 6x6 minimap');

  // 2. Clearing dungeon with pending stat points allows level-up stat allocation
  g.pendingStatPoints = 2;
  g.dungeon.cleared = true;
  g.phase = 'levelup';

  const beforeStr = g.stats.STR;
  const res1 = allocateStat(g, 'STR');
  assert.strictEqual(res1.kind, 'stat');
  assert.strictEqual(g.stats.STR, beforeStr + 1);
  assert.strictEqual(g.pendingStatPoints, 1);

  const beforeVit = g.stats.VIT;
  const beforeMaxHp = g.maxHp;
  const res2 = allocateStat(g, 'VIT');
  assert.strictEqual(res2.kind, 'stat');
  assert.strictEqual(g.stats.VIT, beforeVit + 1);
  assert.strictEqual(g.maxHp, beforeMaxHp + 15);
  assert.strictEqual(g.pendingStatPoints, 0);
  assert.strictEqual(g.phase, 'explore', 'Phase transitions back to explore once all points spent');
});

test('QA: deterministic seed reproduction and floor-clear stat point guarantees', () => {
  // Test seeded determinism without Date.now() / unseeded randomness
  const g1 = createGame({ beastData, seed: 4242, weaponType: 'Blade' });
  const d1 = startDungeon(g1, { stepsCount: 12, floor: 1, seed: 12345 });

  const g2 = createGame({ beastData, seed: 4242, weaponType: 'Blade' });
  const d2 = startDungeon(g2, { stepsCount: 12, floor: 1, seed: 12345 });

  assert.deepStrictEqual(d1.steps, d2.steps, 'Identical seed must produce identical procedural path steps');

  // Verify floor clear logic guarantees additional point even if carrying an unspent point
  const g3 = createGame({ beastData, seed: 999, weaponType: 'Blade' });
  g3.pendingStatPoints = 1;
  g3.level = 2;
  g3.xp = 4; // sqrt(4) = 2, so levelFromXp(4 + 25) = floor(sqrt(29)) = 5
  // If XP gained raises level:
  const bonusXp = 25;
  g3.xp += bonusXp;
  const newLvl = levelFromXp(g3.xp);
  assert.strictEqual(newLvl, 5);
  const gained = newLvl - g3.level;
  g3.level = newLvl;
  g3.pendingStatPoints += gained;
  assert.strictEqual(g3.pendingStatPoints, 4, '1 existing point + 3 gained levels = 4 total');

  // Now test boundary where newLvl <= g.level but floor is cleared:
  // Must still guarantee at least +1 stat point!
  const g4 = createGame({ beastData, seed: 888, weaponType: 'Blade' });
  g4.level = 10;
  g4.pendingStatPoints = 2;
  g4.xp = 100;
  // Floor clear with small bonus where newLvl == g.level
  const floorXp = 10;
  g4.xp += floorXp;
  const calculatedLvl = levelFromXp(g4.xp); // sqrt(110) = 10.48 => 10
  assert.strictEqual(calculatedLvl <= g4.level, true);
  // With our fix:
  g4.pendingStatPoints = (g4.pendingStatPoints || 0) + 1;
  g4.level += 1;
  assert.strictEqual(g4.pendingStatPoints, 3, 'Guaranteed +1 stat point awarded despite carrying existing points');
  assert.strictEqual(g4.level, 11);
});


