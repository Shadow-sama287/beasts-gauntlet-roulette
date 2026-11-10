// Run: node --test src/onchain.test.mjs   — offline, no RPC needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toU256Calldata, encodeByteArray, decodeByteArray, decodeDataUri, parseTokenUri } from './onchain.js';

test('u256 split: low/high round trip, BigInt safe', () => {
  const big = (1n << 200n) + 12345n;
  const [lo, hi] = toU256Calldata(big);
  assert.equal((BigInt(hi) << 128n) + BigInt(lo), big);
  assert.deepEqual(toU256Calldata('7'), ['7', '0']);
});

test('ByteArray encode/decode round trip across word boundaries', () => {
  for (const s of ['', 'a', 'x'.repeat(30), 'y'.repeat(31), 'z'.repeat(32), 'data:application/json;utf8,{"name":"Warlock ★"}'.repeat(5)]) {
    assert.equal(decodeByteArray(encodeByteArray(s)), s);
  }
});

test('token_uri: base64 JSON with inline SVG image', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
  const meta = { name: 'Warlock', attributes: [{ trait_type: 'Tier', value: 1 }], image: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
  const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(meta)).toString('base64');
  const p = parseTokenUri(uri);
  assert.equal(p.name, 'Warlock');
  assert.equal(p.imageSvg, svg);
  assert.equal(p.attributes[0].value, 1);
});

test('token_uri: utf8/percent-encoded JSON and raw <svg> image', () => {
  const meta = { name: 'Kraken', image: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' };
  const uri = 'data:application/json;utf8,' + JSON.stringify(meta);
  const p = parseTokenUri(uri);
  assert.equal(p.name, 'Kraken');
  assert.ok(p.imageSvg.startsWith('<svg'));
  const enc = 'data:application/json,' + encodeURIComponent(JSON.stringify(meta));
  assert.equal(parseTokenUri(enc).name, 'Kraken');
});

test('token_uri: http image falls into imageUrl', () => {
  const p = parseTokenUri(JSON.stringify({ name: 'x', image: 'https://example.com/a.png' }));
  assert.equal(p.imageUrl, 'https://example.com/a.png');
  assert.equal(p.imageSvg, null);
  assert.throws(() => decodeDataUri('nope'));
});
