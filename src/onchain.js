// src/onchain.js — read-only Beasts NFT access for the browser or Node. Never signs, never sends.
// Layer 2 of beast-onchain skill. The game MUST still run if every function here throws.
//
// Why raw callContract and not a Contract+ABI object: avoids starknet.js version differences (v6/v7/v8 changed
// the Contract constructor). RpcProvider.callContract({contractAddress, entrypoint, calldata}) is stable.
//
// RULES (from the beasts-hackathon skill — the chain wins over this file):
//  - ERC-721 entry points (owner_of, token_uri) take the token id as u256 => calldata [low, high].
//  - Beasts-specific entry points take ONE felt252 id.
//  - Keep token ids as BigInt/strings. Never Number.
//  - Never hardcode token ids; read them from the chain (snapshot step), ids differ between networks.
//  - Cache token_uri results (the event RPC quota is shared).

export const SEPOLIA = {
  nft: '0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1',
  registry: '0x7f6883b4f901ce25aff2b10c876db8dfff68e61ba93102354816519e7fe1f',
};

const MASK128 = (1n << 128n) - 1n;

/** felt252/BigInt token id -> [low, high] calldata strings for u256 entry points. */
export function toU256Calldata(tokenId) {
  const id = BigInt(tokenId);
  return [(id & MASK128).toString(), (id >> 128n).toString()];
}

const hexToBigInt = (h) => BigInt(h);

/**
 * Decode a Cairo ByteArray from raw felts (what a `ByteArray` return looks like in a call result):
 *   [ data_len, ...data (each a bytes31 word, 31 bytes), pending_word, pending_word_len ]
 */
export function decodeByteArray(felts) {
  const f = felts.map(hexToBigInt);
  const dataLen = Number(f[0]);
  const bytes = [];
  const pushWord = (word, len) => {
    for (let i = len - 1; i >= 0; i--) bytes.push(Number((word >> BigInt(8 * i)) & 0xffn));
  };
  for (let i = 0; i < dataLen; i++) pushWord(f[1 + i], 31);
  const pendingWord = f[1 + dataLen];
  const pendingLen = Number(f[2 + dataLen]);
  pushWord(pendingWord, pendingLen);
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** Inverse of decodeByteArray — used by tests. */
export function encodeByteArray(str) {
  const bytes = new TextEncoder().encode(str);
  const full = Math.floor(bytes.length / 31);
  const toHex = (arr) => '0x' + (arr.length ? [...arr].map((b) => b.toString(16).padStart(2, '0')).join('') : '0');
  const out = ['0x' + full.toString(16)];
  for (let i = 0; i < full; i++) out.push(toHex(bytes.slice(i * 31, (i + 1) * 31)));
  const rest = bytes.slice(full * 31);
  out.push(toHex(rest));
  out.push('0x' + rest.length.toString(16));
  return out;
}

const b64decode = (s) => {
  if (typeof atob === 'function') {
    const bin = atob(s);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  return Buffer.from(s, 'base64').toString('utf8');
};

/** Decode a `data:` URI payload (base64, or percent-encoded / raw utf8). Returns a string. */
export function decodeDataUri(uri) {
  const m = /^data:([^,]*?),(.*)$/s.exec(uri);
  if (!m) throw new Error('not a data: URI');
  const [, meta, payload] = m;
  if (/;base64/i.test(meta)) return b64decode(payload);
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

/** token_uri string -> { raw, name, description, attributes, imageSvg|imageUrl }. Handles nested data: URIs. */
export function parseTokenUri(tokenUri) {
  let jsonText = tokenUri;
  if (tokenUri.startsWith('data:')) jsonText = decodeDataUri(tokenUri);
  const meta = JSON.parse(jsonText);
  const out = {
    raw: meta,
    name: meta.name ?? null,
    description: meta.description ?? null,
    attributes: meta.attributes ?? [],
    imageSvg: null,
    imageUrl: null,
  };
  const img = meta.image ?? meta.image_data ?? '';
  if (typeof img === 'string') {
    if (img.startsWith('data:image/svg')) out.imageSvg = decodeDataUri(img);
    else if (img.trim().startsWith('<svg')) out.imageSvg = img;
    else if (img) out.imageUrl = img;
  }
  return out;
}

const cache = new Map();

export const ENTRYPOINT_TOKEN_URI_SELECTOR = '0x226ad7e84c1fe08eb4c525ed93cccadf9517670341304571e66f7c4f95cbe54';

/**
 * Fetch + parse token_uri for one token. Uses standard JSON-RPC starknet_call (zero external packages needed).
 */
export async function fetchBeast({ rpcUrl, nft = SEPOLIA.nft, tokenId }) {
  const key = `${nft}:${BigInt(tokenId)}`;
  if (cache.has(key)) return cache.get(key);

  const endpoint = rpcUrl || 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'starknet_call',
      params: [
        {
          contract_address: nft,
          entry_point_selector: ENTRYPOINT_TOKEN_URI_SELECTOR,
          calldata: toU256Calldata(tokenId),
        },
        'latest',
      ],
    }),
  });
  if (!res.ok) throw new Error(`RPC error: ${res.status}`);
  const json = await res.json();
  if (json.error || !json.result) throw new Error(json.error?.message || 'starknet_call failed');
  const felts = json.result;
  const parsed = parseTokenUri(decodeByteArray(felts));
  cache.set(key, parsed);
  return parsed;
}

/** Wrap anything onchain so a failure degrades to local art instead of breaking the UI. */
export async function safely(promiseFactory, fallback = null) {
  try {
    return await promiseFactory();
  } catch (err) {
    console.warn('[onchain] falling back:', err?.message || err);
    return fallback;
  }
}
