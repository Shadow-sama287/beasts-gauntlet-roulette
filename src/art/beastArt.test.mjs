import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBeastArt, resolveBeastArtSync, withTimeout } from './beastArt.js';

test('resolveBeastArt: resolves local art for mapped beasts', async () => {
  const beast = { id: '1', name: 'Warlock', rarity: 1 };
  const res = await resolveBeastArt(beast);
  assert.equal(res.kind, 'local');
  assert.equal(res.src, '/beasts/art/1.svg');

  const syncRes = resolveBeastArtSync(beast);
  assert.equal(syncRes.kind, 'local');
  assert.equal(syncRes.src, '/beasts/art/1.svg');
});

test('resolveBeastArt: falls back to sigil for unmapped beasts', async () => {
  const beast = { id: '99999', name: 'Mystic Beast', rarity: 3 };
  const res = await resolveBeastArt(beast);
  assert.equal(res.kind, 'sigil');
  assert.ok(res.src.startsWith('data:image/svg+xml'));
});

test('withTimeout: resolves before timeout and rejects after timeout', async () => {
  const fast = withTimeout(Promise.resolve('done'), 100);
  assert.equal(await fast, 'done');

  const slow = withTimeout(new Promise((r) => setTimeout(r, 200)), 50);
  await assert.rejects(slow, /Timeout after 50ms/);
});

