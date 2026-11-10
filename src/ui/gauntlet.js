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
import { playAttackSound, playCritSound, playMissSound, playLevelUpSound, playCatchSound, playGoodSound, playBadSound, playTick } from '../audio.js';
import { handleArtError, artForBeast } from '../beastLoader.js';
import { TIER_COLORS, TIER_NAMES } from '../roulette.js';

let activeGauntletGame = null;

export function resetGauntletSession() {
  activeGauntletGame = null;
}

function getWeaponSvg(type) {
  if (type === 'Blade') {
    // Hunter Bow & Arrow
    return `<svg viewBox="0 0 24 24" class="weapon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 21C5 12.163 12.163 5 21 5" />
      <path d="M5 21l16-16" />
      <path d="M15 5h6v6" />
      <path d="M3 21l3-3" />
    </svg>`;
  }
  if (type === 'Bludgeon') {
    // Brute Warhammer / Heavy Mace
    return `<svg viewBox="0 0 24 24" class="weapon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 4l5 5-2.5 2.5-5-5L15 4z" />
      <path d="M12.5 6.5l-9 9a1.414 1.414 0 0 0 0 2l2 2a1.414 1.414 0 0 0 2 0l9-9" />
      <path d="M18 10l3 3" />
      <path d="M11 3l3 3" />
    </svg>`;
  }
  // Magical Arcane Wand / Staff
  return `<svg viewBox="0 0 24 24" class="weapon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.5 6.5L4 17l3 3L17.5 9.5" />
    <path d="M18 2v3M21 5h-3" />
    <path d="M20 9l2 2M15 2l-2 2" />
    <circle cx="17.5" cy="6.5" r="2.5" fill="currentColor" />
  </svg>`;
}

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

  function initGame() {
    g = activeGauntletGame = createGame({
      beastData,
      seed: Date.now() ^ 0x1337,
      weaponType: chosenWeapon,
      companionId: currentCompanion ? Number(currentCompanion.id) || 1 : 1,
      config: DEMO_CONFIG,
    });
    // Start at Camp
    notifyNavState();
    render();
  }

  // Ensure active game is instantiated on Camp arrival
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

  function notifyNavState() {
    // Hide bottom tab bar while inside active dungeon exploration/battle; show in Camp or after victory
    const inActiveDungeon = Boolean(g && g.dungeon && !g.dungeon.cleared && g.phase !== 'dead');
    if (onDungeonStateChange) onDungeonStateChange(inActiveDungeon);
    document.body.classList.toggle('hide-bottom-nav', inActiveDungeon);
  }

  function triggerCombatFeedback({ dmgDealt, dmgTaken, isCrit, weaponType, compDmg = 0 }) {
    const beastCard = container.querySelector('.battle-beast-card');
    const artWrap = container.querySelector('.battle-art-wrap');

    // 1. Floating damage on enemy: staggered offsets to never overlap!
    if (beastCard && dmgDealt > 0) {
      // Main hero damage
      const heroDmgEl = document.createElement('div');
      heroDmgEl.className = `combat-float-number hero-float ${isCrit ? 'crit' : 'dmg'}`;
      heroDmgEl.textContent = isCrit ? `-${dmgDealt} CRIT!` : `-${dmgDealt}`;
      heroDmgEl.style.left = '52%';
      heroDmgEl.style.top = '25%';
      beastCard.appendChild(heroDmgEl);

      // Companion damage offset to the left
      if (compDmg > 0) {
        const compDmgEl = document.createElement('div');
        compDmgEl.className = 'combat-float-number comp-float';
        compDmgEl.textContent = `🐾 -${compDmg}`;
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

    // 2. Damage taken: floating hurt number & vignette flash
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
  }

  function triggerHealFeedback(amount) {
    const target = container.querySelector('.camp-hero-bar') || container.querySelector('.gauntlet-header-panel');
    if (target) {
      const healEl = document.createElement('div');
      healEl.className = 'combat-float-number heal';
      healEl.textContent = `+${amount} HP 💚`;
      target.style.position = 'relative';
      target.appendChild(healEl);
      target.classList.remove('healed-flash');
      void target.offsetWidth;
      target.classList.add('healed-flash');
      setTimeout(() => { if (healEl.parentNode) healEl.remove(); }, 900);
      setTimeout(() => { target.classList.remove('healed-flash'); }, 700);
    }
  }

  function triggerUpgradeFeedback(label, cardSelector) {
    const card = container.querySelector(cardSelector);
    if (card) {
      const upEl = document.createElement('div');
      upEl.className = 'combat-float-number upgrade';
      upEl.textContent = `${label} UPGRADED! ✨`;
      card.style.position = 'relative';
      card.appendChild(upEl);
      card.classList.remove('upgrade-flash');
      void card.offsetWidth;
      card.classList.add('upgrade-flash');
      setTimeout(() => { if (upEl.parentNode) upEl.remove(); }, 900);
      setTimeout(() => { card.classList.remove('upgrade-flash'); }, 700);
    }
  }

  function triggerStatFeedback(statName, targetEl) {
    if (targetEl) {
      const stEl = document.createElement('div');
      stEl.className = 'combat-float-number stat';
      stEl.textContent = `+1 ${statName}! ✨`;
      targetEl.style.position = 'relative';
      targetEl.appendChild(stEl);
      setTimeout(() => { if (stEl.parentNode) stEl.remove(); }, 850);
    }
  }

  function handleAutoBattle() {
    if (!autoBattle || !g || !document.body.contains(container)) {
      autoBattle = false;
      if (autoBattleTimer) clearInterval(autoBattleTimer);
      return;
    }
    if (g.phase === 'battle') {
      executeAttack();
    } else if (g.phase === 'explore' && g.dungeon && !g.dungeon.cleared && g.hp > g.maxHp * 0.3) {
      executeStep();
    }
  }

  function executeStep() {
    if (!g || g.phase !== 'explore') return;
    const oldHp = g.hp;

    // Use dungeon step if inside dungeon, else start dungeon
    let ev;
    if (g.dungeon && !g.dungeon.cleared) {
      ev = stepDungeon(g);
    } else {
      startDungeon(g, { stepsCount: 12, floor: (g.dungeon?.floor || 0) + 1 });
      ev = stepDungeon(g);
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
      if (ev.captured && onCaptureNamed) {
        playCatchSound(ev.defeated ? ev.defeated.tier : 1);
        onCaptureNamed(ev.defeated || g.beast);
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
    dungeonClearedLoot = {
      floor: g.dungeon.floor,
      gold: g.dungeon.loot.gold,
      xp: g.dungeon.loot.xp,
      kills: g.dungeon.loot.kills,
      capturedCount: g.dungeon.loot.captured.length,
    };
    notifyNavState();
  }

  // ----------------- RENDER METHODS -----------------

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

    // If dungeon just cleared, show Dungeon Cleared Screen
    if (dungeonClearedLoot) {
      container.appendChild(createDungeonClearedScreen());
      return;
    }

    // Active Dungeon or Camp Hub
    const isAtCamp = !g.dungeon || g.dungeon.cleared;
    if (isAtCamp) {
      container.appendChild(createCampScreen());
    } else {
      container.appendChild(createDungeonScreen());
    }
  }

  // 1. CAMP EXPEDITION SCREEN (Pre-run hub & inter-floor staging)
  function createCampScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'camp-scene-wrap arcade-panel';

    const nextFloor = (g.dungeon?.floor || 0) + 1;
    const pPrice = potionPrice(g);
    const wPrice = upgradePrice(g, 'weapon');
    const aPrice = upgradePrice(g, 'armor');
    const hpPct = Math.min(100, Math.max(0, Math.round((g.hp / g.maxHp) * 100)));

    // Roster of captured/owned beasts for companion ally picker
    const caughtSet = new Set(albumData && albumData.caughtIds ? albumData.caughtIds : []);
    if (albumData && albumData.capturedNamed) {
      albumData.capturedNamed.forEach((nb) => { if (nb && nb.id) caughtSet.add(nb.id); });
    }

    let capturedBeasts = beasts.filter((b) => caughtSet.has(String(b.id)));
    if (capturedBeasts.length === 0) {
      capturedBeasts = currentCompanion ? [currentCompanion] : beasts.slice(0, 4);
    }
    if (!currentCompanion && capturedBeasts.length > 0) {
      currentCompanion = capturedBeasts[0];
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
      {
        key: 'Blade',
        name: 'Blade',
        type: 'Hunter',
        typeClass: 'hunter',
        advantage: 'Strong vs Magical (+50%)',
      },
      {
        key: 'Bludgeon',
        name: 'Bludgeon',
        type: 'Brute',
        typeClass: 'brute',
        advantage: 'Strong vs Hunter (+50%)',
      },
      {
        key: 'Magic',
        name: 'Magic',
        type: 'Magical',
        typeClass: 'magical',
        advantage: 'Strong vs Brute (+50%)',
      },
    ];

    wrap.innerHTML = `
      <!-- Camp Header (Clean spacing, zero empty gap) -->
      <div class="page-top-header">
        <button id="btn-camp-exit" class="btn-subview-back" title="Return to Title">‹</button>
        <div class="page-top-titles">
          <h1 class="arcade-title" style="color:var(--gold);">⚔️ GAUNTLET CAMP</h1>
          <span class="subhead">${nextFloor > 1 ? `Floor ${nextFloor - 1} Cleared · ` : ''}Prepare gear & ally for ${nextFloor === 1 ? 'Floor 1' : `Floor ${nextFloor}`}</span>
        </div>
      </div>

      <!-- Adventurer Status Bar -->
      <div class="camp-hero-bar">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="font-size:0.95rem; white-space:nowrap;">Adventurer (Lv. ${g.level})</strong>
            <span class="badge-tag" style="background:#221d38; color:var(--gold); font-size:0.68rem;">FLOOR ${nextFloor}</span>
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
          <div class="num font-bold" style="color:var(--gold); font-size:1.25rem; text-shadow:0 0 10px rgba(245, 197, 66, 0.3);">🪙 ${g.gold}g</div>
          ${g.pendingStatPoints > 0
            ? `<div class="badge-tag pulse" style="background:rgba(245, 197, 66, 0.2); border:1px solid var(--gold); color:var(--gold); font-size:0.7rem; font-weight:bold;">★ ${g.pendingStatPoints} PTS AVAILABLE</div>`
            : `<div style="font-size:0.7rem; color:var(--muted);">${g.kills} beasts slain</div>`
          }
        </div>
      </div>

      <!-- Stats Summary Strip -->
      <div class="camp-stats-strip">
        <span>STR: <strong>${g.stats.STR}</strong></span>
        <span>DEX: <strong>${g.stats.DEX}</strong></span>
        <span>VIT: <strong>${g.stats.VIT}</strong></span>
        <span>INT: <strong>${g.stats.INT}</strong></span>
        <span>WIS: <strong>${g.stats.WIS}</strong></span>
        <span>CHA: <strong>${g.stats.CHA}</strong></span>
        ${g.stats.CHA > 0 ? `<span style="color:var(--gold);">🪙 -${g.stats.CHA * 2}g pot / -${g.stats.CHA}g gear</span>` : ''}
      </div>

      <!-- Banked Stat Points Allocation (if any) -->
      ${g.pendingStatPoints > 0 ? `
        <div class="camp-card-box stat-alloc-panel" style="border-color:var(--gold); background:rgba(245, 197, 66, 0.05);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="camp-box-title" style="color:var(--gold);">★ LEVEL UP! ALLOCATE STAT POINTS (${g.pendingStatPoints} LEFT)</div>
          </div>
          <div class="stat-alloc-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; margin-top:8px;">
            <button class="stat-alloc-btn" data-s="STR"><span>STR (${g.stats.STR})</span><small>+Damage</small></button>
            <button class="stat-alloc-btn" data-s="DEX"><span>DEX (${g.stats.DEX})</span><small>+Escape/Traps</small></button>
            <button class="stat-alloc-btn" data-s="VIT"><span>VIT (${g.stats.VIT})</span><small>+15 Max HP</small></button>
            <button class="stat-alloc-btn" data-s="INT"><span>INT (${g.stats.INT})</span><small>+Avoid Traps</small></button>
            <button class="stat-alloc-btn" data-s="WIS"><span>WIS (${g.stats.WIS})</span><small>+Avoid Ambush</small></button>
            <button class="stat-alloc-btn" data-s="CHA"><span>CHA (${g.stats.CHA})</span><small>+Discount</small></button>
          </div>
        </div>
      ` : ''}

      <!-- 1. Weapon Selection Cards (Clear cards with SVG icons, type name & arrow diagram) -->
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
                  <div class="weapon-svg-wrap">
                    ${getWeaponSvg(w.key)}
                  </div>
                  <div class="wep-title">${w.name}</div>
                  <div class="wep-type-tag">${w.type}</div>
                  <div class="wep-advantage-note">${w.advantage}</div>
                  <div class="wep-status-pill">${isSelected ? 'ACTIVE ✓' : 'EQUIP'}</div>
                </button>
              `;
            })
            .join('')}
        </div>

        <!-- Combat Triangle Arrow Diagram -->
        <div class="combat-triangle-diagram">
          <div class="tri-node brute"><span class="tri-icon">🔨</span><strong>Brute</strong></div>
          <div class="tri-arrow"><span>beats</span>➔</div>
          <div class="tri-node hunter"><span class="tri-icon">🏹</span><strong>Hunter</strong></div>
          <div class="tri-arrow"><span>beats</span>➔</div>
          <div class="tri-node magical"><span class="tri-icon">🪄</span><strong>Magical</strong></div>
          <div class="tri-arrow"><span>beats</span>➔</div>
          <div class="tri-node brute mini"><span class="tri-icon">🔨</span></div>
        </div>
        <div class="triangle-note">Combat Triangle: Strong type deals +50% DMG · Weak type deals -50% DMG</div>
      </div>

      <!-- 2. Companion Selector Carousel (with Combat Type Filter Chips) -->
      <div class="camp-card-box">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
          <div class="camp-box-title">2. CHOOSE COMPANION ALLY</div>
          <span class="badge-tag" style="background:#1d1b30; color:var(--gold); font-size:0.68rem;">★ STRIKES EVERY TURN</span>
        </div>

        <!-- Filter Chips Row to easily filter all tamed companions -->
        <div class="comp-filter-row">
          <button class="comp-filter-chip ${companionFilter === 'all' ? 'active' : ''}" data-cfilter="all">All (${compCounts.all})</button>
          <button class="comp-filter-chip ${companionFilter === 'Magical' ? 'active' : ''}" data-cfilter="Magical" style="color:var(--t2);">🪄 Magical (${compCounts.Magical})</button>
          <button class="comp-filter-chip ${companionFilter === 'Hunter' ? 'active' : ''}" data-cfilter="Hunter" style="color:var(--t4);">🏹 Hunter (${compCounts.Hunter})</button>
          <button class="comp-filter-chip ${companionFilter === 'Brute' ? 'active' : ''}" data-cfilter="Brute" style="color:var(--t1);">🔨 Brute (${compCounts.Brute})</button>
        </div>

        <div class="companion-snap-carousel" id="companion-picker-carousel">
          ${filteredCompanions.length > 0 ? filteredCompanions
            .map((b) => {
              const isSelected = currentCompanion && String(currentCompanion.id) === String(b.id);
              const tierCol = TIER_COLORS[b.rarity] || '#fff';
              const art = artForBeast(b.id) || b.art || `/beasts/art/${b.id}.svg`;
              return `
                <div class="companion-snap-card ${isSelected ? 'selected' : ''}" data-id="${b.id}" style="border-color:${isSelected ? 'var(--gold)' : 'var(--line)'};">
                  <div class="snap-card-art">
                    <img src="${art}" alt="${b.name}" class="comp-thumb-img" data-id="${b.id}" loading="lazy" />
                  </div>
                  <div class="snap-card-meta">
                    <div class="snap-card-name" title="${b.name}">${b.name}</div>
                    <div class="snap-card-type-row">
                      <span style="color:${tierCol}; font-weight:bold;">T${b.rarity}</span>
                      <span class="badge-tag" style="font-size:0.62rem; padding:1px 4px;">${b.type || 'Hunter'}</span>
                      ${(b.isArtathon || Number(b.id) >= 10000) ? '<span class="artathon-pill-badge" style="font-size:0.55rem; padding:0 3px;">ARTATHON</span>' : ''}
                    </div>
                    <div class="snap-card-perk">Strikes each turn</div>
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

      <!-- 3. Camp Provisions & Armory (Market & Gear Upgrades) -->
      <div class="camp-card-box">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="camp-box-title">3. CAMP PROVISIONS & FORGE</div>
          <span style="font-size:0.7rem; color:var(--good); font-weight:600;">✓ Market Open at Camp</span>
        </div>

        <div class="camp-market-grid">
          <!-- Potion Card -->
          <div class="camp-market-card">
            <span class="mkt-icon">🧪</span>
            <div class="mkt-label">Heal Potion</div>
            <div class="mkt-tier">+20 HP</div>
            <div class="mkt-price">${pPrice}g</div>
            <button id="btn-camp-potion" class="btn-ghost arcade-btn" ${g.gold < pPrice || g.hp >= g.maxHp ? 'disabled' : ''}>
              ${g.hp >= g.maxHp ? 'HP FULL' : 'Drink'}
            </button>
          </div>

          <!-- Weapon Upgrade Card -->
          <div class="camp-market-card">
            <span class="mkt-icon">⚔️</span>
            <div class="mkt-label">${g.weapon.type}</div>
            <div class="mkt-tier">${wPrice ? `T${g.weapon.tier} ➔ T${g.weapon.tier - 1}` : `T${g.weapon.tier} (MAX)`}</div>
            <div class="mkt-price">${wPrice ? `${wPrice}g` : 'MAXED'}</div>
            <button id="btn-camp-wep" class="btn-ghost arcade-btn" ${!wPrice || g.gold < wPrice ? 'disabled' : ''}>
              ${wPrice ? 'Upgrade' : 'MAX'}
            </button>
          </div>

          <!-- Armor Upgrade Card -->
          <div class="camp-market-card">
            <span class="mkt-icon">🛡️</span>
            <div class="mkt-label">${g.armor.type}</div>
            <div class="mkt-tier">${aPrice ? `T${g.armor.tier} ➔ T${g.armor.tier - 1}` : `T${g.armor.tier} (MAX)`}</div>
            <div class="mkt-price">${aPrice ? `${aPrice}g` : 'MAXED'}</div>
            <button id="btn-camp-arm" class="btn-ghost arcade-btn" ${!aPrice || g.gold < aPrice ? 'disabled' : ''}>
              ${aPrice ? 'Upgrade' : 'MAX'}
            </button>
          </div>
        </div>
      </div>

      <!-- Main Action Button (Big gold primary, one line, always legible, disabled only when no weapon) -->
      <div class="camp-action-zone" style="margin-top:6px;">
        <button id="btn-start-gauntlet" class="btn-primary arcade-btn gauntlet-enter-btn" ${!chosenWeapon ? 'disabled' : ''}>
          ENTER THE GAUNTLET ▶
        </button>
      </div>
    `;

    // Event listeners
    wrap.querySelector('#btn-camp-exit').onclick = () => {
      if (onExit) onExit();
    };

    wrap.querySelectorAll('.stat-alloc-btn').forEach((btn) => {
      btn.onclick = () => {
        const s = btn.dataset.s;
        allocateStat(g, s);
        playLevelUpSound();
        render();
        const updatedTarget = container.querySelector('.camp-stats-strip') || container.querySelector('.stat-alloc-panel');
        triggerStatFeedback(s, updatedTarget);
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
          currentCompanion = found;
          g.companion = found;
          playTick(600);
          if (onSelectCompanion) onSelectCompanion(found);
          else render();
        }
      };
    });

    wrap.querySelectorAll('.comp-thumb-img').forEach((img) => {
      const b = beasts.find((x) => String(x.id) === String(img.dataset.id));
      if (b) img.onerror = () => handleArtError(img, b);
    });

    wrap.querySelector('#btn-camp-potion').onclick = () => {
      const oldHp = g.hp;
      const bought = buyPotion(g);
      const healed = Math.max(0, g.hp - oldHp);
      if (healed > 0) {
        playGoodSound();
        render();
        triggerHealFeedback(healed);
      } else {
        render();
      }
    };

    wrap.querySelector('#btn-camp-wep').onclick = () => {
      const bought = buyUpgrade(g, 'weapon');
      if (bought) {
        playLevelUpSound();
        render();
        triggerUpgradeFeedback(`T${g.weapon.tier} WEAPON`, '.camp-market-card:nth-child(2)');
      }
    };

    wrap.querySelector('#btn-camp-arm').onclick = () => {
      const bought = buyUpgrade(g, 'armor');
      if (bought) {
        playLevelUpSound();
        render();
        triggerUpgradeFeedback(`T${g.armor.tier} ARMOR`, '.camp-market-card:nth-child(3)');
      }
    };

    wrap.querySelector('#btn-start-gauntlet').onclick = () => {
      startDungeon(g, { stepsCount: 12, floor: nextFloor });
      notifyNavState();
      render();
    };

    return wrap;
  }

  // 3. DUNGEON SCREEN (Mini-map HUD, Chamber encounters & Battles)
  function createDungeonScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'dungeon-run-wrap';

    const d = g.dungeon;
    const hpPct = Math.min(100, Math.max(0, Math.round((g.hp / g.maxHp) * 100)));
    const xpNext = (g.level + 1) * (g.level + 1);
    const xpPct = Math.min(100, Math.round((g.xp / xpNext) * 100));

    // Top HUD Bar with Mini-map in top-right
    const header = document.createElement('header');
    header.className = 'dungeon-hud-header';

    // Generate Mini-map cells HTML
    const minimapCellsHtml = d.steps
      .map((step, idx) => {
        const isCurrent = idx === d.stepIndex;
        const isVisited = step.visited;
        let icon = '·';
        let cellClass = 'map-cell';

        if (idx === d.stepsCount - 1) {
          icon = '👑';
          cellClass += ' map-boss';
        } else if (isVisited) {
          if (step.type === 'beast') icon = '💀';
          else if (step.type === 'trap') icon = '⚡';
          else icon = '🪙';
          cellClass += ' map-visited';
        } else {
          cellClass += ' map-unknown';
        }

        if (isCurrent) cellClass += ' map-current blink';

        return `<div class="${cellClass}" title="Chamber ${idx + 1}: ${isVisited || isCurrent ? step.type : 'Unknown'}">${icon}</div>`;
      })
      .join('');

    header.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <!-- Hero HP / Gold -->
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:bold; font-size:0.9rem;">F${d.floor} · Lv.${g.level}</span>
            <span class="num font-bold" style="color:var(--gold); font-size:0.95rem;">🪙 ${g.gold}g</span>
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

        <!-- Bit-Style Mini-Map in top-right HUD (80-100px) -->
        <div class="minimap-box" id="minimap-box">
          <div class="minimap-grid">
            ${minimapCellsHtml}
          </div>
          <div class="minimap-caption num">CHAMBER ${Math.min(d.stepIndex + 1, d.stepsCount)}/${d.stepsCount}</div>
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

    // Main Stage Area (Battle vs Chamber Step)
    if (g.phase === 'battle' && g.beast) {
      wrap.appendChild(createBattleStage());
    } else {
      wrap.appendChild(createChamberStepStage());
    }

    // Battle Log
    wrap.appendChild(createCompactLog());

    return wrap;
  }

  // 4. BATTLE STAGE
  function createBattleStage() {
    const beast = g.beast;
    const wrap = document.createElement('div');
    wrap.className = 'battle-stage-panel';

    const beastHpPct = Math.min(100, Math.max(0, Math.round((beast.hp / beast.maxHp) * 100)));
    const tierColor = TIER_COLORS[beast.tier] || '#f2f2f2';
    const tierName = TIER_NAMES[beast.tier] || 'Common';
    const isNamed = Boolean(beast.prefix || beast.isBoss);
    const fullName = beast.displayName || beast.name;

    // Real Beast Art
    const artSrc = artForBeast(beast.id) || beast.art || `/beasts/art/${beast.id}.svg`;

    // Type advantage check
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

      <!-- Enemy Sprite at Top -->
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

      <!-- Bottom Hero & Companion Stage -->
      <div class="battle-allies-row">
        <!-- Companion Sprite -->
        <div class="battle-ally-card companion">
          <div class="ally-thumb-slot">
            <img src="${currentCompanion ? (artForBeast(currentCompanion.id) || currentCompanion.art || `/beasts/art/${currentCompanion.id}.svg`) : artSrc}" />
          </div>
          <div class="ally-info">
            <div style="font-weight:bold; font-size:0.75rem;">${currentCompanion ? currentCompanion.name : 'Ally'}</div>
            <div style="font-size:0.68rem; color:var(--gold);">Strikes each turn</div>
          </div>
        </div>

        <!-- Hero Card -->
        <div class="battle-ally-card battle-hero-card">
          <div class="ally-info" style="text-align:right;">
            <div style="font-weight:bold; font-size:0.8rem;">Adventurer</div>
            <div style="font-size:0.7rem; color:var(--t4);">${g.weapon.type} T${g.weapon.tier}</div>
          </div>
          <div class="ally-thumb-slot hero-slot">
            <span>⚔️</span>
          </div>
        </div>
      </div>

      <!-- Combat Action Buttons in Thumb Zone -->
      <div class="battle-actions-thumb-zone">
        <button id="btn-attack" class="btn-primary arcade-btn" style="flex:2; height:50px; font-size:1.1rem;">
          ⚔️ ATTACK
        </button>
        <button id="btn-flee" class="btn-ghost arcade-btn" style="flex:1; height:50px; border:1px solid var(--line); font-size:0.88rem;">
          🏃 FLEE (30%)
        </button>
      </div>
    `;

    const img = wrap.querySelector('#battle-beast-img');
    if (img) img.onerror = () => handleArtError(img, beast);
    const allyImg = wrap.querySelector('.battle-ally-card.companion img');
    if (allyImg && currentCompanion) allyImg.onerror = () => handleArtError(allyImg, currentCompanion);

    wrap.querySelector('#btn-attack').onclick = executeAttack;
    wrap.querySelector('#btn-flee').onclick = executeFlee;

    return wrap;
  }

  // 5. CHAMBER STEP STAGE (Explore step in dungeon)
  function createChamberStepStage() {
    const wrap = document.createElement('div');
    wrap.className = 'chamber-step-panel arcade-panel';

    const d = g.dungeon;
    const currentStep = d ? d.steps[d.stepIndex] : null;

    wrap.innerHTML = `
      <div style="text-align:center; padding:18px 10px;">
        <div style="font-size:2.8rem; margin-bottom:8px;">🚪</div>
        <h3 class="arcade-title" style="font-size:1.15rem; color:var(--text);">CHAMBER ${d ? d.stepIndex + 1 : 1} OF ${d ? d.stepsCount : 12}</h3>
        <p style="font-size:0.8rem; color:var(--muted); margin:6px 0 16px;">
          The damp stone corridor stretches into the dark. Prepare for traps or wild beasts.
        </p>

        <!-- Advance Chamber Button in Thumb Zone -->
        <button id="btn-explore" class="btn-primary arcade-btn" style="width:100%; height:52px; font-size:1.1rem;">
          ADVANCE TO CHAMBER ${d ? d.stepIndex + 1 : 1} ▶
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

    wrap.querySelector('#btn-explore').onclick = executeStep;

    const autoChk = wrap.querySelector('#chk-auto-battle');
    autoChk.onchange = (e) => {
      autoBattle = e.target.checked;
      handleAutoBattle();
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
        <div style="font-size:3rem; margin-bottom:8px;">🏆</div>
        <h2 class="arcade-title" style="color:var(--gold); font-size:1.4rem;">FLOOR ${loot.floor} CLEARED!</h2>
        <p class="subhead" style="margin-top:4px;">The chamber boss was vanquished! Returning to Camp.</p>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin:16px 0; background:var(--panel-2); padding:12px; border-radius:10px; border:1px solid var(--line); font-size:0.85rem;">
          <div>Gold Loot: <strong class="num" style="color:var(--gold);">+${loot.gold}g</strong></div>
          <div>XP Earned: <strong class="num" style="color:var(--good);">+${loot.xp} XP</strong></div>
          <div>Beasts Slain: <strong class="num">${loot.kills}</strong></div>
          <div>Captures: <strong class="num" style="color:var(--gold);">${loot.capturedCount}</strong></div>
        </div>

        <button id="btn-return-camp" class="btn-primary arcade-btn" style="width:100%; height:50px; font-size:1.05rem;">
          RETURN TO CAMP (Heal & Shop)
        </button>
      </div>
    `;

    wrap.querySelector('#btn-return-camp').onclick = () => {
      dungeonClearedLoot = null;
      if (g.dungeon) g.dungeon.cleared = true;
      notifyNavState();
      render();
    };

    return wrap;
  }

  // 7. DEATH SCREEN
  function createDeathScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'death-screen-wrap arcade-panel';

    wrap.innerHTML = `
      <div style="text-align:center; padding:24px 12px;">
        <div style="font-size:3.5rem; margin-bottom:8px;">💀</div>
        <h2 class="arcade-title" style="color:var(--bad); font-size:1.5rem;">YOU HAVE FALLEN</h2>
        <p style="font-size:0.85rem; color:var(--muted); margin:6px 0 16px;">
          Slain by ${g.diedTo || 'the dungeon depths'}. Final Level: <strong>${g.level}</strong>. Kills: <strong>${g.kills}</strong>.
        </p>

        <button id="btn-retry-gauntlet" class="btn-primary arcade-btn" style="width:100%; height:52px; font-size:1.1rem;">
          ⚔️ ENTER NEW RUN
        </button>
        <button id="btn-death-exit" class="btn-ghost arcade-btn" style="width:100%; margin-top:8px;">
          Return to Hub
        </button>
      </div>
    `;

    wrap.querySelector('#btn-retry-gauntlet').onclick = () => {
      initGame();
    };
    wrap.querySelector('#btn-death-exit').onclick = () => {
      if (onExit) onExit();
    };

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
        ${(showFullLog ? g.log : recentLines)
          .map((line) => `<div class="log-entry">${line}</div>`)
          .join('')}
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
