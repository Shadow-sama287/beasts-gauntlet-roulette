// src/ui/transition.js — Arcade Shutter Page Transition with Pixel Seam & Rotating Battle Tips
import { playTick } from '../audio.js';

let overlayEl = null;
let tipIndex = 0;

const ARCADE_TIPS = [
  '⚔️ COMBAT TIP: Brutes beat Hunters (Bludgeon crushes Hide)',
  '🏹 COMBAT TIP: Hunters beat Magical (Blade pierces Cloth)',
  '🪄 COMBAT TIP: Magical beats Brutes (Magic melts Metal Armor)',
  '🥋 DOJO TIP: High rhythm combo unlocks Gauntlet Companion Strike Bonus',
  '📖 DEX TIP: Defeating named beasts records them into your Beast Dex',
  '🎰 ROULETTE TIP: 10 Essence triggers Lucky Spin with rare tier focus',
];

function ensureOverlay() {
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'arcade-page-transition';
    overlayEl.className = 'arcade-transition-overlay';
    overlayEl.innerHTML = `
      <div class="transition-scanlines"></div>
      <div class="transition-shutter top"></div>
      <div class="transition-shutter bottom"></div>
      <div class="transition-seam-flash"></div>
      <div class="transition-center-container">
        <div class="transition-marquee">▶ INSERT COIN · STAGE LOADING ◀</div>
        <div class="transition-tip-text" id="transition-tip-box"></div>
        <div class="transition-progress-track">
          <div class="transition-progress-bar"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);
  }
  return overlayEl;
}

export function forceDismissTransition() {
  if (overlayEl) {
    overlayEl.classList.remove('active', 'slow-load');
  }
}

export function trigger8BitTransition(onSwap) {
  // If reduced motion is preferred, swap immediately without visual shutter
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (onSwap) {
      try {
        onSwap();
      } catch (err) {
        console.error('Reduced-motion swap error:', err);
      }
    }
    return;
  }

  const overlay = ensureOverlay();
  const tipBox = overlay.querySelector('#transition-tip-box');
  if (tipBox) {
    tipBox.textContent = ARCADE_TIPS[tipIndex % ARCADE_TIPS.length];
    tipIndex++;
  }

  // Audio chirp on shutter close
  try {
    playTick(580);
  } catch {}

  overlay.classList.remove('active', 'slow-load');
  // Force reflow
  void overlay.offsetWidth;
  overlay.classList.add('active');

  let swapped = false;

  // Show slow-load coin bar and tips only if stage transition takes > 280ms
  const slowTimer = setTimeout(() => {
    if (!swapped) {
      overlay.classList.add('slow-load');
    }
  }, 280);

  // Hard safety watchdog: guarantee the overlay is never stuck indefinitely!
  const hardSafetyTimer = setTimeout(() => {
    overlay.classList.remove('active', 'slow-load');
  }, 750);

  // Shutter closes in ~200ms, perform content swap at mid-point
  setTimeout(() => {
    swapped = true;
    clearTimeout(slowTimer);

    if (onSwap) {
      try {
        onSwap();
      } catch (err) {
        console.error('Stage swap exception:', err);
      }
    }

    // Flash at the seam
    const seam = overlay.querySelector('.transition-seam-flash');
    if (seam) {
      seam.classList.add('flash');
      setTimeout(() => seam.classList.remove('flash'), 100);
    }

    // Shutters open in reverse, total transition time ~400ms
    setTimeout(() => {
      clearTimeout(hardSafetyTimer);
      overlay.classList.remove('active', 'slow-load');
    }, 200);
  }, 200);
}
