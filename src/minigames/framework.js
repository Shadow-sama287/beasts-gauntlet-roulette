// src/minigames/framework.js — Full-Screen Minigame Framework
// 100dvh takeover, 3 zones (Top HUD, >=60% Play Field, Thumb Zone), State Machine, Watchdog & Error Boundary.

import { getTierMinigame } from './tierGames.js';
import { artForBeast, handleArtError } from '../beastLoader.js';
import { TIER_COLORS, TIER_NAMES } from '../roulette.js';
import { renderErrorRecovery } from '../ui/errorBoundary.js';

/**
 * Mounts and executes a full-screen minigame.
 * @param {HTMLElement} container - The container for full-screen takeover
 * @param {object} options
 * @param {object} options.beast - Target beast
 * @param {number} options.tier - Beast rarity tier (1..5)
 * @param {boolean} options.lucky - Whether Lucky Spin 1.6x is active
 * @param {boolean} options.isTutorial - First-run assist guarantee
 * @param {number} options.difficulty - Difficulty scaling (0.7 .. 1.3)
 * @param {object} options.sfx - Sound effects
 * @param {function} options.onComplete - Callback when game finishes ({ success, grade, score })
 * @returns {object} handle with destroy()
 */
export function mountFullScreenMinigame(container, options = {}) {
  const {
    beast,
    tier = beast?.rarity || beast?.tier || 5,
    lucky = false,
    isTutorial = false,
    difficulty = 1.0,
    isNew = false,
    friendliness = 10,
    sfx = {},
    onComplete = () => {},
  } = options;

  let destroyed = false;
  let currentState = 'INTRO'; // 'INTRO' | 'HINT' | 'COUNTDOWN' | 'PLAY' | 'RESULT'
  let gameController = null;
  let watchdogTimer = null;
  let prepWatchdog = null;
  let countdownTimer = null;
  let introTimer = null;
  let hintTimer = null;
  let progressVal = 0;
  let combo = 0;
  let showDebug = Boolean(typeof window !== 'undefined' && window.location?.search && window.location.search.includes('debug'));

  const tierColor = TIER_COLORS[tier] || '#f2f2f2';
  const tierName = TIER_NAMES[tier] || 'Common';
  const beastArt = artForBeast(beast.id) || beast.art || `/beasts/art/${beast.id}.svg`;
  const tierDef = getTierMinigame(tier);

  // Check if first time viewing this minigame
  let isFirstTime = false;
  try {
    const key = `br.seen_${tierDef.id}`;
    if (!localStorage.getItem(key)) {
      isFirstTime = true;
      localStorage.setItem(key, '1');
    }
  } catch {}

  // 1. Structure the full-screen view
  container.innerHTML = `
    <div class="minigame-fullscreen-scene tier-${tier}">
      <!-- 1. TOP HUD ZONE -->
      <header class="minigame-hud-zone" id="mg-hud-header" title="Long press for debug overlay">
        <div class="minigame-hud-left">
          <span class="badge-tag" style="background:${tierColor}22; color:${tierColor}; border:1px solid ${tierColor}88;">
            T${tier} ${tierName.toUpperCase()}
          </span>
          <span class="minigame-beast-name">${beast.name}</span>
          ${lucky ? '<span class="badge-tag lucky-pulse" style="background:#ffd15c; color:#000; font-weight:bold;">★ LUCKY 1.6x</span>' : ''}
          ${isTutorial ? '<span class="badge-tag" style="background:#3ecf6e22; color:#3ecf6e; border:1px solid #3ecf6e;">TUTORIAL ASSIST</span>' : ''}
        </div>

        <div class="minigame-hud-right">
          <!-- TAMING Progress Bar -->
          <div class="taming-meter-container">
            <div class="taming-meter-header">
              <span class="taming-label">TAMING</span>
              <span class="taming-pct num" id="taming-pct-text">0%</span>
            </div>
            <div class="taming-meter-track">
              <div class="taming-meter-fill" id="taming-meter-bar" style="background:${tierColor}; width:0%;"></div>
            </div>
          </div>
        </div>
      </header>

      <!-- 2. PLAY FIELD (At least 60% of viewport height) -->
      <main class="minigame-play-field" id="minigame-field">
        <!-- Floating Grade Slot -->
        <div class="minigame-grade-slot" id="grade-slot"></div>

        <!-- Centerpiece Beast with Aura & Reactions -->
        <div class="minigame-beast-centerpiece" id="beast-centerpiece">
          <div class="minigame-beast-aura" style="border-color:${tierColor}; box-shadow:0 0 35px ${tierColor}44;"></div>
          <img id="minigame-hero-art" src="${beastArt}" alt="${beast.name}" class="minigame-beast-img bounce-idle" />
        </div>

        <!-- Dynamic Interaction Canvas / Controller Mount -->
        <div class="minigame-canvas-mount" id="canvas-mount"></div>

        <!-- Overlays (Intro, Hint, Countdown, Result) -->
        <div class="minigame-overlay-slot" id="overlay-slot"></div>

        <!-- Debug Overlay Slot -->
        <div id="mg-debug-slot"></div>
      </main>

      <!-- 3. BOTTOM THUMB ZONE (Controls & Hint) -->
      <footer class="minigame-thumb-zone" id="mg-thumb-zone">
        <div class="minigame-one-line-hint" id="minigame-hint-line">
          ${tierDef.blurb}
        </div>
        <div id="mg-thumb-controls-slot" style="width:100%;">
          <div class="minigame-prep-pill">PREPARING ENCOUNTER…</div>
        </div>
      </footer>
    </div>
  `;

  const fieldEl = container.querySelector('#minigame-field');
  const canvasMount = container.querySelector('#canvas-mount');
  const overlaySlot = container.querySelector('#overlay-slot');
  const gradeSlot = container.querySelector('#grade-slot');
  const tamingBar = container.querySelector('#taming-meter-bar');
  const tamingText = container.querySelector('#taming-pct-text');
  const beastImg = container.querySelector('#minigame-hero-art');
  const beastFrame = container.querySelector('#beast-centerpiece');
  const hintLine = container.querySelector('#minigame-hint-line');
  const debugSlot = container.querySelector('#mg-debug-slot');
  const hudHeader = container.querySelector('#mg-hud-header');

  // Beast image fallback using unified handler
  if (beastImg) {
    beastImg.onerror = () => handleArtError(beastImg, beast);
  }

  // Debug overlay update
  function updateDebugOverlay() {
    if (!showDebug || !debugSlot) return;
    debugSlot.innerHTML = `
      <div class="minigame-debug-overlay">
        <div><strong>DEBUG OVERLAY</strong></div>
        <div>STATE: ${currentState}</div>
        <div>DIFF: ${difficulty.toFixed(2)}</div>
        <div>BEAST: #${beast.id} (${beast.name})</div>
        <div>COMBO: ${combo}x</div>
      </div>
    `;
  }
  if (showDebug) updateDebugOverlay();

  // Long-press on HUD toggles debug overlay
  let hudPressTimer = null;
  hudHeader.addEventListener('pointerdown', () => {
    hudPressTimer = setTimeout(() => {
      showDebug = !showDebug;
      if (!showDebug && debugSlot) debugSlot.innerHTML = '';
      else updateDebugOverlay();
    }, 800);
  });
  hudHeader.addEventListener('pointerup', () => clearTimeout(hudPressTimer));
  hudHeader.addEventListener('pointercancel', () => clearTimeout(hudPressTimer));

  // Update TAMING progress and beast reaction
  function updateProgress(p) {
    progressVal = Math.max(0, Math.min(1.0, p));
    if (tamingBar) tamingBar.style.width = `${Math.round(progressVal * 100)}%`;
    if (tamingText) tamingText.textContent = `${Math.round(progressVal * 100)}%`;

    if (beastFrame) {
      if (progressVal >= 0.85) {
        beastFrame.classList.add('slump-near-success');
      } else if (progressVal >= 0.4) {
        beastFrame.classList.add('struggle-pulse');
      }
    }
  }

  // Hit reaction flinch
  function triggerFlinch() {
    if (beastImg) {
      beastImg.classList.remove('beast-flinch');
      void beastImg.offsetWidth;
      beastImg.classList.add('beast-flinch');
    }
  }

  // Floating grade popup and combo tracking
  function triggerGrade(grade) {
    if (destroyed || !gradeSlot) return;
    if (grade === 'perfect' || grade === 'good') {
      combo++;
      if (grade === 'perfect' && fieldEl) {
        fieldEl.classList.remove('minigame-screen-shake');
        void fieldEl.offsetWidth;
        fieldEl.classList.add('minigame-screen-shake');
      }
    } else {
      combo = 0;
    }

    const popup = document.createElement('div');
    popup.className = `minigame-grade-popup ${grade}`;
    popup.innerHTML = `
      ${grade.toUpperCase()}!
      ${combo >= 2 ? `<div class="minigame-combo-banner">★ ${combo}x COMBO</div>` : ''}
    `;
    gradeSlot.innerHTML = '';
    gradeSlot.appendChild(popup);
    setTimeout(() => popup.remove(), 700);

    if (showDebug) updateDebugOverlay();
  }

  // Danger feedback (heartbeat + red screen vignette)
  function triggerDanger() {
    if (destroyed || !fieldEl) return;
    fieldEl.classList.add('minigame-danger-vignette');
    sfx?.tick?.(140);
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(35); } catch {}
    }
  }

  // Confetti burst for new beast unlock celebration
  function spawnConfettiBurst(targetSlot) {
    if (typeof document === 'undefined' || !targetSlot) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'minigame-confetti-canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '25';
    targetSlot.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const w = (canvas.width = targetSlot.clientWidth || 360);
    const h = (canvas.height = targetSlot.clientHeight || 500);

    const colors = ['#f5c542', '#3ecf6e', '#3d8bff', '#a45cff', '#ff5e94', '#ffffff'];
    const pieces = Array.from({ length: 54 }, () => ({
      x: w / 2,
      y: h * 0.4,
      vx: (Math.random() - 0.5) * 480,
      vy: -Math.random() * 380 - 100,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 10,
      alpha: 1.0,
    }));

    let last = performance.now();
    let raf = null;

    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);

      let alive = 0;
      for (const p of pieces) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 440 * dt; // gravity
        p.rot += p.vRot * dt;
        p.alpha -= 0.42 * dt;

        if (p.alpha > 0) {
          alive++;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
      }

      if (alive > 0) {
        raf = requestAnimationFrame(loop);
      } else {
        canvas.remove();
      }
    }
    raf = requestAnimationFrame(loop);
  }

  // Handle completion
  function handleGameComplete({ success, grade = 'hit', score = 10 }) {
    if (destroyed) return;
    currentState = 'RESULT';
    clearWatchdog();
    if (fieldEl) fieldEl.classList.remove('minigame-danger-vignette');

    // Immediately stop and destroy game controller so loop, sounds and updates halt
    if (gameController) {
      try {
        if (typeof gameController.destroy === 'function') {
          gameController.destroy();
        }
      } catch (err) {
        console.warn('Error destroying minigame controller on complete:', err);
      }
      gameController = null;
    }

    // Freeze & clear canvas mount so minigame cannot run in background
    if (canvasMount) {
      canvasMount.innerHTML = '';
      canvasMount.style.pointerEvents = 'none';
    }

    // Hide beast centerpiece and thumb controls so result banner has full focus without visual clutter
    if (beastFrame) {
      beastFrame.style.display = 'none';
    }
    const thumbZone = container.querySelector('#mg-thumb-zone');
    if (thumbZone) {
      thumbZone.style.display = 'none';
    }

    // If tutorial assist is active on first spin, guarantee success!
    const effectiveSuccess = isTutorial ? true : success;
    const effectiveGrade = isTutorial && !success ? 'hit' : grade;

    if (effectiveSuccess) {
      updateProgress(1.0);
      sfx?.catchSound?.(tier);
      showResultBanner(true, effectiveGrade);
    } else {
      sfx?.missSound?.();
      showResultBanner(false, 'miss');
    }

    if (showDebug) updateDebugOverlay();
  }

  function showResultBanner(success, grade) {
    overlaySlot.innerHTML = `
      <div class="minigame-result-modal-box arcade-card ${success ? (isNew ? 'success-gold new-beast-glow-box' : 'duplicate-box') : 'escaped-smoke'}">
        ${success ? (
          isNew 
            ? `<div class="pixel-tag new-beast-tag" style="margin-bottom:8px;">★ NEW BEAST DISCOVERED & TAMED! ★</div>`
            : `<div class="pixel-tag duplicate-tame-tag" style="margin-bottom:8px;">TAMING COMPLETE · DUPLICATE</div>`
        ) : `<div class="pixel-tag" style="background:#280c10; color:var(--bad); border:1px solid var(--bad); margin-bottom:8px;">✕ CAPTURE FAILED ✕</div>`}

        <div class="minigame-result-card-flip">
          <div class="minigame-result-portrait-frame" style="border-color:${success ? (isNew ? 'var(--gold)' : 'var(--line)') : 'var(--bad)'};">
            <img id="mg-result-art" src="${beastArt}" alt="${beast.name}" class="${!success ? 'silhouette' : ''}" />
          </div>
        </div>

        <h2 class="arcade-title" style="font-size:1.6rem; color:${success ? (isNew ? 'var(--gold)' : 'var(--text)') : 'var(--bad)'}; margin:6px 0 2px;">
          ${success ? `${beast.name} TAMED!` : `${beast.name} ESCAPED!`}
        </h2>

        <div style="font-size:0.85rem; color:${isNew ? tierColor : 'var(--muted)'}; font-weight:bold; margin-bottom:6px;">
          Tier ${tier} · ${beast.type || 'Hunter'} Beast
        </div>

        ${success && isNew ? `
          <div style="margin: 8px 0;">
            <span class="friendliness-stat-badge">♥ INITIAL FRIENDLINESS: ${friendliness}%</span>
          </div>
        ` : ''}

        <p style="font-size:0.82rem; color:var(--muted); line-height:1.4; margin-bottom:14px;">
          ${success 
            ? (isNew 
                ? `First-time capture! Successfully bonded with ${beast.name}. Added to Beast Dex with +${friendliness}% Attack & Defense Boost in Gauntlet Camp!`
                : `Duplicate catch: +10 Credits & +${6 - tier} Essence awarded! Existing Friendliness stat preserved.`)
            : `${beast.name} slipped away into the shadows. Consolation: +5 Credits & +1 Essence awarded!`
          }
        </p>

        <button id="btn-result-continue" class="btn-primary arcade-primary-btn" style="width:100%; height:50px; font-size:1.05rem;">
          Continue (Space) ▶
        </button>
      </div>
    `;

    // Celebratory visual effects for unlocking a NEW beast
    if (success && isNew && fieldEl) {
      spawnConfettiBurst(fieldEl);
    }

    const resImg = overlaySlot.querySelector('#mg-result-art');
    if (resImg) resImg.onerror = () => handleArtError(resImg, beast);

    const contBtn = overlaySlot.querySelector('#btn-result-continue');
    contBtn.onclick = () => {
      destroy();
      onComplete({ success, grade, score: success ? 20 : 5 });
    };
  }

  // 3-second Watchdog during setup: guarantees game reaches PLAY
  prepWatchdog = setTimeout(() => {
    if (currentState !== 'PLAY' && currentState !== 'RESULT' && !destroyed) {
      console.warn('Minigame prep watchdog: advancing to PLAY');
      if (overlaySlot) overlaySlot.innerHTML = '';
      startPlay();
    }
  }, 3500);

  // State Machine Step 1: INTRO
  function startIntro() {
    currentState = 'INTRO';
    overlaySlot.innerHTML = `
      <div class="minigame-intro-card arcade-card">
        <div class="badge-tag" style="background:${tierColor}22; color:${tierColor}; border:1px solid ${tierColor}66;">
          ★ TIER ${tier} ${tierName.toUpperCase()} ENCOUNTER ★
        </div>
        <h2 class="arcade-title" style="color:var(--text); font-size:1.4rem; margin:6px 0;">${beast.name}</h2>
        <div style="font-size:0.85rem; color:var(--muted);">${beast.type || 'Wild'} Beast #${beast.id}</div>
        <div style="margin-top:10px; font-size:0.8rem; color:var(--gold); display:flex; align-items:center; justify-content:center; gap:6px;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <span>Preparing Taming Chamber…</span>
        </div>
      </div>
    `;
    sfx?.tick?.(440);
    if (showDebug) updateDebugOverlay();

    introTimer = setTimeout(() => {
      if (destroyed) return;
      if (isFirstTime) {
        startHint();
      } else {
        startCountdown();
      }
    }, 1200);
  }

  // State Machine Step 2: HINT (first time only)
  function startHint() {
    currentState = 'HINT';
    overlaySlot.innerHTML = `
      <div class="minigame-intro-card arcade-card">
        <div style="color:var(--gold); font-weight:bold; font-size:0.95rem; margin-bottom:4px;">HOW TO TAME:</div>
        <div style="font-size:0.9rem; color:var(--text); line-height:1.4; margin-bottom:12px;">${tierDef.blurb}</div>
        <div style="font-size:0.85rem; color:var(--t4); font-weight:bold;">CONTROLS: ${tierDef.controls}</div>
        <button id="btn-skip-hint" class="btn-ghost" style="margin-top:12px; font-size:0.75rem; border:1px solid var(--line);">
          Tap to start
        </button>
      </div>
    `;
    if (showDebug) updateDebugOverlay();

    const skipBtn = overlaySlot.querySelector('#btn-skip-hint');
    const advance = () => {
      clearTimeout(hintTimer);
      startCountdown();
    };
    if (skipBtn) skipBtn.onclick = advance;
    hintTimer = setTimeout(advance, 2200);
  }

  // State Machine Step 3: COUNTDOWN (3 - 2 - 1 - GO)
  function startCountdown() {
    currentState = 'COUNTDOWN';
    const counts = ['3', '2', '1', 'TAME!'];
    let idx = 0;

    overlaySlot.innerHTML = `<div class="minigame-countdown-number" id="countdown-num">3</div>`;
    const numEl = overlaySlot.querySelector('#countdown-num');
    if (showDebug) updateDebugOverlay();

    function tick() {
      if (destroyed) return;
      if (idx < counts.length) {
        numEl.textContent = counts[idx];
        numEl.classList.remove('pulse');
        void numEl.offsetWidth;
        numEl.classList.add('pulse');
        sfx?.tick?.(280 + idx * 80);
        idx++;
        countdownTimer = setTimeout(tick, 600);
      } else {
        overlaySlot.innerHTML = '';
        startPlay();
      }
    }
    tick();
  }

  // State Machine Step 4: PLAY
  function startPlay() {
    if (prepWatchdog) clearTimeout(prepWatchdog);
    currentState = 'PLAY';
    startWatchdog();
    if (showDebug) updateDebugOverlay();

    try {
      gameController = tierDef.factory(canvasMount, {
        beast,
        tier,
        lucky,
        difficulty,
        onProgress: (p) => {
          updateProgress(p);
          triggerFlinch();
        },
        onGrade: triggerGrade,
        onDanger: triggerDanger,
        onComplete: handleGameComplete,
        sfx,
      });

      // Contextual Thumb Zone Controls based on minigame archetype
      const thumbSlot = container.querySelector('#mg-thumb-controls-slot');
      if (thumbSlot) {
        if (tierDef.controlsType === '3lanes') {
          thumbSlot.innerHTML = `
            <div class="minigame-3lane-bar">
              <button id="btn-lane-0" class="btn-primary minigame-lane-btn" style="background:#192038; border:1px solid #3d8bff; color:#8ab4f8;">◀ LEFT (A)</button>
              <button id="btn-lane-1" class="btn-primary minigame-lane-btn" style="background:#192922; border:1px solid #3ecf6e; color:#7ee787;">▲ MID (W)</button>
              <button id="btn-lane-2" class="btn-primary minigame-lane-btn" style="background:#332218; border:1px solid #ffaa33; color:#ffc078;">RIGHT ▶ (D)</button>
            </div>
          `;
          const wireLaneBtn = (btnId, laneIdx) => {
            const btn = thumbSlot.querySelector(btnId);
            if (!btn) return;
            const handleHit = (e) => {
              e.preventDefault();
              gameController?.hitLane?.(laneIdx);
            };
            btn.addEventListener('pointerdown', handleHit);
            btn.addEventListener('click', handleHit);
          };
          wireLaneBtn('#btn-lane-0', 0);
          wireLaneBtn('#btn-lane-1', 1);
          wireLaneBtn('#btn-lane-2', 2);
        } else if (tierDef.controlsType === 'drag') {
          thumbSlot.innerHTML = `
            <div class="minigame-drag-guide-pill">
              <span class="drag-pulse-icon">👆</span> TOUCH & DRAG CAPTURE RING ON SCREEN TO TAME
            </div>
          `;
        } else {
          thumbSlot.innerHTML = `
            <button id="btn-thumb-action" class="btn-primary minigame-primary-action-btn" style="height:54px; width:100%; font-size:1.1rem;">
              ${tierDef.controls}
            </button>
          `;
          const btn = thumbSlot.querySelector('#btn-thumb-action');
          if (btn && gameController?.triggerInput) {
            const handleAction = (e) => {
              e.preventDefault();
              gameController.triggerInput();
            };
            btn.addEventListener('pointerdown', handleAction);
            btn.addEventListener('click', handleAction);
          }
        }
      }
    } catch (err) {
      console.error('Failed to mount minigame controller:', err);
      renderErrorRecovery(overlaySlot, err, {
        onRetry: () => startPlay(),
        onReset: () => handleGameComplete({ success: true, grade: 'hit', score: 10 }),
      });
    }
  }

  // Watchdog Timer (recovers if game doesn't complete within 28 seconds)
  function startWatchdog() {
    clearWatchdog();
    watchdogTimer = setTimeout(() => {
      if (currentState === 'PLAY' && !destroyed) {
        console.warn('Minigame watchdog triggered: round duration exceeded.');
        overlaySlot.innerHTML = `
          <div class="minigame-watchdog-dialog arcade-card">
            <div style="font-weight:bold; color:var(--bad); margin-bottom:6px;">Taking too long?</div>
            <div style="display:flex; gap:8px;">
              <button id="btn-wd-retry" class="btn-ghost" style="flex:1;">Retry</button>
              <button id="btn-wd-skip" class="btn-primary" style="flex:1;">Skip (Counts as Escaped)</button>
            </div>
          </div>
        `;
        overlaySlot.querySelector('#btn-wd-retry').onclick = () => startPlay();
        overlaySlot.querySelector('#btn-wd-skip').onclick = () => handleGameComplete({ success: false, grade: 'miss', score: 5 });
      }
    }, 28000);
  }

  function clearWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    if (prepWatchdog) clearTimeout(prepWatchdog);
  }

  // Keyboard navigation for minigame input
  const handleKeydown = (e) => {
    if (currentState === 'PLAY') {
      if (tierDef.controlsType === '3lanes') {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
          e.preventDefault();
          gameController?.hitLane?.(0);
          return;
        }
        if (e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Space') {
          e.preventDefault();
          gameController?.hitLane?.(1);
          return;
        }
        if (e.code === 'KeyD' || e.code === 'ArrowRight') {
          e.preventDefault();
          gameController?.hitLane?.(2);
          return;
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (gameController?.triggerInput) {
          gameController.triggerInput();
        }
      }
    } else if (currentState === 'RESULT' && e.code === 'Space') {
      e.preventDefault();
      const cont = overlaySlot.querySelector('#btn-result-continue');
      if (cont) cont.click();
    }
  };
  window.addEventListener('keydown', handleKeydown);

  // Pause on visibility change
  const handleVisibility = () => {
    if (document.hidden && gameController?.pause) {
      gameController.pause();
    } else if (!document.hidden && gameController?.resume) {
      gameController.resume();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Kick off state machine
  startIntro();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearWatchdog();
    if (introTimer) clearTimeout(introTimer);
    if (countdownTimer) clearTimeout(countdownTimer);
    if (hintTimer) clearTimeout(hintTimer);
    if (hudPressTimer) clearTimeout(hudPressTimer);

    window.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('visibilitychange', handleVisibility);

    if (gameController?.destroy) {
      try {
        gameController.destroy();
      } catch (e) {
        console.warn('Error destroying minigame controller:', e);
      }
    }
    container.innerHTML = '';
  }

  return {
    destroy,
    getState: () => currentState,
  };
}
