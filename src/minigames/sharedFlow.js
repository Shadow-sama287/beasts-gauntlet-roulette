// src/minigames/sharedFlow.js
// Shared intro, 3-2-1 countdown, and juice wrapper for all minigames.

import { runMiniGame } from './runner.js';

let comboCounter = 0;

export async function executeMiniGameWithFlow(game, ctx, onResult) {
  const mount = ctx.mount;
  mount.innerHTML = '';

  // 1. Check if seen before
  let seen = false;
  try {
    seen = Boolean(localStorage.getItem(`br.seen_${game.id}`));
    localStorage.setItem(`br.seen_${game.id}`, '1');
  } catch {}

  // Generous intro read time so player can understand the objective and controls
  const introTime = seen ? 2200 : 3200;
  let skipped = false;

  const skipHandler = (e) => {
    if (e.type === 'click' || e.code === 'Space' || e.key === 'Enter') {
      skipped = true;
    }
  };
  mount.addEventListener('click', skipHandler);
  window.addEventListener('keydown', skipHandler);

  const cancellableWait = async (ms) => {
    const start = Date.now();
    while (Date.now() - start < ms && !skipped) {
      await new Promise((r) => setTimeout(r, 40));
    }
  };

  // 2. Intro card
  const introEl = document.createElement('div');
  introEl.className = 'minigame-intro-overlay';
  introEl.innerHTML = `
    <div class="intro-card-box arcade-card">
      <div class="intro-badge">TAME MINIGAME</div>
      <div class="intro-title">${game.title}</div>
      <div class="intro-blurb">${game.blurb}</div>
      <div class="intro-controls">🕹️ CONTROLS: <strong>${game.controls}</strong></div>
      <div class="intro-skip-prompt">⚡ Tap <span class="kbd-hint">or Space </span>to skip countdown</div>
    </div>
  `;
  mount.appendChild(introEl);

  await cancellableWait(introTime);
  if (!mount.contains(introEl)) {
    mount.removeEventListener('click', skipHandler);
    window.removeEventListener('keydown', skipHandler);
    return;
  }

  // 3. 3-2-1 Countdown (skip if requested)
  if (!skipped) {
    const countdownEl = document.createElement('div');
    countdownEl.className = 'minigame-countdown-overlay';
    introEl.replaceWith(countdownEl);

    const counts = ['3', '2', '1', 'GO!'];
    for (let i = 0; i < counts.length; i++) {
      if (skipped) break;
      countdownEl.textContent = counts[i];
      countdownEl.classList.remove('pulse');
      void countdownEl.offsetWidth; // force re-flow for animation
      countdownEl.classList.add('pulse');
      ctx.sfx?.tick?.(220 + i * 80);
      await cancellableWait(650);
      if (!mount.contains(countdownEl)) {
        mount.removeEventListener('click', skipHandler);
        window.removeEventListener('keydown', skipHandler);
        return;
      }
    }
    countdownEl.remove();
  } else {
    introEl.remove();
  }

  mount.removeEventListener('click', skipHandler);
  window.removeEventListener('keydown', skipHandler);

  // 4. Run Game
  const gameMount = document.createElement('div');
  gameMount.className = 'minigame-active-mount';
  mount.appendChild(gameMount);

  let autoTimer = null;
  const gamePromise = runMiniGame(game, {
    ...ctx,
    mount: gameMount,
  });

  if (ctx.autoSpinEnabled) {
    autoTimer = setTimeout(() => {
      // Hands-free stage demo auto-complete
      if (typeof ctx.finish === 'function') {
        ctx.finish({ success: true, grade: 'perfect', score: 10 });
      }
    }, 1800);
  }

  const result = await gamePromise;
  if (autoTimer) clearTimeout(autoTimer);

  // 5. Juice and Combo
  if (result.grade === 'perfect') {
    comboCounter++;
    ctx.sfx?.perfect?.();
  } else if (result.success) {
    comboCounter = 0;
    ctx.sfx?.good?.();
  } else {
    comboCounter = 0;
    ctx.sfx?.bad?.();
  }

  // Grade Popup
  const gradeOverlay = document.createElement('div');
  gradeOverlay.className = `minigame-grade-popup grade-${result.grade}`;
  gradeOverlay.innerHTML = `
    <div class="grade-text">${result.grade.toUpperCase()}!</div>
    ${comboCounter >= 2 ? `<div class="combo-text">🔥 ${comboCounter}x PERFECT COMBO!</div>` : ''}
  `;
  mount.appendChild(gradeOverlay);

  await new Promise((resolve) => setTimeout(resolve, 550));
  gradeOverlay.remove();
  gameMount.remove();

  onResult(result);
}
