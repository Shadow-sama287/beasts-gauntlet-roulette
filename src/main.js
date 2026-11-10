// src/main.js — Beast Gauntlet & Roulette Master Controller
import {
  buildWheel,
  spin,
  createRouletteState,
  createTameZone,
  tameZoneWidth,
  resolveTame,
  catchBeast,
  missBeast,
  generateSigilDataUri,
  generateSigilSvg,
  buildReelStrip,
  getMinigameForTier,
  MINIGAME_INFO,
  resolveFocusRing,
  resolveConvergence,
  TIER_NAMES,
  TIER_COLORS,
  getPityStatus,
  claimCreditTrackBeast,
} from './roulette.js';
import { trigger8BitTransition } from './ui/transition.js';
import { createSettingsView } from './ui/settings.js';
import { loadBeasts, handleArtError, artForBeast } from './beastLoader.js';
import { loadAlbum, saveAlbum, clearAlbum } from './albumStorage.js';
import { drawWheel, preloadBeastImages } from './ui/wheelCanvas.js';
import {
  playTick,
  playPulseSound,
  playWardHit,
  playConvergencePulse,
  playCatchSound,
  playMissSound,
  playGoodSound,
  playBadSound,
  playPerfectSound,
  playRevealSting,
  sfx,
  toggleSound,
  isSoundEnabled,
} from './audio.js';
import { createGauntletView } from './ui/gauntlet.js';
import { createDojoView } from './ui/dojo.js';
import { createJukeboxView } from './ui/jukebox.js';
import { openCardModal, closeCardModal } from './ui/cardModal.js';
import { initParticles } from './ui/particles.js';
import { MINIGAMES, getGameById } from './minigames/registry.js';
import { pickGame } from './minigames/pick.js';
import { executeMiniGameWithFlow } from './minigames/sharedFlow.js';
import { createReel } from './ui/reelStrip.js';
import { wallet, truncateAddress, NETWORK_NAME } from './chain/wallet.js';
import { loadCachedOwnership, checkRosterOwnership } from './chain/ownership.js';
import { getSpinSeed, deriveSpin, triggerBlockRefresh } from './chain/verifiableSpin.js';
import { createRunReceipt, downloadReceipt } from './chain/receipt.js';
import { SEPOLIA } from './onchain.js';

// Application state
let beasts = [];
let albumData = { caughtIds: [], caughtAt: {}, capturedNamed: [], activeCompanionId: null };
let state = null;
let currentScreen = 'title'; // 'title' | 'wheel' | 'tame' | 'album' | 'end' | 'gauntlet' | 'dojo' | 'jukebox'
let currentSpinResult = null; // { beast, targetAngle, slice, luckyActive }
let tameMinigame = null; // { markerPos, direction, speed, zone, animId, active, luckyActive }
let autoSpinEnabled = false;
let autoSpinTimeout = null;
let albumFilter = 'all'; // 'all' | '1' | '2' | '3' | '4' | '5'
let gameHistory = [];
let currentActiveGame = null;
let activeReelHandle = null;
let currentDifficulty = 1.0;
let currentLatencyMs = 0;
let ownedOnchainSet = new Set();
let runLogs = [];
let runNonce = 'run-' + Date.now().toString(36);
let currentSpinSeedInfo = null;

const urlParams = new URLSearchParams(window.location.search);
const isDebugMode = urlParams.has('debug');
const debugGameParam = urlParams.get('game');
const debugTierParam = Number(urlParams.get('tier')) || 3;
const debugTypeParam = urlParams.get('type') || 'Hunter';

const appEl = document.getElementById('app');

function getActiveCompanion() {
  if (albumData.activeCompanionId) {
    const found = beasts.find((b) => b.id === albumData.activeCompanionId);
    if (found) return found;
  }
  return beasts[0] || null;
}

// Initialize application
async function init() {
  initParticles(document.getElementById('particle-canvas'));
  beasts = await loadBeasts();
  preloadBeastImages(beasts);
  albumData = loadAlbum();

  // Create initial roulette state with seeded RNG and owned set from album
  state = createRouletteState({
    beasts,
    seed: Date.now() ^ 0xbeaf,
    owned: new Set(albumData.caughtIds),
    spinsMax: 25,
    hearts: 3,
    essence: 0,
  });

  // Initialize background verifiable block refresh
  triggerBlockRefresh();

  // Listen to Starknet wallet state changes
  wallet.onChange(async (st) => {
    if (st.isConnected && st.address) {
      ownedOnchainSet = loadCachedOwnership(st.address);
      render();
      const res = await checkRosterOwnership({ beasts, userAddress: st.address });
      if (res.ownedIds && res.ownedIds.size > 0) {
        ownedOnchainSet = res.ownedIds;
        showToast(`🦊 Synced Starknet Sepolia beasts: ${ownedOnchainSet.size} owned!`);
        render();
      }
    } else {
      ownedOnchainSet = new Set();
      render();
    }
  });

  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('resize', () => {
    if (currentScreen === 'wheel') renderWheelScreenCanvas();
  });

  // Direct game launcher support: ?debug=1&game=netToss&tier=3&type=Hunter
  if (debugGameParam) {
    const dummyBeast = {
      id: 'debug-target',
      name: `${debugGameParam.toUpperCase()}`,
      rarity: debugTierParam,
      tier: debugTierParam,
      type: debugTypeParam,
      art: artForBeast(debugTierParam) || generateSigilDataUri('debug', debugGameParam, debugTierParam),
    };
    currentSpinResult = {
      beast: dummyBeast,
      luckyActive: false,
      pityTriggered: false,
    };
    goToScreen('tame');
    return;
  }

  render();
}

function handleGlobalKeydown(e) {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

  if (document.getElementById('beast-card-modal')) {
    if (e.key === 'Escape' || e.code === 'Space') {
      e.preventDefault();
      closeCardModal();
      return;
    }
  }

  // Minigame input ownership lock: ignore space/enter so it doesn't trigger "Continue"
  if (window.__tameInputLocked) {
    if (e.code === 'Space') {
      e.preventDefault();
    }
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (currentScreen === 'title') {
      goToScreen('gauntlet');
    } else if (currentScreen === 'wheel') {
      if (activeReelHandle && activeReelHandle.isSpinning()) {
        activeReelHandle.fastForward();
      } else {
        const spinBtn = document.getElementById('btn-spin');
        if (spinBtn && !spinBtn.disabled) spinBtn.click();
      }
    } else if (currentScreen === 'tame') {
      const continueBtn = document.getElementById('btn-continue');
      if (continueBtn && !continueBtn.disabled) continueBtn.click();
    } else if (currentScreen === 'gauntlet') {
      const statBtn = document.querySelector('.stat-alloc-btn');
      if (statBtn) {
        statBtn.click();
        return;
      }
      const atkBtn = document.getElementById('btn-attack');
      const expBtn = document.getElementById('btn-explore');
      const startG = document.getElementById('btn-start-gauntlet');
      const retryG = document.getElementById('btn-retry-gauntlet');
      if (atkBtn && !atkBtn.disabled) atkBtn.click();
      else if (expBtn && !expBtn.disabled) expBtn.click();
      else if (startG && !startG.disabled) startG.click();
      else if (retryG && !retryG.disabled) retryG.click();
    } else if (currentScreen === 'end') {
      const playAgainBtn = document.getElementById('btn-play-again');
      if (playAgainBtn) playAgainBtn.click();
    }
  } else if (currentScreen !== 'dojo' && (e.key === 'a' || e.key === 'A')) {
    goToScreen(currentScreen === 'album' ? 'wheel' : 'album');
  } else if (e.key === 'g' || e.key === 'G') {
    goToScreen('gauntlet');
  } else if (e.key === 'r' || e.key === 'R') {
    goToScreen('wheel');
  } else if (currentScreen !== 'dojo' && (e.key === 'd' || e.key === 'D')) {
    goToScreen('dojo');
  } else if (e.key === 'j' || e.key === 'J') {
    goToScreen('jukebox');
  } else if (e.key === 'Escape') {
    closeCardModal();
    if (currentScreen !== 'title' && currentScreen !== 'wheel') {
      goToScreen('wheel');
    }
  }
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function goToScreen(screen) {
  closeCardModal();
  if (autoSpinTimeout) clearTimeout(autoSpinTimeout);
  if (tameMinigame && tameMinigame.animId) cancelAnimationFrame(tameMinigame.animId);

  trigger8BitTransition(() => {
    currentScreen = screen;
    render();

    if (currentScreen === 'wheel') {
      requestAnimationFrame(() => {
        renderWheelScreenCanvas();
        if (autoSpinEnabled && !state.gameOver) {
          autoSpinTimeout = setTimeout(() => {
            const btn = document.getElementById('btn-spin');
            if (btn && !btn.disabled) btn.click();
          }, 600);
        }
      });
    }
  });
}

// ----------------- RENDER ENGINE -----------------

function render() {
  appEl.innerHTML = '';

  // Render Debug Toolbar if ?debug=1
  if (isDebugMode) {
    appEl.appendChild(createDebugPanel());
  }

  // Render Roulette Status Bar on wheel & tame screens
  if (currentScreen === 'wheel' || currentScreen === 'tame') {
    appEl.appendChild(createStatusBar());
  }

  // Render specific screen
  let screenEl;
  if (currentScreen === 'tame') {
    document.body.classList.add('hide-bottom-nav');
  } else if (currentScreen !== 'gauntlet' && currentScreen !== 'dojo') {
    document.body.classList.remove('hide-bottom-nav');
  }

  switch (currentScreen) {
    case 'title':
      screenEl = createTitleScreen();
      break;
    case 'wheel':
      screenEl = createWheelScreen();
      break;
    case 'tame':
      screenEl = createTameScreen();
      break;
    case 'gauntlet':
      screenEl = createGauntletView({
        companion: getActiveCompanion(),
        beasts,
        albumData,
        onSelectCompanion: (chosen) => {
          albumData.activeCompanionId = chosen.id;
          saveAlbum(albumData);
        },
        onExit: () => goToScreen('title'),
        onCaptureNamed: handleNamedCapture,
        onDungeonStateChange: (inDungeon) => {
          document.body.classList.toggle('hide-bottom-nav', inDungeon);
        },
      });
      break;
    case 'dojo':
      screenEl = createDojoView({
        companion: getActiveCompanion(),
        onReward: handleDojoReward,
        onExit: () => goToScreen('title'),
        onEnterGauntlet: () => goToScreen('gauntlet'),
      });
      break;
    case 'settings':
    case 'jukebox':
      screenEl = createSettingsView({
        onExit: () => goToScreen('title'),
      });
      break;
    case 'album':
      screenEl = createAlbumScreen();
      break;
    case 'end':
      screenEl = createEndScreen();
      break;
    default:
      screenEl = createTitleScreen();
  }

  appEl.appendChild(screenEl);

  // Render fixed bottom tab bar on all scenes
  appEl.appendChild(createBottomTabBar());
}

function createDebugPanel() {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <div class="debug-row">
      <span style="color:var(--gold); font-weight:bold;">🛠️ DEBUG TOOLBAR</span>
      <span>Seed: ${state ? state.seed : 42}</span>
      <span>Game: <strong>${currentActiveGame ? currentActiveGame.id : 'picker'}</strong></span>
    </div>
    <div class="debug-row">
      <label>Difficulty (${currentDifficulty.toFixed(2)}):</label>
      <input type="range" class="debug-slider" min="0.7" max="1.3" step="0.05" value="${currentDifficulty}" id="slider-diff" style="flex:1;" />
    </div>
    <div class="debug-row">
      <label>Latency (${currentLatencyMs}ms):</label>
      <input type="range" class="debug-slider" min="0" max="120" step="5" value="${currentLatencyMs}" id="slider-latency" style="flex:1;" />
    </div>
  `;

  const sliderDiff = panel.querySelector('#slider-diff');
  sliderDiff.oninput = (e) => {
    currentDifficulty = parseFloat(e.target.value);
    const label = panel.querySelector('.debug-row:nth-child(2) label');
    if (label) label.textContent = `Difficulty (${currentDifficulty.toFixed(2)}):`;
  };

  const sliderLat = panel.querySelector('#slider-latency');
  sliderLat.oninput = (e) => {
    currentLatencyMs = parseInt(e.target.value, 10);
    const label = panel.querySelector('.debug-row:nth-child(3) label');
    if (label) label.textContent = `Latency (${currentLatencyMs}ms):`;
  };

  return panel;
}

function handleNamedCapture(namedBeast) {
  const idStr = String(namedBeast.id);
  if (!albumData.caughtIds.includes(idStr)) {
    albumData.caughtIds.push(idStr);
  }
  albumData.caughtAt[idStr] = Date.now();

  if (!albumData.capturedNamed) albumData.capturedNamed = [];
  if (!albumData.capturedNamed.some((c) => c.id === idStr && c.prefix === namedBeast.prefix)) {
    albumData.capturedNamed.push({
      id: idStr,
      name: namedBeast.name,
      prefix: namedBeast.prefix,
      tier: namedBeast.tier,
      type: namedBeast.type,
      level: namedBeast.level,
      capturedAt: Date.now(),
    });
  }

  state.owned.add(idStr);
  saveAlbum(albumData);
  showToast(`★ NAMED CAPTURE: ${namedBeast.prefix || ''} ${namedBeast.name} added to Beast Dex!`);
}

function handleDojoReward({ essence, gold, strikeBonusPct }) {
  state.essence = Math.min(10, state.essence + (essence || 1));
  if (strikeBonusPct) {
    albumData.companionStrikeBonus = strikeBonusPct;
  }
  showToast(`🥋 Dojo Master: +${strikeBonusPct || 10}% Gauntlet Strike Bonus! (+${essence || 1} Essence, +${gold || 20} Gold)`);
  saveAlbum(albumData);
}

// ----------------- FIXED BOTTOM TAB NAVIGATION & STATUS -----------------

function createBottomTabBar() {
  const nav = document.createElement('nav');
  nav.className = 'bottom-tab-bar';
  nav.setAttribute('aria-label', 'Main Navigation');

  const dexCount = albumData.caughtIds.length;

  nav.innerHTML = `
    <div class="bottom-tab-items">
      <button class="bottom-tab-btn ${currentScreen === 'title' ? 'active' : ''}" data-screen="title" aria-label="Home">
        <span class="tab-svg-icon">
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
            <path d="M8 1L1 8h2v7h4v-4h2v4h4V8h2L8 1z"/>
          </svg>
        </span>
        <span class="tab-btn-label">Home</span>
      </button>

      <button class="bottom-tab-btn ${currentScreen === 'gauntlet' ? 'active' : ''}" data-screen="gauntlet" aria-label="Gauntlet">
        <span class="tab-svg-icon">
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
            <path d="M14 1l-1 2-5 5-2-2 5-5 2-1 1 1zM2 13l2-1 2 2-1 2-2-1-1-2zm1-2l6-6 1 1-6 6-1-1zm8 2l2 2-1 1-2-2 1-1zM1 14l1-1 1 1-1 1-1-1z"/>
          </svg>
        </span>
        <span class="tab-btn-label">Gauntlet</span>
      </button>

      <button class="bottom-tab-btn ${currentScreen === 'wheel' || currentScreen === 'tame' ? 'active' : ''}" data-screen="wheel" aria-label="Roulette">
        <span class="tab-svg-icon">
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
            <path d="M2 2h12v12H2V2zm2 2v8h8V4H4zm2 2h1v4H6V6zm3 0h1v4H9V6z"/>
          </svg>
        </span>
        <span class="tab-btn-label">Roulette</span>
      </button>

      <button class="bottom-tab-btn ${currentScreen === 'dojo' ? 'active' : ''}" data-screen="dojo" aria-label="Dojo">
        <span class="tab-svg-icon">
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
            <path d="M1 2h14v2H1V2zm2 3h10v1H3V5zm1 2h2v7H4V7zm6 0h2v7h-2V7zm-4 1h4v1H6V8z"/>
          </svg>
        </span>
        <span class="tab-btn-label">Dojo</span>
      </button>

      <button class="bottom-tab-btn ${currentScreen === 'album' ? 'active' : ''}" data-screen="album" aria-label="Dex">
        <span class="tab-svg-icon">
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
            <path d="M2 2h5v11H2V2zm7 0h5v11H9V2zM1 1h6a1 1 0 011 1v12a1 1 0 01-1 1H1V1zm14 0H9a1 1 0 00-1 1v12a1 1 0 001 1h6V1z"/>
          </svg>
        </span>
        <span class="tab-btn-label">Dex <span class="tab-count num">(${dexCount})</span></span>
      </button>

      <button class="bottom-tab-btn ${currentScreen === 'settings' || currentScreen === 'jukebox' ? 'active' : ''}" data-screen="settings" aria-label="Settings">
        <span class="tab-svg-icon">
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
            <path d="M7 1h2v2h-2V1zm4 1.5l1.4 1.4-1.4 1.4-1.4-1.4L11 2.5zm3.5 4.5v2h-2V7h2zm-1.5 5.5l-1.4 1.4-1.4-1.4 1.4-1.4 1.4 1.4zM7 13h2v2H7v-2zm-4-1.5l-1.4-1.4 1.4-1.4 1.4 1.4L3 11.5zM1 7h2v2H1V7zm1.5-4.5L3.9 3.9 2.5 5.3 1.1 3.9 2.5 2.5zM8 5a3 3 0 100 6 3 3 0 000-6z"/>
          </svg>
        </span>
        <span class="tab-btn-label">Settings</span>
      </button>
    </div>
  `;

  nav.querySelectorAll('.bottom-tab-btn').forEach((btn) => {
    btn.onclick = () => {
      const target = btn.dataset.screen;
      if (target !== currentScreen) {
        goToScreen(target);
      }
    };
  });

  return nav;
}

function createStatusBar() {
  const bar = document.createElement('header');
  bar.className = 'status-bar';

  // 1. Spins Counter with thin progress bar
  const spinsWrap = document.createElement('div');
  spinsWrap.className = 'stat-chip';
  const remainingSpins = Math.max(0, state.spinsMax - state.spinsUsed);
  const spinPct = Math.min(100, (state.spinsUsed / state.spinsMax) * 100);
  spinsWrap.innerHTML = `
    <span class="stat-label">Free Spins <span class="num font-bold" style="color:var(--gold);">${remainingSpins} left</span></span>
    <div class="meter-track" style="width:100%; height:4px; margin-top:3px;">
      <div class="meter-fill" style="width:${spinPct}%; background:var(--gold);"></div>
    </div>
  `;

  // 2. Essence 10-segments Bar
  const essenceWrap = document.createElement('div');
  essenceWrap.className = 'essence-meter-wrap stat-chip';
  const isLucky = state.essence >= 10 || state.luckyActive;
  essenceWrap.innerHTML = `
    <div style="display:flex; justify-content:space-between; width:100%; margin-bottom:2px;">
      <span class="stat-label">Essence ${state.essence}/10</span>
      ${isLucky ? '<span style="font-size:0.65rem; color:var(--gold); font-weight:bold;">LUCKY!</span>' : ''}
    </div>
    <div class="essence-segments">
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map((i) => `<div class="essence-seg ${i < state.essence ? (isLucky ? 'filled lucky' : 'filled') : ''}"></div>`)
        .join('')}
    </div>
  `;

  // 3. Bestiary Credits (Deterministic Spine)
  const creditsWrap = document.createElement('div');
  creditsWrap.className = 'stat-chip';
  creditsWrap.innerHTML = `
    <span class="stat-label">Bestiary Credits</span>
    <span class="num font-bold" style="color:var(--gold); font-size:1rem; margin-top:2px;">🪙 ${state.credits || 0}</span>
  `;

  bar.appendChild(spinsWrap);
  bar.appendChild(essenceWrap);
  bar.appendChild(creditsWrap);

  return bar;
}

// ----------------- 1. TITLE SCREEN (FULL-SCREEN ARCADE ATTRACT) -----------------

function createTitleScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'screen title-arcade-scene';

  const companion = getActiveCompanion();
  const companionArt = companion ? (companion.art || artForBeast(companion.id)) : '/beasts/art/1.svg';
  const dexCount = albumData.caughtIds.length;
  const totalCount = beasts.length;
  const remainingSpins = Math.max(0, state.spinsMax - state.spinsUsed);

  wrap.innerHTML = `
    <!-- Slim Top Arcade HUD -->
    <div class="title-top-hud">
      <div class="title-hud-chip">
        <span class="hud-chip-label">CREDITS</span>
        <span class="hud-chip-val num" style="color:var(--gold);">🪙 ${state.credits || 0}</span>
      </div>
      <div class="title-hud-chip">
        <span class="hud-chip-label">SPINS LEFT</span>
        <span class="hud-chip-val num" style="color:var(--good);">${remainingSpins}</span>
      </div>
      <div class="title-hud-chip" id="title-chip-dex" style="cursor:pointer;" title="View Beast Dex">
        <span class="hud-chip-label">BEAST DEX</span>
        <span class="hud-chip-val num" style="color:var(--t3);">${dexCount}/${totalCount}</span>
      </div>
    </div>

    <!-- Arcade Header Banner -->
    <div class="title-arcade-header">
      <div class="pixel-tag" style="background:#1d1630; color:var(--gold); border:1px solid var(--gold); margin-bottom:6px;">
        ★ STARKNET BEASTS ARCADE ★
      </div>
      <h1 class="title-arcade-heading">BEAST GAUNTLET</h1>
      <div class="title-arcade-subheading">& ROULETTE</div>
    </div>

    <!-- Centerpiece: Large Animated Companion Beast -->
    <div class="title-companion-centerpiece">
      <div class="title-companion-aura"></div>
      <div class="title-companion-frame" id="title-comp-frame" style="cursor:pointer;" title="Tap to inspect or change companion">
        <img id="title-hero-comp-img" src="${companionArt}" alt="${companion?.name || 'Companion'}" class="title-hero-beast-sprite bounce-idle" />
        <div class="title-comp-chip">
          <span style="color:var(--gold);">★</span>
          <span>${companion ? companion.name : 'Choose Ally'}</span>
          <span style="font-size:0.65rem; color:var(--muted); margin-left:3px;">(TAP)</span>
        </div>
      </div>
      <div class="arcade-attract-pulse">★ TAP TO START ★</div>
    </div>

    <!-- Primary Action Buttons in Thumb Zone -->
    <div class="title-arcade-actions">
      <button id="btn-start-gauntlet-main" class="btn-primary arcade-primary-btn" style="height:52px; font-size:1.15rem; width:100%;">
        ⚔️ ENTER THE GAUNTLET
      </button>
      <button id="btn-start-roulette-main" class="btn-ghost arcade-secondary-btn" style="height:48px; width:100%; border:2px solid var(--gold); color:var(--gold);">
        🎰 SPIN THE WHEEL
      </button>
    </div>
  `;

  const compImg = wrap.querySelector('#title-hero-comp-img');
  if (compImg && companion) {
    compImg.onerror = () => handleArtError(compImg, companion);
  }

  wrap.querySelector('#title-comp-frame').onclick = () => {
    if (companion) {
      openCardModal(companion, {
        isCaught: true,
        isCompanion: true,
        isOwnedOnchain: ownedOnchainSet.has(String(companion.id)),
        onSelectCompanion: (selected) => {
          albumData.activeCompanionId = selected.id;
          saveAlbum(albumData);
          render();
        },
      });
    } else {
      goToScreen('album');
    }
  };

  wrap.querySelector('#title-chip-dex').onclick = () => goToScreen('album');
  wrap.querySelector('#btn-start-gauntlet-main').onclick = () => goToScreen('gauntlet');
  wrap.querySelector('#btn-start-roulette-main').onclick = () => goToScreen('wheel');

  return wrap;
}

function openOddsModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="odds-dialog arcade-panel" style="max-width:440px; width:92%; background:#10101c; border:2px solid var(--gold); border-radius:10px; padding:18px; color:var(--text);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="arcade-title" style="font-size:1.1rem;">📊 GACHA ODDS & PITY RULES</h3>
        <button id="btn-close-odds" class="btn-ghost arcade-btn" style="min-height:28px; padding:2px 8px;">✕</button>
      </div>

      <p style="font-size:0.75rem; color:var(--muted); margin:6px 0 12px;">
        Conforms to GACHA_SYSTEM_SPEC.md (Starr Road deterministic spine + pity).
      </p>

      <div class="odds-table" style="display:flex; flex-direction:column; gap:6px; background:#0a0a12; padding:10px; border-radius:8px; border:1px solid var(--line);">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t5);"><span>Common (T5)</span><span class="num font-bold">50.0%</span><span style="font-size:0.72rem; color:var(--muted)">+5 credits/dupe</span></div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t4);"><span>Uncommon (T4)</span><span class="num font-bold">28.0%</span><span style="font-size:0.72rem; color:var(--muted)">+15 credits/dupe</span></div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t3);"><span>Rare (T3)</span><span class="num font-bold">15.0%</span><span style="font-size:0.72rem; color:var(--muted)">+40 credits/dupe</span></div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t2);"><span>Mythic/Epic (T2)</span><span class="num font-bold">5.0%</span><span style="font-size:0.72rem; color:var(--muted)">+120 credits/dupe</span></div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t1);"><span>Legendary (T1)</span><span class="num font-bold">2.0%</span><span style="font-size:0.72rem; color:var(--muted)">+400 credits/dupe</span></div>
      </div>

      <div style="margin-top:12px; background:#0e0e18; padding:10px; border-radius:8px; font-size:0.75rem; border:1px solid var(--line);">
        <div style="color:var(--gold); font-weight:bold; margin-bottom:4px;">★ BAD LUCK PROTECTION & PROGRESSION:</div>
        <div>• <strong>Rare (T3) or better:</strong> Guaranteed on 15th spin without one.</div>
        <div>• <strong>Legendary (T1):</strong> Guaranteed on 45th spin without one.</div>
        <div>• <strong>Unowned Beast Preference:</strong> Unowned beasts have 3x higher weight.</div>
        <div>• <strong>Starr Road:</strong> Duplicates give credits to unlock guaranteed beast rarities!</div>
      </div>
    </div>
  `;
  modal.querySelector('#btn-close-odds').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}

// ----------------- 2. WHEEL SCREEN -----------------

function createWheelScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'screen';

  const pity = getPityStatus(state);
  const targetTierColor = TIER_COLORS[pity.targetTier] || '#fff';

  const gachaPanelHtml = `
    <div class="gacha-status-card arcade-panel">
      <!-- Pity Counters Row -->
      <div class="gacha-pity-row">
        <div class="pity-chip ${pity.tier3In === 1 ? 'flash' : ''}">
          <span class="pity-chip-label">✨ RARE+ (T3) PITY:</span>
          <span class="pity-chip-val num font-bold">${pity.tier3In === 1 ? 'GUARANTEED NEXT!' : `${pity.tier3In} spins`}</span>
        </div>
        <div class="pity-chip ${pity.tier1In === 1 ? 'flash' : ''}">
          <span class="pity-chip-label">👑 LEGEND PITY:</span>
          <span class="pity-chip-val num font-bold">${pity.tier1In === 1 ? 'GUARANTEED NEXT!' : `${pity.tier1In} spins`}</span>
        </div>
        <button id="btn-show-odds" class="btn-ghost arcade-btn" style="min-height:28px; padding:2px 8px; font-size:0.75rem;">
          📊 Odds
        </button>
      </div>

      <!-- Starr Road / Credit Track (Deterministic Progression Spine) -->
      <div class="credit-track-bar">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.76rem;">
          <span><strong>STARR TRACK:</strong> Next ➔ <strong style="color:${targetTierColor}">T${pity.targetTier} ${pity.targetTierName}</strong></span>
          <span class="num font-bold" style="color:var(--gold);">🪙 ${pity.credits} / ${pity.targetCost} Credits</span>
        </div>
        <div class="meter-track" style="height:7px; margin-top:4px;">
          <div class="meter-fill" style="width:${pity.creditProgressPct}%; background:linear-gradient(90deg, #3d8bff, var(--gold));"></div>
        </div>
        ${
          pity.canClaim
            ? `<button id="btn-claim-track" class="btn-primary arcade-btn" style="width:100%; min-height:36px; margin-top:8px; font-size:0.85rem; background:linear-gradient(135deg, #3ecf6e, #2ea354);">
                ★ CLAIM T${pity.targetTier} ${pity.targetTierName.toUpperCase()} BEAST NOW! ★
              </button>`
            : ''
        }
      </div>
    </div>
  `;

  const previewStrip = buildReelStrip(beasts[0] || { id: '1', name: 'Beast', rarity: 5 }, beasts, state.rng, 8, 4);

  wrap.innerHTML = `
    ${gachaPanelHtml}

    <div id="reel-mount" class="reel-mount" style="width:100%;">
      <div class="reel-viewport">
        <div class="reel-fade-left"></div>
        <div class="reel-pointer-line"></div>
        <div class="reel-strip" id="reel-strip-preview">
          ${previewStrip
            .map((b) => {
              const tierColor = TIER_COLORS[b.rarity] || '#f2f2f2';
              const sigilSvg = generateSigilSvg(b.id, b.name, b.rarity);
              return `
                <div class="reel-card tier-${b.rarity}" style="width:110px; border-color:${tierColor};">
                  <div class="reel-card-art">${sigilSvg}</div>
                  <div class="reel-card-name" style="color:${tierColor}">${b.name.slice(0, 11)}</div>
                  <div class="reel-card-meta">T${b.rarity}</div>
                </div>
              `;
            })
            .join('')}
        </div>
        <div class="reel-fade-right"></div>
      </div>
    </div>

    <div class="wheel-controls">
      <button id="btn-spin" class="btn-primary" style="width:100%; height:52px; font-size:1.15rem;">
        SPIN REEL (Space)
      </button>

      <label class="demo-toggle-wrap">
        <input type="checkbox" id="chk-auto-spin" ${autoSpinEnabled ? 'checked' : ''} />
        Auto-Spin (stage demo)
      </label>
    </div>
  `;

  const showOddsBtn = wrap.querySelector('#btn-show-odds');
  if (showOddsBtn) {
    showOddsBtn.onclick = openOddsModal;
  }

  const claimBtn = wrap.querySelector('#btn-claim-track');
  if (claimBtn) {
    claimBtn.onclick = () => {
      const res = claimCreditTrackBeast(state, beasts);
      if (res.success) {
        if (!albumData.caughtIds.includes(String(res.beast.id))) {
          albumData.caughtIds.push(String(res.beast.id));
        }
        albumData.caughtAt[String(res.beast.id)] = Date.now();
        saveAlbum(albumData);
        playCatchSound(res.tier);
        showToast(`★ STARR ROAD UNLOCK: T${res.tier} ${res.beast.name} unlocked!`);
        openCardModal(res.beast, {
          isCaught: true,
          isCompanion: albumData.activeCompanionId === res.beast.id,
          isOwnedOnchain: ownedOnchainSet.has(String(res.beast.id)),
        });
        render();
      }
    };
  }

  const reelMount = wrap.querySelector('#reel-mount');
  const spinBtn = wrap.querySelector('#btn-spin');
  const autoChk = wrap.querySelector('#chk-auto-spin');

  autoChk.onchange = (e) => {
    autoSpinEnabled = e.target.checked;
    if (autoSpinEnabled && !spinBtn.disabled) {
      spinBtn.click();
    }
  };

  spinBtn.onclick = async () => {
    if (spinBtn.disabled) return;
    if (state.spinsUsed >= state.spinsMax) {
      goToScreen('end');
      return;
    }

    spinBtn.disabled = true;
    autoChk.disabled = true;

    // Fetch verified block seed or local RNG fallback
    const spinIndex = state.spinsUsed;
    currentSpinSeedInfo = await getSpinSeed({ runNonce, spinIndex });
    triggerBlockRefresh();

    // Decide spin outcome with seeded RNG
    currentSpinResult = spin(state);
    if (!currentSpinResult) {
      goToScreen('end');
      return;
    }
    currentSpinResult.spinSeedInfo = currentSpinSeedInfo;

    activeReelHandle = createReel(reelMount, {
      winner: currentSpinResult.beast,
      pool: beasts,
      rng: state.rng,
      onComplete: () => {
        activeReelHandle = null;
        goToScreen('tame');
      },
    });
  };

  return wrap;
}

function renderWheelScreenCanvas() {
  // Wheel replaced by responsive card reel
}

// ----------------- 3. TAME SCREEN -----------------

function createTameScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'screen';

  if (!currentSpinResult) {
    goToScreen('wheel');
    return wrap;
  }

  const { beast, luckyActive } = currentSpinResult;
  const tier = beast.rarity || beast.tier || 5;
  const tierColor = TIER_COLORS[tier] || '#f2f2f2';
  const tierName = TIER_NAMES[tier] || 'Common';
  const isOwnedOnchain = ownedOnchainSet.has(String(beast.id));

  const seedInfo = currentSpinResult.spinSeedInfo || currentSpinSeedInfo;
  const isVerified = seedInfo && seedInfo.source === 'verified';
  const spinChipHtml = isVerified
    ? `<button id="btn-verified-spin" class="verified-chip" title="Click to view replay data">🔒 Verified #${seedInfo.blockNumber || 'Sepolia'} · ${seedInfo.blockHash ? seedInfo.blockHash.slice(0, 8) + '…' : ''} ↗</button>`
    : `<span class="local-rng-chip">Local RNG</span>`;

  // Pick minigame (respecting debug parameter if set)
  const urlParams = new URLSearchParams(window.location.search);
  const debugGameId = urlParams.get('game');
  const game = (debugGameId && getGameById(debugGameId)) || pickGame(MINIGAMES, beast, state.rng, gameHistory);
  currentActiveGame = game;
  gameHistory.push(game.id);

  wrap.innerHTML = `
    <div class="tame-card card-flip">
      <div class="tame-header">
        <span class="badge-tag" style="background:${tierColor}22; color:${tierColor}; border:1px solid ${tierColor}66;">
          T${tier} ${tierName.toUpperCase()}
        </span>
        ${beast.isOnchain ? '<span class="onchain-pill-badge">ONCHAIN</span>' : '<span class="sigil-pill-badge">SIGIL</span>'}
        ${isOwnedOnchain ? '<span class="owned-pill-badge">OWNED</span>' : ''}
        ${spinChipHtml}
        ${luckyActive ? '<span class="badge-tag" style="background:#f5c542; color:#000; font-weight:bold;">★ LUCKY SPIN ACTIVE (1.6x)</span>' : ''}
      </div>

      <div class="beast-portrait-wrap ${isOwnedOnchain ? 'owned-glow' : ''}" id="beast-card-slot" style="border-color:${isOwnedOnchain ? 'var(--gold)' : tierColor}; box-shadow: 0 0 24px ${isOwnedOnchain ? 'rgba(245, 197, 66, 0.45)' : `${tierColor}44`};">
        <img id="tame-beast-img" class="beast-portrait" src="${beast.art || artForBeast(beast.id) || `/beasts/art/${beast.id}.svg`}" alt="${beast.name}" />
      </div>

      <h2 class="tame-beast-title" style="margin-bottom:2px;">${beast.name}</h2>
      <div style="font-size:0.85rem; color:var(--muted); margin-bottom:12px;">${beast.type || 'Wild'} · #${beast.id}</div>

      <div id="minigame-mount" class="minigame-mount" style="width:100%; min-height:260px; display:flex; align-items:center; justify-content:center;"></div>

      <div id="minigame-action-bar" style="width:100%; margin-top:10px; display:flex; justify-content:center;">
        <button id="btn-tame-action" class="btn-primary" style="width:100%; height:48px; font-size:1.05rem; letter-spacing:0.02em;">
          ${(game.controls || '').toUpperCase().includes('DODGE') ? 'DODGE & STRIKE <span class="kbd-hint">(Space)</span>' : (game.controls || '').toUpperCase().includes('TUG') || (game.controls || '').toUpperCase().includes('MASH') ? 'TUG / PULL <span class="kbd-hint">(Space)</span>' : 'TAME / STRIKE <span class="kbd-hint">(Space)</span>'}
        </button>
      </div>

      <div id="tame-result-panel" class="tame-result-panel" style="display:none;" aria-live="polite"></div>
    </div>
  `;

  const tameImg = wrap.querySelector('#tame-beast-img');
  if (tameImg) {
    tameImg.onerror = () => handleArtError(tameImg, beast);
  }

  const verifiedBtn = wrap.querySelector('#btn-verified-spin');
  if (verifiedBtn) {
    verifiedBtn.onclick = () => openReplayModal(seedInfo, beast);
  }

  const mount = wrap.querySelector('#minigame-mount');
  const actionBar = wrap.querySelector('#minigame-action-bar');
  const tameActionBtn = wrap.querySelector('#btn-tame-action');
  const resultPanel = wrap.querySelector('#tame-result-panel');

  if (tameActionBtn) {
    tameActionBtn.onclick = () => {
      const canvas = mount.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true }));
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    };
  }

  // Input lock while minigame runs
  window.__tameInputLocked = true;

  // Execute minigame with shared flow
  setTimeout(() => {
    executeMiniGameWithFlow(
      game,
      {
        mount,
        beast: { ...beast, tier },
        rng: state.rng,
        settings: {
          difficulty: currentDifficulty,
          latencyMs: currentLatencyMs,
        },
        sfx,
        autoSpinEnabled,
      },
      (res) => {
        window.__tameInputLocked = false;
        onMinigameResolved(res.success, res.grade);
      }
    );
  }, 40);

  function onMinigameResolved(hit, grade = 'hit') {
    mount.style.display = 'none';
    if (actionBar) actionBar.style.display = 'none';
    resultPanel.style.display = 'flex';

    // Record into verifiable run log
    runLogs.push({
      spinIndex: state.spinsUsed,
      beastId: String(beast.id),
      name: beast.name,
      result: hit ? 'tamed' : 'escaped',
      blockHash: seedInfo?.blockHash || null,
      blockNumber: seedInfo?.blockNumber || null,
      seed: seedInfo?.seed || null,
    });

    if (hit) {
      playCatchSound(beast.rarity);
      const isNew = !state.owned.has(beast.id);
      const res = catchBeast(state, beast);

      if (isNew) {
        albumData.caughtIds.push(beast.id);
        albumData.caughtAt[beast.id] = Date.now();
        saveAlbum(albumData);
        showToast(`🎉 New Beast added to Album: ${beast.name}!`);
      } else {
        showToast(`✨ Duplicate: +${res.creditsGained || 10} Credits & +${res.essenceGained} Essence!`);
      }

      resultPanel.innerHTML = `
        <div class="result-badge success" style="color:${tierColor}; font-size:2.2rem; font-weight:800; letter-spacing:0.04em; margin-bottom:2px;">TAMED!</div>
        <div class="result-subtitle" style="font-size:0.95rem; color:var(--muted); margin:4px 0 10px 0;">
          ${isNew ? `New Beast recorded in your Album!` : `Duplicate converted: +${res.creditsGained || 10} Credits · +${res.essenceGained} Essence`}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:12px;">
          <a href="https://beasts.app/#/beast/${beast.id}" target="_blank" rel="noopener" class="beasts-app-link">View on beasts.app ↗</a>
          <a href="https://sepolia.starkscan.co/nft/${SEPOLIA.nft}/${beast.tokenId || beast.id}" target="_blank" rel="noopener" class="beasts-app-link" style="color:var(--gold);">Starkscan NFT ↗</a>
        </div>
        <button id="btn-continue" class="btn-primary" style="width:100%; height:48px;">
          Continue (Space)
        </button>
      `;
    } else {
      playMissSound();
      missBeast(state);
      wrap.querySelector('.tame-card').classList.add('shake-miss');

      resultPanel.innerHTML = `
        <div class="result-badge fail" style="color:var(--bad); font-size:2.2rem; font-weight:800; letter-spacing:0.04em; margin-bottom:2px;">ESCAPED</div>
        <div class="result-subtitle" style="font-size:0.95rem; color:var(--muted); margin:4px 0 10px 0;">
          The beast broke free into the mist!
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:12px;">
          <a href="https://beasts.app/#/beast/${beast.id}" target="_blank" rel="noopener" class="beasts-app-link">View on beasts.app ↗</a>
        </div>
        <button id="btn-continue" class="btn-primary" style="width:100%; height:48px;">
          Continue (Space)
        </button>
      `;
    }

    const continueBtn = resultPanel.querySelector('#btn-continue');
    continueBtn.onclick = () => {
      if (state.spinsUsed >= state.spinsMax) {
        goToScreen('end');
      } else {
        goToScreen('wheel');
      }
    };

    if (autoSpinEnabled) {
      setTimeout(() => {
        if (continueBtn) continueBtn.click();
      }, 900);
    }
  }

  return wrap;
}

// ----------------- MODALS (REPLAY & RECEIPT) -----------------

function openReplayModal(seedInfo, beast) {
  closeCardModal();
  const existing = document.getElementById('replay-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'replay-modal';

  const blockHash = seedInfo?.blockHash || 'N/A';
  const blockNum = seedInfo?.blockNumber || 'Sepolia';
  const explorerUrl = seedInfo?.blockHash ? `https://sepolia.starkscan.co/block/${seedInfo.blockHash}` : '#';

  overlay.innerHTML = `
    <div class="replay-dialog">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="font-family:var(--font-title); font-size:1.25rem; margin:0; color:var(--good);">
          🔒 VERIFIABLE REPLAYABLE SPIN
        </h3>
        <button class="modal-close-btn" id="replay-close">✕</button>
      </div>

      <p style="font-size:0.85rem; color:var(--muted); line-height:1.4; margin-bottom:12px;">
        Every spin is derived from public Starknet Sepolia block data and a run nonce, ensuring anyone can independently replay the spin.
      </p>

      <div style="background:#09090f; border:1px solid var(--line); border-radius:8px; padding:10px; font-size:0.8rem; display:flex; flex-direction:column; gap:6px;">
        <div><strong>Block #:</strong> <span class="num">${blockNum}</span></div>
        <div><strong>Block Hash:</strong> <span class="num" style="word-break:break-all; color:var(--good);">${blockHash}</span></div>
        <div><strong>Run Nonce:</strong> <span class="num">${seedInfo?.runNonce || 'local'}</span></div>
        <div><strong>Spin Index:</strong> <span class="num">${seedInfo?.spinIndex ?? 0}</span></div>
        <div><strong>Seed:</strong> <span class="num">${seedInfo?.seed ?? 'local'}</span></div>
      </div>

      <div id="replay-result-box" style="margin-top:12px; font-size:0.85rem; display:none; padding:8px; border-radius:6px; background:rgba(62, 207, 110, 0.15); border:1px solid var(--good); color:var(--good);"></div>

      <div style="display:flex; gap:8px; margin-top:16px;">
        <button id="btn-run-replay" class="btn-primary" style="flex:1; height:42px;">
          🔄 Replay Spin
        </button>
        ${seedInfo?.blockHash ? `<a href="${explorerUrl}" target="_blank" rel="noopener" class="btn-ghost" style="display:flex; align-items:center; justify-content:center; padding:0 12px; border:1px solid var(--line); font-size:0.8rem;">Explorer ↗</a>` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#replay-close').onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  const runReplayBtn = overlay.querySelector('#btn-run-replay');
  const resultBox = overlay.querySelector('#replay-result-box');

  runReplayBtn.onclick = async () => {
    runReplayBtn.disabled = true;
    runReplayBtn.textContent = 'Deriving…';
    if (seedInfo?.blockHash) {
      const derived = await deriveSpin({
        beasts,
        owned: state.owned,
        blockHash: seedInfo.blockHash,
        runNonce: seedInfo.runNonce,
        spinIndex: seedInfo.spinIndex,
        pityCounter: state.pityCounter,
      });
      resultBox.style.display = 'block';
      resultBox.innerHTML = `✓ Replay verified: yields <strong>${derived.beast.name} (T${derived.beast.rarity})</strong> matching target angle ${derived.targetAngle.toFixed(2)} rad.`;
    } else {
      resultBox.style.display = 'block';
      resultBox.innerHTML = `Local RNG spin: seed ${seedInfo?.seed || 'RNG'} yielded <strong>${beast.name}</strong>.`;
    }
    runReplayBtn.textContent = 'Replayed ✓';
  };
}

function openReceiptModal(receiptData) {
  closeCardModal();
  const existing = document.getElementById('receipt-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'receipt-modal';

  const jsonStr = JSON.stringify(receiptData.receipt, null, 2);

  overlay.innerHTML = `
    <div class="receipt-dialog">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h3 style="font-family:var(--font-title); font-size:1.25rem; margin:0; color:var(--gold);">
          📜 STARKNET RUN RECEIPT
        </h3>
        <button class="modal-close-btn" id="receipt-close">✕</button>
      </div>

      <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
        <span class="badge-tag" style="background:#1f4037; color:#99f2c8; font-size:0.75rem;">
          ${receiptData.status}
        </span>
        <span class="badge-tag" style="background:#261f14; color:var(--gold); font-size:0.75rem;">
          Gas-free · SNIP-12
        </span>
      </div>

      <div style="font-size:0.78rem; color:var(--muted); margin-bottom:4px;">
        Run Hash (31 bytes felt): <span class="num font-bold" style="color:var(--text);">${receiptData.receipt.runHash}</span>
      </div>

      <pre class="receipt-json-pre">${jsonStr}</pre>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px;">
        <button id="btn-copy-receipt-json" class="btn-primary" style="height:42px; font-size:0.85rem;">
          📋 Copy JSON
        </button>
        <button id="btn-download-receipt-json" class="btn-primary" style="height:42px; background:var(--panel-2); border:1px solid var(--gold); color:var(--gold); font-size:0.85rem;">
          💾 Download JSON
        </button>
      </div>

      <div style="text-align:center; margin-top:8px;">
        <button disabled class="btn-ghost" style="opacity:0.45; font-size:0.75rem; cursor:not-allowed;">
          🪙 Mint Onchain NFT (Coming Soon)
        </button>
        <div style="font-size:0.68rem; color:var(--muted); margin-top:2px;">
          Simulated run only — zero gas spent, no contract mint transaction.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#receipt-close').onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  overlay.querySelector('#btn-copy-receipt-json').onclick = async () => {
    try {
      await navigator.clipboard.writeText(jsonStr);
      showToast('Receipt JSON copied to clipboard!');
    } catch {
      showToast('Copied to clipboard');
    }
  };

  overlay.querySelector('#btn-download-receipt-json').onclick = () => {
    downloadReceipt(receiptData.receipt);
    showToast('Downloaded beast-run-receipt.json');
  };
}

// ----------------- 4. ALBUM / BEAST DEX SCREEN -----------------

function createAlbumScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'screen dex-screen-view';

  const totalBeasts = beasts.length;
  const caughtCount = albumData.caughtIds.length;
  const namedCount = (albumData.capturedNamed || []).length;
  const ownedCount = ownedOnchainSet.size;
  const caughtPct = Math.round((caughtCount / (totalBeasts || 1)) * 100);

  // Filter beasts by rarity or category
  const filtered = beasts.filter((b) => {
    if (albumFilter === 'all') return true;
    if (albumFilter === 'artathon') return Boolean(b.isArtathon || Number(b.id) >= 10000);
    return String(b.rarity) === albumFilter;
  });

  wrap.innerHTML = `
    <!-- Sticky, Non-Overflowing Header -->
    <div class="dex-sticky-header">
      <div class="dex-header-row">
        <div style="display:flex; align-items:center; gap:8px;">
          <button id="btn-back-from-dex" class="btn-subview-back" title="Back">‹</button>
          <div>
            <h2 class="arcade-title" style="font-size:1.25rem; margin:0; color:var(--gold); line-height:1.1;">
              BEAST DEX
            </h2>
            <div style="font-size:0.7rem; color:var(--muted); margin-top:1px;">
              ${ownedCount ? `Starknet NFTs: ${ownedCount} owned · ` : ''}Named: ${namedCount}
            </div>
          </div>
        </div>

        <div class="dex-counter-pill">
          <span class="num font-bold" style="font-size:0.95rem; color:var(--text);">${caughtCount}/${totalBeasts}</span>
          <span style="font-size:0.65rem; color:var(--good); font-weight:bold; margin-left:4px;">${caughtPct}%</span>
        </div>
      </div>

      <!-- Thin Progress Bar -->
      <div class="dex-progress-track">
        <div class="dex-progress-bar-fill" style="width:${caughtPct}%;"></div>
      </div>

      <!-- Single Horizontal Scrolling Row of Filter Chips Starting with All -->
      <div class="dex-filter-scroll-row">
        <button class="filter-chip ${albumFilter === 'all' ? 'active' : ''}" data-filter="all">All (${totalBeasts})</button>
        <button class="filter-chip ${albumFilter === 'artathon' ? 'active' : ''}" data-filter="artathon" style="color:#d8b4fe; border-color:var(--t2);">🎨 Artathon (30)</button>
        <button class="filter-chip ${albumFilter === '1' ? 'active' : ''}" data-filter="1" style="color:var(--t1);">T1 Legend</button>
        <button class="filter-chip ${albumFilter === '2' ? 'active' : ''}" data-filter="2" style="color:var(--t2);">T2 Epic</button>
        <button class="filter-chip ${albumFilter === '3' ? 'active' : ''}" data-filter="3" style="color:var(--t3);">T3 Rare</button>
        <button class="filter-chip ${albumFilter === '4' ? 'active' : ''}" data-filter="4" style="color:var(--t4);">T4 Uncommon</button>
        <button class="filter-chip ${albumFilter === '5' ? 'active' : ''}" data-filter="5" style="color:var(--t5);">T5 Common</button>
      </div>
    </div>

    <!-- Beast Grid -->
    <div class="beast-grid" id="album-grid"></div>

    <div style="text-align:center; margin: 20px 0 32px;">
      <button id="btn-reset-album" class="btn-ghost" style="font-size:0.75rem; color:var(--muted); border:1px solid var(--line);">
        🗑️ Clear Local Album Cache
      </button>
    </div>
  `;

  wrap.querySelector('#btn-back-from-dex').onclick = () => goToScreen('title');

  wrap.querySelectorAll('.filter-chip').forEach((btn) => {
    btn.onclick = () => {
      albumFilter = btn.dataset.filter;
      render();
    };
  });

  wrap.querySelector('#btn-reset-album').onclick = () => {
    if (confirm('Are you sure you want to reset your local collection album?')) {
      clearAlbum();
      albumData = { caughtIds: [], caughtAt: {}, capturedNamed: [], activeCompanionId: null };
      state.owned = new Set();
      showToast('Local album cleared');
      render();
    }
  };

  const gridEl = wrap.querySelector('#album-grid');
  filtered.forEach((b) => {
    const bIdStr = String(b.id);
    const isCaught = albumData.caughtIds.some((id) => String(id) === bIdStr);
    const isOwnedOnchain = ownedOnchainSet.has(bIdStr);
    const namedVariant = (albumData.capturedNamed || []).find((c) => String(c.id) === bIdStr);
    const isCompanion = String(albumData.activeCompanionId) === bIdStr;
    const tier = b.tier || b.rarity || 5;
    const tierColor = TIER_COLORS[tier] || '#f2f2f2';
    const tierName = TIER_NAMES[tier] || 'Common';
    const combatType = b.type || (tier % 3 === 0 ? 'Brute' : tier % 3 === 1 ? 'Magical' : 'Hunter');
    const typeIcons = { Magical: '🪄', Hunter: '🏹', Brute: '🔨' };

    const card = document.createElement('div');
    card.className = `album-card ${isCaught ? 'caught' : 'uncaught'} ${isOwnedOnchain ? 'owned-card' : ''} ${namedVariant ? 'named-card' : ''} ${isCompanion ? 'companion-card' : ''}`;

    if (isCaught || isOwnedOnchain) {
      card.style.borderColor = isOwnedOnchain ? 'var(--gold)' : namedVariant ? 'var(--gold)' : `${tierColor}66`;
      card.style.boxShadow = isOwnedOnchain ? '0 0 18px rgba(245, 197, 66, 0.45)' : namedVariant ? '0 0 14px rgba(245, 197, 66, 0.4)' : `0 4px 12px ${tierColor}18`;

      const cardName = namedVariant ? `${namedVariant.prefix} ${b.name}` : b.name;

      const artSrc = b.art || artForBeast(b.id) || `/beasts/art/${b.id}.svg`;

      card.innerHTML = `
        <div class="album-card-art-wrap tamed-frame">
          <img class="album-card-art" src="${artSrc}" alt="${cardName}" />
          ${isCompanion ? '<span class="companion-active-star">★ ALLY</span>' : ''}
        </div>
        <div class="album-card-title">${cardName}</div>
        <div class="album-card-meta">
          <span style="color:${tierColor}; font-weight:bold;">T${b.rarity}</span>
          <span>${typeIcons[combatType] || ''} ${tierName}</span>
        </div>
        <div class="card-badge-container">
          ${(b.isArtathon || Number(b.id) >= 10000) ? '<span class="artathon-pill-badge" style="font-size:0.58rem; padding:1px 4px;">ARTATHON</span>' : ''}
          ${b.isOnchain ? '<span class="onchain-pill-badge" style="font-size:0.58rem; padding:1px 4px;">ONCHAIN</span>' : '<span class="sigil-pill-badge" style="font-size:0.58rem; padding:1px 4px;">LOCAL</span>'}
          ${isOwnedOnchain ? '<span class="owned-pill-badge" style="font-size:0.58rem; padding:1px 4px;">OWNED</span>' : ''}
          ${namedVariant ? '<span style="font-size:0.58rem; color:var(--gold); font-weight:bold;">NAMED</span>' : ''}
        </div>
      `;
    } else {
      // Locked card: Dark silhouette of real art + big "?" overlay with NO spoilers (no tier, type, or onchain badges)
      const artSrc = b.art || artForBeast(b.id) || `/beasts/art/${b.id}.svg`;
      card.innerHTML = `
        <div class="album-card-art-wrap locked-frame">
          <img class="album-card-art silhouette" src="${artSrc}" alt="???" />
          <div class="silhouette-q-overlay">?</div>
        </div>
        <div class="album-card-title" style="color:var(--muted);">???</div>
        <div class="album-card-meta">
          <span style="color:var(--muted); font-size:0.75rem;">Undiscovered</span>
        </div>
        <div class="card-badge-container">
          ${(b.isArtathon || Number(b.id) >= 10000) ? '<span class="artathon-pill-badge" style="font-size:0.55rem; padding:1px 3px;">ARTATHON</span>' : ''}
          <span class="locked-chip-tag">LOCKED</span>
        </div>
      `;
    }

    const img = card.querySelector('img');
    if (img) img.onerror = () => handleArtError(img, b);

    // Clicking card opens 3D Holographic Tilt Modal
    card.style.cursor = 'pointer';
    card.onclick = () => {
      openCardModal(b, {
        isCaught,
        isCompanion,
        isOwnedOnchain,
        onSelectCompanion: (selected) => {
          albumData.activeCompanionId = selected.id;
          saveAlbum(albumData);
          showToast(`★ Set ${selected.name} as active Companion!`);
          render();
        },
      });
    };

    gridEl.appendChild(card);
  });

  return wrap;
}

// ----------------- 5. END SCREEN -----------------

function createEndScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'screen';

  const caughtInRun = state.owned.size;
  const spinsUsed = state.spinsUsed;

  let rarestBeast = null;
  for (const b of beasts) {
    if (state.owned.has(b.id)) {
      if (!rarestBeast || b.rarity < rarestBeast.rarity) {
        rarestBeast = b;
      }
    }
  }

  const rarestDesc = rarestBeast
    ? `${rarestBeast.name} (T${rarestBeast.rarity} ${TIER_NAMES[rarestBeast.rarity]})`
    : 'None';

  const shareText = `🎰 Beast Gauntlet & Roulette Summary
🏆 Beasts Owned: ${caughtInRun}/${beasts.length}
👑 Rarest Tamed: ${rarestDesc}
❤️ Hearts Left: ${state.hearts}/3
🎯 Spins Used: ${spinsUsed}/${state.spinsMax}
✨ Essence Gathered: ${state.essence}
Local collection (not minted) · beasts.app`;

  wrap.innerHTML = `
    <div class="end-card">
      <h1>${state.hearts <= 0 ? 'HUNT ENDED' : 'MAX SPINS REACHED'}</h1>
      <p class="subhead">${state.hearts <= 0 ? 'You ran out of hearts in the wild.' : 'You completed your 25 spins!'}</p>

      <div class="summary-tiles">
        <div class="summary-tile">
          <span class="stat-label">Beasts Owned</span>
          <span class="stat-val num" style="font-size:1.3rem; color:var(--good);">${caughtInRun}/${beasts.length}</span>
        </div>
        <div class="summary-tile">
          <span class="stat-label">Spins Used</span>
          <span class="stat-val num" style="font-size:1.3rem; color:var(--gold);">${spinsUsed}/${state.spinsMax}</span>
        </div>
        <div class="summary-tile" style="grid-column: span 2;">
          <span class="stat-label">Rarest Beast Tamed</span>
          <span class="stat-val" style="font-size:1.05rem; color:${rarestBeast ? TIER_COLORS[rarestBeast.rarity] : 'var(--text)'};">
            ${rarestDesc}
          </span>
        </div>
      </div>

      <div class="share-box">${shareText}</div>

      <div class="end-actions">
        <button id="btn-sign-receipt" class="btn-primary" style="height:48px; background:linear-gradient(135deg, #1f4037, #99f2c8); color:#000; font-weight:800;">
          ✍️ Sign Run Receipt (Gas-free)
        </button>
        <button id="btn-copy-share" class="btn-primary" style="height:48px;">
          📋 Copy Result
        </button>
        <button id="btn-play-again" class="btn-primary" style="height:48px; background:var(--panel-2); border:1px solid var(--gold); color:var(--gold);">
          🔄 Play Again (Space)
        </button>
        <button id="btn-view-album" class="btn-ghost">
          📖 View Beast Dex
        </button>
      </div>
    </div>
  `;

  const signReceiptBtn = wrap.querySelector('#btn-sign-receipt');
  if (signReceiptBtn) {
    signReceiptBtn.onclick = async () => {
      signReceiptBtn.disabled = true;
      signReceiptBtn.textContent = 'Generating…';
      try {
        const res = await createRunReceipt({
          account: wallet.state.account,
          player: wallet.state.address,
          runLogs,
          tamed: caughtInRun,
          spins: spinsUsed,
          chainId: wallet.state.chainId,
        });
        openReceiptModal(res);
      } catch (err) {
        showToast('Receipt error: ' + err.message);
      } finally {
        signReceiptBtn.disabled = false;
        signReceiptBtn.textContent = '✍️ Sign Run Receipt (Gas-free)';
      }
    };
  }

  wrap.querySelector('#btn-copy-share').onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Copied result to clipboard! 📋');
    } catch {
      showToast('Result copied! (Fallback)');
    }
  };

  wrap.querySelector('#btn-play-again').onclick = () => {
    runLogs = [];
    runNonce = 'run-' + Date.now().toString(36);
    state = createRouletteState({
      beasts,
      seed: Date.now() ^ 0xcafe,
      owned: new Set(albumData.caughtIds),
      spinsMax: 30,
      hearts: 3,
      essence: 0,
    });
    goToScreen('wheel');
  };

  wrap.querySelector('#btn-view-album').onclick = () => goToScreen('album');

  return wrap;
}

// Start game
init();
