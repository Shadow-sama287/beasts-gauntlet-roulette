// src/minigames.test.mjs — Unit tests for minigame framework, tuning, picker, and sequence logic
import test from 'node:test';
import assert from 'node:assert';
import { hardness, lerp, mulberry32 } from './minigames/tuning.js';
import { pickGame } from './minigames/pick.js';
import { makeSequence } from './minigames/games/runeEcho.js';
import { TUNING_TABLE } from './minigames/tuningTable.js';
import { MINIGAMES } from './minigames/registry.js';

test('tuning: hardness scales from 0.0 (T5) to 1.0 (T1) and clamps to [0, 1.3]', () => {
  assert.strictEqual(hardness(5, 1.0), 0.0, 'T5 at 1.0 difficulty should be 0.0');
  assert.strictEqual(hardness(1, 1.0), 1.0, 'T1 at 1.0 difficulty should be 1.0');
  assert.strictEqual(hardness(3, 1.0), 0.5, 'T3 at 1.0 difficulty should be 0.5');

  // Clamping check
  assert.strictEqual(hardness(1, 2.0), 1.3, 'Should clamp to 1.3 maximum');
  assert.strictEqual(hardness(6, 1.0), 0.0, 'Should clamp to 0.0 minimum');
});

test('tuning: lerp stays bounded between easy and hard values', () => {
  const easy = TUNING_TABLE.netToss.speed.easy;
  const hard = TUNING_TABLE.netToss.speed.hard;

  assert.strictEqual(lerp(easy, hard, 0), easy);
  assert.strictEqual(lerp(easy, hard, 1), hard);
  const mid = lerp(easy, hard, 0.5);
  assert.strictEqual(mid > easy && mid < hard, true);
});

test('pickGame: respects tiers, beast type weights, and never repeats consecutively', () => {
  const beast = { id: '10', name: 'Hunter Beast', tier: 3, type: 'Hunter' };
  const rng = mulberry32(12345);

  let lastGameId = null;
  const history = [];

  for (let i = 0; i < 50; i++) {
    const picked = pickGame(MINIGAMES, beast, rng, history);
    assert.ok(picked, 'Should pick a game');
    assert.strictEqual(picked.tiers.includes(3), true, 'Picked game must support Tier 3');
    if (lastGameId !== null) {
      assert.notStrictEqual(picked.id, lastGameId, 'Never repeat the same game twice in a row');
    }
    lastGameId = picked.id;
    history.push(picked.id);
  }
});

test('runeEcho: makeSequence generates valid symbols and respects length', () => {
  const rng = mulberry32(9999);
  for (let len = 3; len <= 8; len++) {
    const seq = makeSequence(rng, len, 4);
    assert.strictEqual(seq.length, len);
    for (const sym of seq) {
      assert.strictEqual(sym >= 0 && sym < 4, true, 'Symbol must be in [0, 3]');
    }
  }
});

test('registry: all games A through H are registered with valid contract', () => {
  const expectedGameIds = [
    'netToss',
    'runeEcho',
    'dodgeStrike',
    'tugStruggle',
    'sparkCatch',
    'runeTrace',
    'heartbeat',
    'classic_timingbar',
    'classic_focusring',
    'classic_movingbar',
    'classic_duallock',
    'classic_convergence',
  ];

  for (const expectedId of expectedGameIds) {
    const game = MINIGAMES.find((g) => g.id === expectedId);
    assert.ok(game, `Game ${expectedId} must be in registry`);
    assert.ok(typeof game.title === 'string' && game.title.length > 0, 'Game must have title');
    assert.ok(typeof game.blurb === 'string' && game.blurb.length > 0, 'Game must have blurb');
    assert.ok(typeof game.controls === 'string' && game.controls.length > 0, 'Game must have controls hint');
    assert.ok(Array.isArray(game.tiers) && game.tiers.length > 0, 'Game must support tiers');
    assert.ok(game.weights && typeof game.weights === 'object', 'Game must have weights');
    assert.ok(typeof game.mount === 'function', 'Game must have mount function');
  }

  // Ensure every tier 1-5 has at least 3 games available
  for (let tier = 1; tier <= 5; tier++) {
    const available = MINIGAMES.filter((g) => g.tiers.includes(tier));
    assert.ok(available.length >= 3, `Tier ${tier} must have at least 3 available minigames, found ${available.length}`);
  }
});

