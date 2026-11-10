// src/ui/reelStrip.js — Horizontal Card Reel (case-opening style)
import { buildReelStrip, reelTargetX, generateSigilSvg, TIER_COLORS, TIER_NAMES } from '../roulette.js';
import { playTick, playRevealSting } from '../audio.js';

export function createReel(container, options = {}) {
  const {
    winner,
    pool = [],
    rng = Math.random,
    onComplete = () => {},
  } = options;

  container.innerHTML = `
    <div class="reel-viewport">
      <div class="reel-fade-left"></div>
      <div class="reel-pointer-line"></div>
      <div class="reel-strip" id="reel-strip"></div>
      <div class="reel-fade-right"></div>
    </div>
  `;

  const viewport = container.querySelector('.reel-viewport');
  const stripEl = container.querySelector('#reel-strip');

  const viewportW = viewport.clientWidth || (window.innerWidth <= 640 ? 340 : 480);
  const cardW = window.innerWidth <= 640 ? 96 : 110;
  const gap = 10;
  const step = cardW + gap;
  const winnerIndex = 52;
  const stripLength = 64;

  const cards = buildReelStrip(winner, pool, rng, stripLength, winnerIndex);

  // Render cards with lightweight procedural sigil SVGs
  const typeIcons = { Magical: '🪄', Hunter: '🏹', Brute: '🔨' };
  stripEl.innerHTML = cards
    .map((b, idx) => {
      const tierColor = TIER_COLORS[b.rarity] || '#f2f2f2';
      const sigilSvg = generateSigilSvg(b.id, b.name, b.rarity);
      const icon = typeIcons[b.type] || '🐾';
      return `
        <div class="reel-card tier-${b.rarity}" data-index="${idx}" style="width:${cardW}px; border-color:${tierColor};">
          <div class="reel-card-art">${sigilSvg}</div>
          <div class="reel-card-name" style="color:${tierColor}">${b.name.slice(0, 11)}</div>
          <div class="reel-card-meta">${icon} T${b.rarity}</div>
        </div>
      `;
    })
    .join('');

  const targetX = reelTargetX(winnerIndex, cardW, gap, viewportW, rng);

  let isSpinning = true;
  let isFastForwarding = false;
  let rafId = null;
  let lastCardIdx = -1;
  let spinStartTime = performance.now();
  const spinDuration = 4800;

  // Sound ticking as cards cross center pointer
  function trackTicks() {
    if (!isSpinning) return;
    try {
      const transform = getComputedStyle(stripEl).transform;
      if (transform && transform !== 'none') {
        const matrix = new DOMMatrixReadOnly(transform);
        const currentX = matrix.m41;
        const currentCenterCard = Math.floor((-currentX + viewportW / 2) / step);
        if (currentCenterCard !== lastCardIdx && currentCenterCard >= 0) {
          lastCardIdx = currentCenterCard;
          // Pitch rises gently as it progresses toward winner
          const progress = Math.min(1, currentCenterCard / winnerIndex);
          const pitch = 240 + progress * 320;
          playTick(pitch);
        }
      }
    } catch {}
    rafId = requestAnimationFrame(trackTicks);
  }

  // Animate spin
  requestAnimationFrame(() => {
    stripEl.style.transition = `transform ${spinDuration}ms cubic-bezier(0.08, 0.65, 0.1, 1)`;
    stripEl.style.transform = `translateX(${-targetX}px)`;
    rafId = requestAnimationFrame(trackTicks);
  });

  function fastForward() {
    if (!isSpinning || isFastForwarding) return;
    isFastForwarding = true;
    stripEl.style.transition = 'transform 380ms ease-out';
    stripEl.style.transform = `translateX(${-targetX}px)`;
  }

  function handleFinish() {
    if (!isSpinning) return;
    isSpinning = false;
    if (rafId) cancelAnimationFrame(rafId);

    // Highlight winning card, dim others
    const allCards = stripEl.querySelectorAll('.reel-card');
    allCards.forEach((c) => c.classList.add('dimmed'));

    const winningCardEl = stripEl.querySelector(`.reel-card[data-index="${winnerIndex}"]`);
    if (winningCardEl) {
      winningCardEl.classList.remove('dimmed');
      winningCardEl.classList.add('winner-revealed');
    }

    // T1 / T2 Sting & Pause
    const isRare = winner.rarity <= 2;
    if (isRare) {
      playRevealSting(winner.rarity);
      viewport.classList.add('rare-flash');
    }

    const revealDelay = isRare ? 950 : 450;
    setTimeout(() => {
      onComplete();
    }, revealDelay);
  }

  stripEl.addEventListener('transitionend', handleFinish, { once: true });

  return {
    fastForward,
    isSpinning: () => isSpinning,
    destroy: () => {
      isSpinning = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}
