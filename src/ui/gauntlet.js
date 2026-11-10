// src/ui/gauntlet.js — Loot Survivor Dungeon Gauntlet & Combat Arena
import {
  createGame,
  explore,
  attack,
  flee,
  allocateStat,
  buyPotion,
  buyUpgrade,
  potionPrice,
  upgradePrice,
  typeMultiplierClass,
  TYPE_OF_WEAPON,
  ARMOR_FOR_TYPE,
  DEMO_CONFIG,
  startDungeon,
  stepDungeon,
  isMarketLocked,
} from '../engine.js';
import beastData from '../beasts.json';
import {
  playAttackSound,
  playCritSound,
  playMissSound,
  playLevelUpSound,
  playCatchSound,
  playGoodSound,
  playBadSound,
  playTick,
  playPulseSound,
} from '../audio.js';
import { handleArtError, artForBeast } from '../beastLoader.js';
import { TIER_COLORS, TIER_NAMES } from '../roulette.js';

let activeGauntletGame = null;

export function resetGauntletSession() {
  activeGauntletGame = null;
}

// ---------------- Pixel SVGs (Replacing Emojis) ----------------
const ICONS = {
  door: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" class="pixel-icon"><path d="M4 2h16v20H4V2zm2 2v16h12V4H6zm8 7a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>`,
  skull: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" class="pixel-icon"><path d="M12 2a9 9 0 00-9 9c0 3.1 1.6 5.8 4 7.4V22h10v-3.6c2.4-1.6 4-4.3 4-7.4a9 9 0 00-9-9zm-3.5 8a2 2 0 110 4 2 2 0 010-4zm7 0a2 2 0 110 4 2 2 0 010-4zM10 18h4v2h-4v-2z"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" class="pixel-icon"><path d="M3 19h18v2H3v-2zm1-9l4 5 4-7 4 7 4-5 1 7H3l1-7z"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" width="16" height="16" fill="var(--gold)" class="pixel-icon coin-icon"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><text x="12" y="16" font-size="12" font-weight="bold" fill="currentColor" text-anchor="middle">G</text></svg>`,
  bolt: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="pixel-icon"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  potion: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" class="pixel-icon"><path d="M9 2h6v2H9V2zm1 3h4v2h-4V5zm-4 4h12l2 11a2 2 0 01-2 2H6a2 2 0 01-2-2l2-11zm3 4v5h6v-5H9z"/></svg>`,
  sword: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" class="pixel-icon"><path d="M19 3l2 2-10 10-2-2L19 3zM7 15l2 2-3 3-2-2 3-3zm-4 4l2-2 2 2-2 2-2-2z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" class="pixel-icon"><path d="M12 2L4 5v6.5c0 5.5 3.4 10.7 8 12 4.6-1.3 8-6.5 8-12V5l-8-3zm0 2.2l6 2.3v5c0 4.5-2.7 8.8-6 10-3.3-1.2-6-5.5-6-10V6.5l6-2.3z"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" width="22" height="22" fill="var(--gold)" class="pixel-icon"><path d="M18 2H6v2H2v6c0 3.3 2.7 6 6 6h1.2c.8 1.4 2.1 2.4 3.8 2.8V21H8v2h8v-2h-5v-2.2c1.7-.4 3-1.4 3.8-2.8H16c3.3 0 6-2.7 6-6V4h-4V2zM4 6h2v4c0 2.2-1.8 4-4 4V6zm14 4V6h2v8c-2.2 0-4-1.8-4-4z"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" width="16" height="16" fill="var(--gold)" class="pixel-icon"><path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/></svg>`,
};

function getWeaponSvg(type) {
  if (type === 'Blade') {
    return `<svg viewBox="0 0 24 24" class="weapon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 21C5 12.163 12.163 5 21 5" />
      <path d="M5 21l16-16" />
      <path d="M15 5h6v6" />
      <path d="M3 21l3-3" />
    </svg>`;
  }
  if (type === 'Bludgeon') {
    return `<svg viewBox="0 0 24 24" class="weapon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 4l5 5-2.5 2.5-5-5L15 4z" />
      <path d="M12.5 6.5l-9 9a1.414 1.414 0 0 0 0 2l2 2a1.414 1.414 0 0 0 2 0l9-9" />
      <path d="M18 10l3 3" />
      <path d="M11 3l3 3" />
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" class="weapon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.5 6.5L4 17l3 3L17.5 9.5" />
    <path d="M18 2v3M21 5h-3" />
    <path d="M20 9l2 2M15 2l-2 2" />
    <circle cx="17.5" cy="6.5" r="2.5" fill="currentColor" />
  </svg>`;
}

const STAT_INFO = {
  STR: 'Strength: Increases weapon strike damage in combat (+DMG).',
  DEX: 'Dexterity: Increases escape chance when fleeing and helps disarm traps.',
  VIT: 'Vitality: Increases maximum adventurer health (+15 Max HP per point).',
  INT: 'Intelligence: Grants sharp perception to detect and avoid dungeon traps.',
  WIS: 'Wisdom: Prevents enemy monster ambushes and surprise attacks.',
  CHA: 'Charisma: Grants market discounts on Camp potions and gear upgrades.',
};

export function createGauntletView({
  companion,
  beasts = [],
  albumData = null,
  onSelectCompanion,
  onExit,
  onCaptureNamed,
  onDungeonStateChange,
} = {}) {
  const container = document.createElement('div');
  container.className = 'screen gauntlet-screen';

  let g = activeGauntletGame;
  let autoBattleTimer = null;
  let autoBattle = false;
  let chosenWeapon = g && g.weapon ? g.weapon.type : 'Blade';
  let currentCompanion = companion || (g ? g.companion : null) || (beasts.length ? beasts[0] : null);
  let showFullLog = false;
  let dungeonClearedLoot = null;
  let companionFilter = 'all'; // 'all' | 'Magical' | 'Hunter' | 'Brute'
  let activeNamedReveal = null;

  function initGame() {
    g = activeGauntletGame = createGame({
      beastData,
      seed: Date.now() ^ 0x1337,
      weaponType: chosenWeapon,
      companionId: currentCompanion ? Number(currentCompanion.id) || 1 : 1,
      config: DEMO_CONFIG,
    });
    notifyNavState();
    render();
  }

  if (!g) {
    g = activeGauntletGame = createGame({
      beastData,
      seed: Date.now() ^ 0x1337,
      weaponType: chosenWeapon,
      companionId: currentCompanion ? Number(currentCompanion.id) || 1 : 1,
      config: DEMO_CONFIG,
    });
  }
  notifyNavState();

  function showToast(msg) {
    const existing = document.querySelector('.gauntlet-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'gauntlet-toast toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function notifyNavState() {
    const inActiveDungeon = Boolean(g && g.dungeon && !g.dungeon.cleared && g.phase !== 'dead');
    if (onDungeonStateChange) onDungeonStateChange(inActiveDungeon);
    document.body.classList.toggle('hide-bottom-nav', inActiveDungeon);
  }

  function checkLowHpGuard() {
    if (!g) return;
    const isLow = g.hp <= g.maxHp * 0.3;
    container.classList.toggle('low-hp-vignette', isLow);

    if (isLow) {
      playPulseSound(180);
      if (autoBattle) {
        autoBattle = false;
        if (autoBattleTimer) clearInterval(autoBattleTimer);
        showToast(`[LOW HP] Auto-battle stopped: (${g.hp}/${g.maxHp})! Heal or proceed manually.`);
        render();
      }
    }
  }

  function triggerCombatFeedback({ dmgDealt, dmgTaken, isCrit, weaponType, compDmg = 0 }) {
    const beastCard = container.querySelector('.battle-beast-card');
    const artWrap = container.querySelector('.battle-art-wrap');

    if (beastCard && dmgDealt > 0) {
      const heroDmgEl = document.createElement('div');
      heroDmgEl.className = `combat-float-number hero-float ${isCrit ? 'crit' : 'dmg'}`;
      heroDmgEl.textContent = isCrit ? `-${dmgDealt} CRIT!` : `-${dmgDealt}`;
      heroDmgEl.style.left = '52%';
      heroDmgEl.style.top = '25%';
      beastCard.appendChild(heroDmgEl);

      if (compDmg > 0) {
        const compDmgEl = document.createElement('div');
        compDmgEl.className = 'combat-float-number comp-float';
        compDmgEl.textContent = `-${compDmg} ALLY`;
        compDmgEl.style.left = '22%';
        compDmgEl.style.top = '40%';
        beastCard.appendChild(compDmgEl);
        setTimeout(() => { if (compDmgEl.parentNode) compDmgEl.remove(); }, 950);
      }

      if (artWrap) {
        artWrap.classList.remove('beast-hit-shake');
        void artWrap.offsetWidth;
        artWrap.classList.add('beast-hit-shake');

        const slash = document.createElement('div');
        slash.className = `weapon-slash-fx ${weaponType ? weaponType.toLowerCase() : 'blade'}`;
        artWrap.appendChild(slash);
        setTimeout(() => { if (slash.parentNode) slash.remove(); }, 600);
      }

      setTimeout(() => { if (heroDmgEl.parentNode) heroDmgEl.remove(); }, 950);
    }

    if (dmgTaken > 0) {
      container.classList.remove('screen-damage-vignette');
      void container.offsetWidth;
      container.classList.add('screen-damage-vignette');

      const heroBox = container.querySelector('.battle-hero-card');
      if (heroBox) {
        const hurtEl = document.createElement('div');
        hurtEl.className = 'combat-float-number hurt';
        hurtEl.textContent = `-${dmgTaken} HP`;
        hurtEl.style.left = '45%';
        hurtEl.style.top = '-10px';
        heroBox.appendChild(hurtEl);
        setTimeout(() => { if (hurtEl.parentNode) hurtEl.remove(); }, 900);
      }

      setTimeout(() => {
        container.classList.remove('screen-damage-vignette');
      }, 400);
    }

    checkLowHpGuard();
  }

  function handleAutoBattle() {
    if (!autoBattle || !g || !document.body.contains(container)) {
      autoBattle = false;
      if (autoBattleTimer) clearInterval(autoBattleTimer);
      return;
    }

    if (g.hp <= g.maxHp * 0.3) {
      autoBattle = false;
      showToast(`[LOW HP] Auto-battle stopped: (${g.hp}/${g.maxHp})! Heal or proceed manually.`);
      render();
      return;
    }

    if (g.phase === 'battle') {
      executeAttack();
    } else if (g.phase === 'explore' && g.dungeon && !g.dungeon.cleared) {
      executeStep();
    }
  }

  function executeStep() {
    if (!g || g.phase !== 'explore') return;

    let ev;
    if (g.dungeon && !g.dungeon.cleared) {
      ev = stepDungeon(g);
    } else {
      startDungeon(g, { stepsCount: 12, floor: (g.dungeon?.floor || 0) + 1 });
      ev = stepDungeon(g);
    }

    // Beasts encountered in gauntlet are registered as discovered (not tamed)
    if (g.beast && albumData) {
      const bId = String(g.beast.id);
      if (!albumData.discoveredIds) albumData.discoveredIds = [];
      if (!albumData.discoveredIds.includes(bId) && !albumData.caughtIds.includes(bId)) {
        albumData.discoveredIds.push(bId);
        saveAlbum(albumData);
      }
    }

    notifyNavState();
    render();

    if (ev.kind === 'trap') {
      if (ev.avoided) {
        playGoodSound();
      } else {
        playBadSound();
        triggerCombatFeedback({ dmgDealt: 0, dmgTaken: ev.dmg, isCrit: false });
      }
    } else if (ev.kind === 'discovery') {
      playGoodSound();
    } else if (ev.kind === 'dungeon_cleared' || (g.dungeon && g.dungeon.cleared)) {
      handleDungeonCleared();
    }

    checkLowHpGuard();

    if (autoBattle && g.phase !== 'dead' && g.phase !== 'battle') {
      setTimeout(handleAutoBattle, 450);
    }
  }

  function executeAttack() {
    if (!g || !g.beast || g.phase !== 'battle') return;
    const isCrit = g.rng() < (g.stats.CHA || 0) * 0.04;
    playAttackSound(g.weapon.type);
    if (isCrit) playCritSound();

    const oldBeastHp = g.beast.hp;
    const oldPlayerHp = g.hp;

    const ev = attack(g);

    const dmgDealt = Math.max(0, oldBeastHp - (g.beast ? g.beast.hp : 0));
    const dmgTaken = Math.max(0, oldPlayerHp - g.hp);

    if (ev.kind === 'victory') {
      // Register defeated beast as discovered in Dex
      const defeatedDef = ev.defeated || g.beast;
      if (defeatedDef && albumData) {
        const bId = String(defeatedDef.id);
        if (!albumData.discoveredIds) albumData.discoveredIds = [];
        if (!albumData.discoveredIds.includes(bId) && !albumData.caughtIds.includes(bId)) {
          albumData.discoveredIds.push(bId);
          saveAlbum(albumData);
        }
      }

      if (ev.captured) {
        const capturedDef = ev.defeated || g.beast;
        playCatchSound(capturedDef.tier || 1);
        if (onCaptureNamed) onCaptureNamed(capturedDef);
        // Show Named Reveal Modal
        activeNamedReveal = capturedDef;
      }
      if (ev.dungeonCleared) {
        handleDungeonCleared();
      }
    }

    if (g.phase === 'dead') {
      playMissSound();
      notifyNavState();
      render();
      return;
    }

    triggerCombatFeedback({
      dmgDealt,
      dmgTaken,
      isCrit,
      weaponType: g.weapon.type,
      compDmg: Math.min(dmgDealt, 8 + (g.level || 1)),
    });

    render();

    if (autoBattle && g.phase === 'battle') {
      setTimeout(handleAutoBattle, 480);
    }
  }

  function executeFlee() {
    if (!g || g.phase !== 'battle') return;
    const ev = flee(g);
    if (ev.success) {
      playGoodSound();
      if (g.dungeon && g.dungeon.cleared) {
        handleDungeonCleared();
      }
    } else {
      playBadSound();
    }
    notifyNavState();
    render();
  }

  function handleDungeonCleared() {
    if (!g || !g.dungeon) return;
    playLevelUpSound();

    // Floor completion bonus XP & level-up progression
    const floorBonusXp = (g.dungeon.floor || 1) * 25;
    g.xp = (g.xp || 0) + floorBonusXp;
    g.dungeon.loot.xp = (g.dungeon.loot.xp || 0) + floorBonusXp;

    const newLvl = levelFromXp(g.xp);
    if (newLvl > g.level) {
      const gained = newLvl - g.level;
      g.level = newLvl;
      g.pendingStatPoints = (g.pendingStatPoints || 0) + gained;
      g.phase = 'levelup';
    } else {
      // Guaranteed floor clear stat upgrade point: ALWAYS award at least 1 point and bump level!
      g.pendingStatPoints = (g.pendingStatPoints || 0) + 1;
      g.level += 1;
      g.phase = 'levelup';
    }

    dungeonClearedLoot = {
      floor: g.dungeon.floor,
      gold: g.dungeon.loot.gold,
      xp: g.dungeon.loot.xp,
      kills: g.dungeon.loot.kills,
      capturedCount: g.dungeon.loot.captured.length,
    };
    notifyNavState();
  }

  // ----------------- RENDER ROOT -----------------
  function render() {
    container.innerHTML = '';

    if (!g) {
      initGame();
      return;
    }

    if (g.phase === 'dead') {
      notifyNavState();
      container.appendChild(createDeathScreen());
      return;
    }

    if (activeNamedReveal) {
      container.appendChild(createNamedRevealScreen(activeNamedReveal));
      return;
    }

    if (dungeonClearedLoot) {
      container.appendChild(createDungeonClearedScreen());
      return;
    }

    const isAtCamp = !g.dungeon || g.dungeon.cleared;
    if (isAtCamp) {
      container.appendChild(createCampScreen());
    } else {
      container.appendChild(createDungeonScreen());
    }
  }

  // 1. CAMP HUB SCREEN
  function createCampScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'camp-scene-wrap arcade-panel';

    const nextFloor = (g.dungeon?.floor || 0) + 1;
    const pPrice = potionPrice(g);
    const wPrice = upgradePrice(g, 'weapon');
    const aPrice = upgradePrice(g, 'armor');
    const hpPct = Math.min(100, Math.max(0, Math.round((g.hp / g.maxHp) * 100)));

    const caughtSet = new Set(albumData && albumData.caughtIds ? albumData.caughtIds.map(String) : []);
    let capturedBeasts = beasts.filter((b) => caughtSet.has(String(b.id)));
    if (capturedBeasts.length === 0 && currentCompanion) {
      capturedBeasts = [currentCompanion];
    }
    if (!currentCompanion && capturedBeasts.length > 0) {
      currentCompanion = capturedBeasts[0];
    }
    if (currentCompanion) {
      const fVal = (albumData?.friendliness?.[String(currentCompanion.id)]) || currentCompanion.friendliness || 10;
      currentCompanion.friendliness = fVal;
      g.companion = currentCompanion;
    }

    const compCounts = {
      all: capturedBeasts.length,
      Magical: capturedBeasts.filter((b) => (b.type || 'Magical') === 'Magical').length,
      Hunter: capturedBeasts.filter((b) => (b.type || 'Hunter') === 'Hunter').length,
      Brute: capturedBeasts.filter((b) => (b.type || 'Brute') === 'Brute').length,
    };

    const filteredCompanions = companionFilter === 'all'
      ? capturedBeasts
      : capturedBeasts.filter((b) => (b.type || 'Hunter') === companionFilter);

    const weaponOptions = [
      { key: 'Blade', name: 'Blade', type: 'Hunter', typeClass: 'hunter', advantage: 'Strong vs Magical (+50%)' },
      { key: 'Bludgeon', name: 'Bludgeon', type: 'Brute', typeClass: 'brute', advantage: 'Strong vs Hunter (+50%)' },
      { key: 'Magic', name: 'Magic', type: 'Magical', typeClass: 'magical', advantage: 'Strong vs Brute (+50%)' },
    ];

    wrap.innerHTML = `
      <!-- Camp Header -->
      <div class="page-top-header">
        <button id="btn-camp-exit" class="btn-subview-back" title="Return to Title">‹</button>
        <div class="page-top-titles">
          <h1 class="arcade-title" style="color:var(--gold); display:flex; align-items:center; gap:6px;">
            ${ICONS.sword} GAUNTLET CAMP
          </h1>
          <span class="subhead">${nextFloor > 1 ? `Floor ${nextFloor - 1} Cleared · ` : ''}Prepare gear & companion for Floor ${nextFloor}</span>
        </div>
      </div>

      <!-- Adventurer Status Bar -->
      <div class="camp-hero-bar">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="font-size:0.95rem; white-space:nowrap;">Adventurer (Lv. ${g.level})</strong>
            <span class="badge-tag" style="background:#221d38; color:var(--gold); font-size:0.68rem;">FLOOR ${nextFloor}</span>
            ${g.pendingStatPoints > 0 ? `<span class="badge-tag pulse" style="background:rgba(245, 197, 66, 0.25); border:1px solid var(--gold); color:var(--gold); font-size:0.68rem;">★ +${g.pendingStatPoints} AT CAMP</span>` : ''}
          </div>
          <div style="margin-top:6px; max-width:220px;">
            <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--muted); margin-bottom:2px;">
              <span>HP</span>
              <span class="num font-bold" style="color:${hpPct < 30 ? 'var(--bad)' : 'var(--good)'};">${g.hp} / ${g.maxHp}</span>
            </div>
            <div class="meter-track" style="height:6px;">
              <div class="meter-fill" style="width:${hpPct}%; background:${hpPct < 30 ? 'var(--bad)' : 'var(--good)'};"></div>
            </div>
          </div>
        </div>

        <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
          <div class="num font-bold" style="color:var(--gold); font-size:1.2rem; display:flex; align-items:center; gap:4px;">
            ${ICONS.coin} ${g.gold}g
          </div>
          <div style="font-size:0.7rem; color:var(--muted);">${g.kills} beasts slain</div>
        </div>
      </div>

      <!-- Stats Summary Strip (Tappable for info) -->
      <div class="camp-stats-strip" title="Tap any stat to see details">
        <button class="stat-info-pill" data-stat="STR">STR: <strong>${g.stats.STR}</strong></button>
        <button class="stat-info-pill" data-stat="DEX">DEX: <strong>${g.stats.DEX}</strong></button>
        <button class="stat-info-pill" data-stat="VIT">VIT: <strong>${g.stats.VIT}</strong></button>
        <button class="stat-info-pill" data-stat="INT">INT: <strong>${g.stats.INT}</strong></button>
        <button class="stat-info-pill" data-stat="WIS">WIS: <strong>${g.stats.WIS}</strong></button>
        <button class="stat-info-pill" data-stat="CHA">CHA: <strong>${g.stats.CHA}</strong></button>
      </div>

      <!-- Banked Stat Points Allocation -->
      ${g.pendingStatPoints > 0 ? `
        <div class="camp-card-box stat-alloc-panel" style="border: 2px solid var(--gold); background: rgba(245, 197, 66, 0.08); box-shadow: 0 0 16px rgba(245, 197, 66, 0.2);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="camp-box-title" style="color:var(--gold); font-size:0.85rem; display:flex; align-items:center; gap:5px;">
              ★ LEVEL UP! ALLOCATE STAT POINTS
            </div>
            <span class="badge-tag pulse" style="background:var(--gold); color:#000; font-weight:800; font-size:0.75rem; padding:2px 8px; border-radius:12px;">
              ${g.pendingStatPoints} AVAILABLE
            </span>
          </div>
          <div class="stat-alloc-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; margin-top:8px;">
            <button class="stat-alloc-btn" data-s="STR"><strong>+1 STR</strong><span>(${g.stats.STR})</span><small>+Damage</small></button>
            <button class="stat-alloc-btn" data-s="DEX"><strong>+1 DEX</strong><span>(${g.stats.DEX})</span><small>+Flee/Trap</small></button>
            <button class="stat-alloc-btn" data-s="VIT"><strong>+1 VIT</strong><span>(${g.stats.VIT})</span><small>+15 Max HP</small></button>
            <button class="stat-alloc-btn" data-s="INT"><strong>+1 INT</strong><span>(${g.stats.INT})</span><small>+Avoid Trap</small></button>
            <button class="stat-alloc-btn" data-s="WIS"><strong>+1 WIS</strong><span>(${g.stats.WIS})</span><small>+Avoid Ambush</small></button>
            <button class="stat-alloc-btn" data-s="CHA"><strong>+1 CHA</strong><span>(${g.stats.CHA})</span><small>+Discount</small></button>
          </div>
        </div>
      ` : ''}

      <!-- 1. Weapon Selection Cards -->
      <div class="camp-card-box">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="camp-box-title">1. CHOOSE COMBAT WEAPON</div>
          <span style="font-size:0.7rem; color:var(--muted);">Current: <strong style="color:var(--gold);">${g.weapon.type} T${g.weapon.tier}</strong></span>
        </div>
        <div class="weapon-pick-row">
          ${weaponOptions
            .map((w) => {
              const isSelected = chosenWeapon === w.key;
              return `
                <button class="weapon-pick-card ${w.typeClass} ${isSelected ? 'active' : ''}" data-w="${w.key}">
                  <div class="weapon-svg-wrap">${getWeaponSvg(w.key)}</div>
                  <div class="wep-title">${w.name}</div>
                  <div class="wep-type-tag">${w.type}</div>
                  <div class="wep-advantage-note">${w.advantage}</div>
                  <div class="wep-status-pill">${isSelected ? 'ACTIVE ✓' : 'EQUIP'}</div>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- 2. Companion Selector Carousel -->
      <div class="camp-card-box">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
          <div class="camp-box-title">2. CHOOSE COMPANION ALLY</div>
          <span class="badge-tag" style="background:#1d1b30; color:var(--gold); font-size:0.68rem;">★ STRIKES EVERY TURN (8+ DMG)</span>
        </div>

        <div class="comp-filter-row">
          <button class="comp-filter-chip ${companionFilter === 'all' ? 'active' : ''}" data-cfilter="all">All (${compCounts.all})</button>
          <button class="comp-filter-chip ${companionFilter === 'Magical' ? 'active' : ''}" data-cfilter="Magical" style="color:var(--t2);">Magical (${compCounts.Magical})</button>
          <button class="comp-filter-chip ${companionFilter === 'Hunter' ? 'active' : ''}" data-cfilter="Hunter" style="color:var(--t4);">Hunter (${compCounts.Hunter})</button>
          <button class="comp-filter-chip ${companionFilter === 'Brute' ? 'active' : ''}" data-cfilter="Brute" style="color:var(--t1);">Brute (${compCounts.Brute})</button>
        </div>

        <div class="companion-snap-carousel" id="companion-picker-carousel">
          ${filteredCompanions.length > 0 ? filteredCompanions
            .map((b) => {
              const isSelected = currentCompanion && String(currentCompanion.id) === String(b.id);
              const tierCol = TIER_COLORS[b.rarity] || '#fff';
              const art = artForBeast(b.id) || b.art || `/beasts/art/${b.id}.svg`;
              const fVal = (albumData?.friendliness?.[String(b.id)]) || b.friendliness || 10;
              return `
                <div class="companion-snap-card ${isSelected ? 'selected' : ''}" data-id="${b.id}" style="border-color:${isSelected ? 'var(--gold)' : 'var(--line)'};">
                  <div class="snap-card-art">
                    <img src="${art}" alt="${b.name}" class="comp-thumb-img" data-id="${b.id}" loading="lazy" />
                  </div>
                  <div class="snap-card-meta">
                    <div class="snap-card-name">${b.name}</div>
                    <div class="snap-card-type-row">
                      <span style="color:${tierCol}; font-weight:bold;">T${b.rarity}</span>
                      <span class="badge-tag" style="font-size:0.62rem; padding:1px 4px;">${b.type || 'Hunter'}</span>
                    </div>
                    <div style="font-size:0.65rem; color:#ff5e94; font-weight:bold; margin-top:2px;">
                      ♥ ${fVal}% (+${fVal}% Atk / -${Math.round(fVal * 0.4)}% Def)
                    </div>
                  </div>
                  <div class="snap-card-badge">${isSelected ? 'EQUIPPED ★' : 'SELECT'}</div>
                </div>
              `;
            })
            .join('') : `
              <div style="padding:14px; text-align:center; color:var(--muted); font-size:0.8rem; width:100%;">
                No tamed ${companionFilter} companions. Choose another filter chip above.
              </div>
            `}
        </div>
      </div>

      <!-- 3. Camp Provisions & Armory -->
      <div class="camp-card-box">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="camp-box-title">3. CAMP PROVISIONS & FORGE</div>
          <span style="font-size:0.7rem; color:var(--good); font-weight:600;">✓ Market Open at Camp</span>
        </div>

        <div class="camp-market-grid">
          <div class="camp-market-card">
            <span class="mkt-icon">${ICONS.potion}</span>
            <div class="mkt-label">Heal Potion</div>
            <div class="mkt-tier">+20 HP</div>
            <div class="mkt-price">${pPrice}g</div>
            <button id="btn-camp-potion" class="btn-ghost arcade-btn" ${g.gold < pPrice || g.hp >= g.maxHp ? 'disabled' : ''}>
              ${g.hp >= g.maxHp ? 'HP FULL' : 'Drink'}
            </button>
          </div>

          <div class="camp-market-card">
            <span class="mkt-icon">${ICONS.sword}</span>
            <div class="mkt-label">${g.weapon.type}</div>
            <div class="mkt-tier">${wPrice ? `T${g.weapon.tier} ➔ T${g.weapon.tier - 1}` : `T${g.weapon.tier} (MAX)`}</div>
            <div class="mkt-price">${wPrice ? `${wPrice}g` : 'MAXED'}</div>
            <button id="btn-camp-wep" class="btn-ghost arcade-btn" ${!wPrice || g.gold < wPrice ? 'disabled' : ''}>
              ${wPrice ? 'Upgrade' : 'MAX'}
            </button>
          </div>

          <div class="camp-market-card">
            <span class="mkt-icon">${ICONS.shield}</span>
            <div class="mkt-label">${g.armor.type}</div>
            <div class="mkt-tier">${aPrice ? `T${g.armor.tier} ➔ T${g.armor.tier - 1}` : `T${g.armor.tier} (MAX)`}</div>
            <div class="mkt-price">${aPrice ? `${aPrice}g` : 'MAXED'}</div>
            <button id="btn-camp-arm" class="btn-ghost arcade-btn" ${!aPrice || g.gold < aPrice ? 'disabled' : ''}>
              ${aPrice ? 'Upgrade' : 'MAX'}
            </button>
          </div>
        </div>
      </div>

      <!-- Action Button -->
      <div class="camp-action-zone" style="margin-top:6px;">
        <button id="btn-start-gauntlet" class="btn-primary arcade-btn gauntlet-enter-btn" ${!chosenWeapon ? 'disabled' : ''}>
          ENTER THE GAUNTLET ▶
        </button>
      </div>
    `;

    // Listeners
    wrap.querySelector('#btn-camp-exit').onclick = () => { if (onExit) onExit(); };

    wrap.querySelectorAll('.stat-info-pill').forEach((btn) => {
      btn.onclick = () => {
        const s = btn.dataset.stat;
        showToast(STAT_INFO[s] || s);
      };
    });

    wrap.querySelectorAll('.stat-alloc-btn').forEach((btn) => {
      btn.onclick = () => {
        const s = btn.dataset.s;
        allocateStat(g, s);
        playLevelUpSound();
        render();
      };
    });

    wrap.querySelectorAll('.comp-filter-chip').forEach((btn) => {
      btn.onclick = () => {
        companionFilter = btn.dataset.cfilter;
        playTick(520);
        render();
      };
    });

    wrap.querySelectorAll('.weapon-pick-card').forEach((btn) => {
      btn.onclick = () => {
        chosenWeapon = btn.dataset.w;
        g.weapon.type = chosenWeapon;
        g.armor.type = ARMOR_FOR_TYPE[TYPE_OF_WEAPON[chosenWeapon]];
        playTick(440);
        render();
      };
    });

    wrap.querySelectorAll('.companion-snap-card').forEach((card) => {
      card.onclick = () => {
        const id = card.dataset.id;
        const found = beasts.find((b) => String(b.id) === String(id));
        if (found) {
          const fVal = (albumData?.friendliness?.[String(found.id)]) || found.friendliness || 10;
          found.friendliness = fVal;
          currentCompanion = found;
          g.companion = found;
          if (albumData) {
            albumData.activeCompanionId = String(found.id);
            saveAlbum(albumData);
          }
          playTick(600);
          if (onSelectCompanion) onSelectCompanion(found);
          render();
        }
      };
    });

    wrap.querySelectorAll('.comp-thumb-img').forEach((img) => {
      const b = beasts.find((x) => String(x.id) === String(img.dataset.id));
      if (b) img.onerror = () => handleArtError(img, b);
    });

    wrap.querySelector('#btn-camp-potion').onclick = () => {
      const oldHp = g.hp;
      buyPotion(g);
      if (g.hp > oldHp) playGoodSound();
      render();
    };

    wrap.querySelector('#btn-camp-wep').onclick = () => {
      if (buyUpgrade(g, 'weapon')) playLevelUpSound();
      render();
    };

    wrap.querySelector('#btn-camp-arm').onclick = () => {
      if (buyUpgrade(g, 'armor')) playLevelUpSound();
      render();
    };

    wrap.querySelector('#btn-start-gauntlet').onclick = () => {
      startDungeon(g, { stepsCount: 12, floor: nextFloor });
      notifyNavState();
      render();
    };

    return wrap;
  }

  // 2. DUNGEON SCREEN (Parallax Corridor Scene)
  function createDungeonScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'dungeon-run-wrap';

    const d = g.dungeon;
    const hpPct = Math.min(100, Math.max(0, Math.round((g.hp / g.maxHp) * 100)));
    const chamberIdx = d.stepIndex;
    const chamberNum = chamberIdx + 1;

    // Mini-map cells with vector icons in 6x6 grid (36 cells total)
    // Dynamic procedural path chambers vs empty/wall cells
    const coordToStep = new Map();
    d.steps.forEach((step, idx) => {
      coordToStep.set(`${step.row},${step.col}`, { step, idx });
    });

    const minimapGridCells = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const found = coordToStep.get(`${r},${c}`);
        if (found) {
          const { step, idx } = found;
          const isCurrent = idx === d.stepIndex;
          const isVisited = step.visited;
          let iconHtml = '·';
          let cellClass = 'map-cell map-path-cell';

          if (idx === d.stepsCount - 1) {
            iconHtml = ICONS.crown;
            cellClass += ' map-boss';
          } else if (isVisited) {
            if (step.type === 'beast') iconHtml = ICONS.skull;
            else if (step.type === 'trap') iconHtml = ICONS.bolt;
            else iconHtml = ICONS.coin;
            cellClass += ' map-visited';
          } else {
            cellClass += ' map-unvisited';
          }

          if (isCurrent) cellClass += ' map-current blink';

          minimapGridCells.push(`<div class="${cellClass}" title="Chamber ${idx + 1} (${step.type})">${iconHtml}</div>`);
        } else {
          // Off-path cell: wall / empty cell
          minimapGridCells.push(`<div class="map-cell map-wall" title="Wall"></div>`);
        }
      }
    }
    const minimapCellsHtml = minimapGridCells.join('');

    const header = document.createElement('header');
    header.className = 'dungeon-hud-header';
    header.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:bold; font-size:0.9rem;">F${d.floor} · Lv.${g.level}</span>
            <span class="num font-bold" style="color:var(--gold); font-size:0.95rem; display:flex; align-items:center; gap:3px;">
              ${ICONS.coin} ${g.gold}g
            </span>
            ${g.pendingStatPoints > 0 ? `<span class="badge-tag pulse" style="background:rgba(245, 197, 66, 0.25); color:var(--gold); font-size:0.65rem;">★ +${g.pendingStatPoints} STATS</span>` : ''}
            <button id="btn-quit-dungeon" class="btn-ghost" style="min-height:26px; padding:2px 8px; font-size:0.72rem; color:var(--bad);" title="Quit floor">✕</button>
          </div>

          <div style="margin-top:4px; max-width:200px;">
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--muted);">
              <span>HP</span>
              <span class="num font-bold" style="color:${hpPct < 30 ? 'var(--bad)' : 'var(--good)'}">${g.hp}/${g.maxHp}</span>
            </div>
            <div class="meter-track" style="height:5px;"><div class="meter-fill" style="width:${hpPct}%; background:${hpPct < 30 ? 'var(--bad)' : 'var(--good)'};"></div></div>
          </div>
        </div>

        <div class="minimap-box" id="minimap-box">
          <div class="minimap-grid">${minimapCellsHtml}</div>
          <div class="minimap-caption num">CHAMBERS: ${chamberIdx + 1}/${d.stepsCount}</div>
        </div>
      </div>
    `;

    header.querySelector('#btn-quit-dungeon').onclick = () => {
      if (confirm('Flee back to Camp? You will forfeit uncollected floor rewards.')) {
        g.dungeon.cleared = true;
        notifyNavState();
        render();
      }
    };

    wrap.appendChild(header);

    if (g.phase === 'battle' && g.beast) {
      wrap.appendChild(createBattleStage());
    } else {
      wrap.appendChild(createChamberStepStage(chamberNum, d.stepsCount));
    }

    wrap.appendChild(createCompactLog());
    return wrap;
  }

  // 3. BATTLE STAGE
  function createBattleStage() {
    const beast = g.beast;
    const wrap = document.createElement('div');
    wrap.className = 'battle-stage-panel';

    const beastHpPct = Math.min(100, Math.max(0, Math.round((beast.hp / beast.maxHp) * 100)));
    const tierColor = TIER_COLORS[beast.tier] || '#f2f2f2';
    const tierName = TIER_NAMES[beast.tier] || 'Common';
    const isNamed = Boolean(beast.prefix || beast.isBoss);
    const fullName = beast.displayName || beast.name;
    const artSrc = artForBeast(beast.id) || beast.art || `/beasts/art/${beast.id}.svg`;

    const wepType = TYPE_OF_WEAPON[g.weapon.type];
    const multClass = typeMultiplierClass(wepType, beast.type);
    let hintText = '1.0x Match';
    let hintColor = 'var(--text)';
    if (multClass === 'strong') {
      hintText = `▲ ADVANTAGE (+50% dmg vs ${beast.type})`;
      hintColor = 'var(--good)';
    } else if (multClass === 'weak') {
      hintText = `▼ WEAK (-50% dmg vs ${beast.type})`;
      hintColor = 'var(--bad)';
    }

    wrap.innerHTML = `
      ${isNamed ? `<div class="boss-banner ${beast.isBoss ? 'boss' : 'named'}">★ ${beast.isBoss ? 'BOSS ENCOUNTER' : 'NAMED BEAST'} — Defeat to capture!</div>` : ''}

      <div class="battle-beast-card" style="border-color:${tierColor};">
        <div class="battle-art-wrap">
          <img id="battle-beast-img" src="${artSrc}" alt="${fullName}" />
        </div>
        <div style="margin-top:6px; text-align:center;">
          <div style="font-weight:bold; font-size:1.05rem; color:${isNamed ? 'var(--gold)' : 'var(--text)'};">${fullName}</div>
          <div style="font-size:0.75rem; color:${tierColor}; font-weight:bold;">
            T${beast.tier} ${tierName.toUpperCase()} · ${beast.type} · Lv.${beast.level}
          </div>
          <div style="font-size:0.72rem; color:${hintColor}; font-weight:600; margin-top:2px;">${hintText}</div>

          <div style="margin-top:6px;">
            <div class="meter-track" style="height:7px;"><div class="meter-fill" style="width:${beastHpPct}%; background:${beastHpPct < 30 ? 'var(--bad)' : 'var(--t1)'};"></div></div>
            <div style="font-size:0.7rem; color:var(--muted); text-align:right; margin-top:2px;" class="num">${beast.hp}/${beast.maxHp} HP</div>
          </div>
        </div>
      </div>

      <div class="battle-allies-row">
        <div class="battle-ally-card companion">
          <div class="ally-thumb-slot">
            <img src="${currentCompanion ? (artForBeast(currentCompanion.id) || currentCompanion.art || `/beasts/art/${currentCompanion.id}.svg`) : artSrc}" />
          </div>
          <div class="ally-info">
            <div style="font-weight:bold; font-size:0.75rem;">${currentCompanion ? currentCompanion.name : 'Ally'}</div>
            <div style="font-size:0.68rem; color:var(--gold);">Strikes each turn</div>
          </div>
        </div>

        <div class="battle-ally-card battle-hero-card">
          <div class="ally-info" style="text-align:right;">
            <div style="font-weight:bold; font-size:0.8rem;">Adventurer</div>
            <div style="font-size:0.7rem; color:var(--t4);">${g.weapon.type} T${g.weapon.tier}</div>
          </div>
          <div class="ally-thumb-slot hero-slot">
            <span>${ICONS.sword}</span>
          </div>
        </div>
      </div>

      <div class="battle-actions-thumb-zone">
        <button id="btn-attack" class="btn-primary arcade-btn" style="flex:2; height:50px; font-size:1.1rem; display:flex; align-items:center; justify-content:center; gap:6px;">
          ${ICONS.sword} ATTACK
        </button>
        <button id="btn-flee" class="btn-ghost arcade-btn" style="flex:1; height:50px; border:1px solid var(--line); font-size:0.88rem;">
          FLEE (30%)
        </button>
      </div>
    `;

    const img = wrap.querySelector('#battle-beast-img');
    if (img) img.onerror = () => handleArtError(img, beast);

    const allyImg = wrap.querySelector('.ally-thumb-slot img');
    if (allyImg && currentCompanion) {
      allyImg.onerror = () => handleArtError(allyImg, currentCompanion);
    }

    wrap.querySelector('#btn-attack').onclick = executeAttack;
    wrap.querySelector('#btn-flee').onclick = executeFlee;

    return wrap;
  }

  // 4. CHAMBER STEP STAGE (Full-Screen Atmospheric Corridor Scene)
  function createChamberStepStage(chamberNum, totalChambers) {
    const wrap = document.createElement('div');
    wrap.className = 'chamber-corridor-scene';

    const compArt = currentCompanion ? (artForBeast(currentCompanion.id) || currentCompanion.art || `/beasts/art/${currentCompanion.id}.svg`) : null;

    wrap.innerHTML = `
      <!-- Torch Sconces with Animated Flicker -->
      <div class="corridor-torch torch-left">
        <div class="torch-flame"></div>
      </div>
      <div class="corridor-torch torch-right">
        <div class="torch-flame"></div>
      </div>

      <!-- Corridor Arch & Doorway -->
      <div class="corridor-arch-center">
        <div class="corridor-portal-frame">
          <div class="portal-svg-wrap">${ICONS.door}</div>
        </div>
        <h3 class="arcade-title" style="font-size:1.25rem; color:var(--text); margin-top:8px;">
          CORRIDOR TO CHAMBER ${chamberNum} OF ${totalChambers}
        </h3>
        <p style="font-size:0.82rem; color:var(--muted); margin:4px 0 16px;">
          The damp stone corridor stretches forward into darkness.
        </p>

        <!-- Visible Hero & Companion Sprites Advancing -->
        <div class="corridor-party-row">
          ${compArt ? `
            <div class="corridor-comp-slot" title="${currentCompanion?.name || 'Companion'}">
              <img src="${compArt}" class="corridor-comp-img bounce-idle" alt="Companion" />
              <div class="corridor-party-tag">${currentCompanion?.name || 'Ally'}</div>
            </div>
          ` : ''}
          <div class="corridor-hero-slot" title="Adventurer">
            <div class="corridor-hero-icon">${ICONS.sword}</div>
            <div class="corridor-party-tag">Hero Lv.${g.level}</div>
          </div>
        </div>
      </div>

      <!-- Action Button in Thumb Zone -->
      <div class="corridor-action-zone">
        <button id="btn-explore" class="btn-primary arcade-btn" style="width:100%; height:52px; font-size:1.1rem;">
          ENTER CHAMBER ${chamberNum} ▶
        </button>

        <div style="display:flex; justify-content:center; align-items:center; gap:8px; margin-top:12px;">
          <label class="switch-control">
            <input type="checkbox" id="chk-auto-battle" ${autoBattle ? 'checked' : ''} />
            <span class="switch-slider"></span>
          </label>
          <span style="font-size:0.75rem; color:var(--muted);">Auto-Battle (Hands-Free)</span>
        </div>
      </div>
    `;

    const compImg = wrap.querySelector('.corridor-comp-img');
    if (compImg && currentCompanion) {
      compImg.onerror = () => handleArtError(compImg, currentCompanion);
    }

    wrap.querySelector('#btn-explore').onclick = executeStep;

    const autoChk = wrap.querySelector('#chk-auto-battle');
    autoChk.onchange = (e) => {
      autoBattle = e.target.checked;
      handleAutoBattle();
    };

    return wrap;
  }

  // 5. NAMED BEAST DISCOVERY REVEAL MODAL (Card-Flip Moment)
  function createNamedRevealScreen(namedBeast) {
    const wrap = document.createElement('div');
    wrap.className = 'named-capture-modal-scene';

    const art = artForBeast(namedBeast.id) || namedBeast.art || `/beasts/art/${namedBeast.id}.svg`;
    const tierCol = TIER_COLORS[namedBeast.tier] || 'var(--gold)';
    const isFloorWon = Boolean(dungeonClearedLoot);

    wrap.innerHTML = `
      <div class="named-capture-card-box card-flip" style="border: 2px solid ${tierCol};">
        <div class="named-sparkle-halo" style="background: radial-gradient(circle, ${tierCol}30 0%, transparent 70%);"></div>
        <div class="badge-tag" style="background:${tierCol}22; color:${tierCol}; border:1px solid ${tierCol}; font-size:0.75rem; font-weight:bold; letter-spacing:0.05em; margin-bottom:10px; padding:3px 10px; border-radius:12px; z-index:1;">
          ★ NAMED BEAST DISCOVERED! ★
        </div>
        <div class="named-art-frame" style="border-color:${tierCol};">
          <img src="${art}" alt="${namedBeast.name}" class="named-beast-portrait" />
        </div>
        <h2 class="arcade-title" style="color:var(--gold); font-size:1.35rem; margin:6px 0 2px; z-index:1; word-break:break-word;">
          ${namedBeast.prefix ? `${namedBeast.prefix} ` : ''}${namedBeast.name}
        </h2>
        <div style="font-size:0.85rem; color:${tierCol}; font-weight:bold; margin-bottom:6px; z-index:1;">
          Tier ${namedBeast.tier} · ${namedBeast.type} Beast (Level ${namedBeast.level})
        </div>
        <p style="font-size:0.8rem; color:var(--muted); line-height:1.4; margin:8px 0 14px; z-index:1;">
          Recorded in Beast Dex as <strong style="color:#7da5ff;">Discovered (Untamed)</strong>! To tame and recruit this beast as an active companion ally, spin and tame it in the Roulette Wheel.
        </p>

        <div style="width:100%; z-index:1; margin-top:6px;">
          <button id="btn-named-continue" class="btn-primary arcade-btn" style="width:100%; height:48px; font-size:1rem; font-weight:bold;">
            ${isFloorWon ? 'Proceed to Floor Victory ▶' : 'Continue Dungeon Run ▶'}
          </button>
        </div>
      </div>
    `;

    const img = wrap.querySelector('.named-beast-portrait');
    if (img) img.onerror = () => handleArtError(img, namedBeast);

    wrap.querySelector('#btn-named-continue').onclick = () => {
      activeNamedReveal = null;
      render();
    };

    return wrap;
  }

  // 6. DUNGEON CLEARED SCREEN
  function createDungeonClearedScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'dungeon-cleared-wrap arcade-panel';
    const loot = dungeonClearedLoot;

    wrap.innerHTML = `
      <div style="text-align:center; padding:20px 10px;">
        <div class="cleared-trophy-icon" style="margin-bottom:8px;">${ICONS.trophy}</div>
        <h2 class="arcade-title" style="color:var(--gold); font-size:1.4rem;">FLOOR ${loot.floor} CLEARED!</h2>
        <p class="subhead" style="margin-top:4px;">The chamber boss was vanquished! Floor completed successfully.</p>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin:14px 0; background:var(--panel-2); padding:12px; border-radius:10px; border:1px solid var(--line); font-size:0.85rem;">
          <div>Gold Loot: <strong class="num" style="color:var(--gold);">${ICONS.coin} +${loot.gold}g</strong></div>
          <div>XP Earned: <strong class="num" style="color:var(--good);">+${loot.xp} XP</strong></div>
          <div>Beasts Slain: <strong class="num">${loot.kills}</strong></div>
          <div>Captures: <strong class="num" style="color:var(--gold);">${loot.capturedCount}</strong></div>
        </div>

        <!-- Level Up Stat Allocation Menu Directly on Dungeon Cleared Screen -->
        ${g.pendingStatPoints > 0 ? `
          <div class="stat-alloc-panel dungeon-cleared-level-up-box" style="margin: 16px 0; padding: 14px 12px; background: rgba(245, 197, 66, 0.08); border: 2px solid var(--gold); border-radius: 12px; text-align: left;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
              <strong style="color:var(--gold); font-size:0.88rem; display:flex; align-items:center; gap:5px;">
                ★ LEVEL UP! ALLOCATE STAT POINTS
              </strong>
              <span class="badge-tag pulse" style="background:var(--gold); color:#000; font-weight:800; font-size:0.75rem; padding:2px 8px; border-radius:12px;">
                ${g.pendingStatPoints} POINT${g.pendingStatPoints > 1 ? 'S' : ''} AVAILABLE
              </span>
            </div>
            <p style="font-size:0.75rem; color:var(--muted); margin:0 0 10px 0; line-height:1.4;">
              Spend your earned stat points to upgrade your hero's attributes:
            </p>
            <div class="stat-alloc-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
              <button class="stat-alloc-btn" data-s="STR"><strong>+1 STR</strong><span>(${g.stats.STR})</span><small>+Damage</small></button>
              <button class="stat-alloc-btn" data-s="DEX"><strong>+1 DEX</strong><span>(${g.stats.DEX})</span><small>+Flee/Trap</small></button>
              <button class="stat-alloc-btn" data-s="VIT"><strong>+1 VIT</strong><span>(${g.stats.VIT})</span><small>+15 Max HP</small></button>
              <button class="stat-alloc-btn" data-s="INT"><strong>+1 INT</strong><span>(${g.stats.INT})</span><small>+Avoid Trap</small></button>
              <button class="stat-alloc-btn" data-s="WIS"><strong>+1 WIS</strong><span>(${g.stats.WIS})</span><small>+Avoid Ambush</small></button>
              <button class="stat-alloc-btn" data-s="CHA"><strong>+1 CHA</strong><span>(${g.stats.CHA})</span><small>+Discount</small></button>
            </div>
          </div>
        ` : `
          <div style="margin: 12px 0; padding: 8px 12px; background: rgba(62, 207, 110, 0.1); border: 1px solid var(--good); border-radius: 8px; font-size: 0.8rem; color: var(--good);">
            ✓ All stat points allocated! Hero stats updated.
          </div>
        `}

        <button id="btn-return-camp" class="btn-primary arcade-btn" style="width:100%; height:50px; font-size:1.05rem;">
          RETURN TO CAMP (Heal & Shop)
        </button>
      </div>
    `;

    wrap.querySelectorAll('.stat-alloc-btn').forEach((btn) => {
      btn.onclick = () => {
        const s = btn.dataset.s;
        allocateStat(g, s);
        playLevelUpSound();
        render();
      };
    });

    wrap.querySelector('#btn-return-camp').onclick = () => {
      dungeonClearedLoot = null;
      if (g.dungeon) g.dungeon.cleared = true;
      notifyNavState();
      render();
    };

    return wrap;
  }

  // 7. DEATH SCREEN (Full Run Summary)
  function createDeathScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'death-screen-wrap arcade-panel';

    const killerName = g.diedTo || 'the dungeon depths';
    const killerArt = g.beast ? (artForBeast(g.beast.id) || g.beast.art || `/beasts/art/${g.beast.id}.svg`) : null;
    const chambersCleared = g.dungeon ? Math.max(0, g.dungeon.stepIndex) : 0;
    const capturesMade = (albumData && albumData.capturedNamed ? albumData.capturedNamed.length : 0);

    wrap.innerHTML = `
      <div style="text-align:center; padding:20px 12px;">
        <div class="death-skull-icon" style="color:var(--bad); margin-bottom:8px;">${ICONS.skull}</div>
        <h2 class="arcade-title" style="color:var(--bad); font-size:1.5rem; margin-bottom:4px;">YOU HAVE FALLEN</h2>
        <div style="font-size:0.85rem; color:var(--muted); margin-bottom:14px;">
          Slain by <strong style="color:var(--text);">${killerName}</strong>
        </div>

        ${killerArt ? `
          <div class="death-killer-frame">
            <img src="${killerArt}" alt="${killerName}" class="death-killer-art" />
          </div>
        ` : ''}

        <!-- Run Summary Grid -->
        <div class="death-summary-grid">
          <div class="summary-tile">
            <span class="stat-label">Floor</span>
            <span class="stat-val num" style="color:var(--gold); font-size:1.2rem;">${g.dungeon?.floor || 1}</span>
          </div>
          <div class="summary-tile">
            <span class="stat-label">Chambers</span>
            <span class="stat-val num" style="font-size:1.2rem;">${chambersCleared}/${g.dungeon?.stepsCount || 12}</span>
          </div>
          <div class="summary-tile">
            <span class="stat-label">Beasts Slain</span>
            <span class="stat-val num" style="color:var(--bad); font-size:1.2rem;">${g.kills}</span>
          </div>
          <div class="summary-tile">
            <span class="stat-label">Gold</span>
            <span class="stat-val num" style="color:var(--gold); font-size:1.2rem;">${g.gold}g</span>
          </div>
        </div>

        <button id="btn-retry-gauntlet" class="btn-primary arcade-btn" style="width:100%; height:52px; font-size:1.1rem; margin-top:14px;">
          ENTER NEW RUN
        </button>
        <button id="btn-death-exit" class="btn-ghost arcade-btn" style="width:100%; margin-top:8px;">
          Return to Hub
        </button>
      </div>
    `;

    const killerImg = wrap.querySelector('.death-killer-art');
    if (killerImg && g.beast) {
      killerImg.onerror = () => handleArtError(killerImg, g.beast);
    }

    wrap.querySelector('#btn-retry-gauntlet').onclick = () => initGame();
    wrap.querySelector('#btn-death-exit').onclick = () => { if (onExit) onExit(); };

    return wrap;
  }

  // 8. COMPACT BATTLE LOG
  function createCompactLog() {
    const wrap = document.createElement('div');
    wrap.className = 'combat-log-container';
    const recentLines = g.log.slice(-2);

    wrap.innerHTML = `
      <div class="combat-log-header">
        <span style="font-size:0.7rem; color:var(--muted); font-weight:bold;">BATTLE LOG</span>
        <button id="btn-toggle-log" class="btn-ghost" style="min-height:22px; padding:1px 6px; font-size:0.68rem; color:var(--gold);">
          ${showFullLog ? '▲ Collapse' : '▼ Expand'}
        </button>
      </div>
      <div class="combat-log-content ${showFullLog ? 'expanded' : ''}">
        ${(showFullLog ? g.log : recentLines).map((line) => `<div class="log-entry">${line}</div>`).join('')}
      </div>
    `;

    wrap.querySelector('#btn-toggle-log').onclick = () => {
      showFullLog = !showFullLog;
      render();
    };

    return wrap;
  }

  render();
  return container;
}
