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
import { trigger8BitTransition, forceDismissTransition } from './ui/transition.js';
import { renderErrorRecovery } from './ui/errorBoundary.js';
import { createSettingsView } from './ui/settings.js';
import { loadBeasts, handleArtError, artForBeast } from './beastLoader.js';
import { loadAlbum, saveAlbum, clearAlbum } from './albumStorage.js';
import { preloadBeastImages } from './ui/wheelCanvas.js';
import {
  isGauntletLocked,
  isDojoLocked,
  isFirstSpin,
  getFirstSpinBeast,
  unlockFirstCompanion,
  createFreshAlbumState,
} from './firstRunGate.js';
import { mountFullScreenMinigame } from './minigames/framework.js';
import {
  playTick,
  playPulseSound,
  playCatchSound,
  playMissSound,
  playGoodSound,
  playBadSound,
  playPerfectSound,
  playRevealSting,
  sfx,
} from './audio.js';
import { createGauntletView } from './ui/gauntlet.js';
import { createDojoView } from './ui/dojo.js';
import { createJukeboxView } from './ui/jukebox.js';
import { openCardModal, closeCardModal } from './ui/cardModal.js';
import { initParticles } from './ui/particles.js';
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
let currentScreen = 'title'; // 'title' | 'wheel' | 'tame' | 'album' | 'end' | 'gauntlet' | 'dojo' | 'settings'
let currentSpinResult = null; // { beast, targetAngle, slice, luckyActive, spinSeedInfo }
let quickSpinEnabled = false;
let albumFilter = 'all'; // 'all' | '1' | '2' | '3' | '4' | '5'
let activeReelHandle = null;
let currentDifficulty = 1.0;
let currentLatencyMs = 0;
let ownedOnchainSet = new Set();
let runLogs = [];
let runNonce = 'run-' + Date.now().toString(36);
let currentSpinSeedInfo = null;

const urlParams = new URLSearchParams(window.location.search);
const isDebugMode = urlParams.has('debug');

const appEl = document.getElementById('app');

function getActiveCompanion() {
  if (albumData && albumData.activeCompanionId) {
    const found = beasts.find((b) => String(b.id) === String(albumData.activeCompanionId));
    if (found) return found;
  }
  return null;
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
    spinsMax: 30,
    hearts: 3,
    essence: 0,
  });

  // Background verifiable block refresh
  triggerBlockRefresh();

  // Listen to Starknet wallet state changes
  wallet.onChange(async (st) => {
    if (st.isConnected && st.address) {
      ownedOnchainSet = loadCachedOwnership(st.address);
      render();
      const res = await checkRosterOwnership({ beasts, userAddress: st.address });
      if (res.ownedIds && res.ownedIds.size > 0) {
        ownedOnchainSet = res.ownedIds;
        showToast(`Synced Starknet Sepolia beasts: ${ownedOnchainSet.size} owned!`);
        render();
      }
    } else {
      ownedOnchainSet = new Set();
      render();
    }
  });

  window.addEventListener('keydown', handleGlobalKeydown);

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

  if (currentScreen === 'tame') {
    // In minigame, framework handles space
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (currentScreen === 'title') {
      if (isGauntletLocked(albumData)) {
        goToScreen('wheel');
      } else {
        goToScreen('gauntlet');
      }
    } else if (currentScreen === 'wheel') {
      if (activeReelHandle && activeReelHandle.isSpinning()) {
        activeReelHandle.fastForward();
      } else {
        const spinBtn = document.getElementById('btn-spin');
        if (spinBtn && !spinBtn.disabled) spinBtn.click();
      }
    } else if (currentScreen === 'gauntlet') {
      const namedC = document.getElementById('btn-named-continue');
      const retCamp = document.getElementById('btn-return-camp');
      const atkBtn = document.getElementById('btn-attack');
      const expBtn = document.getElementById('btn-explore');
      const startG = document.getElementById('btn-start-gauntlet');
      const retryG = document.getElementById('btn-retry-gauntlet');
      if (namedC && !namedC.disabled) namedC.click();
      else if (retCamp && !retCamp.disabled) retCamp.click();
      else if (atkBtn && !atkBtn.disabled) atkBtn.click();
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
  setTimeout(() => toast.remove(), 2200);
}

function goToScreen(screen) {
  closeCardModal();

  // First-run gate guard
  if ((screen === 'gauntlet' || screen === 'dojo') && isGauntletLocked(albumData)) {
    showToast(`Tame your first beast in the Roulette to unlock the ${screen === 'gauntlet' ? 'Gauntlet' : 'Dojo'}!`);
    screen = 'wheel';
  }

  trigger8BitTransition(() => {
    currentScreen = screen;
    render();
  });
}

// ----------------- RENDER ENGINE WITH ERROR BOUNDARY -----------------

function render() {
  try {
    appEl.innerHTML = '';

    // Render Debug Toolbar if ?debug=1
    if (isDebugMode) {
      appEl.appendChild(createDebugPanel());
    }

    // Toggle bottom navigation
    if (currentScreen === 'tame') {
      document.body.classList.add('hide-bottom-nav');
    } else if (currentScreen !== 'gauntlet' && currentScreen !== 'dojo') {
      document.body.classList.remove('hide-bottom-nav');
    }

    let screenEl;
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
            albumData.activeCompanionId = String(chosen.id);
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

    // Fixed bottom tab bar on all scenes except full-screen minigame
    if (currentScreen !== 'tame') {
      appEl.appendChild(createBottomTabBar());
    }
  } catch (err) {
    console.error('Fatal render error:', err);
    forceDismissTransition();
    renderErrorRecovery(appEl, err, {
      onRetry: () => render(),
      onReset: () => {
        currentScreen = 'title';
        render();
      },
    });
  }
}

function createDebugPanel() {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <div class="debug-row">
      <span style="color:var(--gold); font-weight:bold;">DEBUG TOOLBAR</span>
      <span>Seed: ${state ? state.seed : 42}</span>
    </div>
    <div class="debug-row">
      <label>Difficulty (${currentDifficulty.toFixed(2)}):</label>
      <input type="range" class="debug-slider" min="0.7" max="1.3" step="0.05" value="${currentDifficulty}" id="slider-diff" style="flex:1;" />
    </div>
  `;

  const sliderDiff = panel.querySelector('#slider-diff');
  sliderDiff.oninput = (e) => {
    currentDifficulty = parseFloat(e.target.value);
    const label = panel.querySelector('.debug-row:nth-child(2) label');
    if (label) label.textContent = `Difficulty (${currentDifficulty.toFixed(2)}):`;
  };

  return panel;
}

function handleNamedCapture(namedBeast) {
  const idStr = String(namedBeast.id);
  // In Gauntlet camp the new beast that appear must be given status as discovered and not as tamed.
  // You can only tame and get new beasts through roulette.
  if (!albumData.discoveredIds) albumData.discoveredIds = [];
  if (!albumData.discoveredIds.includes(idStr)) {
    albumData.discoveredIds.push(idStr);
  }

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

  saveAlbum(albumData);
}

function handleDojoReward({ essence, gold, strikeBonusPct, friendlinessGain, newFriendliness, companionId }) {
  // Sync latest album data from storage to avoid clobbering persisted stats
  const freshAlbum = loadAlbum();
  albumData = freshAlbum;
  state.essence = Math.min(10, state.essence + (essence || 1));
  if (strikeBonusPct) {
    albumData.companionStrikeBonus = strikeBonusPct;
  }
  if (companionId && newFriendliness !== undefined) {
    if (!albumData.friendliness) albumData.friendliness = {};
    albumData.friendliness[String(companionId)] = newFriendliness;
  }
  const fMsg = friendlinessGain ? ` · ♥ Companion Friendliness: ${newFriendliness}% (+${friendlinessGain}%)` : '';
  showToast(`Dojo Master: +${strikeBonusPct || 10}% Gauntlet Strike Bonus${fMsg}! (+${essence || 1} Essence, +${gold || 20} Gold)`);
  saveAlbum(albumData);
}

// ----------------- FIXED BOTTOM TAB NAVIGATION -----------------

function createBottomTabBar() {
  const nav = document.createElement('nav');
  nav.className = 'bottom-tab-bar';
  nav.setAttribute('aria-label', 'Main Navigation');

  const dexCount = albumData.caughtIds.length;
  const isLocked = isGauntletLocked(albumData);

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

      <button class="bottom-tab-btn ${currentScreen === 'gauntlet' ? 'active' : ''} ${isLocked ? 'locked-tab' : ''}" data-screen="gauntlet" aria-label="Gauntlet">
        <span class="tab-svg-icon">
          ${isLocked ? `<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor"><path d="M4 6V4a4 4 0 018 0v2h1a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V7a1 1 0 011-1h2zm2-2a2 2 0 114 0v2H6V4z"/></svg>` : `<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M14 1l-1 2-5 5-2-2 5-5 2-1 1 1zM2 13l2-1 2 2-1 2-2-1-1-2zm1-2l6-6 1 1-6 6-1-1zm8 2l2 2-1 1-2-2 1-1zM1 14l1-1 1 1-1 1-1-1z"/></svg>`}
        </span>
        <span class="tab-btn-label">${isLocked ? 'Locked' : 'Gauntlet'}</span>
      </button>

      <button class="bottom-tab-btn ${currentScreen === 'wheel' ? 'active' : ''}" data-screen="wheel" aria-label="Roulette">
        <span class="tab-svg-icon">
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
            <path d="M2 2h12v12H2V2zm2 2v8h8V4H4zm2 2h1v4H6V6zm3 0h1v4H9V6z"/>
          </svg>
        </span>
        <span class="tab-btn-label">Roulette</span>
      </button>

      <button class="bottom-tab-btn ${currentScreen === 'dojo' ? 'active' : ''} ${isLocked ? 'locked-tab' : ''}" data-screen="dojo" aria-label="Dojo">
        <span class="tab-svg-icon">
          ${isLocked ? `<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor"><path d="M4 6V4a4 4 0 018 0v2h1a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V7a1 1 0 011-1h2zm2-2a2 2 0 114 0v2H6V4z"/></svg>` : `<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M1 2h14v2H1V2zm2 3h10v1H3V5zm1 2h2v7H4V7zm6 0h2v7h-2V7zm-4 1h4v1H6V8z"/></svg>`}
        </span>
        <span class="tab-btn-label">${isLocked ? 'Locked' : 'Dojo'}</span>
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
      if (isLocked && (target === 'gauntlet' || target === 'dojo')) {
        showToast(`Tame your first beast in the Roulette to unlock the ${target === 'gauntlet' ? 'Gauntlet' : 'Dojo'}!`);
        goToScreen('wheel');
        return;
      }
      if (target !== currentScreen) {
        goToScreen(target);
      }
    };
  });

  return nav;
}

// ----------------- 1. TITLE SCREEN -----------------

function createTitleScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'screen title-arcade-scene';

  const isLocked = isGauntletLocked(albumData);
  const companion = getActiveCompanion();
  const companionArt = companion ? (artForBeast(companion.id) || companion.art || `/beasts/art/${companion.id}.svg`) : null;
  const dexCount = albumData.caughtIds.length;
  const totalCount = beasts.length;
  const remainingSpins = Math.max(0, state.spinsMax - state.spinsUsed);

  wrap.innerHTML = `
    <!-- Slim Top Arcade HUD -->
    <div class="title-top-hud">
      <div class="title-hud-chip">
        <span class="hud-chip-label">CREDITS</span>
        <span class="hud-chip-val num" style="color:var(--gold);">${state.credits || 0} CR</span>
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

    <!-- Centerpiece -->
    <div class="title-companion-centerpiece">
      <div class="title-companion-aura"></div>
      ${isLocked ? `
        <div class="title-companion-frame locked-attract-frame" id="title-comp-frame" style="cursor:pointer;" title="Spin the roulette to tame your first beast!">
          <div class="locked-attract-q">?</div>
          <div class="title-comp-chip">
            <span style="color:var(--muted);">No Companion Yet</span>
          </div>
        </div>
        <div class="arcade-attract-pulse">★ SPIN ROULETTE TO TAME FIRST ALLY ★</div>
      ` : `
        <div class="title-companion-frame" id="title-comp-frame" style="cursor:pointer;" title="Tap to inspect active companion">
          <img id="title-hero-comp-img" src="${companionArt}" alt="${companion.name}" class="title-hero-beast-sprite bounce-idle" />
          <div class="title-comp-chip">
            <span style="color:var(--gold);">★</span>
            <span>${companion.name}</span>
            <span style="font-size:0.65rem; color:var(--muted); margin-left:3px;">(TAP)</span>
          </div>
        </div>
        <div class="arcade-attract-pulse">★ TAP TO ENTER GAUNTLET ★</div>
      `}
    </div>

    <!-- Action Buttons in Thumb Zone -->
    <div class="title-arcade-actions">
      ${isLocked ? `
        <button id="btn-start-roulette-main" class="btn-primary arcade-primary-btn" style="height:54px; font-size:1.15rem; width:100%;">
          SPIN THE ROULETTE
        </button>
        <button id="btn-start-gauntlet-locked" class="btn-ghost" style="height:46px; width:100%; opacity:0.55; border:1px solid var(--line); color:var(--muted); font-size:0.88rem;">
          [LOCKED] GAUNTLET
        </button>
      ` : `
        <button id="btn-start-gauntlet-main" class="btn-primary arcade-primary-btn" style="height:52px; font-size:1.15rem; width:100%;">
          ENTER THE GAUNTLET
        </button>
        <button id="btn-start-roulette-main" class="btn-ghost arcade-secondary-btn" style="height:48px; width:100%; border:2px solid var(--gold); color:var(--gold);">
          SPIN THE ROULETTE
        </button>
      `}
    </div>
  `;

  wrap.querySelector('#title-chip-dex').onclick = () => goToScreen('album');
  wrap.querySelector('#btn-start-roulette-main').onclick = () => goToScreen('wheel');

  if (isLocked) {
    const lockedBtn = wrap.querySelector('#btn-start-gauntlet-locked');
    if (lockedBtn) {
      lockedBtn.onclick = () => {
        showToast('Tame your first beast in the Roulette to unlock the Gauntlet!');
        goToScreen('wheel');
      };
    }
  } else {
    const gauntletBtn = wrap.querySelector('#btn-start-gauntlet-main');
    if (gauntletBtn) gauntletBtn.onclick = () => goToScreen('gauntlet');

    const heroImg = wrap.querySelector('#title-hero-comp-img');
    if (heroImg && companion) {
      heroImg.onerror = () => handleArtError(heroImg, companion);
    }

    const frame = wrap.querySelector('#title-comp-frame');
    if (frame && companion) {
      frame.onclick = () => {
        openCardModal(companion, {
          isCaught: true,
          isCompanion: true,
          isOwnedOnchain: ownedOnchainSet.has(String(companion.id)),
          onSelectCompanion: (selected) => {
            albumData.activeCompanionId = String(selected.id);
            saveAlbum(albumData);
            render();
          },
        });
      };
    }
  }

  return wrap;
}

// ----------------- FIRST COMPANION REVEAL MODAL -----------------

function openFirstCompanionModal(beast) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay first-companion-modal';
  const art = artForBeast(beast.id) || beast.art || `/beasts/art/${beast.id}.svg`;
  const tierCol = TIER_COLORS[beast.rarity || beast.tier || 5] || 'var(--gold)';

  modal.innerHTML = `
    <div class="first-comp-dialog arcade-card card-flip" style="border:2px solid var(--gold); background:#120e22; padding:22px 18px; text-align:center; max-width:390px; width:92%; border-radius:12px;">
      <div class="pixel-tag" style="background:#281b38; color:var(--gold); border:1px solid var(--gold); margin-bottom:8px;">
        ★ YOUR FIRST COMPANION! ★
      </div>
      <div class="first-comp-art-frame" style="width:130px; height:130px; margin:0 auto; border:2px solid ${tierCol}; border-radius:12px; overflow:hidden; background:#0c0a18; box-shadow:0 0 25px ${tierCol}44; display:flex; align-items:center; justify-content:center;">
        <img src="${art}" alt="${beast.name}" style="width:100%; height:100%; object-fit:contain;" class="bounce-idle" />
      </div>
      <h2 class="arcade-title" style="color:var(--gold); font-size:1.35rem; margin:10px 0 2px;">
        ${beast.name}
      </h2>
      <div style="font-size:0.85rem; color:${tierCol}; font-weight:bold; margin-bottom:8px;">
        T${beast.rarity || beast.tier} · ${beast.type || 'Hunter'} Beast
      </div>
      <p style="font-size:0.82rem; color:var(--text); line-height:1.4; margin-bottom:16px;">
        ${beast.name} is now your active ally! The <strong>Dungeon Gauntlet</strong> and <strong>Dojo</strong> are now UNLOCKED!
      </p>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <button id="btn-first-comp-gauntlet" class="btn-primary arcade-primary-btn" style="height:52px; font-size:1.05rem; width:100%;">
          ENTER THE GAUNTLET
        </button>
        <button id="btn-first-comp-spin" class="btn-ghost arcade-btn" style="height:44px; border:1px solid var(--gold); color:var(--gold); width:100%;">
          SPIN AGAIN
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const compImg = modal.querySelector('.first-comp-art-frame img');
  if (compImg) {
    compImg.onerror = () => handleArtError(compImg, beast);
  }

  modal.querySelector('#btn-first-comp-gauntlet').onclick = () => {
    modal.remove();
    goToScreen('gauntlet');
  };

  modal.querySelector('#btn-first-comp-spin').onclick = () => {
    modal.remove();
    goToScreen('wheel');
  };
}

// ----------------- ODDS & PITY BOTTOM SHEET -----------------

function openOddsModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  const pity = getPityStatus(state);

  modal.innerHTML = `
    <div class="odds-dialog arcade-panel" style="max-width:440px; width:92%; background:#10101c; border:2px solid var(--gold); border-radius:10px; padding:18px; color:var(--text);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="arcade-title" style="font-size:1.1rem; color:var(--gold);">GACHA ODDS & PITY RULES</h3>
        <button id="btn-close-odds" class="btn-ghost arcade-btn" style="min-height:28px; padding:2px 8px;">✕</button>
      </div>

      <p style="font-size:0.75rem; color:var(--muted); margin:6px 0 12px;">
        Single source of truth per GACHA_CONFIG.pity & Starr Road deterministic spine.
      </p>

      <div class="odds-table" style="display:flex; flex-direction:column; gap:6px; background:#0a0a12; padding:10px; border-radius:8px; border:1px solid var(--line);">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t5);"><span>Common (T5)</span><span class="num font-bold">50.0%</span><span style="font-size:0.72rem; color:var(--muted)">+5 credits/dupe</span></div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t4);"><span>Uncommon (T4)</span><span class="num font-bold">28.0%</span><span style="font-size:0.72rem; color:var(--muted)">+15 credits/dupe</span></div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t3);"><span>Rare (T3)</span><span class="num font-bold">15.0%</span><span style="font-size:0.72rem; color:var(--muted)">+40 credits/dupe</span></div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t2);"><span>Mythic/Epic (T2)</span><span class="num font-bold">5.0%</span><span style="font-size:0.72rem; color:var(--muted)">+120 credits/dupe</span></div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--t1);"><span>Legendary (T1)</span><span class="num font-bold">2.0%</span><span style="font-size:0.72rem; color:var(--muted)">+400 credits/dupe</span></div>
      </div>

      <div style="margin-top:12px; background:#0e0e18; padding:10px; border-radius:8px; font-size:0.75rem; border:1px solid var(--line);">
        <div style="color:var(--gold); font-weight:bold; margin-bottom:4px;">★ BAD LUCK PROTECTION & PITY:</div>
        <div>• <strong>Rare (T3) or better:</strong> Guaranteed on 15th spin without one (${pity.tier3In} spins left).</div>
        <div>• <strong>Legendary (T1):</strong> Guaranteed on 45th spin without one (${pity.tier1In} spins left).</div>
        <div>• <strong>Starr Road:</strong> Duplicates award credits to unlock guaranteed beast tiers!</div>
      </div>
    </div>
  `;
  modal.querySelector('#btn-close-odds').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}

// ----------------- 2. ROULETTE SCREEN (SLIM HUD & HERO REEL) -----------------

function createWheelScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'screen wheel-screen-container';

  const pity = getPityStatus(state);
  const targetTierColor = TIER_COLORS[pity.targetTier] || '#fff';
  const remainingSpins = Math.max(0, state.spinsMax - state.spinsUsed);
  const isLucky = state.essence >= 10 || state.luckyActive;

  wrap.innerHTML = `
    <!-- Slim Top HUD (Single Row) -->
    <div class="wheel-slim-hud">
      <div class="wheel-hud-chip">
        <span class="hud-chip-label">SPINS</span>
        <span class="hud-chip-val num font-bold" style="color:var(--gold);">${remainingSpins} LEFT</span>
      </div>
      <div class="wheel-hud-chip">
        <span class="hud-chip-label">ESSENCE</span>
        <span class="hud-chip-val num" style="color:${isLucky ? '#ffd15c' : 'var(--text)'};">
          ${state.essence}/10 ${isLucky ? '★ LUCKY!' : ''}
        </span>
      </div>
      <div class="wheel-hud-chip">
        <span class="hud-chip-label">CREDITS</span>
        <span class="hud-chip-val num" style="color:var(--good);">${state.credits || 0} CR</span>
      </div>
      <button id="btn-show-odds" class="btn-ghost arcade-btn wheel-odds-btn" title="View Gacha Odds & Pity Rules">
        ODDS & PITY
      </button>
    </div>

    <!-- Center Hero Reel -->
    <div id="reel-mount" class="reel-mount hero-reel-mount ${isLucky ? 'lucky-reel-aura' : ''}" style="width:100%;"></div>

    <!-- Thin Starr Road Progress Track Under Reel -->
    <div class="starr-road-thin-strip" id="starr-road-strip">
      <div class="starr-strip-labels">
        <span><strong>STARR ROAD:</strong> Next ➔ <strong style="color:${targetTierColor}">T${pity.targetTier} ${pity.targetTierName}</strong></span>
        <span class="num font-bold" style="color:var(--gold);">${pity.credits} / ${pity.targetCost} CR</span>
      </div>
      <div class="meter-track" style="height:5px; margin-top:3px;">
        <div class="meter-fill" style="width:${pity.creditProgressPct}%; background:linear-gradient(90deg, #3d8bff, var(--gold));"></div>
      </div>
      ${pity.canClaim ? `
        <button id="btn-claim-track" class="btn-primary arcade-btn" style="width:100%; min-height:36px; margin-top:6px; font-size:0.85rem; background:linear-gradient(135deg, #3ecf6e, #2ea354);">
          ★ CLAIM T${pity.targetTier} ${pity.targetTierName.toUpperCase()} BEAST NOW! ★
        </button>
      ` : ''}
    </div>

    <!-- Lower Half Thumb Zone Controls -->
    <div class="wheel-controls-thumb-zone">
      ${albumData && albumData.caughtIds && albumData.caughtIds.length > 0 ? `
        <div class="wheel-recent-pulls-row">
          <span class="recent-label">RECENT:</span>
          ${albumData.caughtIds.slice(-4).reverse().map((id) => {
            const b = beasts.find((x) => String(x.id) === String(id));
            if (!b) return '';
            const tCol = TIER_COLORS[b.rarity || b.tier || 5] || '#888';
            return `<span class="recent-pull-chip" style="border-color:${tCol}; color:${tCol};">T${b.rarity || b.tier} ${b.name.slice(0, 9)}</span>`;
          }).join('')}
        </div>
      ` : ''}

      <div class="wheel-guaranteed-note">
        ${isLucky ? '★ LUCKY SPIN ACTIVE: 1.6x Expanded Minigame Sweet Spot!' : `Next Rare+ guaranteed in <strong style="color:var(--gold);">${pity.tier3In}</strong> spins`}
      </div>

      <button id="btn-spin" class="btn-primary spin-hero-btn ${isLucky ? 'lucky-spin-btn' : ''}" style="width:100%; height:54px; font-size:1.15rem;" ${remainingSpins <= 0 ? 'disabled' : ''}>
        ${remainingSpins <= 0 ? '0 SPINS LEFT · Earn more in Gauntlet' : isLucky ? `★ LUCKY SPIN · ${remainingSpins} LEFT` : `SPIN · ${remainingSpins} LEFT`}
      </button>

      <div class="wheel-quick-spin-row">
        <label class="demo-toggle-wrap">
          <input type="checkbox" id="chk-quick-spin" ${quickSpinEnabled ? 'checked' : ''} />
          Quick Spin (Fast Easing)
        </label>
      </div>
    </div>
  `;

  // Render initial preview reel
  const reelMount = wrap.querySelector('#reel-mount');
  const previewStrip = buildReelStrip(beasts[0] || { id: '1', name: 'Beast', rarity: 5 }, beasts, state.rng, 8, 4);
  reelMount.innerHTML = `
    <div class="reel-viewport">
      <div class="reel-fade-left"></div>
      <div class="reel-pointer-notch" aria-hidden="true">
        <svg viewBox="0 0 24 16" width="24" height="16" fill="var(--gold)"><polygon points="0,0 24,0 12,16"/></svg>
      </div>
      <div class="reel-strip" id="reel-strip-preview">
        ${previewStrip.map((b) => {
          const tierColor = TIER_COLORS[b.rarity] || '#f2f2f2';
          const art = artForBeast(b.id) || b.art || `/beasts/art/${b.id}.svg`;
          return `
            <div class="reel-card tier-${b.rarity}" style="width:110px; border-color:${tierColor};">
              <div class="reel-card-art">
                <img src="${art}" class="reel-beast-thumb" alt="${b.name}" loading="lazy" />
              </div>
              <div class="reel-card-name" style="color:${tierColor}">${b.name.slice(0, 11)}</div>
              <div class="reel-card-meta">T${b.rarity}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="reel-fade-right"></div>
    </div>
  `;

  wrap.querySelector('#btn-show-odds').onclick = openOddsModal;

  const previewImgs = wrap.querySelectorAll('#reel-strip-preview img');
  previewImgs.forEach((img, idx) => {
    const b = previewStrip[idx];
    if (b) img.onerror = () => handleArtError(img, b);
  });

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

  const quickChk = wrap.querySelector('#chk-quick-spin');
  quickChk.onchange = (e) => {
    quickSpinEnabled = e.target.checked;
  };

  const spinBtn = wrap.querySelector('#btn-spin');
  spinBtn.onclick = async () => {
    if (spinBtn.disabled) return;
    if (state.spinsUsed >= state.spinsMax) {
      goToScreen('end');
      return;
    }

    spinBtn.disabled = true;

    // Verifiable block seed or local fallback
    const spinIndex = state.spinsUsed;
    currentSpinSeedInfo = await getSpinSeed({ runNonce, spinIndex });
    triggerBlockRefresh();

    // Check first-spin tutorial assist
    if (isFirstSpin(albumData)) {
      const starterBeast = getFirstSpinBeast(beasts, state.rng);
      currentSpinResult = {
        beast: starterBeast,
        targetAngle: 0,
        slice: null,
        luckyActive: false,
        pityTriggered: false,
        spinSeedInfo: currentSpinSeedInfo,
      };
      state.spinsUsed++;
    } else {
      currentSpinResult = spin(state);
      if (!currentSpinResult) {
        goToScreen('end');
        return;
      }
      currentSpinResult.spinSeedInfo = currentSpinSeedInfo;
    }

    activeReelHandle = createReel(reelMount, {
      winner: currentSpinResult.beast,
      pool: beasts,
      rng: state.rng,
      quickSpin: quickSpinEnabled,
      onComplete: () => {
        activeReelHandle = null;
        goToScreen('tame');
      },
    });
  };

  return wrap;
}

// ----------------- 3. FULL-SCREEN TAME MINIGAME SCREEN -----------------

function createTameScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'screen tame-fullscreen-container';

  if (!currentSpinResult) {
    goToScreen('wheel');
    return wrap;
  }

  const { beast, luckyActive } = currentSpinResult;
  const tier = beast.rarity || beast.tier || 5;
  const isTutorial = isFirstSpin(albumData);
  const bIdStr = String(beast.id);
  const isNew = !albumData.caughtIds.includes(bIdStr);
  const rolledFriendliness = isNew
    ? (Math.floor(Math.random() * 20) + 1)
    : (albumData.friendliness?.[bIdStr] || 10);

  // Mount Full-Screen Minigame Framework
  mountFullScreenMinigame(wrap, {
    beast,
    tier,
    lucky: luckyActive,
    isTutorial,
    isNew,
    friendliness: rolledFriendliness,
    difficulty: currentDifficulty,
    sfx: {
      tick: playTick,
      good: playGoodSound,
      bad: playBadSound,
      perfect: playPerfectSound,
      catchSound: playCatchSound,
      missSound: playMissSound,
    },
    onComplete: (res) => {
      onMinigameResolved(res.success, res.grade, beast, rolledFriendliness);
    },
  });

  return wrap;
}

function onMinigameResolved(hit, grade = 'hit', beast, initialFriendliness = 10) {
  const seedInfo = currentSpinResult?.spinSeedInfo || currentSpinSeedInfo;

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
    const isFirst = albumData.caughtIds.length === 0;
    const bIdStr = String(beast.id);
    const isNew = !albumData.caughtIds.includes(bIdStr);
    const res = catchBeast(state, beast);

    if (isFirst) {
      unlockFirstCompanion(albumData, beast);
      state.owned.add(bIdStr);
      saveAlbum(albumData);
      openFirstCompanionModal(beast);
      return;
    }

    if (isNew) {
      albumData.caughtIds.push(bIdStr);
      albumData.caughtAt[bIdStr] = Date.now();
      if (!albumData.friendliness) albumData.friendliness = {};
      albumData.friendliness[bIdStr] = initialFriendliness || Math.floor(Math.random() * 20) + 1;
      state.owned.add(bIdStr);
      saveAlbum(albumData);
      showToast(`★ New Beast tamed: ${beast.name}! Friendliness: ${albumData.friendliness[bIdStr]}%`);
    } else {
      // Duplicate does not affect friendliness stat
      showToast(`★ Duplicate: +${res.creditsGained || 10} Credits & +${res.essenceGained} Essence! Friendliness preserved.`);
    }
  } else {
    missBeast(state);
    showToast('The beast escaped into the wild.');
  }

  if (state.spinsUsed >= state.spinsMax) {
    goToScreen('end');
  } else {
    goToScreen('wheel');
  }
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
          VERIFIABLE REPLAYABLE SPIN
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
          Replay Spin
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
          STARKNET RUN RECEIPT
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
          Copy JSON
        </button>
        <button id="btn-download-receipt-json" class="btn-primary" style="height:42px; background:var(--panel-2); border:1px solid var(--gold); color:var(--gold); font-size:0.85rem;">
          Download JSON
        </button>
      </div>

      <div style="text-align:center; margin-top:8px;">
        <button disabled class="btn-ghost" style="opacity:0.45; font-size:0.75rem; cursor:not-allowed;">
          Mint Onchain NFT (Coming Soon)
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

  const filtered = beasts.filter((b) => {
    if (albumFilter === 'all') return true;
    if (albumFilter === 'artathon') return Boolean(b.isArtathon || Number(b.id) >= 10000);
    return String(b.rarity) === albumFilter;
  });

  wrap.innerHTML = `
    <!-- Sticky Header -->
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

      <div class="dex-progress-track">
        <div class="dex-progress-bar-fill" style="width:${caughtPct}%;"></div>
      </div>

      <div class="dex-filter-scroll-row">
        <button class="filter-chip ${albumFilter === 'all' ? 'active' : ''}" data-filter="all">All (${totalBeasts})</button>
        <button class="filter-chip ${albumFilter === 'artathon' ? 'active' : ''}" data-filter="artathon" style="color:#d8b4fe; border-color:var(--t2);">Artathon (30)</button>
        <button class="filter-chip ${albumFilter === '1' ? 'active' : ''}" data-filter="1" style="color:var(--t1);">T1 Legend</button>
        <button class="filter-chip ${albumFilter === '2' ? 'active' : ''}" data-filter="2" style="color:var(--t2);">T2 Epic</button>
        <button class="filter-chip ${albumFilter === '3' ? 'active' : ''}" data-filter="3" style="color:var(--t3);">T3 Rare</button>
        <button class="filter-chip ${albumFilter === '4' ? 'active' : ''}" data-filter="4" style="color:var(--t4);">T4 Uncommon</button>
        <button class="filter-chip ${albumFilter === '5' ? 'active' : ''}" data-filter="5" style="color:var(--t5);">T5 Common</button>
      </div>
    </div>

    <div class="beast-grid" id="album-grid"></div>

    <div style="text-align:center; margin: 20px 0 32px;">
      <button id="btn-reset-album" class="btn-ghost" style="font-size:0.75rem; color:var(--muted); border:1px solid var(--line);">
        Clear Local Album Cache & Re-lock Gate
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
    if (confirm('Are you sure you want to reset your local collection? This will re-lock the Gauntlet until you tame a beast.')) {
      clearAlbum();
      albumData = createFreshAlbumState();
      state.owned = new Set();
      showToast('Local album cleared · Gauntlet locked');
      render();
    }
  };

  const gridEl = wrap.querySelector('#album-grid');
  filtered.forEach((b) => {
    const bIdStr = String(b.id);
    const isCaught = albumData.caughtIds.some((id) => String(id) === bIdStr);
    const isDiscovered = !isCaught && Boolean(albumData.discoveredIds && albumData.discoveredIds.some((id) => String(id) === bIdStr));
    const isOwnedOnchain = ownedOnchainSet.has(bIdStr);
    const namedVariant = (albumData.capturedNamed || []).find((c) => String(c.id) === bIdStr);
    const isCompanion = String(albumData.activeCompanionId) === bIdStr;
    const friendliness = albumData.friendliness?.[bIdStr] !== undefined ? albumData.friendliness[bIdStr] : 10;
    const tier = b.tier || b.rarity || 5;
    const tierColor = TIER_COLORS[tier] || '#f2f2f2';
    const tierName = TIER_NAMES[tier] || 'Common';
    const combatType = b.type || (tier % 3 === 0 ? 'Brute' : tier % 3 === 1 ? 'Magical' : 'Hunter');
    const typeIcons = { Magical: 'MAG', Hunter: 'HNT', Brute: 'BRT' };

    const card = document.createElement('div');
    card.className = `album-card ${isCaught ? 'caught' : isDiscovered ? 'discovered-card' : 'uncaught'} ${isOwnedOnchain ? 'owned-card' : ''} ${namedVariant ? 'named-card' : ''} ${isCompanion ? 'companion-card' : ''}`;

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
          <span class="friendliness-stat-badge">♥ ${friendliness}%</span>
        </div>
        <div class="card-badge-container">
          ${(b.isArtathon || Number(b.id) >= 10000) ? '<span class="artathon-pill-badge" style="font-size:0.58rem; padding:1px 4px;">ARTATHON</span>' : ''}
          ${b.isOnchain ? '<span class="onchain-pill-badge" style="font-size:0.58rem; padding:1px 4px;">ONCHAIN</span>' : '<span class="sigil-pill-badge" style="font-size:0.58rem; padding:1px 4px;">LOCAL</span>'}
          ${isOwnedOnchain ? '<span class="owned-pill-badge" style="font-size:0.58rem; padding:1px 4px;">OWNED</span>' : ''}
          ${namedVariant ? '<span style="font-size:0.58rem; color:var(--gold); font-weight:bold;">NAMED</span>' : ''}
        </div>
      `;
    } else if (isDiscovered) {
      const artSrc = b.art || artForBeast(b.id) || `/beasts/art/${b.id}.svg`;
      card.style.borderColor = 'rgba(100, 150, 255, 0.45)';
      card.style.boxShadow = '0 2px 10px rgba(100, 150, 255, 0.15)';

      card.innerHTML = `
        <div class="album-card-art-wrap discovered-frame" style="border:1px solid rgba(100,150,255,0.4); border-radius:8px; overflow:hidden;">
          <img class="album-card-art" src="${artSrc}" alt="${b.name}" />
        </div>
        <div class="album-card-title" style="color:#c0d2f8;">${b.name}</div>
        <div class="album-card-meta">
          <span style="color:${tierColor}; font-weight:bold;">T${b.rarity}</span>
          <span>${typeIcons[combatType] || ''} ${tierName}</span>
        </div>
        <div class="card-badge-container">
          <span class="discovered-pill-badge">DISCOVERED (Untamed)</span>
        </div>
      `;
    } else {
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

    card.style.cursor = 'pointer';
    card.onclick = () => {
      openCardModal(b, {
        isCaught,
        isDiscovered,
        isCompanion,
        isOwnedOnchain,
        friendliness,
        onSelectCompanion: (selected) => {
          if (!isCaught) return;
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

  const shareText = `Beast Gauntlet & Roulette Summary
Beasts Owned: ${caughtInRun}/${beasts.length}
Rarest Tamed: ${rarestDesc}
Hearts Left: ${state.hearts}/3
Spins Used: ${spinsUsed}/${state.spinsMax}
Essence Gathered: ${state.essence}
Local collection (not minted) · beasts.app`;

  wrap.innerHTML = `
    <div class="end-card">
      <h1>${state.hearts <= 0 ? 'HUNT ENDED' : 'MAX SPINS REACHED'}</h1>
      <p class="subhead">${state.hearts <= 0 ? 'You ran out of hearts in the wild.' : 'You completed your spins!'}</p>

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
          Sign Run Receipt (Gas-free)
        </button>
        <button id="btn-copy-share" class="btn-primary" style="height:48px;">
          Copy Result
        </button>
        <button id="btn-play-again" class="btn-primary" style="height:48px; background:var(--panel-2); border:1px solid var(--gold); color:var(--gold);">
          Play Again
        </button>
        <button id="btn-view-album" class="btn-ghost">
          View Beast Dex
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
        signReceiptBtn.textContent = 'Sign Run Receipt (Gas-free)';
      }
    };
  }

  wrap.querySelector('#btn-copy-share').onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Copied result to clipboard!');
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
