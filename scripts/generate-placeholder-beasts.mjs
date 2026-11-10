// scripts/generate-placeholder-beasts.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { generateSigilDataUri } from '../src/roulette.js';

// 1. Load canonical beasts 1 to 75
const canonRaw = JSON.parse(
  readFileSync(
    'beast-gauntlet-kit/beast-gauntlet-kit/.agent/skills/loot-survivor-rules/resources/beasts.json',
    'utf8'
  )
);

const beasts1to75 = canonRaw.beasts.map((b) => ({
  id: String(b.id),
  name: b.name,
  rarity: b.tier,
  art: generateSigilDataUri(String(b.id), b.name, b.tier),
}));

// 2. Custom beasts 10012 to 10041 (30 beasts)
const customDef = [
  { id: '10012', name: 'Crystalline Scorpion', rarity: 4 },
  { id: '10013', name: 'Dune Burrower', rarity: 4 },
  { id: '10014', name: 'Bog Mireling', rarity: 5 },
  { id: '10015', name: 'Solar Wyrm', rarity: 1 },
  { id: '10016', name: 'Void Specter', rarity: 2 },
  { id: '10017', name: 'Storm Harpy', rarity: 3 },
  { id: '10018', name: 'Ironhide Basilisk', rarity: 3 },
  { id: '10019', name: 'Ember Hound', rarity: 4 },
  { id: '10020', name: 'Sporeling Shroom', rarity: 5 },
  { id: '10021', name: 'Cavern Beetle', rarity: 5 },
  { id: '10022', name: 'Grave Ghoul', rarity: 4 },
  { id: '10023', name: 'Glacier Behemoth', rarity: 2 },
  { id: '10024', name: 'Coral Leviathan', rarity: 2 },
  { id: '10025', name: 'Volcanic Salamander', rarity: 3 },
  { id: '10026', name: 'Mist Wisp', rarity: 5 },
  { id: '10027', name: 'Astral Phoenix', rarity: 1 },
  { id: '10028', name: 'Rune Golem', rarity: 3 },
  { id: '10029', name: 'Thorn Raptor', rarity: 4 },
  { id: '10030', name: 'Rust Scavenger', rarity: 5 },
  { id: '10031', name: 'Tide Weaver', rarity: 4 },
  { id: '10032', name: 'Molten Crab', rarity: 5 },
  { id: '10033', name: 'Dusk Raven', rarity: 4 },
  { id: '10034', name: 'Quake Ram', rarity: 3 },
  { id: '10035', name: 'Luminous Jelly', rarity: 5 },
  { id: '10036', name: 'Acidic Slime', rarity: 5 },
  { id: '10037', name: 'Spectral Stag', rarity: 3 },
  { id: '10038', name: 'Phantom Serpent', rarity: 2 },
  { id: '10039', name: 'Obsidian Gargoyle', rarity: 4 },
  { id: '10040', name: 'Chronos Dragon', rarity: 1 },
  { id: '10041', name: 'Pebble Sprite', rarity: 5 },
];

const beasts10012to10041 = customDef.map((b) => ({
  id: b.id,
  name: b.name,
  rarity: b.rarity,
  art: generateSigilDataUri(b.id, b.name, b.rarity),
}));

// Combine both ranges: 75 + 30 = 105 beasts
const allBeasts = [...beasts1to75, ...beasts10012to10041];

mkdirSync('public', { recursive: true });
writeFileSync('public/my-beasts.json', JSON.stringify({ beasts: allBeasts }, null, 2) + '\n');
console.log(`Generated public/my-beasts.json with ${allBeasts.length} beasts (IDs 1-75 and 10012-10041)`);
