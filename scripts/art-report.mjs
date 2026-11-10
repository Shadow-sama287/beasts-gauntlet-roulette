// scripts/art-report.mjs — Real Beast Art Census across full roster
import { readFileSync, existsSync } from 'node:fs';
import { resolveBeastArt, setArtManifest } from '../src/art/beastArt.js';

// Load local manifest
const manifestPath = './public/beasts/art/manifest.json';
let manifest = {};
if (existsSync(manifestPath)) {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  setArtManifest(manifest);
}

// Load beasts roster
const rosterPath = './public/my-beasts.json';
if (!existsSync(rosterPath)) {
  console.error('Error: public/my-beasts.json not found');
  process.exit(1);
}

const data = JSON.parse(readFileSync(rosterPath, 'utf8'));
const beasts = Array.isArray(data.beasts) ? data.beasts : [];

let localCount = 0;
let onchainCount = 0;
let sigilCount = 0;

for (const beast of beasts) {
  const res = await resolveBeastArt(beast);
  if (res.kind === 'local') localCount++;
  else if (res.kind === 'onchain') onchainCount++;
  else sigilCount++;
}

console.log('========================================');
console.log('       BEAST ART CENSUS REPORT          ');
console.log('========================================');
console.log(`Local Art (bundled SVGs) : ${localCount}`);
console.log(`Onchain Art (live read)  : ${onchainCount}`);
console.log(`Sigil Fallback           : ${sigilCount}`);
console.log(`----------------------------------------`);
console.log(`Total Roster             : ${beasts.length}`);
console.log('========================================');

