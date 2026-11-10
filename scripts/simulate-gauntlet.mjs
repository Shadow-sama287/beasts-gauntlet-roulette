// scripts/simulate-gauntlet.mjs — End-to-end headless simulation of a Loot Survivor dungeon gauntlet run
import { createGame, explore, attack, allocateStat, buyPotion, buyUpgrade, summary, DEMO_CONFIG } from '../src/engine.js';
import { readFileSync } from 'node:fs';

const beastData = JSON.parse(readFileSync(new URL('../src/beasts.json', import.meta.url), 'utf8'));

console.log('=== STARTING BEAST GAUNTLET SIMULATION ===');
const g = createGame({
  beastData,
  seed: 42,
  weaponType: 'Blade',
  companionId: 1,
  config: { ...DEMO_CONFIG, namedLevel: 1 },
});

console.log(`Hero: ${g.name} | Starter: ${g.weapon.type} (${g.weapon.tier}) | Companion ID: ${g.companion.id}`);

let turns = 0;
while (turns < 200 && g.phase !== 'dead') {
  turns++;
  if (g.phase === 'explore') {
    if (g.hp < g.maxHp * 0.4 && g.gold >= (g.cfg.potionPrice || 5)) {
      buyPotion(g);
    }
    explore(g);
  } else if (g.phase === 'battle') {
    attack(g);
  } else if (g.phase === 'levelup') {
    allocateStat(g, g.stats.VIT < 15 ? 'VIT' : 'STR');
  }
}

const s = summary(g);
console.log('\n=== GAUNTLET SUMMARY ===');
console.log(`Status: ${g.phase === 'dead' ? `Slain by ${g.diedTo}` : 'Survived'}`);
console.log(`Final Level: ${s.level}`);
console.log(`Turns: ${s.turns}`);
console.log(`Kills: ${s.kills}`);
console.log(`Gold: ${s.gold}`);
console.log(`Captures: ${s.captured.length}`);
if (s.captured.length > 0) {
  console.log(`First captured beast: ${s.captured[0].prefix} ${s.captured[0].name} (T${s.captured[0].tier} Lv.${s.captured[0].level})`);
}
console.log('=== GAUNTLET SIMULATION COMPLETED SUCCESSFULLY ===\n');
