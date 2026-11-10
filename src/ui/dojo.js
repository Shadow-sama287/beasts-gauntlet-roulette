// src/ui/dojo.js — Beast Dojo 4-Lane Falling-Notes Rhythm Game
import {
  JUKEBOX_TRACKS,
  startMusic,
  stopMusic,
  playDojoHitSound,
  playPerfectSound,
  playGoodSound,
  playMissSound,
  playComboBreakSound,
  playLevelUpSound,
} from '../audio.js';
import { handleArtError, artForBeast } from '../beastLoader.js';

const LANES = [
  { id: 0, label: '◀', keys: ['d', 'D', 'ArrowLeft', 'a', 'A'], color: '#3d8bff', keyLabel: 'D' },
  { id: 1, label: '▼', keys: ['f', 'F', 'ArrowDown', 's', 'S'], color: '#3ecf6e', keyLabel: 'F' },
  { id: 2, label: '▲', keys: ['j', 'J', 'ArrowUp', 'k', 'K'], color: '#ff8a1f', keyLabel: 'J' },
  { id: 3, label: '▶', keys: ['k', 'K', 'ArrowRight', 'l', 'L'], color: '#a45cff', keyLabel: 'K' },
];

const HIT_PERFECT_MS = 80;
const HIT_GOOD_MS = 160;
const HIT_WINDOW_MS = 200;
const NOTE_TRAVEL_MS = 1400; // time in ms from lane spawn to hit line

export function createDojoView({ companion, onReward, onExit, onEnterGauntlet }) {
  const container = document.createElement('div');
  container.className = 'screen dojo-stage-screen';

  let selectedTrackIdx = 0;
  let gameRunning = false;
  let isPaused = false;
  let animFrameId = null;

  let startTime = 0;
  let pauseStartTime = 0;
  let totalPausedDuration = 0;
  let roundDurationMs = 32000;

  let notes = [];
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let missCount = 0;
  let totalNotes = 0;

  const compArt = companion ? (companion.art || artForBeast(companion.id)) : '/beasts/1.svg';
  const compName = companion ? (companion.displayName || companion.name) : 'Adventurer';

  function renderLobby() {
    container.innerHTML = `
      <div class="dojo-lobby-view">
        <div class="dojo-lobby-header">
          <div class="pixel-tag" style="background:#1a1a2e; color:var(--gold); border:1px solid var(--gold); align-self:flex-start;">
            🥋 RHYTHM TRAINING
          </div>
          <h2 style="font-family:var(--font-title); font-size:1.6rem; margin-top:6px; color:var(--text); letter-spacing:1px;">
            BEAST DOJO
          </h2>
          <p style="font-size:0.82rem; color:var(--muted); margin-top:4px;">
            Train companion strike rhythm · Earn Gold, Essence & <strong style="color:var(--gold);">Gauntlet Strike Bonus</strong>
          </p>
        </div>

        <!-- Companion Showcase -->
        <div class="dojo-comp-card">
          <div class="dojo-comp-art-frame">
            <img id="dojo-lobby-comp-art" src="${compArt}" alt="${compName}" class="dojo-comp-sprite bounce-idle" />
          </div>
          <div class="dojo-comp-info">
            <div style="font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px;">Companion In Training</div>
            <div style="font-size:1.15rem; font-weight:bold; color:var(--gold);">${compName}</div>
            <div style="font-size:0.8rem; color:var(--text); margin-top:3px;">
              ${companion?.tier ? `Tier ${companion.tier} · ${companion.type || 'Fighter'}` : 'Loyal Companion'}
            </div>
            <div class="dojo-perk-chip">
              ★ Dojo Master Bonus: Up to <strong>+20% Strike Damage</strong> in Gauntlet
            </div>
          </div>
        </div>

        <!-- Track Selection -->
        <div class="dojo-track-picker">
          <label style="font-size:0.82rem; font-weight:bold; color:var(--text); display:block; margin-bottom:8px;">
            SELECT MOB CHIPTUNE TRACK:
          </label>
          <div class="track-select-grid">
            ${JUKEBOX_TRACKS.map((t, idx) => `
              <button class="track-select-btn ${idx === selectedTrackIdx ? 'active' : ''}" data-idx="${idx}">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                  <span style="font-weight:bold;">${t.name}</span>
                  <span class="num font-bold" style="color:var(--gold); font-size:0.82rem;">${t.bpm} BPM</span>
                </div>
                <div style="font-size:0.72rem; color:var(--muted); text-align:left; margin-top:2px;">
                  ${t.category} · ${t.key} · ${t.scale}
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Start CTA -->
        <div class="dojo-lobby-footer">
          <button id="btn-start-rhythm" class="btn-primary" style="width:100%; height:52px; font-size:1.15rem; letter-spacing:1px;">
            ▶ START TRAINING ROUND
          </button>
          <div style="text-align:center; font-size:0.75rem; color:var(--muted); margin-top:8px;" class="kbd-hint">
            Desktop: Use keys <strong>D · F · J · K</strong> or <strong>Arrows</strong> to hit notes
          </div>
        </div>
      </div>
    `;

    const img = container.querySelector('#dojo-lobby-comp-art');
    if (img && companion) img.onerror = () => handleArtError(img, companion);

    container.querySelectorAll('.track-select-btn').forEach((btn) => {
      btn.onclick = () => {
        selectedTrackIdx = parseInt(btn.dataset.idx, 10);
        renderLobby();
      };
    });

    container.querySelector('#btn-start-rhythm').onclick = () => {
      startRhythmRound();
    };
  }

  function startRhythmRound() {
    gameRunning = true;
    isPaused = false;
    window.__activeGameRunning = true; // Signal main to hide navigation tab bar
    document.body.classList.add('in-active-game');

    score = 0;
    combo = 0;
    maxCombo = 0;
    perfectCount = 0;
    goodCount = 0;
    missCount = 0;
    totalPausedDuration = 0;

    const track = JUKEBOX_TRACKS[selectedTrackIdx];
    const bpm = track.bpm;
    const beatMs = (60 / bpm) * 1000;
    const stepMs = beatMs / 2; // eighth notes

    // Generate notes synchronized with track melody
    notes = [];
    const totalSteps = 60; // ~30-36 seconds depending on BPM
    roundDurationMs = (totalSteps * stepMs) + NOTE_TRAVEL_MS + 2000;

    let noteId = 0;
    for (let s = 2; s < totalSteps; s++) {
      // Deterministic pseudo-random lane based on melody pitch + step
      const noteFreq = track.melody[s % track.melody.length];
      const lane = Math.floor((noteFreq * 7 + s * 13) % 4);

      // Density pattern: place notes on every beat, plus some syncopated eighth notes
      const isBeat = (s % 2 === 0);
      const isSyncopated = (s % 4 === 1 && (s % 3 === 0));

      if (isBeat || isSyncopated) {
        const targetHitTime = NOTE_TRAVEL_MS + (s * stepMs);
        notes.push({
          id: noteId++,
          lane,
          targetHitTime,
          hit: false,
          missed: false,
          el: null,
        });
      }
    }
    totalNotes = notes.length;

    renderStageUI(track);
    startMusic(selectedTrackIdx);

    startTime = performance.now();
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function renderStageUI(track) {
    container.innerHTML = `
      <div class="rhythm-stage-container">
        <!-- Top HUD -->
        <div class="rhythm-top-hud">
          <div style="display:flex; align-items:center; gap:8px;">
            <button id="btn-pause-dojo" class="btn-ghost pause-btn" title="Pause / Exit">
              ⏸
            </button>
            <div>
              <div style="font-size:0.8rem; font-weight:bold; color:var(--gold);">${track.name}</div>
              <div style="font-size:0.68rem; color:var(--muted);">${track.bpm} BPM · ${track.scale}</div>
            </div>
          </div>

          <div class="rhythm-score-cluster">
            <div class="rhythm-score-num num" id="rhythm-score">0</div>
            <div class="rhythm-combo-tag" id="rhythm-combo">0x COMBO</div>
          </div>

          <div class="rhythm-progress-circle" id="rhythm-time-left">
            <span class="num font-bold" id="rhythm-seconds" style="font-size:0.85rem; color:var(--text);">30s</span>
          </div>
        </div>

        <!-- Companion Battle/Dance Stage -->
        <div class="rhythm-companion-stage" id="rhythm-comp-stage">
          <div class="rhythm-comp-aura" id="rhythm-comp-aura"></div>
          <img id="rhythm-comp-sprite" src="${compArt}" alt="${compName}" class="rhythm-comp-img bounce-beat" style="animation-duration:${60 / track.bpm}s;" />
          <div class="rhythm-floating-feedback" id="rhythm-feedback"></div>
        </div>

        <!-- 4 Falling Note Lanes -->
        <div class="rhythm-lanes-board" id="rhythm-lanes-board">
          ${LANES.map((lane) => `
            <div class="rhythm-lane lane-${lane.id}" data-lane="${lane.id}">
              <div class="lane-track-line"></div>
              <div class="lane-hit-zone" style="border-color:${lane.color};">
                <span class="lane-marker-icon" style="color:${lane.color};">${lane.label}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Bottom Touch Lane Pads -->
        <div class="rhythm-pad-bar">
          ${LANES.map((lane) => `
            <button class="rhythm-lane-pad pad-${lane.id}" data-lane="${lane.id}" style="--pad-color:${lane.color};">
              <span class="pad-symbol">${lane.label}</span>
              <span class="pad-key-hint kbd-hint">${lane.keyLabel}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    const img = container.querySelector('#rhythm-comp-sprite');
    if (img && companion) img.onerror = () => handleArtError(img, companion);

    // Attach lane pad interactions
    container.querySelectorAll('.rhythm-lane-pad').forEach((pad) => {
      const laneId = parseInt(pad.dataset.lane, 10);
      const triggerPad = (e) => {
        e.preventDefault();
        triggerHit(laneId);
        pad.classList.add('pad-active');
        setTimeout(() => pad.classList.remove('pad-active'), 100);
      };
      pad.addEventListener('pointerdown', triggerPad);
    });

    container.querySelector('#btn-pause-dojo').onclick = togglePauseModal;
  }

  function gameLoop(now) {
    if (!gameRunning) return;
    if (isPaused) return;

    const elapsed = now - startTime - totalPausedDuration;
    const remainingMs = Math.max(0, roundDurationMs - elapsed);

    const secondsEl = container.querySelector('#rhythm-seconds');
    if (secondsEl) {
      secondsEl.textContent = `${Math.ceil(remainingMs / 1000)}s`;
    }

    const board = container.querySelector('#rhythm-lanes-board');
    if (board) {
      const boardHeight = board.clientHeight || 260;
      const hitLineY = boardHeight * 0.82; // Hit zone at 82% height

      // Update falling notes
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.hit) {
          if (n.el) {
            n.el.remove();
            n.el = null;
          }
          continue;
        }

        const delta = n.targetHitTime - elapsed;

        // Note is spawning into view
        if (delta <= NOTE_TRAVEL_MS && delta >= -HIT_WINDOW_MS) {
          if (!n.el) {
            const laneEl = container.querySelector(`.rhythm-lane.lane-${n.lane}`);
            if (laneEl) {
              const noteEl = document.createElement('div');
              noteEl.className = `falling-note note-lane-${n.lane}`;
              noteEl.style.backgroundColor = LANES[n.lane].color;
              noteEl.style.boxShadow = `0 0 10px ${LANES[n.lane].color}`;
              laneEl.appendChild(noteEl);
              n.el = noteEl;
            }
          }

          if (n.el) {
            // Calculate Y position: at delta = NOTE_TRAVEL_MS -> Y = 0; at delta = 0 -> Y = hitLineY
            const progress = (NOTE_TRAVEL_MS - delta) / NOTE_TRAVEL_MS;
            const yPos = progress * hitLineY;
            n.el.style.transform = `translateY(${yPos}px)`;
          }
        }

        // Note passed hit window without being pressed => MISS!
        if (delta < -HIT_GOOD_MS && !n.missed && !n.hit) {
          n.missed = true;
          handleMiss();
          if (n.el) {
            n.el.classList.add('note-faded-miss');
            setTimeout(() => {
              if (n.el) { n.el.remove(); n.el = null; }
            }, 150);
          }
        }
      }
    }

    if (elapsed >= roundDurationMs) {
      endRound();
      return;
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  function triggerHit(laneId) {
    if (!gameRunning || isPaused) return;

    const elapsed = performance.now() - startTime - totalPausedDuration;

    // Find the closest active unhit note in this lane within tolerance window
    let candidate = null;
    let minDelta = Infinity;

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.lane === laneId && !n.hit && !n.missed) {
        const delta = Math.abs(elapsed - n.targetHitTime);
        if (delta <= HIT_WINDOW_MS && delta < minDelta) {
          minDelta = delta;
          candidate = n;
        }
      }
    }

    if (candidate) {
      candidate.hit = true;
      if (candidate.el) {
        candidate.el.classList.add('note-exploded');
        setTimeout(() => {
          if (candidate.el) { candidate.el.remove(); candidate.el = null; }
        }, 120);
      }

      if (minDelta <= HIT_PERFECT_MS) {
        handleHitResult('PERFECT', minDelta, candidate.lane);
      } else if (minDelta <= HIT_GOOD_MS) {
        handleHitResult('GOOD', minDelta, candidate.lane);
      } else {
        handleMiss();
      }
    } else {
      // Stray tap with no note in window
      if (combo >= 5) {
        handleMiss();
      }
    }
  }

  function handleHitResult(type, delta, laneId) {
    const isPerfect = (type === 'PERFECT');
    if (isPerfect) {
      perfectCount++;
      playPerfectSound();
      combo++;
    } else {
      goodCount++;
      playGoodSound();
      combo++;
    }

    if (combo > maxCombo) maxCombo = combo;

    // Haptic pulse
    if (navigator.vibrate) {
      navigator.vibrate(isPerfect ? 24 : 12);
    }

    const mult = combo >= 20 ? 4 : combo >= 10 ? 3 : combo >= 5 ? 2 : 1;
    const basePts = isPerfect ? 250 : 120;
    score += basePts * mult;

    // Update Score & Combo HUD
    const scoreEl = container.querySelector('#rhythm-score');
    const comboEl = container.querySelector('#rhythm-combo');
    if (scoreEl) scoreEl.textContent = score;
    if (comboEl) {
      comboEl.textContent = `${combo}x COMBO`;
      comboEl.className = `rhythm-combo-tag ${combo >= 15 ? 'fire-combo' : combo >= 5 ? 'hot-combo' : ''}`;
    }

    // Lane hit pulse effect
    const laneZone = container.querySelector(`.rhythm-lane.lane-${laneId} .lane-hit-zone`);
    if (laneZone) {
      laneZone.classList.add('hit-pulse');
      setTimeout(() => laneZone.classList.remove('hit-pulse'), 120);
    }

    // Companion reaction
    const compSprite = container.querySelector('#rhythm-comp-sprite');
    const aura = container.querySelector('#rhythm-comp-aura');
    const feedback = container.querySelector('#rhythm-feedback');

    if (compSprite) {
      compSprite.classList.remove('flinch');
      compSprite.classList.add(isPerfect ? 'bounce-perfect' : 'bounce-good');
      setTimeout(() => compSprite.classList.remove('bounce-perfect', 'bounce-good'), 180);
    }

    if (aura && isPerfect) {
      aura.classList.add('aura-flash');
      setTimeout(() => aura.classList.remove('aura-flash'), 200);
    }

    if (feedback) {
      feedback.textContent = isPerfect ? '★ PERFECT! ★' : 'GOOD!';
      feedback.style.color = isPerfect ? 'var(--gold)' : 'var(--good)';
      feedback.className = 'rhythm-floating-feedback show-popup';
      setTimeout(() => feedback.className = 'rhythm-floating-feedback', 300);
    }
  }

  function handleMiss() {
    missCount++;
    if (combo >= 4) {
      playComboBreakSound();
    } else {
      playMissSound();
    }
    combo = 0;

    if (navigator.vibrate) {
      navigator.vibrate([30, 20, 30]);
    }

    const comboEl = container.querySelector('#rhythm-combo');
    if (comboEl) {
      comboEl.textContent = 'COMBO LOST';
      comboEl.className = 'rhythm-combo-tag miss-combo';
    }

    // Companion flinch
    const compSprite = container.querySelector('#rhythm-comp-sprite');
    const feedback = container.querySelector('#rhythm-feedback');

    if (compSprite) {
      compSprite.classList.add('flinch');
      setTimeout(() => compSprite.classList.remove('flinch'), 250);
    }

    if (feedback) {
      feedback.textContent = 'MISS';
      feedback.style.color = 'var(--bad)';
      feedback.className = 'rhythm-floating-feedback show-popup';
      setTimeout(() => feedback.className = 'rhythm-floating-feedback', 300);
    }
  }

  function togglePauseModal() {
    if (!gameRunning) return;

    if (!isPaused) {
      isPaused = true;
      pauseStartTime = performance.now();
      stopMusic();

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.id = 'dojo-pause-modal';
      modal.innerHTML = `
        <div class="arcade-panel pause-dialog" style="max-width:320px; text-align:center; padding:20px;">
          <h3 style="font-family:var(--font-title); font-size:1.3rem; color:var(--gold); margin-bottom:12px;">
            ⏸ TRAINING PAUSED
          </h3>
          <p style="font-size:0.85rem; color:var(--text); margin-bottom:16px;">
            Current Score: <strong class="num">${score}</strong><br>
            Max Combo: <strong class="num">${maxCombo}x</strong>
          </p>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button id="btn-resume-dojo" class="btn-primary" style="height:46px;">
              ▶ RESUME
            </button>
            <button id="btn-quit-dojo" class="btn-ghost" style="height:42px; border:1px solid var(--bad); color:var(--bad);">
              ✕ QUIT TRAINING
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#btn-resume-dojo').onclick = () => {
        modal.remove();
        totalPausedDuration += performance.now() - pauseStartTime;
        isPaused = false;
        startMusic(selectedTrackIdx);
        animFrameId = requestAnimationFrame(gameLoop);
      };

      modal.querySelector('#btn-quit-dojo').onclick = () => {
        modal.remove();
        cleanup();
        renderLobby();
      };
    }
  }

  function endRound() {
    cleanup();
    playLevelUpSound();

    const answeredNotes = perfectCount + goodCount + missCount;
    const accuracy = answeredNotes > 0
      ? Math.round(((perfectCount * 1.0 + goodCount * 0.5) / answeredNotes) * 100)
      : 0;

    let grade = 'C';
    let strikeBonusPct = 5;

    if (accuracy >= 95) {
      grade = 'S';
      strikeBonusPct = 20;
    } else if (accuracy >= 85) {
      grade = 'A';
      strikeBonusPct = 15;
    } else if (accuracy >= 70) {
      grade = 'B';
      strikeBonusPct = 10;
    } else {
      grade = 'C';
      strikeBonusPct = 5;
    }

    const goldReward = Math.max(15, Math.floor(score / 40) + (grade === 'S' ? 30 : 15));
    const essenceReward = Math.max(1, Math.min(4, Math.floor(maxCombo / 8) + (grade === 'S' ? 2 : 1)));

    if (onReward) {
      onReward({
        score,
        maxCombo,
        accuracy,
        grade,
        strikeBonusPct,
        essence: essenceReward,
        gold: goldReward,
      });
    }

    renderResultsScreen({
      grade,
      accuracy,
      score,
      maxCombo,
      perfectCount,
      goodCount,
      missCount,
      strikeBonusPct,
      goldReward,
      essenceReward,
    });
  }

  function renderResultsScreen(res) {
    const gradeColors = { S: 'var(--gold)', A: '#3ecf6e', B: '#3d8bff', C: '#9a98ad' };

    container.innerHTML = `
      <div class="dojo-results-view">
        <div class="pixel-tag" style="background:#1a1a2e; color:var(--gold); border:1px solid var(--gold);">
          ★ SESSION COMPLETE ★
        </div>

        <div class="results-grade-circle" style="border-color:${gradeColors[res.grade]}; color:${gradeColors[res.grade]};">
          <div style="font-size:3.5rem; font-family:var(--font-title); line-height:1;">${res.grade}</div>
          <div style="font-size:0.75rem; letter-spacing:1px; text-transform:uppercase;">Rank</div>
        </div>

        <h3 style="font-size:1.2rem; color:var(--text); margin-top:10px;">
          ${res.grade === 'S' ? 'MASTER DISCIPLINE!' : res.grade === 'A' ? 'GREAT HARMONY!' : 'TRAINING COMPLETE'}
        </h3>

        <!-- Companion Strike Bonus Banner -->
        <div class="dojo-reward-banner">
          <div style="font-size:0.75rem; text-transform:uppercase; color:var(--gold); font-weight:bold;">
            ⚔️ GAUNTLET COMPANION PERK UNLOCKED
          </div>
          <div style="font-size:1.1rem; font-weight:bold; color:#fff; margin-top:2px;">
            +${res.strikeBonusPct}% Companion Strike Damage
          </div>
          <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">
            ${compName} strikes harder during your next Gauntlet runs!
          </div>
        </div>

        <!-- Breakdown Grid -->
        <div class="results-stats-card">
          <div class="stat-col"><span class="lbl">Score</span><span class="val num">${res.score}</span></div>
          <div class="stat-col"><span class="lbl">Accuracy</span><span class="val num">${res.accuracy}%</span></div>
          <div class="stat-col"><span class="lbl">Max Combo</span><span class="val num">${res.maxCombo}x</span></div>
          <div class="stat-col"><span class="lbl">Perfects</span><span class="val num" style="color:var(--gold);">${res.perfectCount}</span></div>
          <div class="stat-col"><span class="lbl">Goods</span><span class="val num" style="color:var(--good);">${res.goodCount}</span></div>
          <div class="stat-col"><span class="lbl">Misses</span><span class="val num" style="color:var(--bad);">${res.missCount}</span></div>
        </div>

        <div style="font-size:0.85rem; color:var(--good); font-weight:bold; margin-top:4px;">
          Loot Earned: +${res.goldReward} Gold · +${res.essenceReward} Essence
        </div>

        <!-- Action CTAs -->
        <div class="results-cta-bar">
          <button id="btn-enter-gauntlet-bonus" class="btn-primary" style="width:100%; height:48px; font-size:1.05rem;">
            ⚔️ ENTER GAUNTLET WITH BONUS (+${res.strikeBonusPct}%)
          </button>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; width:100%;">
            <button id="btn-train-again" class="btn-ghost" style="height:44px; border:1px solid var(--gold); color:var(--gold);">
              🥋 Train Again
            </button>
            <button id="btn-return-hub" class="btn-ghost" style="height:44px; border:1px solid var(--line);">
              Return to Hub
            </button>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#btn-enter-gauntlet-bonus').onclick = () => {
      if (onEnterGauntlet) onEnterGauntlet();
      else if (onExit) onExit();
    };

    container.querySelector('#btn-train-again').onclick = () => {
      renderLobby();
    };

    container.querySelector('#btn-return-hub').onclick = () => {
      if (onExit) onExit();
    };
  }

  function handleKeydown(e) {
    if (!gameRunning || isPaused) return;
    if (e.repeat) return;

    for (let i = 0; i < LANES.length; i++) {
      if (LANES[i].keys.includes(e.key)) {
        e.preventDefault();
        triggerHit(i);
        const pad = container.querySelector(`.pad-${i}`);
        if (pad) {
          pad.classList.add('pad-active');
          setTimeout(() => pad.classList.remove('pad-active'), 100);
        }
        break;
      }
    }
  }

  function cleanup() {
    gameRunning = false;
    isPaused = false;
    window.__activeGameRunning = false;
    document.body.classList.remove('in-active-game');
    stopMusic();
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    const pauseModal = document.getElementById('dojo-pause-modal');
    if (pauseModal) pauseModal.remove();
  }

  window.addEventListener('keydown', handleKeydown);

  // Observer to guarantee audio & animation stop when view is unmounted
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      cleanup();
      window.removeEventListener('keydown', handleKeydown);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  renderLobby();
  return container;
}
