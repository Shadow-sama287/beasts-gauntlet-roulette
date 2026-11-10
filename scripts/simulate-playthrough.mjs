// scripts/simulate-playthrough.mjs — End-to-end simulation of a full 25-spin game session
import {
  createRouletteState,
  spin,
  buildWheel,
  tameZoneWidth,
  resolveTame,
  catchBeast,
  missBeast,
} from '../src/roulette.js';
import { FALLBACK_BEASTS } from '../src/beastLoader.js';
import { readFileSync, existsSync } from 'node:fs';

async function runSimulation() {
  console.log('=== STARTING BEAST ROULETTE SIMULATION ===');
  let beasts = FALLBACK_BEASTS;
  if (existsSync('public/my-beasts.json')) {
    const raw = JSON.parse(readFileSync('public/my-beasts.json', 'utf8'));
    if (raw && raw.beasts) beasts = raw.beasts;
  }
  console.log(`Loaded ${beasts.length} beasts from public/my-beasts.json`);

  const state = createRouletteState({
    beasts,
    seed: 9999,
    hearts: 3,
    essence: 0,
    spinsMax: 25,
  });

  let newCatches = 0;
  let duplicates = 0;
  let misses = 0;
  let pityTriggers = 0;
  let luckySpinsUsed = 0;

  console.log('\nStarting 25 spins...\n');

  while (!state.gameOver) {
    const isLucky = state.essence >= 10;
    if (isLucky) luckySpinsUsed++;

    const spinResult = spin(state);
    if (!spinResult) break;

    const { beast, pityTriggered, luckyActive } = spinResult;
    if (pityTriggered) pityTriggers++;

    const width = tameZoneWidth(beast.rarity);
    // Simulate player timing: 70% hit rate
    const simulateHit = Math.random() < 0.75;
    const testMarker = simulateHit ? 0.5 : 0.01;
    const testZone = { start: 0.4, end: 0.4 + width };
    const hit = resolveTame(testMarker, testZone, luckyActive);

    if (hit) {
      const outcome = catchBeast(state, beast);
      if (outcome.isDuplicate) {
        duplicates++;
        console.log(`Spin #${state.spinsUsed}: DUPLICATE ${beast.name} (T${beast.rarity}) -> +${outcome.essenceGained} essence (Total: ${state.essence})`);
      } else {
        newCatches++;
        console.log(`Spin #${state.spinsUsed}: NEW CATCH! ${beast.name} (T${beast.rarity}) [${outcome.totalOwned}/${beasts.length} owned]`);
      }
    } else {
      misses++;
      missBeast(state);
      console.log(`Spin #${state.spinsUsed}: MISSED ${beast.name} (T${beast.rarity}) -> Hearts left: ${state.hearts}`);
    }

    if (state.hearts <= 0) {
      console.log('Player ran out of hearts!');
      break;
    }
  }

  console.log('\n=== RUN SUMMARY ===');
  console.log(`Spins completed: ${state.spinsUsed}/${state.spinsMax}`);
  console.log(`Hearts left: ${state.hearts}/3`);
  console.log(`New catches: ${newCatches}`);
  console.log(`Duplicate catches: ${duplicates}`);
  console.log(`Misses: ${misses}`);
  console.log(`Pity triggers: ${pityTriggers}`);
  console.log(`Lucky spins activated: ${luckySpinsUsed}`);
  console.log(`Final essence: ${state.essence}`);
  console.log(`Total owned: ${state.owned.size}/${beasts.length}`);
  console.log('=== SIMULATION COMPLETED SUCCESSFULLY ===\n');
}

runSimulation();
