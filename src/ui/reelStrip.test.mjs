// src/ui/reelStrip.test.mjs — Verification of Reel Strip and Centering
import test from 'node:test';
import assert from 'node:assert';
import { buildReelStrip, reelTargetX } from '../roulette.js';
import { calculateReelCenterOffset } from './reelStrip.js';

test('reel verification: winning card is placed at winnerIndex and target lands winner in viewport center', () => {
  const winner = { id: '26', name: 'Griffin', rarity: 1, tier: 1, type: 'Hunter' };
  const pool = [
    { id: '1', name: 'Warlock', rarity: 1 },
    { id: '16', name: 'Banshee', rarity: 4 },
    { id: '71', name: 'Golem', rarity: 5 },
  ];

  const winnerIndex = 42;
  const stripLength = 54;
  const cards = buildReelStrip(winner, pool, Math.random, stripLength, winnerIndex);

  assert.strictEqual(cards.length, stripLength);
  assert.strictEqual(cards[winnerIndex].id, '26');
  assert.strictEqual(cards[winnerIndex].name, 'Griffin');

  // Verify alignment across multiple viewport widths (phone 360px, desktop 480px, wide 720px)
  const configurations = [
    { viewportW: 360, cardW: 110, gap: 12 },
    { viewportW: 480, cardW: 130, gap: 12 },
    { viewportW: 720, cardW: 130, gap: 12 },
  ];

  for (const { viewportW, cardW, gap } of configurations) {
    const step = cardW + gap;
    const targetX = calculateReelCenterOffset(winnerIndex, cardW, gap, viewportW);

    // Center of pointer in viewport is viewportW / 2
    // With strip shifted by -targetX, position of card center in viewport is:
    // cardLeft = winnerIndex * step - targetX
    // cardCenterInViewport = cardLeft + cardW / 2
    const cardLeftInViewport = winnerIndex * step - targetX;
    const cardCenterInViewport = cardLeftInViewport + cardW / 2;
    const pointerX = viewportW / 2;

    assert.strictEqual(cardCenterInViewport, pointerX, `Winning card must center exactly at pointer X for viewport ${viewportW}`);
  }
});
