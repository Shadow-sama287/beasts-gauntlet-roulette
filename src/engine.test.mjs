// Run: node --test src/game/engine.test.mjs   (or: npm test)
// First two cases are the worked examples from https://docs.provable.games/lootsurvivor/combat
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  playerDamage, beastDamage, elementalDamage, typeMultiplierClass, createGame, explore, attack, flee,
  allocateStat, buyPotion, buyUpgrade, goldReward, levelFromXp, maxHpFor, summary,
  generateDungeonLayout, startDungeon, stepDungeon, isMarketLocked, companionStrike,
} from './engine.js';

const beastData = JSON.parse(readFileSync(new URL('./beasts.json', import.meta.url), 'utf8'));

test('docs example 1: L10 T3 Blade, STR 5 vs T4 Hide (Hunter) beast L10 => 25', () => {
  const d = playerDamage({
    weapon: { type: 'Blade', tier: 3, level: 10 }, str: 5, crit: false,
    beast: { type: 'Hunter', tier: 4, level: 10 },
  });
  assert.equal(d, 25);
});

test('docs example 2: T3 Bludgeon vs Hide (strong) + crit, STR 5 => 92', () => {
  const d = playerDamage({
    weapon: { type: 'Bludgeon', tier: 3, level: 10 }, str: 5, crit: true,
    beast: { type: 'Hunter', tier: 4, level: 10 },
  });
  assert.equal(d, 92);
});

test('type triangle: Brute > Hunter > Magical > Brute', () => {
  assert.equal(typeMultiplierClass('Brute', 'Hunter'), 'strong');
  assert.equal(typeMultiplierClass('Hunter', 'Magical'), 'strong');
  assert.equal(typeMultiplierClass('Magical', 'Brute'), 'strong');
  assert.equal(typeMultiplierClass('Hunter', 'Brute'), 'weak');
  assert.equal(typeMultiplierClass('Brute', 'Brute'), 'fair');
  assert.equal(elementalDamage(30, 'Brute', 'Hunter'), 45);
  assert.equal(elementalDamage(30, 'Hunter', 'Brute'), 15);
});

test('minimum damage: adventurer 4, beast 2', () => {
  assert.equal(playerDamage({ weapon: { type: 'Magic', tier: 5, level: 1 }, str: 0, crit: false, beast: { type: 'Brute', tier: 1, level: 20 } }), 4);
  assert.equal(beastDamage({ beast: { type: 'Brute', tier: 5, level: 1 }, armor: { type: 'Metal', tier: 1, level: 20 } }), 2);
});

test('rewards and stats follow docs', () => {
  assert.equal(goldReward({ tier: 1, level: 10 }), 25); // 5x level / 2
  assert.equal(goldReward({ tier: 5, level: 10 }), 5); // 1x level / 2
  assert.equal(maxHpFor(0), 100);
  assert.equal(maxHpFor(10), 250);
  assert.equal(maxHpFor(1000), 1023);
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(100), 10);
});

test('data: 75 beasts, 25 per type, 5 per tier per type', () => {
  assert.equal(beastData.beasts.length, 75);
  for (const type of ['Magical', 'Hunter', 'Brute']) {
    assert.equal(beastData.beasts.filter((b) => b.type === type).length, 25);
    for (let t = 1; t <= 5; t++) assert.equal(beastData.beasts.filter((b) => b.type === type && b.tier === t).length, 5);
  }
});

test('determinism: same seed => same run', () => {
  const run = (seed) => {
    const g = createGame({ beastData, seed, weaponType: 'Blade' });
    for (let i = 0; i < 60 && g.phase !== 'dead'; i++) {
      if (g.phase === 'explore') explore(g);
      else if (g.phase === 'battle') attack(g);
      else if (g.phase === 'levelup') allocateStat(g, 'VIT');
    }
    return JSON.stringify(summary(g));
  };
  assert.equal(run(7), run(7));
});

test('stat start: 12 points, VIT raises max HP, level-up grants points', () => {
  const g = createGame({ beastData, seed: 3 });
  const total = Object.values(g.stats).reduce((a, b) => a + b, 0);
  assert.equal(total, 12);
  g.pendingStatPoints = 2; g.phase = 'levelup';
  const before = g.maxHp;
  allocateStat(g, 'VIT');
  assert.equal(g.maxHp, before + 15);
  allocateStat(g, 'STR');
  assert.equal(g.phase, 'explore');
});

test('named beast capture lands in the Beast Dex (low namedLevel for demo)', () => {
  const g = createGame({ beastData, seed: 11, config: { namedLevel: 1 }, companionId: 1 });
  g.stats.STR = 40; g.hp = g.maxHp = 1000; // make the test kill fast
  let guard = 0;
  while (g.captured.length === 0 && g.phase !== 'dead' && guard++ < 500) {
    if (g.phase === 'explore') explore(g);
    else if (g.phase === 'battle') attack(g);
    else if (g.phase === 'levelup') allocateStat(g, 'VIT');
  }
  assert.ok(g.captured.length >= 1, 'expected at least one capture');
  assert.ok(g.captured[0].prefix);
});

test('market + flee are guarded by phase', () => {
  const g = createGame({ beastData, seed: 5 });
  g.gold = 100; g.hp = 10;
  assert.equal(buyPotion(g).kind, 'potion');
  assert.equal(buyUpgrade(g, 'weapon').kind, 'upgrade');
  assert.equal(g.weapon.tier, 4);
  assert.equal(flee(g).kind, 'blocked'); // not in battle
});

test('dungeon generator: deterministic layout, boss always last step', () => {
  const layoutA = generateDungeonLayout({ seed: 12345, stepsCount: 12, floor: 1 });
  const layoutB = generateDungeonLayout({ seed: 12345, stepsCount: 12, floor: 1 });
  assert.equal(layoutA.length, 12);
  assert.deepEqual(layoutA, layoutB);

  // Boss is strictly the final chamber
  assert.equal(layoutA[11].type, 'boss');

  // Traps, beasts and discoveries exist in reasonable ratio
  const beasts = layoutA.filter((s) => s.type === 'beast').length;
  const traps = layoutA.filter((s) => s.type === 'trap').length;
  assert.ok(beasts >= 4, `expected >=4 beasts, got ${beasts}`);
  assert.ok(traps >= 1, `expected >=1 traps, got ${traps}`);
});

test('dungeon lock rules: healing and upgrades locked during active dungeon until cleared', () => {
  const g = createGame({ beastData, seed: 42 });
  g.gold = 100; g.hp = 50;

  // In Camp (before dungeon): market is available
  assert.equal(isMarketLocked(g), false);
  assert.equal(buyPotion(g).kind, 'potion');

  // Enter Dungeon Floor 1
  startDungeon(g, { stepsCount: 10, floor: 1 });
  assert.equal(isMarketLocked(g), true);

  // Inside dungeon: healing & upgrades are locked
  const lockP = buyPotion(g);
  assert.equal(lockP.kind, 'blocked');
  assert.equal(lockP.reason, 'locked_in_dungeon');

  const lockU = buyUpgrade(g, 'weapon');
  assert.equal(lockU.kind, 'blocked');
  assert.equal(lockU.reason, 'locked_in_dungeon');

  // Mark dungeon cleared (e.g. boss defeated)
  g.dungeon.cleared = true;
  assert.equal(isMarketLocked(g), false);

  // Market unlocks back in Camp
  assert.equal(buyUpgrade(g, 'weapon').kind, 'upgrade');
});

test('companion strike: scales with Dojo training bonus', () => {
  const companion = { id: 1, name: 'Warlock', tier: 1, type: 'Magical' };
  const beast = { id: 2, name: 'Wolf', tier: 4, type: 'Brute' }; // Magical beats Brute

  // Base strike without bonus
  const baseStrike = companionStrike({ companion, level: 5, beast, bonusPct: 0 });
  assert.ok(baseStrike > 0);

  // With +20% Dojo training bonus
  const boostedStrike = companionStrike({ companion, level: 5, beast, bonusPct: 20 });
  assert.ok(boostedStrike > baseStrike, `expected ${boostedStrike} > ${baseStrike}`);

  // In attack(g) flow with game companionBonusPct
  const g = createGame({ beastData, seed: 10, companionId: 1 });
  g.companion = companion;
  g.companionBonusPct = 20;
  g.beast = beast;
  g.phase = 'battle';
  const atk = attack(g);
  assert.equal(atk.kind, 'attack');
  assert.equal(atk.companionBonusPct, 20);
  assert.ok(atk.comp > 0);

  // Companion with rarity property instead of tier property
  const rarityComp = { id: 1, name: 'Warlock', rarity: 1, type: 'Magical' };
  const rarityStrike = companionStrike({ companion: rarityComp, level: 5, beast, bonusPct: 0 });
  assert.equal(rarityStrike, baseStrike);
  assert.ok(!Number.isNaN(rarityStrike));
});
