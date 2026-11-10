// src/ui/jukebox.js — Musical Onchain Beasts (MOB) Sound Studio & Visualizer
import {
  JUKEBOX_TRACKS,
  startMusic,
  stopMusic,
  isMusicPlaying,
  getCurrentTrackIndex,
  getVisualizerData,
} from '../audio.js';

export function createJukeboxView({ onExit } = {}) {
  const container = document.createElement('div');
  container.className = 'screen jukebox-screen';

  let animId = null;

  container.innerHTML = `
    <div class="jukebox-card">
      <div class="jukebox-header">
        <div>
          <h2>MOB SOUND STUDIO</h2>
          <p class="subhead">Musical Onchain Beasts · Procedural 8-bit Synth Player</p>
        </div>
        <button id="btn-jukebox-exit" class="btn-ghost" style="min-height:36px; padding:4px 10px;">✕ Exit</button>
      </div>

      <!-- Real-time Visualizer Canvas -->
      <div class="visualizer-container">
        <canvas id="visualizer-canvas" class="visualizer-canvas" width="400" height="120"></canvas>
      </div>

      <!-- Track Information -->
      <div class="track-info-box">
        <div class="track-title" id="jukebox-track-title">Primal Beats (MOB Genesis)</div>
        <div class="track-meta" id="jukebox-track-meta">Track #1 of 4 · 130 BPM · Synthesizer Active</div>
      </div>

      <!-- Player Controls -->
      <div class="jukebox-controls">
        <button id="btn-prev-track" class="btn-ghost" style="min-height:44px; font-size:1.2rem;">⏮</button>
        <button id="btn-play-pause" class="btn-primary" style="min-height:48px; min-width:120px; font-size:1rem;">
          ▶ PLAY
        </button>
        <button id="btn-next-track" class="btn-ghost" style="min-height:44px; font-size:1.2rem;">⏭</button>
      </div>

      <!-- Track Playlist -->
      <div class="track-list" id="track-list"></div>

      <div class="jukebox-footer">
        <span class="badge-tag" style="background:#141420;">Sound Manager Simulation</span>
        <p style="font-size:0.75rem; color:var(--muted); margin-top:6px;">
          Beasts on Starknet are Musical Onchain Beasts (MOB). Each species carries procedural sound tracks synthesized onchain.
        </p>
      </div>
    </div>
  `;

  const canvas = container.querySelector('#visualizer-canvas');
  const ctx = canvas.getContext('2d');
  const titleEl = container.querySelector('#jukebox-track-title');
  const metaEl = container.querySelector('#jukebox-track-meta');
  const playBtn = container.querySelector('#btn-play-pause');
  const prevBtn = container.querySelector('#btn-prev-track');
  const nextBtn = container.querySelector('#btn-next-track');
  const listEl = container.querySelector('#track-list');
  const exitBtn = container.querySelector('#btn-jukebox-exit');

  exitBtn.onclick = () => {
    if (animId) cancelAnimationFrame(animId);
    if (onExit) onExit();
  };

  function updateTrackDisplay() {
    const idx = getCurrentTrackIndex();
    const track = JUKEBOX_TRACKS[idx];
    titleEl.textContent = track.title;
    metaEl.textContent = `Track #${idx + 1} of ${JUKEBOX_TRACKS.length} · ${track.bpm} BPM · Web Audio Oscillator`;
    playBtn.textContent = isMusicPlaying() ? '⏸ PAUSE' : '▶ PLAY';

    container.querySelectorAll('.track-item').forEach((item, i) => {
      item.classList.toggle('active', i === idx);
    });
  }

  // Populate track playlist
  JUKEBOX_TRACKS.forEach((track, idx) => {
    const item = document.createElement('div');
    item.className = `track-item ${idx === getCurrentTrackIndex() ? 'active' : ''}`;
    item.innerHTML = `
      <span class="track-number num">${idx + 1}</span>
      <span class="track-name">${track.title}</span>
      <span class="track-bpm num">${track.bpm} BPM</span>
    `;
    item.onclick = () => {
      startMusic(idx);
      updateTrackDisplay();
    };
    listEl.appendChild(item);
  });

  playBtn.onclick = () => {
    if (isMusicPlaying()) {
      stopMusic();
    } else {
      startMusic(getCurrentTrackIndex());
    }
    updateTrackDisplay();
  };

  prevBtn.onclick = () => {
    const current = getCurrentTrackIndex();
    const prev = (current - 1 + JUKEBOX_TRACKS.length) % JUKEBOX_TRACKS.length;
    startMusic(prev);
    updateTrackDisplay();
  };

  nextBtn.onclick = () => {
    const current = getCurrentTrackIndex();
    const next = (current + 1) % JUKEBOX_TRACKS.length;
    startMusic(next);
    updateTrackDisplay();
  };

  // Visualizer loop
  function renderVisualizer() {
    if (!document.body.contains(container)) {
      if (animId) cancelAnimationFrame(animId);
      return;
    }
    const data = getVisualizerData();
    ctx.clearRect(0, 0, 400, 120);

    const barWidth = 400 / 24;
    for (let i = 0; i < 24; i++) {
      const val = data[i % data.length] || 0;
      const barHeight = isMusicPlaying() ? Math.max(6, (val / 255) * 110) : 4;
      const x = i * barWidth;
      const y = 120 - barHeight;

      const grad = ctx.createLinearGradient(0, y, 0, 120);
      grad.addColorStop(0, '#f5c542');
      grad.addColorStop(0.5, '#a45cff');
      grad.addColorStop(1, '#3d8bff');

      ctx.fillStyle = grad;
      ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
    }

    animId = requestAnimationFrame(renderVisualizer);
  }

  animId = requestAnimationFrame(renderVisualizer);
  updateTrackDisplay();

  return container;
}

