// scripts/fetch-art.mjs — Download / build art for beasts and generate public/beasts/art/manifest.json
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ART_DIR = resolve(process.cwd(), 'public/beasts/art');
const MANIFEST_PATH = resolve(ART_DIR, 'manifest.json');
const ROSTER_PATH = resolve(process.cwd(), 'public/my-beasts.json');
const ART_TODO_PATH = resolve(process.cwd(), 'docs/ART_TODO.md');

mkdirSync(ART_DIR, { recursive: true });

async function main() {
  console.log('--- Fetching & indexing beast art ---');
  let roster = [];
  if (existsSync(ROSTER_PATH)) {
    try {
      const data = JSON.parse(readFileSync(ROSTER_PATH, 'utf8'));
      roster = data.beasts || [];
    } catch (err) {
      console.warn('Failed to parse roster:', err);
    }
  }

  // Scan existing files in public/beasts/art
  const existingFiles = existsSync(ART_DIR) ? readdirSync(ART_DIR) : [];
  const manifest = {};

  for (const file of existingFiles) {
    if (file === 'manifest.json') continue;
    const baseId = file.replace(/\.[^/.]+$/, '');
    manifest[baseId] = file;
  }

  // Check if we also have files in public/beasts/*.svg that can be indexed/copied
  const rootBeastsDir = resolve(process.cwd(), 'public/beasts');
  if (existsSync(rootBeastsDir)) {
    const rootFiles = readdirSync(rootBeastsDir);
    for (const file of rootFiles) {
      if (file.endsWith('.svg') && !manifest[file.replace('.svg', '')]) {
        const id = file.replace('.svg', '');
        const targetPath = join(ART_DIR, file);
        if (!existsSync(targetPath)) {
          writeFileSync(targetPath, readFileSync(join(rootBeastsDir, file)));
        }
        manifest[id] = file;
      }
    }
  }

  console.log(`Found ${Object.keys(manifest).length} local beast art files.`);

  // Identify missing beasts
  const missing = roster.filter((b) => !manifest[String(b.id)]);
  console.log(`Beasts needing art fetch: ${missing.length}`);

  // Document URL pattern & manual steps in docs/ART_TODO.md
  const todoContent = `# Beast Art Retrieval & Status

## Team Beasts Art Source
- **Roster File:** \`public/my-beasts.json\`
- **Web App Pattern:** \`https://beasts.app/#/beast/<id>\`
- **Onchain Token URI Entrypoint:** Beasts NFT Contract on Starknet Sepolia (\`0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1\`)

## Local Art Manifest
- Location: \`public/beasts/art/manifest.json\`
- Current local art files: ${Object.keys(manifest).length}
- Missing local art files: ${missing.length}

## Manual Art Export / Automation Steps
1. In a network-enabled environment with RPC access to Starknet Sepolia, run:
   \`node .claude/skills/beasts-hackathon/scripts/beasts-read.mjs uri <tokenId> --out ./temp_art\`
2. For beasts.app web renditions (IDs 10012 to 10041):
   - Visit \`https://beasts.app/#/beast/<id>\`
   - Save the rendered SVG/PNG art as \`public/beasts/art/<id>.svg\`
   - Re-run \`node scripts/fetch-art.mjs\` to update \`manifest.json\`
3. The game runtime automatically falls back to:
   - Onchain image fetch (2s timeout, cached)
   - Dynamic SVG Sigil fallback generated from beast ID hash
`;

  mkdirSync(resolve(process.cwd(), 'docs'), { recursive: true });
  writeFileSync(ART_TODO_PATH, todoContent);

  // Write manifest.json
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote manifest to ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error('Error in fetch-art:', err);
  process.exit(1);
});

