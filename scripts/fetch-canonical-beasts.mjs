// scripts/fetch-canonical-beasts.mjs — Fetch all 75 canonical Beasts SVGs and metadata from Starknet Sepolia
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const RPC_URL = 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe';
const NFT_CONTRACT = '0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1';
const GET_GENESIS_SELECTOR = '0x0f726785327e8cb474c500d9e19116530b1a84bbf8908ac70813864a530d07b';
const TOKEN_URI_SELECTOR = '0x0226ad7e84c1fe08eb4c525ed93cccadf9517670341304571e66f7c4f95cbe54';

const ART_DIR = resolve('public/beasts/art');
const PUBLIC_DIR = resolve('public/beasts');
const FALLBACK_DIR = resolve('public/beasts/fallback');
mkdirSync(ART_DIR, { recursive: true });
mkdirSync(PUBLIC_DIR, { recursive: true });
mkdirSync(FALLBACK_DIR, { recursive: true });

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

function parseTokenUriString(raw) {
  if (raw.startsWith('data:application/json;base64,')) {
    const json = Buffer.from(raw.slice('data:application/json;base64,'.length), 'base64').toString('utf8');
    return JSON.parse(json);
  }
  if (raw.startsWith('data:application/json,')) {
    return JSON.parse(decodeURIComponent(raw.slice('data:application/json,'.length)));
  }
  return JSON.parse(raw);
}

async function rpcCall(method, params, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      return json.result;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function fetchSpecies(speciesId) {
  const idStr = String(speciesId);
  // 1. Get Genesis Token ID
  const genesisRes = await rpcCall('starknet_call', [
    {
      contract_address: NFT_CONTRACT,
      entry_point_selector: GET_GENESIS_SELECTOR,
      calldata: ['0x' + Number(speciesId).toString(16)],
    },
    'latest',
  ]);
  if (!genesisRes || !genesisRes[0] || BigInt(genesisRes[0]) === 0n) {
    throw new Error(`Species #${speciesId} has no genesis token`);
  }
  const genesisTokenId = genesisRes[0];

  // 2. Get token_uri
  const uriRes = await rpcCall('starknet_call', [
    {
      contract_address: NFT_CONTRACT,
      entry_point_selector: TOKEN_URI_SELECTOR,
      calldata: toU256Calldata(genesisTokenId),
    },
    'latest',
  ]);
  const rawString = decodeByteArray(uriRes);
  const metadata = parseTokenUriString(rawString);
  let svg = null;
  if (metadata.image && metadata.image.startsWith('data:image/svg+xml;base64,')) {
    svg = Buffer.from(metadata.image.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
  } else if (metadata.image && metadata.image.startsWith('data:image/svg+xml;utf8,')) {
    svg = decodeURIComponent(metadata.image.replace('data:image/svg+xml;utf8,', ''));
  } else if (metadata.image && metadata.image.includes('<svg')) {
    svg = metadata.image;
  }

  if (!svg || !svg.includes('</svg>')) {
    throw new Error(`Invalid SVG for species #${speciesId}`);
  }

  return {
    id: idStr,
    name: metadata.name || metadata.attributes?.Beast || `Species #${speciesId}`,
    genesisTokenId: String(BigInt(genesisTokenId)),
    metadata,
    svg,
  };
}

async function main() {
  console.log('--- Fetching all 75 Canonical Beasts from Starknet Sepolia ---');

  // Load existing roster
  const rosterPath = resolve('public/my-beasts.json');
  const roster = JSON.parse(readFileSync(rosterPath, 'utf8'));
  const beasts = roster.beasts;

  const manifest = {};
  // Retain existing manifest
  if (existsSync(join(ART_DIR, 'manifest.json'))) {
    try {
      Object.assign(manifest, JSON.parse(readFileSync(join(ART_DIR, 'manifest.json'), 'utf8')));
    } catch {}
  }

  const batchSize = 6;
  const canonicalResults = new Map();

  for (let i = 1; i <= 75; i += batchSize) {
    const chunk = [];
    for (let j = i; j < i + batchSize && j <= 75; j++) chunk.push(j);
    console.log(`Fetching species ${chunk[0]}..${chunk[chunk.length - 1]}...`);
    
    const results = await Promise.all(
      chunk.map(async (id) => {
        try {
          const data = await fetchSpecies(id);
          return { id, data, ok: true };
        } catch (err) {
          console.error(`Error fetching #${id}:`, err.message);
          return { id, error: err, ok: false };
        }
      })
    );

    for (const r of results) {
      if (r.ok) {
        canonicalResults.set(r.id, r.data);
      }
    }
  }

  console.log(`Successfully fetched ${canonicalResults.size} / 75 canonical beasts!`);

  // Write SVGs to public/beasts/art/, public/beasts/, and public/beasts/fallback/
  for (const [id, data] of canonicalResults.entries()) {
    const filename = `${id}.svg`;
    writeFileSync(join(ART_DIR, filename), data.svg);
    writeFileSync(join(PUBLIC_DIR, filename), data.svg);
    writeFileSync(join(FALLBACK_DIR, filename), data.svg);
    manifest[String(id)] = filename;
  }

  // Ensure all 10012..10041 are also in manifest
  for (let i = 10012; i <= 10041; i++) {
    manifest[String(i)] = `${i}.svg`;
  }

  // Write manifests
  writeFileSync(join(ART_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(PUBLIC_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // Update my-beasts.json with canonical data
  const typeMap = { '0': 'Magical', '1': 'Hunter', '2': 'Brute', 'Magic': 'Magical', 'Hunter': 'Hunter', 'Brute': 'Brute' };

  const updatedBeasts = beasts.map((b) => {
    const num = Number(b.id);
    if (num >= 1 && num <= 75 && canonicalResults.has(num)) {
      const data = canonicalResults.get(num);
      const attrs = data.metadata.attributes || {};
      const tier = attrs.Tier ? Number(attrs.Tier) : (b.rarity || 5);
      const rawType = attrs.Type || b.type;
      const type = typeMap[rawType] || rawType || 'Magical';
      const level = attrs.Level ? Number(attrs.Level) : (b.level || (tier === 1 ? 55 : tier === 2 ? 38 : tier === 3 ? 24 : tier === 4 ? 14 : 5));
      const power = attrs.Power ? Number(attrs.Power) : (b.power || level * (6 - tier));
      const health = attrs.Health ? Number(attrs.Health) : (b.health || 100 + tier * 25);

      return {
        ...b,
        id: String(num),
        name: data.name || b.name,
        rarity: tier,
        type,
        tokenId: data.genesisTokenId,
        art: `/beasts/art/${num}.svg`,
        isOnchain: true,
        catalog: 'Genesis',
        level,
        power,
        health,
      };
    }
    return b;
  });

  writeFileSync(rosterPath, JSON.stringify({ beasts: updatedBeasts }, null, 2) + '\n');
  console.log('Updated public/my-beasts.json and manifests successfully!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
