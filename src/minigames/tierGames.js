// src/minigames/tierGames.js — 5 Tier-Specific Capture Minigames
// Pure Vanilla JS + HTML5 Canvas. Zero external dependencies, 100% offline, rock-solid lifecycle.

import { tameZoneWidth } from '../roulette.js';

/**
 * Common helper: creates a responsive canvas scaled for devicePixelRatio with ResizeObserver.
 */
function setupCanvas(container) {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let w = container.clientWidth || 360;
  let h = container.clientHeight || 260;
  const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);

  function resize() {
    w = container.clientWidth || 360;
    h = container.clientHeight || 260;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (ctx && typeof ctx.resetTransform === 'function') {
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    }
  }
  resize();

  let resizeObserver = null;
  const onResize = () => resize();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
    if (typeof ResizeObserver === 'function' && container) {
      resizeObserver = new ResizeObserver(onResize);
      try { resizeObserver.observe(container); } catch {}
    }
  }

  function cleanup() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onResize);
      if (resizeObserver) resizeObserver.disconnect();
    }
    canvas.remove();
  }

  return { canvas, ctx, getW: () => w, getH: () => h, resize, cleanup };
}

// -------------------------------------------------------------
// 1. TIER 5 (COMMON): Steady Sweep (Moving Target Zone Timing Bar)
// -------------------------------------------------------------
export function createTier5SteadySweep(container, options = {}) {
  const {
    beast,
    lucky = false,
    difficulty = 1.0,
    rng = Math.random,
    onProgress = () => {},
    onComplete = () => {},
    onDanger = () => {},
    onGrade = () => {},
    sfx = {},
  } = options;

  let active = true;
  let rafId = null;
  let lastTime = performance.now();

  const { canvas, ctx, getW, getH, resize, cleanup } = setupCanvas(container);

  // Difficulty & Zone
  const baseZoneW = tameZoneWidth(5) * (lucky ? 1.6 : 1.0);
  const zoneWidthFrac = Math.max(0.18, Math.min(0.55, baseZoneW / Math.max(0.7, difficulty)));
  let zonePos = 0.2 + rng() * 0.35; // Center of target zone [0.2, 0.55]
  let zoneSpeed = 0.18 * (rng() < 0.5 ? 1 : -1) * difficulty;

  let needlePos = 0.05; // [0, 1]
  let needleSpeed = (0.55 + difficulty * 0.25) * (rng() < 0.5 ? 1 : -1);

  let strikesNeeded = 2;
  let strikesHit = 0;
  let attemptsLeft = 3;

  function render() {
    const W = getW();
    const H = getH();
    ctx.clearRect(0, 0, W, H);

    const trackY = H * 0.5;
    const trackH = Math.min(54, H * 0.22);
    const trackX = 20;
    const trackW = W - 40;

    // Track Background
    ctx.fillStyle = '#0f0f1c';
    ctx.strokeStyle = '#2b2a48';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(trackX, trackY - trackH / 2, trackW, trackH, trackH / 2);
    ctx.fill();
    ctx.stroke();

    // Target Zone
    const zwPx = trackW * zoneWidthFrac;
    const zxPx = trackX + (trackW * zonePos) - zwPx / 2;
    const zoneGrad = ctx.createLinearGradient(zxPx, 0, zxPx + zwPx, 0);
    zoneGrad.addColorStop(0, 'rgba(62, 207, 110, 0.2)');
    zoneGrad.addColorStop(0.5, 'rgba(62, 207, 110, 0.7)');
    zoneGrad.addColorStop(1, 'rgba(62, 207, 110, 0.2)');

    ctx.fillStyle = zoneGrad;
    ctx.strokeStyle = '#3ecf6e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(zxPx, trackY - trackH / 2 + 3, zwPx, trackH - 6, 8);
    ctx.fill();
    ctx.stroke();

    // Sweet Spot Bullseye in Center
    const bullseyeW = zwPx * 0.3;
    const bullseyeX = zxPx + (zwPx - bullseyeW) / 2;
    ctx.fillStyle = 'rgba(245, 197, 66, 0.5)';
    ctx.fillRect(bullseyeX, trackY - trackH / 2 + 5, bullseyeW, trackH - 10);

    // Needle
    const needleXPx = trackX + trackW * needlePos;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(needleXPx - 3, trackY - trackH / 2 - 8, 6, trackH + 16);
    ctx.shadowBlur = 0;

    // Prompt hint
    ctx.fillStyle = '#a0a0c0';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STRIKE SWEET SPOT WHEN NEEDLE ALIGNS', W / 2, trackY + trackH / 2 + 28);
  }

  function loop(now) {
    if (!active) return;
    const dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;

    // Move needle
    needlePos += needleSpeed * dt;
    if (needlePos >= 1.0) {
      needlePos = 1.0;
      needleSpeed = -Math.abs(needleSpeed);
    } else if (needlePos <= 0.0) {
      needlePos = 0.0;
      needleSpeed = Math.abs(needleSpeed);
    }

    // Move target zone
    zonePos += zoneSpeed * dt;
    const halfZw = zoneWidthFrac / 2;
    if (zonePos + halfZw >= 0.95) {
      zonePos = 0.95 - halfZw;
      zoneSpeed = -Math.abs(zoneSpeed);
    } else if (zonePos - halfZw <= 0.05) {
      zonePos = 0.05 + halfZw;
      zoneSpeed = Math.abs(zoneSpeed);
    }

    render();
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  function triggerStrike() {
    if (!active) return;
    const halfZw = zoneWidthFrac / 2;
    const distFromCenter = Math.abs(needlePos - zonePos);
    const isHit = distFromCenter <= halfZw;
    const isPerfect = distFromCenter <= halfZw * 0.3;

    if (isHit) {
      if (isPerfect) {
        strikesHit += 2;
        sfx?.perfect?.();
        onGrade?.('perfect');
      } else {
        strikesHit += 1;
        sfx?.good?.();
        onGrade?.('good');
      }
      onProgress(Math.min(1.0, strikesHit / strikesNeeded));

      if (strikesHit >= strikesNeeded) {
        finish(true, isPerfect ? 'perfect' : 'hit', strikesHit * 5);
      }
    } else {
      attemptsLeft--;
      onGrade?.('miss');
      sfx?.bad?.();
      if (attemptsLeft === 1) {
        onDanger?.(true);
      }
      if (attemptsLeft <= 0) {
        finish(false, 'miss', strikesHit * 2);
      }
    }
  }

  function finish(success, grade, score) {
    if (!active) return;
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    onComplete({ success, grade, score, attemptsLeft });
  }

  const handlePointer = (e) => {
    e.preventDefault();
    triggerStrike();
  };
  canvas.addEventListener('pointerdown', handlePointer);

  return {
    triggerInput: triggerStrike,
    destroy: () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', handlePointer);
      cleanup();
    },
  };
}

// -------------------------------------------------------------
// 2. TIER 4 (UNCOMMON): Rhythm Strike (3-Lane Rhythm Tap)
// -------------------------------------------------------------
export function createTier4RhythmStrike(container, options = {}) {
  const {
    beast,
    lucky = false,
    difficulty = 1.0,
    rng = Math.random,
    onProgress = () => {},
    onComplete = () => {},
    onDanger = () => {},
    onGrade = () => {},
    sfx = {},
  } = options;

  let active = true;
  let rafId = null;
  let lastTime = performance.now();

  const { canvas, ctx, getW, getH, resize, cleanup } = setupCanvas(container);

  const bpm = 116;
  const beatIntervalMs = (60 / bpm) * 1000;
  const fallDuration = 1.35 / Math.max(0.7, difficulty); // seconds to reach hit bar

  // Generate 7 rhythmic incoming notes across 3 lanes
  const totalNotes = 7;
  const notes = [];
  let currentTime = 1.8; // Allow ~1.8s for player to synchronize after countdown
  for (let i = 0; i < totalNotes; i++) {
    const lane = Math.floor(rng() * 3);
    currentTime += (beatIntervalMs / 1000) * (rng() < 0.25 ? 1.0 : 1.45);
    notes.push({
      id: i,
      lane, // 0: Left, 1: Mid, 2: Right
      time: currentTime,
      hit: false,
      missed: false,
    });
  }

  let hits = 0;
  let misses = 0;
  let gameTime = 0;
  const hitsNeeded = 3;
  const maxMisses = 4;
  // Generous hit tolerance window (~360ms-440ms) for reliable touch and mouse sensing
  const tolerance = (lucky ? 0.44 : 0.36) / Math.max(0.7, difficulty);
  let laneFlashes = [0, 0, 0];

  const laneColors = ['#3d8bff', '#3ecf6e', '#ffaa33'];
  const laneLabels = ['◀ LEFT', '▲ MID', 'RIGHT ▶'];

  function render() {
    const W = getW();
    const H = getH();
    ctx.clearRect(0, 0, W, H);

    const laneW = W / 3;
    const hitBarY = H * 0.78;

    // Visual lane flash feedback when player taps a lane
    for (let i = 0; i < 3; i++) {
      if (laneFlashes[i] > 0) {
        ctx.fillStyle = `rgba(${i === 0 ? '61, 139, 255' : i === 1 ? '62, 207, 110' : '255, 170, 51'}, ${Math.min(0.4, laneFlashes[i] * 1.5)})`;
        ctx.fillRect(i * laneW, 0, laneW, H);
      }
    }

    // Lane dividing lines
    ctx.strokeStyle = '#2b2848';
    ctx.lineWidth = 2;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * laneW, 0);
      ctx.lineTo(i * laneW, H);
      ctx.stroke();
    }

    // Hit Bar across bottom
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(0, hitBarY - 24, W, 48);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hitBarY);
    ctx.lineTo(W, hitBarY);
    ctx.stroke();

    // Lane Target Strike Zones
    for (let i = 0; i < 3; i++) {
      const cx = i * laneW + laneW / 2;
      const isFlashed = laneFlashes[i] > 0;
      const color = laneColors[i];

      // Outer Target Circle
      ctx.strokeStyle = isFlashed ? '#ffffff' : color;
      ctx.lineWidth = isFlashed ? 3.5 : 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = isFlashed ? 18 : 6;
      ctx.beginPath();
      ctx.arc(cx, hitBarY, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Lane identifier label below target
      ctx.fillStyle = color;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(laneLabels[i], cx, hitBarY + 38);
    }

    // Render falling note runes
    for (const note of notes) {
      if (note.hit) continue;
      const progress = (gameTime - (note.time - fallDuration)) / fallDuration;
      if (progress < 0 || progress > 1.25) continue;

      const ny = progress * hitBarY;
      const nx = note.lane * laneW + laneW / 2;
      const color = laneColors[note.lane];

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(nx, ny, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(note.lane === 0 ? '◀' : note.lane === 1 ? '▲' : '▶', nx, ny);
    }
  }

  function loop(now) {
    if (!active) return;
    const dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;
    gameTime += dt;

    for (let i = 0; i < 3; i++) {
      if (laneFlashes[i] > 0) laneFlashes[i] -= dt;
    }

    // Check missed notes that fell past the hit bar
    for (const note of notes) {
      if (!note.hit && !note.missed && gameTime > note.time + tolerance) {
        note.missed = true;
        misses++;
        onGrade?.('miss');
        sfx?.bad?.();
        if (misses >= 2) {
          onDanger?.(true);
        }
        if (misses >= maxMisses) {
          finish(false, 'miss', hits * 3);
          return;
        }
      }
    }

    render();

    // Check if finished
    const allProcessed = notes.every((n) => n.hit || n.missed);
    if (allProcessed) {
      if (hits >= hitsNeeded) {
        finish(true, hits >= totalNotes - 1 ? 'perfect' : 'hit', hits * 5);
      } else {
        finish(false, 'miss', hits * 3);
      }
      return;
    }

    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  function hitLane(laneIdx) {
    if (!active) return;
    laneFlashes[laneIdx] = 0.28;
    let closestNote = null;
    let minDiff = Infinity;

    for (const note of notes) {
      if (note.lane === laneIdx && !note.hit && !note.missed) {
        const diff = Math.abs(gameTime - note.time);
        if (diff < minDiff && diff <= tolerance) {
          minDiff = diff;
          closestNote = note;
        }
      }
    }

    if (closestNote) {
      closestNote.hit = true;
      hits++;
      const isPerfect = minDiff < tolerance * 0.45;
      if (isPerfect) {
        sfx?.perfect?.();
        onGrade?.('perfect');
      } else {
        sfx?.good?.();
        onGrade?.('good');
      }

      onProgress(Math.min(1.0, hits / hitsNeeded));

      if (hits >= hitsNeeded) {
        finish(true, hits >= totalNotes - 1 ? 'perfect' : 'hit', hits * 6);
      }
    } else {
      // Soft feedback on empty lane tap without instantly ending run
      sfx?.tick?.(220);
    }
  }

  function finish(success, grade, score) {
    if (!active) return;
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    onComplete({ success, grade, score });
  }

  const handlePointer = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX;
    if (clientX === undefined && e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
    }
    if (clientX === undefined) clientX = rect.left + rect.width / 2;
    const x = clientX - rect.left;
    const laneW = rect.width / 3;
    const lane = Math.floor(x / Math.max(1, laneW));
    hitLane(Math.max(0, Math.min(2, lane)));
  };

  canvas.addEventListener('pointerdown', handlePointer);

  return {
    hitLane,
    triggerInput: () => {
      // Smart targeting: pick active note that is closest to hit bar
      let targetLane = 1;
      let minDiff = Infinity;
      for (const note of notes) {
        if (!note.hit && !note.missed) {
          const diff = Math.abs(gameTime - note.time);
          if (diff < minDiff) {
            minDiff = diff;
            targetLane = note.lane;
          }
        }
      }
      hitLane(targetLane);
    },
    destroy: () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', handlePointer);
      cleanup();
    },
  };
}

// -------------------------------------------------------------
// 3. TIER 3 (RARE): Follow-the-Beast (Tether Ring Drag)
// -------------------------------------------------------------
export function createTier3FollowBeast(container, options = {}) {
  const {
    beast,
    lucky = false,
    difficulty = 1.0,
    rng = Math.random,
    onProgress = () => {},
    onComplete = () => {},
    onDanger = () => {},
    onGrade = () => {},
    sfx = {},
  } = options;

  let active = true;
  let rafId = null;
  let lastTime = performance.now();

  const { canvas, ctx, getW, getH, resize, cleanup } = setupCanvas(container);

  const ringRadius = (lucky ? 55 : 44);
  const targetHoldSeconds = 3.2 / Math.max(0.7, difficulty);
  const maxRoundTime = 18.0;
  let accumulatedHold = 0;
  let elapsedTime = 0;

  // Beast movement trajectory parameters
  let t = rng() * 10;
  let speed = (0.95 + difficulty * 0.3);

  // Player ring position
  let ringX = getW() / 2;
  let ringY = getH() / 2;
  let isPointerDown = false;

  function getBeastPos(W, H, time) {
    const pad = 60;
    const cx = W / 2;
    const cy = H / 2;
    const rx = (W / 2) - pad;
    const ry = (H / 2) - pad;
    return {
      x: cx + Math.sin(time * 0.8) * rx * 0.85,
      y: cy + Math.sin(time * 1.6) * ry * 0.75,
    };
  }

  function render(bx, by) {
    const W = getW();
    const H = getH();
    ctx.clearRect(0, 0, W, H);

    const dist = Math.hypot(ringX - bx, ringY - by);
    const inside = dist <= ringRadius;

    // Glowing Tether Beam if inside
    if (inside) {
      ctx.strokeStyle = 'rgba(61, 139, 255, 0.75)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#3d8bff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ringX, ringY);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Moving Target (Beast Aura Target)
    ctx.strokeStyle = inside ? '#3ecf6e' : '#a45cff';
    ctx.fillStyle = inside ? 'rgba(62, 207, 110, 0.25)' : 'rgba(164, 92, 255, 0.15)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(bx, by, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Player Capture Ring
    ctx.strokeStyle = inside ? '#3ecf6e' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = inside ? '#3ecf6e' : '#ffffff';
    ctx.shadowBlur = inside ? 16 : 6;
    ctx.beginPath();
    ctx.arc(ringX, ringY, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner crosshairs
    ctx.strokeStyle = inside ? 'rgba(62, 207, 110, 0.6)' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ringX - 10, ringY);
    ctx.lineTo(ringX + 10, ringY);
    ctx.moveTo(ringX, ringY - 10);
    ctx.lineTo(ringX, ringY + 10);
    ctx.stroke();

    // Prompt & Timer
    const timeLeft = Math.max(0, Math.ceil(maxRoundTime - elapsedTime));
    ctx.fillStyle = timeLeft <= 5 ? '#ff4444' : '#a0a0c0';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`DRAG RING TO TRACK BEAST · ${timeLeft}s LEFT`, W / 2, H - 16);
  }

  function loop(now) {
    if (!active) return;
    const dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;
    t += dt * speed;
    elapsedTime += dt;

    const W = getW();
    const H = getH();
    const bPos = getBeastPos(W, H, t);

    const dist = Math.hypot(ringX - bPos.x, ringY - bPos.y);
    const inside = dist <= ringRadius;

    if (inside) {
      accumulatedHold += dt;
      const progress = Math.min(1.0, accumulatedHold / targetHoldSeconds);
      onProgress(progress);
      if (Math.floor(accumulatedHold * 4) !== Math.floor((accumulatedHold - dt) * 4)) {
        onGrade?.('good');
      }

      if (accumulatedHold >= targetHoldSeconds) {
        onGrade?.('perfect');
        finish(true, 'perfect', 25);
        return;
      }
    }

    if (maxRoundTime - elapsedTime <= 4.5 && (accumulatedHold / targetHoldSeconds) < 0.6) {
      onDanger?.(true);
    }

    if (elapsedTime >= maxRoundTime) {
      onGrade?.('miss');
      finish(false, 'miss', Math.round((accumulatedHold / targetHoldSeconds) * 15));
      return;
    }

    render(bPos.x, bPos.y);
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  function finish(success, grade, score) {
    if (!active) return;
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    onComplete({ success, grade, score });
  }

  function updatePointer(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (clientX === undefined && e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    if (clientX === undefined) return;
    ringX = Math.max(ringRadius, Math.min(rect.width - ringRadius, clientX - rect.left));
    ringY = Math.max(ringRadius, Math.min(rect.height - ringRadius, clientY - rect.top));
  }

  const onPointerDown = (e) => {
    e.preventDefault();
    isPointerDown = true;
    try {
      if (e.pointerId !== undefined && canvas.setPointerCapture) {
        canvas.setPointerCapture(e.pointerId);
      }
    } catch {}
    updatePointer(e);
  };

  const onPointerMove = (e) => {
    if (isPointerDown || e.pointerType === 'mouse') {
      e.preventDefault?.();
      updatePointer(e);
    }
  };

  const onPointerUp = (e) => {
    isPointerDown = false;
    try {
      if (e?.pointerId !== undefined && canvas.releasePointerCapture) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {}
  };

  const onTouchStart = (e) => {
    e.preventDefault();
    isPointerDown = true;
    if (e.touches && e.touches[0]) updatePointer(e.touches[0]);
  };

  const onTouchMove = (e) => {
    if (isPointerDown && e.touches && e.touches[0]) {
      e.preventDefault();
      updatePointer(e.touches[0]);
    }
  };

  const onTouchEnd = () => {
    isPointerDown = false;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: false });

  return {
    triggerInput: () => {
      // Gentle nudge towards beast rather than auto-teleporting and cheating
      const W = getW();
      const H = getH();
      const bPos = getBeastPos(W, H, t);
      ringX = ringX + (bPos.x - ringX) * 0.35;
      ringY = ringY + (bPos.y - ringY) * 0.35;
    },
    destroy: () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      cleanup();
    },
  };
}

// -------------------------------------------------------------
// 4. TIER 2 (EPIC): Dodge & Seal (Swipe Dodge + Hold Seal)
// -------------------------------------------------------------
export function createTier2DodgeSeal(container, options = {}) {
  const {
    beast,
    lucky = false,
    difficulty = 1.0,
    rng = Math.random,
    onProgress = () => {},
    onComplete = () => {},
    onDanger = () => {},
    onGrade = () => {},
    sfx = {},
  } = options;

  let active = true;
  let rafId = null;
  let lastTime = performance.now();
  let sealTimeout = null;

  const { canvas, ctx, getW, getH, resize, cleanup } = setupCanvas(container);

  let playerLane = 1; // 0, 1, 2
  let phase = 'dodge'; // 'dodge' | 'seal'
  let wave = 1;
  const maxWaves = 2;

  let projectiles = [];
  let sealCharge = 0;
  const sealTarget = 2.0 / Math.max(0.7, difficulty);
  let isHoldingSeal = false;
  let hitsTaken = 0;

  function spawnWave() {
    projectiles = [];
    // Spawn 2 danger zones leaving 1 safe lane
    const safeLane = Math.floor(rng() * 3);
    for (let l = 0; l < 3; l++) {
      if (l !== safeLane) {
        projectiles.push({
          lane: l,
          y: -40,
          speed: (220 + difficulty * 60),
          warned: true,
        });
      }
    }
    sfx?.tick?.(320);
  }
  spawnWave();

  function render() {
    const W = getW();
    const H = getH();
    ctx.clearRect(0, 0, W, H);

    const laneW = W / 3;

    // Lanes
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === playerLane ? 'rgba(164, 92, 255, 0.12)' : 'rgba(25, 20, 40, 0.3)';
      ctx.fillRect(i * laneW + 4, 10, laneW - 8, H - 20);
      ctx.strokeStyle = '#2b2345';
      ctx.strokeRect(i * laneW + 4, 10, laneW - 8, H - 20);
    }

    if (phase === 'dodge') {
      // Danger warnings & projectiles
      for (const p of projectiles) {
        const px = p.lane * laneW + laneW / 2;

        // Warning telegraph on lane
        ctx.fillStyle = 'rgba(255, 68, 68, 0.18)';
        ctx.fillRect(p.lane * laneW + 4, 10, laneW - 8, H - 20);

        // Projectile orb
        ctx.fillStyle = '#ff4444';
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(px, p.y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = '#ffd15c';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SWIPE / TAP LANES TO DODGE INCORPORATED ATTACK', W / 2, H - 18);
    } else {
      // Seal Phase
      const sealPct = Math.min(1.0, sealCharge / sealTarget);
      ctx.fillStyle = 'rgba(62, 207, 110, 0.2)';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 70 * sealPct, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isHoldingSeal ? '#3ecf6e' : '#ffd15c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 60, 0, Math.PI * 2 * sealPct);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isHoldingSeal ? 'HOLDING SEAL…' : 'HOLD THUMB TO CHANNEL SEAL', W / 2, H / 2 + 5);
    }

    // Player Hero Avatar in current lane
    const heroX = playerLane * laneW + laneW / 2;
    const heroY = H * 0.82;
    ctx.fillStyle = '#3d8bff';
    ctx.shadowColor = '#3d8bff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(heroX, heroY, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function loop(now) {
    if (!active) return;
    const dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;
    const H = getH();

    if (phase === 'dodge') {
      let wavePassed = true;
      for (const p of projectiles) {
        p.y += p.speed * dt;
        if (p.y < H + 30) wavePassed = false;

        // Collision check
        if (p.lane === playerLane && Math.abs(p.y - H * 0.82) < 28) {
          hitsTaken++;
          onGrade?.('miss');
          sfx?.bad?.();
          p.y = H + 100; // clear
          if (hitsTaken === 1) {
            onDanger?.(true);
          }
          if (hitsTaken >= 2) {
            finish(false, 'miss', 10);
            return;
          }
        }
      }

      if (wavePassed) {
        phase = 'seal';
        onGrade?.('good');
        sfx?.good?.();
      }
    } else if (phase === 'seal') {
      if (isHoldingSeal) {
        sealCharge += dt;
        const progress = Math.min(1.0, ((wave - 1) * 0.5) + (sealCharge / sealTarget) * 0.5);
        onProgress(progress);

        if (sealCharge >= sealTarget) {
          sealCharge = 0;
          wave++;
          onGrade?.('perfect');
          if (wave > maxWaves) {
            finish(true, 'perfect', 35);
            return;
          } else {
            phase = 'dodge';
            spawnWave();
          }
        }
      }
    }

    render();
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  function finish(success, grade, score) {
    if (!active) return;
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    onComplete({ success, grade, score });
  }

  const handlePointerDown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const laneW = rect.width / 3;
    const clickedLane = Math.floor(x / laneW);

    if (phase === 'dodge') {
      playerLane = Math.max(0, Math.min(2, clickedLane));
      sfx?.tick?.(480);
    } else {
      isHoldingSeal = true;
    }
  };

  const handlePointerUp = () => {
    isHoldingSeal = false;
  };

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointercancel', handlePointerUp);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);

  return {
    triggerInput: () => {
      if (phase === 'dodge') {
        playerLane = (playerLane + 1) % 3;
        sfx?.tick?.(480);
      } else {
        isHoldingSeal = true;
        if (sealTimeout) clearTimeout(sealTimeout);
        sealTimeout = setTimeout(() => { isHoldingSeal = false; }, 800);
      }
    },
    destroy: () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (sealTimeout) clearTimeout(sealTimeout);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      cleanup();
    },
  };
}

// -------------------------------------------------------------
// 5. TIER 1 (LEGENDARY): Harmonic Nexus (3-Phase Boss Convergence)
// -------------------------------------------------------------
export function createTier1NexusBoss(container, options = {}) {
  const {
    beast,
    lucky = false,
    difficulty = 1.0,
    rng = Math.random,
    onProgress = () => {},
    onComplete = () => {},
    onDanger = () => {},
    onGrade = () => {},
    sfx = {},
  } = options;

  let active = true;
  let rafId = null;
  let lastTime = performance.now();

  const { canvas, ctx, getW, getH, resize, cleanup } = setupCanvas(container);

  let currentPhase = 1; // Phase 1: Convergence, Phase 2: Shockwave, Phase 3: Ward Overload
  let attemptsLeft = 3;

  // Phase 1: Twin converging needles
  let leftNeedle = 0.05;
  let rightNeedle = 0.95;
  const nexusW = (lucky ? 0.28 : 0.20) / Math.max(0.7, difficulty);
  let needleSpeed = 0.45 * difficulty;

  // Phase 2: Shockwave countdown
  let shockwaveTimer = 1.4;

  // Phase 3: Rapid pulses & timer
  let pulseHits = 0;
  const pulseNeeded = 3;
  let phase3TimeLeft = 6.0;

  function render() {
    const W = getW();
    const H = getH();
    ctx.clearRect(0, 0, W, H);

    // Boss Phase Banner
    ctx.fillStyle = '#ff8a1f';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`★ APEX NEXUS: PHASE ${currentPhase}/3 (SHIELDS: ${attemptsLeft}) ★`, W / 2, 24);

    if (currentPhase === 1) {
      // Twin needle track
      const trackY = H * 0.55;
      const trackW = W - 40;
      const trackX = 20;

      ctx.fillStyle = '#120f20';
      ctx.fillRect(trackX, trackY - 20, trackW, 40);
      ctx.strokeStyle = '#413060';
      ctx.strokeRect(trackX, trackY - 20, trackW, 40);

      // Central Nexus Singularity
      const nCenter = trackX + trackW / 2;
      const nW = trackW * nexusW;
      ctx.fillStyle = 'rgba(255, 138, 31, 0.35)';
      ctx.fillRect(nCenter - nW / 2, trackY - 20, nW, 40);
      ctx.strokeStyle = '#ff8a1f';
      ctx.strokeRect(nCenter - nW / 2, trackY - 20, nW, 40);

      // Left Needle
      const lx = trackX + trackW * leftNeedle;
      ctx.fillStyle = '#3ecf6e';
      ctx.fillRect(lx - 2, trackY - 24, 4, 48);

      // Right Needle
      const rx = trackX + trackW * rightNeedle;
      ctx.fillStyle = '#3d8bff';
      ctx.fillRect(rx - 2, trackY - 24, 4, 48);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText('STRIKE WHEN BOTH NEEDLES CONVERGE IN NEXUS', W / 2, H - 20);
    } else if (currentPhase === 2) {
      // Shockwave dodge
      const waveRadius = (1.4 - shockwaveTimer) * 130;
      const coreSafe = shockwaveTimer >= 0.15 && shockwaveTimer <= 0.65;

      ctx.strokeStyle = coreSafe ? '#3ecf6e' : '#ff4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, waveRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = coreSafe ? 'rgba(62, 207, 110, 0.45)' : 'rgba(255, 68, 68, 0.2)';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 38, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = coreSafe ? '#3ecf6e' : '#ffd15c';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(coreSafe ? '★ SAFE! TAP NOW TO DASH! ★' : 'WAIT FOR SHOCKWAVE CLEARANCE…', W / 2, H - 20);
    } else {
      // Phase 3: Pulse strikes
      const progress = pulseHits / pulseNeeded;
      ctx.strokeStyle = '#ff8a1f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 50, 0, Math.PI * 2 * Math.max(0.05, progress));
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillText(`OVERLOAD: ${pulseHits}/${pulseNeeded} HITS`, W / 2, H / 2 + 5);
      const timeLeftSec = Math.max(0, phase3TimeLeft.toFixed(1));
      ctx.fillText(`TAP RAPIDLY! (${timeLeftSec}s)`, W / 2, H - 20);
    }
  }

  function loop(now) {
    if (!active) return;
    const dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;

    if (currentPhase === 1) {
      leftNeedle += needleSpeed * dt;
      rightNeedle -= needleSpeed * dt;
      if (leftNeedle >= 1.0) leftNeedle = 0.0;
      if (rightNeedle <= 0.0) rightNeedle = 1.0;
    } else if (currentPhase === 2) {
      shockwaveTimer -= dt;
      if (shockwaveTimer <= 0) {
        shockwaveTimer = 1.4;
      }
    } else if (currentPhase === 3) {
      phase3TimeLeft -= dt;
      if (phase3TimeLeft < 2.5 && pulseHits < pulseNeeded - 1) {
        onDanger?.(true);
      }
      if (phase3TimeLeft <= 0) {
        onGrade?.('miss');
        finish(false, 'miss', 30);
        return;
      }
    }

    render();
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  function triggerAction() {
    if (!active) return;
    if (currentPhase === 1) {
      const halfNw = nexusW / 2;
      const leftIn = Math.abs(leftNeedle - 0.5) <= halfNw;
      const rightIn = Math.abs(rightNeedle - 0.5) <= halfNw;

      if (leftIn && rightIn) {
        sfx?.perfect?.();
        onGrade?.('perfect');
        currentPhase = 2;
        onProgress(0.35);
      } else {
        attemptsLeft--;
        onGrade?.('miss');
        sfx?.bad?.();
        if (attemptsLeft === 1) onDanger?.(true);
        if (attemptsLeft <= 0) {
          finish(false, 'miss', 10);
        }
      }
    } else if (currentPhase === 2) {
      const coreSafe = shockwaveTimer >= 0.15 && shockwaveTimer <= 0.65;
      if (coreSafe) {
        sfx?.good?.();
        onGrade?.('good');
        currentPhase = 3;
        onProgress(0.7);
      } else {
        attemptsLeft--;
        onGrade?.('miss');
        sfx?.bad?.();
        if (attemptsLeft === 1) onDanger?.(true);
        if (attemptsLeft <= 0) {
          finish(false, 'miss', 20);
        }
      }
    } else if (currentPhase === 3) {
      pulseHits++;
      const isFin = pulseHits >= pulseNeeded;
      onGrade?.(isFin ? 'perfect' : 'good');
      sfx?.tick?.(400 + pulseHits * 100);
      onProgress(0.7 + (pulseHits / pulseNeeded) * 0.3);

      if (isFin) {
        finish(true, 'perfect', 50);
      }
    }
  }

  function finish(success, grade, score) {
    if (!active) return;
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    onComplete({ success, grade, score });
  }

  const handlePointer = (e) => {
    e.preventDefault();
    triggerAction();
  };
  canvas.addEventListener('pointerdown', handlePointer);

  return {
    triggerInput: triggerAction,
    destroy: () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', handlePointer);
      cleanup();
    },
  };
}

/**
 * Factory dispatcher to instantiate the proper minigame controller for tier 1..5.
 */
export function getTierMinigame(tier = 5) {
  switch (Number(tier)) {
    case 1:
      return { id: 'apex_nexus', title: 'APEX NEXUS CONVERGENCE', blurb: 'Converge twin needles, dodge boss shockwave, and overload wards!', controls: 'Tap or Space to strike', controlsType: 'boss', factory: createTier1NexusBoss };
    case 2:
      return { id: 'dodge_seal', title: 'DODGE & SEAL', blurb: 'Swipe/tap lanes to dodge attacks, then hold to channel the capture seal!', controls: 'Tap lanes to dodge · Hold to seal', controlsType: 'dodge_seal', factory: createTier2DodgeSeal };
    case 3:
      return { id: 'follow_beast', title: 'FOLLOW THE BEAST', blurb: 'Drag and hold your capture ring to tether the darting beast!', controls: 'Drag capture ring to track beast', controlsType: 'drag', factory: createTier3FollowBeast };
    case 4:
      return { id: 'rhythm_strike', title: 'RHYTHM STRIKE', blurb: 'Tap 3 lanes on the beat as falling runes cross the strike bar!', controls: 'Tap Left / Center / Right lanes', controlsType: '3lanes', factory: createTier4RhythmStrike };
    case 5:
    default:
      return { id: 'steady_sweep', title: 'STEADY SWEEP', blurb: 'Time your strike when the sweeping needle enters the moving sanctuary!', controls: 'Tap or Space to strike', controlsType: 'tap', factory: createTier5SteadySweep };
  }
}
