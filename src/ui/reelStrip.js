// src/ui/reelStrip.js — Horizontal Card Reel (case-opening style)
import { buildReelStrip, reelTargetX, generateSigilSvg, TIER_COLORS, TIER_NAMES } from '../roulette.js';
import { playTick, playRevealSting } from '../audio.js';
import { artForBeast, handleArtError } from '../beastLoader.js';

export function calculateReelCenterOffset(winnerIndex, cardW, gap, viewportW) {
  const step = cardW + gap;
  return winnerIndex * step + cardW / 2 - viewportW / 2;
}

export function createReel(container, options = {}) {
  const {
    winner,
    pool = [],
    rng = Math.random,
    onComplete = () => {},
    quickSpin = false,
  } = options;

  container.innerHTML = `
    <div class="reel-viewport">
      <div class="reel-fade-left"></div>
      <div class="reel-pointer-notch" aria-hidden="true">
        <svg viewBox="0 0 24 16" width="24" height="16" fill="var(--gold)">
          <polygon points="0,0 24,0 12,16" />
        </svg>
      </div>
      <div class="reel-strip" id="reel-strip"></div>
      <div class="reel-fade-right"></div>
    </div>
  `;

  const viewport = container.querySelector('.reel-viewport');
  const stripEl = container.querySelector('#reel-strip');

  const viewportW = viewport.clientWidth || (window.innerWidth <= 640 ? 340 : 480);
  const cardW = window.innerWidth <= 640 ? 110 : 130;
  const gap = 12;
  const step = cardW + gap;
  const winnerIndex = 42;
  const stripLength = 54;

  const cards = buildReelStrip(winner, pool, rng, stripLength, winnerIndex);

  // Render cards with real beast portrait art
  const typeIcons = { Magical: 'MAG', Hunter: 'HNT', Brute: 'BRT' };
  stripEl.innerHTML = cards
    .map((b, idx) => {
      const tierColor = TIER_COLORS[b.rarity] || '#f2f2f2';
      const artSrc = artForBeast(b.id) || b.art || `/beasts/art/${b.id}.svg`;
      const typeTag = typeIcons[b.type] || 'WLD';
      return `
        <div class="reel-card tier-${b.rarity}" data-index="${idx}" style="width:${cardW}px; border-color:${tierColor};">
          <div class="reel-card-art">
            <img src="${artSrc}" alt="${b.name}" class="reel-beast-thumb" loading="lazy" data-id="${b.id}" />
          </div>
          <div class="reel-card-name" style="color:${tierColor}">${b.name.slice(0, 11)}</div>
          <div class="reel-card-meta"><span style="color:${tierColor}; font-weight:bold;">T${b.rarity}</span> · <span class="reel-type-pill">${typeTag}</span></div>
        </div>
      `;
    })
    .join('');

  // Fallback handler for any art error on reel cards
  stripEl.querySelectorAll('.reel-beast-thumb').forEach((img) => {
    img.onerror = () => {
      const id = img.dataset.id;
      const found = cards.find((c) => String(c.id) === String(id));
      if (found) {
        handleArtError(img, found);
      }
    };
  });

  // Calculate target offset to center winning card exactly under pointer notch
  const targetX = calculateReelCenterOffset(winnerIndex, cardW, gap, viewportW);

  let isSpinning = true;
  let isFastForwarding = false;
  let rafId = null;
  let lastCardIdx = -1;
  const spinDuration = quickSpin ? 1400 : 4200;

  // Sound ticking and haptics as cards cross center pointer
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

          // Subtle haptic tick on supported mobile devices
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
              navigator.vibrate(8);
            } catch {}
          }
        }
      }
    } catch {}
    rafId = requestAnimationFrame(trackTicks);
  }

  // Animate spin with ease-out cubic bezier
  requestAnimationFrame(() => {
    const ease = quickSpin ? 'cubic-bezier(0.12, 0.8, 0.2, 1)' : 'cubic-bezier(0.08, 0.72, 0.1, 1)';
    stripEl.style.transition = `transform ${spinDuration}ms ${ease}`;
    stripEl.style.transform = `translateX(${-targetX}px)`;
    rafId = requestAnimationFrame(trackTicks);
  });

  function fastForward() {
    if (!isSpinning || isFastForwarding) return;
    isFastForwarding = true;
    stripEl.style.transition = 'transform 350ms ease-out';
    stripEl.style.transform = `translateX(${-targetX}px)`;
  }

  function handleFinish() {
    if (!isSpinning) return;
    isSpinning = false;
    if (rafId) cancelAnimationFrame(rafId);

    // Snap exact center
    stripEl.style.transition = 'none';
    stripEl.style.transform = `translateX(${-targetX}px)`;

    // Highlight winning card, dim others
    const allCards = stripEl.querySelectorAll('.reel-card');
    allCards.forEach((c) => c.classList.add('dimmed'));

    const winningCardEl = stripEl.querySelector(`.reel-card[data-index="${winnerIndex}"]`);
    if (winningCardEl) {
      winningCardEl.classList.remove('dimmed');
      winningCardEl.classList.add('winner-revealed');
    }

    // T1 / T2 Sting & Pause
    const isRare = (winner.rarity || winner.tier) <= 2;
    if (isRare) {
      playRevealSting(winner.rarity || winner.tier);
      viewport.classList.add('rare-flash');
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate([20, 50, 40]);
        } catch {}
      }
    }

    const revealDelay = isRare ? 900 : 400;
    setTimeout(() => {
      onComplete();
    }, revealDelay);
  }

  stripEl.addEventListener('transitionend', handleFinish, { once: true });

  return {
    fastForward,
    isSpinning: () => isSpinning,
    getWinner: () => winner,
    getTargetX: () => targetX,
    destroy: () => {
      isSpinning = false;
      if (rafId) cancelAnimationFrame(rafId);
      stripEl.removeEventListener('transitionend', handleFinish);
    },
  };
}
