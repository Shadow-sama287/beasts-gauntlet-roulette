// src/minigames/games/classics.js
// Adapters wrapping the original 5 HTML5 Canvas/DOM minigames into the unified MiniGame interface.
// Randomized zone position (clamped [0.12, 0.88]), speed, and direction with weight 0.5.

import { resolveFocusRing, resolveConvergence, resolveTame, tameZoneWidth } from '../../roulette.js';

export const classicTimingBar = {
  id: 'classic_timingbar',
  title: 'STEADY SWEEP',
  blurb: 'Time your strike when the sweeping needle enters the target zone.',
  controls: 'Space / Click to strike',
  tiers: [5],
  weights: { Hunter: 0.5, Magical: 0.5, Brute: 0.5 },
  mount: (ctx) => mountClassicBar(ctx, 'single'),
};

export const classicFocusRing = {
  id: 'classic_focusring',
  title: 'FOCUS RING',
  blurb: 'Strike when the contracting ring aligns with the pulsing circle.',
  controls: 'Space / Click to pulse',
  tiers: [4],
  weights: { Hunter: 0.5, Magical: 0.5, Brute: 0.5 },
  mount: (ctx) => mountClassicFocusRing(ctx),
};

export const classicMovingBar = {
  id: 'classic_movingbar',
  title: 'DRIFTING SANCTUARY',
  blurb: 'The target zone is drifting! Strike as the needle meets the zone.',
  controls: 'Space / Click to strike',
  tiers: [3],
  weights: { Hunter: 0.5, Magical: 0.5, Brute: 0.5 },
  mount: (ctx) => mountClassicBar(ctx, 'moving'),
};

export const classicDualLock = {
  id: 'classic_duallock',
  title: 'DUAL WARD LOCK',
  blurb: 'Break through the epic beast’s twin wards! Strike 2 consecutive locks.',
  controls: 'Space / Click to lock wards',
  tiers: [2],
  weights: { Hunter: 0.5, Magical: 0.5, Brute: 0.5 },
  mount: (ctx) => mountClassicDualLock(ctx),
};

export const classicConvergence = {
  id: 'classic_convergence',
  title: 'HARMONIC CONVERGENCE',
  blurb: 'Stop the twin energy needles as they converge in the nexus!',
  controls: 'Space / Click to converge',
  tiers: [1],
  weights: { Hunter: 0.5, Magical: 0.5, Brute: 0.5 },
  mount: (ctx) => mountClassicConvergence(ctx),
};

// ---------------- Implementation Helpers ----------------

function mountClassicBar(ctx, mode = 'single') {
  const container = ctx.mount;
  container.innerHTML = `
    <div style="width:100%; max-width:380px; margin:0 auto; padding:12px 0;">
      <div style="height:36px; background:#141424; border:1px solid #2a2a44; border-radius:18px; position:relative; overflow:hidden; cursor:pointer;" id="track">
        <div id="zone" style="position:absolute; height:100%; background:#3ecf6e; opacity:0.65; border-radius:10px;"></div>
        <div id="needle" style="position:absolute; width:4px; height:100%; background:#ffffff; box-shadow:0 0 8px #ffffff; top:0; left:0;"></div>
      </div>
    </div>
  `;

  const track = container.querySelector('#track');
  const zoneEl = container.querySelector('#zone');
  const needleEl = container.querySelector('#needle');

  const rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
  const tier = ctx.beast.tier ?? ctx.beast.rarity ?? 5;
  const baseW = tameZoneWidth(tier);
  const widthPct = Math.max(0.12, baseW);
  const centerPct = 0.15 + rng() * 0.7; // Clamped in [0.15, 0.85]
  let zoneStart = Math.max(0.05, centerPct - widthPct / 2);
  let zoneEnd = Math.min(0.95, zoneStart + widthPct);

  zoneEl.style.left = `${zoneStart * 100}%`;
  zoneEl.style.width = `${(zoneEnd - zoneStart) * 100}%`;

  let pos = rng() * 0.5;
  let speed = (0.012 + rng() * 0.006) * (rng() < 0.5 ? 1 : -1);
  let zoneSpeed = mode === 'moving' ? 0.007 * (rng() < 0.5 ? 1 : -1) : 0;
  let animId = null;
  let active = true;

  function loop() {
    if (!active) return;
    pos += speed;
    if (pos >= 1 || pos <= 0) speed = -speed;
    needleEl.style.left = `${Math.max(0, Math.min(1, pos)) * 100}%`;

    if (mode === 'moving') {
      zoneStart += zoneSpeed;
      if (zoneStart <= 0.06 || zoneStart + widthPct >= 0.94) zoneSpeed = -zoneSpeed;
      zoneEnd = zoneStart + widthPct;
      zoneEl.style.left = `${zoneStart * 100}%`;
    }

    animId = requestAnimationFrame(loop);
  }
  animId = requestAnimationFrame(loop);

  function strike() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(animId);

    const hit = pos >= zoneStart && pos <= zoneEnd;
    const center = (zoneStart + zoneEnd) / 2;
    const dist = Math.abs(pos - center);
    const grade = hit ? (dist < widthPct * 0.25 ? 'perfect' : 'hit') : 'miss';

    if (hit) ctx.sfx?.good?.();
    else ctx.sfx?.bad?.();

    ctx.finish({ success: hit, grade, score: hit ? 10 : 0 });
  }

  track.addEventListener('click', strike);
  const keyHandler = (e) => {
    if (e.code === 'Space' || e.key === 'Enter') strike();
  };
  window.addEventListener('keydown', keyHandler);

  return {
    destroy: () => {
      active = false;
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('keydown', keyHandler);
      container.innerHTML = '';
    },
  };
}

function mountClassicFocusRing(ctx) {
  const container = ctx.mount;
  container.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; width:100%; height:180px; cursor:pointer;" id="focus-box">
      <canvas id="focus-canvas" width="200" height="180"></canvas>
    </div>
  `;

  const canvas = container.querySelector('#focus-canvas');
  const cctx = canvas.getContext('2d');
  const targetR = 46;
  const tolerance = 14;
  let currentR = 90;
  let animId = null;
  let active = true;

  function loop() {
    if (!active) return;
    currentR -= 1.1;
    if (currentR <= 12) currentR = 90;

    cctx.clearRect(0, 0, 200, 180);
    const cx = 100;
    const cy = 90;

    // Target ring
    cctx.beginPath();
    cctx.arc(cx, cy, targetR, 0, Math.PI * 2);
    cctx.strokeStyle = '#3ecf6e';
    cctx.lineWidth = 4;
    cctx.stroke();

    // Contracting ring
    cctx.beginPath();
    cctx.arc(cx, cy, currentR, 0, Math.PI * 2);
    cctx.strokeStyle = '#ffffff';
    cctx.lineWidth = 3;
    cctx.stroke();

    animId = requestAnimationFrame(loop);
  }
  animId = requestAnimationFrame(loop);

  function strike() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(animId);

    const diff = Math.abs(currentR - targetR);
    const hit = diff <= tolerance;
    const grade = hit ? (diff <= tolerance * 0.35 ? 'perfect' : 'hit') : 'miss';

    if (hit) ctx.sfx?.good?.();
    else ctx.sfx?.bad?.();

    ctx.finish({ success: hit, grade, score: hit ? 10 : 0 });
  }

  container.addEventListener('click', strike);
  const keyHandler = (e) => {
    if (e.code === 'Space' || e.key === 'Enter') strike();
  };
  window.addEventListener('keydown', keyHandler);

  return {
    destroy: () => {
      active = false;
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('keydown', keyHandler);
      container.innerHTML = '';
    },
  };
}

function mountClassicDualLock(ctx) {
  const container = ctx.mount;
  container.innerHTML = `
    <div style="width:100%; max-width:380px; margin:0 auto; padding:8px 0; text-align:center;">
      <div style="font-size:0.8rem; font-weight:bold; color:#ffd24a; margin-bottom:6px;" id="ward-status">WARD 1/2</div>
      <div style="height:36px; background:#141424; border:1px solid #2a2a44; border-radius:18px; position:relative; overflow:hidden; cursor:pointer;" id="track">
        <div id="zone" style="position:absolute; height:100%; background:#a45cff; opacity:0.65; border-radius:10px;"></div>
        <div id="needle" style="position:absolute; width:4px; height:100%; background:#ffffff; top:0; left:0;"></div>
      </div>
    </div>
  `;

  const track = container.querySelector('#track');
  const zoneEl = container.querySelector('#zone');
  const needleEl = container.querySelector('#needle');
  const statusEl = container.querySelector('#ward-status');

  let ward = 1;
  const widthPct = 0.22;
  let zoneStart = 0.35;
  zoneEl.style.left = `${zoneStart * 100}%`;
  zoneEl.style.width = `${widthPct * 100}%`;

  let pos = 0.1;
  let speed = 0.018;
  let animId = null;
  let active = true;

  function loop() {
    if (!active) return;
    pos += speed;
    if (pos >= 1 || pos <= 0) speed = -speed;
    needleEl.style.left = `${pos * 100}%`;
    animId = requestAnimationFrame(loop);
  }
  animId = requestAnimationFrame(loop);

  function strike() {
    if (!active) return;
    const hit = pos >= zoneStart && pos <= zoneStart + widthPct;

    if (!hit) {
      active = false;
      cancelAnimationFrame(animId);
      ctx.sfx?.bad?.();
      ctx.finish({ success: false, grade: 'miss', score: ward - 1 });
      return;
    }

    if (ward === 1) {
      ward = 2;
      ctx.sfx?.good?.();
      statusEl.setText?.('WARD 2/2 — FINAL STRIKE!');
      statusEl.textContent = 'WARD 2/2 — FINAL STRIKE!';
      zoneStart = 0.55;
      zoneEl.style.left = `${zoneStart * 100}%`;
      speed = -0.024;
    } else {
      active = false;
      cancelAnimationFrame(animId);
      ctx.sfx?.good?.();
      ctx.finish({ success: true, grade: 'perfect', score: 2 });
    }
  }

  track.addEventListener('click', strike);
  const keyHandler = (e) => {
    if (e.code === 'Space' || e.key === 'Enter') strike();
  };
  window.addEventListener('keydown', keyHandler);

  return {
    destroy: () => {
      active = false;
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('keydown', keyHandler);
      container.innerHTML = '';
    },
  };
}

function mountClassicConvergence(ctx) {
  const container = ctx.mount;
  container.innerHTML = `
    <div style="width:100%; max-width:380px; margin:0 auto; padding:8px 0; text-align:center;">
      <div style="font-size:0.8rem; font-weight:bold; color:#ff8a1f; margin-bottom:6px;">CONVERGE TWIN NEEDLES IN NEXUS</div>
      <div style="height:38px; background:#141424; border:1px solid #2a2a44; border-radius:19px; position:relative; overflow:hidden; cursor:pointer;" id="track">
        <div id="nexus" style="position:absolute; left:40%; width:20%; height:100%; background:#ff8a1f; opacity:0.65; border-radius:8px;"></div>
        <div id="needle-left" style="position:absolute; width:4px; height:100%; background:#ffd24a; top:0; left:0;"></div>
        <div id="needle-right" style="position:absolute; width:4px; height:100%; background:#ff4444; top:0; right:0;"></div>
      </div>
    </div>
  `;

  const track = container.querySelector('#track');
  const needleL = container.querySelector('#needle-left');
  const needleR = container.querySelector('#needle-right');

  let leftPos = 0;
  let rightPos = 1;
  let speed = 0.015;
  let animId = null;
  let active = true;

  function loop() {
    if (!active) return;
    leftPos += speed;
    rightPos -= speed;
    if (leftPos >= 1 || leftPos <= 0) speed = -speed;

    needleL.style.left = `${leftPos * 100}%`;
    needleR.style.left = `${rightPos * 100}%`;
    animId = requestAnimationFrame(loop);
  }
  animId = requestAnimationFrame(loop);

  function strike() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(animId);

    const nexusStart = 0.4;
    const nexusEnd = 0.6;
    const inNexus = leftPos >= nexusStart && leftPos <= nexusEnd && rightPos >= nexusStart && rightPos <= nexusEnd;

    if (inNexus) {
      ctx.sfx?.good?.();
      ctx.finish({ success: true, grade: 'perfect', score: 10 });
    } else {
      ctx.sfx?.bad?.();
      ctx.finish({ success: false, grade: 'miss', score: 0 });
    }
  }

  track.addEventListener('click', strike);
  const keyHandler = (e) => {
    if (e.code === 'Space' || e.key === 'Enter') strike();
  };
  window.addEventListener('keydown', keyHandler);

  return {
    destroy: () => {
      active = false;
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('keydown', keyHandler);
      container.innerHTML = '';
    },
  };
}
