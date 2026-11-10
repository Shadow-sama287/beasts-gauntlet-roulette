// src/ui/settings.js — Arcade Settings & Sound Studio
import {
  toggleSound,
  isSoundEnabled,
  JUKEBOX_TRACKS,
  startMusic,
  stopMusic,
  isMusicPlaying,
  getCurrentTrackIndex,
  getVisualizerData,
} from '../audio.js';
import { clearAlbum } from '../albumStorage.js';
import { wallet, truncateAddress } from '../chain/wallet.js';

export function createSettingsView({ onExit } = {}) {
  const container = document.createElement('div');
  container.className = 'screen settings-screen';

  let animId = null;
  const isCrtActive = document.body.classList.contains('crt-active');
  const isConnected = wallet.state.isConnected && wallet.state.address;
  let resetStep = 0; // 0: idle, 1: confirmed once

  container.innerHTML = `
    <div class="settings-card arcade-panel">
      <div class="page-top-header">
        <button id="btn-settings-back" class="btn-subview-back" title="Back">‹</button>
        <div class="page-top-titles">
          <h2 class="arcade-title">SETTINGS & STUDIO</h2>
          <span class="subhead">Audio, Starknet wallet, display & Sound Studio</span>
        </div>
      </div>

      <!-- Collapsible Accordion Sections -->
      <div class="settings-accordion">
        
        <!-- 1. STARKNET WALLET -->
        <details class="settings-detail-section" open>
          <summary class="settings-summary">
            <span class="summary-title">🦊 STARKNET WALLET (SEPOLIA)</span>
            <span class="summary-status">${isConnected ? truncateAddress(wallet.state.address) : 'Disconnected'}</span>
          </summary>
          <div class="settings-content">
            <div class="setting-item">
              <div>
                <div class="setting-label">${isConnected ? 'Wallet Connected' : 'Connect Starknet Wallet'}</div>
                <div class="setting-desc" id="settings-wallet-desc">
                  ${isConnected ? `${wallet.state.address} · Starknet Sepolia` : 'Optional read-only connection (ArgentX / Braavos) to verify onchain Beasts NFT ownership.'}
                </div>
              </div>
              <div>
                ${isConnected
                  ? `<button id="btn-settings-disconnect" class="btn-danger arcade-btn" style="min-height:36px; padding:4px 12px; font-size:0.8rem;">Disconnect</button>`
                  : `<button id="btn-settings-connect" class="btn-primary arcade-btn" style="min-height:38px; padding:6px 14px; font-size:0.85rem;">Connect Wallet</button>`
                }
              </div>
            </div>
          </div>
        </details>

        <!-- 2. AUDIO & DISPLAY -->
        <details class="settings-detail-section" open>
          <summary class="settings-summary">
            <span class="summary-title">🕹️ AUDIO & DISPLAY</span>
            <span class="summary-status">${isSoundEnabled() ? 'Sound ON' : 'Muted'}</span>
          </summary>
          <div class="settings-content">
            <div class="setting-item">
              <div>
                <div class="setting-label">Master Audio & Battle SFX</div>
                <div class="setting-desc">Web Audio synthesized 8-bit chiptunes & impacts</div>
              </div>
              <label class="switch-control">
                <input type="checkbox" id="chk-audio" ${isSoundEnabled() ? 'checked' : ''} />
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="setting-item" style="margin-top:10px;">
              <div>
                <div class="setting-label">CRT Phosphor Scanlines</div>
                <div class="setting-desc">Retro arcade monitor raster scanline filter</div>
              </div>
              <label class="switch-control">
                <input type="checkbox" id="chk-crt" ${isCrtActive ? 'checked' : ''} />
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>
        </details>

        <!-- 3. MOB SOUND STUDIO (Mini Player) -->
        <details class="settings-detail-section" open>
          <summary class="settings-summary">
            <span class="summary-title">🎵 MOB SOUND STUDIO</span>
            <span class="summary-status num">${JUKEBOX_TRACKS.length} Tracks</span>
          </summary>
          <div class="settings-content">
            <p style="font-size:0.75rem; color:var(--muted); margin-bottom:8px;">
              Musical Onchain Beasts (MOB) procedural chiptune synth. Each track drives the rhythm lanes in the Beast Dojo.
            </p>

            <!-- Real-time Visualizer Canvas -->
            <div class="visualizer-container" style="border:1px solid var(--line); border-radius:8px; overflow:hidden; background:#07070c;">
              <canvas id="visualizer-canvas" class="visualizer-canvas" width="440" height="75" style="width:100%; display:block;"></canvas>
            </div>

            <!-- Track Information -->
            <div class="track-info-box" style="margin-top:8px; text-align:center;">
              <div class="track-title" id="settings-track-title" style="font-weight:bold; font-size:0.95rem; color:var(--text);">Primal Beats (MOB Genesis)</div>
              <div class="track-meta" id="settings-track-meta" style="font-size:0.75rem; color:var(--gold); margin-top:2px;">Track #1 of 4 · 130 BPM · Pentatonic scale</div>
            </div>

            <!-- Player Controls -->
            <div class="jukebox-controls" style="margin-top:8px; display:flex; justify-content:center; align-items:center; gap:10px;">
              <button id="btn-prev-track" class="btn-ghost arcade-btn" style="min-height:38px; padding:4px 14px; font-size:1.1rem;">⏮</button>
              <button id="btn-play-pause" class="btn-primary arcade-btn" style="min-height:40px; min-width:120px; font-size:0.9rem;">
                ▶ PLAY
              </button>
              <button id="btn-next-track" class="btn-ghost arcade-btn" style="min-height:38px; padding:4px 14px; font-size:1.1rem;">⏭</button>
            </div>

            <!-- Compact Playlist Grid -->
            <div class="track-list" id="track-list" style="margin-top:10px; display:grid; grid-template-columns: 1fr 1fr; gap:6px;"></div>
          </div>
        </details>

        <!-- 4. ABOUT & DISCLOSURES -->
        <details class="settings-detail-section">
          <summary class="settings-summary">
            <span class="summary-title">📖 ABOUT & DISCLOSURES</span>
            <span class="summary-status">v1.0 Starknet</span>
          </summary>
          <div class="settings-content" style="font-size:0.78rem; line-height:1.5; color:var(--muted);">
            <div style="background:var(--panel-2); padding:10px; border-radius:8px; border:1px solid var(--line); margin-bottom:8px;">
              <strong style="color:var(--text);">🛡️ Simulated Captures:</strong><br>
              In this demo game, "Capture" is a simulated local replica of the real onchain contract mechanic. No wallet transaction or gas fee is required to tame beasts.
            </div>
            <div style="background:var(--panel-2); padding:10px; border-radius:8px; border:1px solid var(--line); margin-bottom:8px;">
              <strong style="color:var(--text);">⚡ Offline Architecture:</strong><br>
              100% playable with zero network access. All 105 beast SVGs, sound synthesizers, and combat engines are self-hosted locally in the build bundle.
            </div>
            <div style="background:var(--panel-2); padding:10px; border-radius:8px; border:1px solid var(--line);">
              <strong style="color:var(--text);">🌐 Ecosystem Links:</strong><br>
              Official Starknet Beasts profiles & marketplace: <a href="https://beasts.app" target="_blank" rel="noopener" style="color:var(--gold); text-decoration:underline;">beasts.app ↗</a>
            </div>
          </div>
        </details>

        <!-- 5. DANGER ZONE (Two-Step Reset) -->
        <details class="settings-detail-section">
          <summary class="settings-summary">
            <span class="summary-title" style="color:var(--bad);">⚠️ DANGER ZONE</span>
            <span class="summary-status" style="color:var(--bad);">Reset Save</span>
          </summary>
          <div class="settings-content">
            <div style="background:rgba(255,90,95,0.08); border:1px solid rgba(255,90,95,0.3); padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div>
                <div style="font-weight:bold; font-size:0.85rem; color:var(--bad);">Reset Local Dex & Game Save</div>
                <div style="font-size:0.72rem; color:var(--muted);">Clears tamed beasts, album records, gold, and restores starter spins.</div>
              </div>
              <button id="btn-reset-data" class="btn-danger arcade-btn" style="min-height:38px; padding:6px 14px; font-size:0.82rem;">
                Reset All Save Data
              </button>
            </div>
          </div>
        </details>

      </div>
    </div>
  `;

  // Wire back button
  container.querySelector('#btn-settings-back').onclick = () => {
    cleanup();
    if (onExit) onExit();
  };

  // Wallet Connect / Disconnect in Settings
  const connectBtn = container.querySelector('#btn-settings-connect');
  if (connectBtn) {
    connectBtn.onclick = async () => {
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting…';
      const res = await wallet.connect();
      if (!res.success) {
        alert(res.error || 'Wallet connection unavailable');
      }
      cleanup();
      if (onExit) onExit();
    };
  }

  const disconnectBtn = container.querySelector('#btn-settings-disconnect');
  if (disconnectBtn) {
    disconnectBtn.onclick = async () => {
      await wallet.disconnect();
      cleanup();
      if (onExit) onExit();
    };
  }

  // Audio Switch
  const audioChk = container.querySelector('#chk-audio');
  audioChk.onchange = () => {
    toggleSound();
  };

  // CRT Switch
  const crtChk = container.querySelector('#chk-crt');
  crtChk.onchange = () => {
    const active = document.body.classList.toggle('crt-active');
    try {
      localStorage.setItem('br.crt', active ? '1' : '0');
    } catch {}
  };

  // Two-step Reset Confirmation
  const resetBtn = container.querySelector('#btn-reset-data');
  resetBtn.onclick = () => {
    if (resetStep === 0) {
      resetStep = 1;
      resetBtn.textContent = 'CONFIRM: ERASE ALL?';
      resetBtn.style.background = '#ff2222';
      setTimeout(() => {
        if (resetStep === 1) {
          resetStep = 0;
          resetBtn.textContent = 'Reset All Save Data';
          resetBtn.style.background = '';
        }
      }, 4000);
    } else {
      clearAlbum();
      try {
        localStorage.removeItem('br.activeCompanion');
        localStorage.removeItem('br.album');
      } catch {}
      alert('Save cleared! Reloading arcade...');
      window.location.reload();
    }
  };

  // Sound Studio Visualizer & Track Logic
  const canvas = container.querySelector('#visualizer-canvas');
  const ctx = canvas.getContext('2d');
  const playBtn = container.querySelector('#btn-play-pause');
  const trackTitle = container.querySelector('#settings-track-title');
  const trackMeta = container.querySelector('#settings-track-meta');
  const trackListContainer = container.querySelector('#track-list');

  function updateTrackDisplay() {
    const idx = getCurrentTrackIndex();
    const track = JUKEBOX_TRACKS[idx] || JUKEBOX_TRACKS[0];
    trackTitle.textContent = `${track.name || track.title} (${track.category || 'MOB'})`;
    trackMeta.textContent = `Track #${idx + 1} of ${JUKEBOX_TRACKS.length} · ${track.bpm} BPM · ${track.scale || 'Pentatonic'} (${track.key || 'C'})`;
    playBtn.textContent = isMusicPlaying() ? '⏸ PAUSE' : '▶ PLAY';

    container.querySelectorAll('.track-chip').forEach((chip, i) => {
      chip.classList.toggle('active', i === idx);
    });
  }

  function renderTrackList() {
    trackListContainer.innerHTML = '';
    JUKEBOX_TRACKS.forEach((track, i) => {
      const chip = document.createElement('div');
      chip.className = `track-chip ${i === getCurrentTrackIndex() ? 'active' : ''}`;
      chip.style.cssText = 'padding:6px 10px; background:var(--panel-2); border:1px solid var(--line); border-radius:6px; cursor:pointer; font-size:0.75rem;';
      chip.innerHTML = `
        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i + 1}. ${track.name || track.title}</div>
        <div style="font-size:0.68rem; color:var(--gold);">${track.category || 'MOB'} · ${track.bpm} BPM</div>
      `;
      chip.onclick = () => {
        startMusic(i);
        updateTrackDisplay();
      };
      trackListContainer.appendChild(chip);
    });
  }

  playBtn.onclick = () => {
    if (isMusicPlaying()) {
      stopMusic();
    } else {
      startMusic(getCurrentTrackIndex());
    }
    updateTrackDisplay();
  };

  container.querySelector('#btn-prev-track').onclick = () => {
    let nextIdx = getCurrentTrackIndex() - 1;
    if (nextIdx < 0) nextIdx = JUKEBOX_TRACKS.length - 1;
    startMusic(nextIdx);
    updateTrackDisplay();
  };

  container.querySelector('#btn-next-track').onclick = () => {
    let nextIdx = (getCurrentTrackIndex() + 1) % JUKEBOX_TRACKS.length;
    startMusic(nextIdx);
    updateTrackDisplay();
  };

  let idlePhase = 0;
  function drawVisualizer() {
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const isPlaying = isMusicPlaying();
    const data = getVisualizerData();
    const barCount = 32;
    const barWidth = canvas.width / barCount;

    idlePhase += 0.05;

    for (let i = 0; i < barCount; i++) {
      let val = 0;
      if (isPlaying) {
        val = (data[i % data.length] || 0) / 255.0;
      } else {
        // Idle calm waveform so visualizer is never a blank box when paused
        val = 0.12 + 0.08 * Math.sin(idlePhase + i * 0.35);
      }
      const barHeight = Math.max(3, val * canvas.height * 0.9);
      const hue = 35 + i * 4;
      ctx.fillStyle = isPlaying ? `hsl(${hue}, 95%, 55%)` : '#242436';
      ctx.fillRect(i * barWidth + 1, canvas.height - barHeight, barWidth - 2, barHeight);
    }

    animId = requestAnimationFrame(drawVisualizer);
  }

  function cleanup() {
    if (animId) cancelAnimationFrame(animId);
  }

  renderTrackList();
  updateTrackDisplay();
  drawVisualizer();

  return container;
}
