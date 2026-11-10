// scripts/bake-all-beasts.mjs — Fetch onchain SVGs for canonical beasts and generate pixel art for custom beasts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SEPOLIA_RPC = 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe';
const NFT_CONTRACT = '0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1';
const GET_GENESIS_SELECTOR = '0x0f726785327e8cb474c500d9e19116530b1a84bbf8908ac70813864a530d07b';
const TOKEN_URI_SELECTOR = '0x0226ad7e84c1fe08eb4c525ed93cccadf9517670341304571e66f7c4f95cbe54';

const ART_DIR = resolve('public/beasts/art');
const PUBLIC_DIR = resolve('public/beasts');
const FALLBACK_DIR = resolve('public/beasts/fallback');
mkdirSync(ART_DIR, { recursive: true });
mkdirSync(PUBLIC_DIR, { recursive: true });
mkdirSync(FALLBACK_DIR, { recursive: true });

const ROSTER_PATH = resolve('public/my-beasts.json');
const rosterData = JSON.parse(readFileSync(ROSTER_PATH, 'utf8'));
const beasts = rosterData.beasts;

const TIER_COLORS = {
  1: '#ff8a1f',
  2: '#a45cff',
  3: '#3d8bff',
  4: '#3ecf6e',
  5: '#f2f2f2',
};

const TIER_NAMES = {
  1: 'Legendary',
  2: 'Epic',
  3: 'Rare',
  4: 'Uncommon',
  5: 'Common',
};

function toU256Calldata(hexOrBigInt) {
  const b = BigInt(hexOrBigInt);
  const low = b & ((1n << 128n) - 1n);
  const high = b >> 128n;
  return ['0x' + low.toString(16), '0x' + high.toString(16)];
}

function decodeByteArray(felts, start = 0) {
  const words = Number(BigInt(felts[start]));
  const bytes = [];
  for (let i = 0; i < words; i++) {
    const hex = BigInt(felts[start + 1 + i]).toString(16).padStart(62, '0');
    for (let j = 0; j < 31; j++) bytes.push(parseInt(hex.slice(j * 2, j * 2 + 2), 16));
  }
  const pending = BigInt(felts[start + 1 + words]).toString(16);
  const pendingLen = Number(BigInt(felts[start + 2 + words]));
  const padded = pending.padStart(pendingLen * 2, '0');
  for (let j = 0; j < pendingLen; j++) bytes.push(parseInt(padded.slice(j * 2, j * 2 + 2), 16));
  return Buffer.from(bytes).toString('utf8');
}

async function rpcCall(method, params) {
  const res = await fetch(SEPOLIA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

// Generate pixel creature SVG art for any beast
function generatePixelCreatureSvg(beast) {
  const tier = beast.rarity || 5;
  const color = TIER_COLORS[tier] || '#f2f2f2';
  const tierName = TIER_NAMES[tier] || 'Common';
  const type = beast.type || (tier % 3 === 0 ? 'Brute' : tier % 3 === 1 ? 'Magical' : 'Hunter');
  const level = beast.level || (tier === 1 ? 55 : tier === 2 ? 38 : tier === 3 ? 24 : tier === 4 ? 14 : 5);
  const power = beast.power || level * (6 - tier);
  const health = beast.health || (100 + tier * 25);

  // Procedural pixel creature patterns based on id
  const seed = parseInt(String(beast.id).replace(/\D/g, ''), 10) || 42;
  const pixels = [];
  const pSize = 8;
  const gridW = 12;
  const gridH = 12;
  const startX = 77;
  const startY = 85;

  // Symmetrical 12x12 sprite generator
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < Math.floor(gridW / 2); x++) {
      const v = Math.sin(seed * 11 + x * 7 + y * 13 + (seed % 17));
      const isPixel = v > 0.05 || (y >= 3 && y <= 8 && x >= 1 && v > -0.3);
      if (isPixel) {
        const pxColor = y < 3 ? color : y > 8 ? '#e2ddf5' : (x + y) % 2 === 0 ? color : '#ffd166';
        // Left
        pixels.push(`<rect x="${startX + x * pSize}" y="${startY + y * pSize}" width="${pSize - 1}" height="${pSize - 1}" fill="${pxColor}"/>`);
        // Mirrored right
        const mx = gridW - 1 - x;
        pixels.push(`<rect x="${startX + mx * pSize}" y="${startY + y * pSize}" width="${pSize - 1}" height="${pSize - 1}" fill="${pxColor}"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="350" viewBox="0 0 250 350">
  <defs>
    <linearGradient id="bg-${beast.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2a2438"/>
      <stop offset="60%" stop-color="#141420"/>
      <stop offset="100%" stop-color="#0b0b12"/>
    </linearGradient>
    <filter id="glow-${beast.id}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Card Border & Background -->
  <rect width="250" height="350" rx="14" fill="url(#bg-${beast.id})" stroke="${color}" stroke-width="3"/>
  <rect x="7" y="7" width="236" height="336" rx="9" fill="none" stroke="${color}" stroke-opacity="0.3" stroke-width="1.5"/>

  <!-- Card Header -->
  <text x="125" y="24" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11" font-weight="bold" fill="#9a98ad" letter-spacing="1">SPECIES #${beast.id}</text>
  <text x="125" y="45" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-size="17" font-weight="bold" fill="#ffffff">${beast.name.slice(0, 18)}</text>

  <!-- Creature Art Frame -->
  <rect x="18" y="56" width="214" height="154" rx="8" fill="#0d0d16" stroke="#2a2a3c" stroke-width="2"/>
  <circle cx="125" cy="133" r="58" fill="${color}" fill-opacity="0.08"/>
  <circle cx="125" cy="133" r="42" fill="none" stroke="${color}" stroke-opacity="0.25" stroke-dasharray="4,4" stroke-width="1.5"/>

  <!-- Pixel Sprite -->
  <g filter="url(#glow-${beast.id})">
    ${pixels.join('\n    ')}
  </g>

  <!-- Stats Grid (Aligned with cardModal & Dex) -->
  <g transform="translate(18, 220)">
    <!-- TIER -->
    <rect width="66" height="38" rx="6" fill="#1b1b28" stroke="#2d2d40" stroke-width="1"/>
    <text x="33" y="14" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="#9a98ad">TIER</text>
    <text x="33" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="${color}">${tier}</text>

    <!-- LEVEL -->
    <g transform="translate(74, 0)">
      <rect width="66" height="38" rx="6" fill="#1b1b28" stroke="#2d2d40" stroke-width="1"/>
      <text x="33" y="14" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="#9a98ad">LEVEL</text>
      <text x="33" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="14" font-weight="bold" fill="#ffffff">${level}</text>
    </g>

    <!-- TYPE -->
    <g transform="translate(148, 0)">
      <rect width="66" height="38" rx="6" fill="#1b1b28" stroke="#2d2d40" stroke-width="1"/>
      <text x="33" y="14" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="#9a98ad">TYPE</text>
      <text x="33" y="30" text-anchor="middle" font-family="ui-monospace, monospace" font-size="12" font-weight="bold" fill="${color}">${type}</text>
    </g>
  </g>

  <!-- Power & Health -->
  <g transform="translate(18, 266)">
    <rect width="103" height="42" rx="6" fill="#1b1b28" stroke="#2d2d40" stroke-width="1"/>
    <text x="51" y="15" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="#9a98ad">POWER</text>
    <text x="51" y="33" text-anchor="middle" font-family="ui-monospace, monospace" font-size="16" font-weight="bold" fill="#ffd166">⚡ ${power}</text>

    <g transform="translate(111, 0)">
      <rect width="103" height="42" rx="6" fill="#1b1b28" stroke="#2d2d40" stroke-width="1"/>
      <text x="51" y="15" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="#9a98ad">HEALTH</text>
      <text x="51" y="33" text-anchor="middle" font-family="ui-monospace, monospace" font-size="16" font-weight="bold" fill="#ff6b6b">♥ ${health}</text>
    </g>
  </g>

  <!-- Footer Tag -->
  <text x="125" y="328" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="#6c6a82" letter-spacing="0.5">T${tier} ${tierName.toUpperCase()} · ${type.toUpperCase()}</text>
</svg>`;
}

async function run() {
  console.log(`Processing art for all ${beasts.length} beasts...`);
  const manifest = {};
  let onchainCount = 0;
  let customCount = 0;

  for (const b of beasts) {
    const id = String(b.id);
    const num = Number(id);
    const existingSvgPath = join(ART_DIR, `${id}.svg`);
    const rootSvgPath = join(PUBLIC_DIR, `${id}.svg`);

    // Check if we already have an authentic onchain SVG file in public/beasts/art/ or public/beasts/
    if (existsSync(existingSvgPath) && readFileSync(existingSvgPath, 'utf8').includes('data-play-anchor')) {
      manifest[id] = `${id}.svg`;
      onchainCount++;
      continue;
    }
    if (existsSync(rootSvgPath) && readFileSync(rootSvgPath, 'utf8').includes('data-play-anchor')) {
      writeFileSync(existingSvgPath, readFileSync(rootSvgPath));
      manifest[id] = `${id}.svg`;
      onchainCount++;
      continue;
    }

    // If it's a canonical beast (1..75), try fetching genesis token from Sepolia
    let fetched = false;
    if (num >= 1 && num <= 75) {
      try {
        const genesisRes = await rpcCall('starknet_call', [
          {
            contract_address: NFT_CONTRACT,
            entry_point_selector: GET_GENESIS_SELECTOR,
            calldata: ['0x' + num.toString(16)],
          },
          'latest',
        ]);
        if (genesisRes && genesisRes[0] && BigInt(genesisRes[0]) !== 0n) {
          const genesisTokenId = genesisRes[0];
          const uriRes = await rpcCall('starknet_call', [
            {
              contract_address: NFT_CONTRACT,
              entry_point_selector: TOKEN_URI_SELECTOR,
              calldata: toU256Calldata(genesisTokenId),
            },
            'latest',
          ]);
          if (uriRes && uriRes.length > 0) {
            const rawString = decodeByteArray(uriRes);
            let parsed;
            if (rawString.startsWith('data:application/json;base64,')) {
              parsed = JSON.parse(Buffer.from(rawString.slice('data:application/json;base64,'.length), 'base64').toString('utf8'));
            } else if (rawString.startsWith('data:application/json,')) {
              parsed = JSON.parse(decodeURIComponent(rawString.slice('data:application/json,'.length)));
            } else {
              parsed = JSON.parse(rawString);
            }
            if (parsed.image && parsed.image.startsWith('data:image/svg+xml;base64,')) {
              const svgData = Buffer.from(parsed.image.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
              writeFileSync(existingSvgPath, svgData);
              writeFileSync(rootSvgPath, svgData);
              writeFileSync(join(FALLBACK_DIR, `${id}.svg`), svgData);
              manifest[id] = `${id}.svg`;
              b.tokenId = String(BigInt(genesisTokenId));
              fetched = true;
              onchainCount++;
              console.log(`✓ Fetched onchain SVG for #${id} ${b.name}`);
            }
          }
        }
      } catch (err) {
        // Fall back to generation
      }
    }

    if (!fetched) {
      // Generate authentic high-res pixel creature card SVG
      const svg = generatePixelCreatureSvg(b);
      writeFileSync(existingSvgPath, svg);
      writeFileSync(rootSvgPath, svg);
      writeFileSync(join(FALLBACK_DIR, `${id}.svg`), svg);
      manifest[id] = `${id}.svg`;
      customCount++;
      console.log(`+ Generated pixel creature card for #${id} ${b.name}`);
    }
  }

  // Write manifests
  writeFileSync(join(ART_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(PUBLIC_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // Update my-beasts.json with proper art paths and metadata
  const updatedBeasts = beasts.map((b) => {
    const id = String(b.id);
    const num = Number(id);
    const tier = b.rarity || 5;
    const level = b.level || (tier === 1 ? 55 : tier === 2 ? 38 : tier === 3 ? 24 : tier === 4 ? 14 : 5);
    const power = level * (6 - tier);
    const health = 100 + tier * 25;
    return {
      ...b,
      id,
      art: `/beasts/art/${id}.svg`,
      isOnchain: Boolean(manifest[id]),
      level,
      power,
      health,
    };
  });

  writeFileSync(ROSTER_PATH, JSON.stringify({ beasts: updatedBeasts }, null, 2) + '\n');

  console.log('----------------------------------------');
  console.log(`Art baking complete!`);
  console.log(`Onchain SVGs: ${onchainCount}`);
  console.log(`Custom/Generated Pixel SVGs: ${customCount}`);
  console.log(`Total roster: ${beasts.length}`);
  console.log('----------------------------------------');
}

run();
