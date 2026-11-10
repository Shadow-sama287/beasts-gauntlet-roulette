// engine.js — pure game logic for the Beast Gauntlet (Loot Survivor-lite). No DOM, no network.
// Combat formulas follow https://docs.provable.games/lootsurvivor/combat.
// Anything marked [DESIGN] is a demo simplification, NOT from the Loot Survivor docs.
//
// Usage (UI):
//   import beastData from './beasts.json';
//   const g = createGame({ beastData, seed: 42, weaponType: 'Blade', companionId: 1 });
//   explore(g); attack(g); flee(g); allocateStat(g, 'STR'); buyPotion(g); buyUpgrade(g, 'weapon');
// Every action mutates `g` and returns a short event object; the UI re-renders from `g`.
// `g.log` is an array of strings (newest last) for the battle log.

export const TYPES = ['Magical', 'Hunter', 'Brute'];
export const WEAPON_FOR_TYPE = { Brute: 'Bludgeon', Hunter: 'Blade', Magical: 'Magic' };
export const ARMOR_FOR_TYPE = { Brute: 'Metal', Hunter: 'Hide', Magical: 'Cloth' };
export const TYPE_OF_WEAPON = { Bludgeon: 'Brute', Blade: 'Hunter', Magic: 'Magical' };
export const TYPE_OF_ARMOR = { Metal: 'Brute', Hide: 'Hunter', Cloth: 'Magical' };
export const STATS = ['STR', 'DEX', 'VIT', 'INT', 'WIS', 'CHA'];

// Brute -> Hunter -> Magical -> Brute  (docs: "Strong Against")
const STRONG_VS = { Brute: 'Hunter', Hunter: 'Magical', Magical: 'Brute' };

export const DEFAULT_CONFIG = {
  namedLevel: 19, // docs: named beasts at level 19+. For a live demo lower it (e.g. 8) so captures show up. [DESIGN]
  startGold: 40, // [DESIGN]
  potionHeal: 20, // [DESIGN]
  upgradePricePerTier: 8, // price of moving to tier T = (6 - T) * this [DESIGN]
  beastLevelPerPlayerLevel: 1.5, // max beast level = ceil(playerLevel * this) [DESIGN] (real game uses a wider range)
  beastHpBase: 10, // [DESIGN]
  beastHpPerPower: 2, // beast HP = base + power * this, power = level * (6 - tier) [DESIGN]
  companionBase: 3, // companion strike = (6 - tier) * base + level [DESIGN]
  startStatPoints: 12, // docs: 12 random stat points at start
  maxHealth: 1023, // docs
  eventWeights: { beast: 0.65, obstacle: 0.2, discovery: 0.15 }, // [DESIGN]
};

/**
 * Presentation preset (use this on stage). Tuned with a 400-seed bot simulation: median run ~14 kills,
 * ~22 explores, ends around level 9, and ~6 named-beast captures. Real Loot Survivor uses namedLevel 19.
 * Pass as: createGame({ beastData, config: DEMO_CONFIG })
 */
export const DEMO_CONFIG = { beastLevelPerPlayerLevel: 2.5, namedLevel: 6 };

// ---------- RNG (seeded, deterministic) ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (g, lo, hi) => lo + Math.floor(g.rng() * (hi - lo + 1)); // inclusive

// ---------- Pure combat math (matches the docs examples; unit-tested) ----------
export function typeMultiplierClass(attackerType, defenderType) {
  if (STRONG_VS[attackerType] === defenderType) return 'strong';
  if (STRONG_VS[defenderType] === attackerType) return 'weak';
  return 'fair';
}

/** Elemental adjustment: strong = +50%, weak = -50% (integer maths like the contracts). */
export function elementalDamage(baseAttack, attackerType, defenderType) {
  const effect = Math.floor(baseAttack / 2);
  const cls = typeMultiplierClass(attackerType, defenderType);
  if (cls === 'strong') return baseAttack + effect;
  if (cls === 'weak') return baseAttack - effect;
  return baseAttack;
}

/** Damage the adventurer deals to a beast. Docs example 1 => 25, example 2 => 92. */
export function playerDamage({ weapon, str, crit, beast }) {
  const base = weapon.level * (6 - weapon.tier);
  const elem = elementalDamage(base, TYPE_OF_WEAPON[weapon.type], beast.type);
  const strBonus = Math.floor((elem * str) / 10);
  const critBonus = crit ? elem : 0;
  const total = elem + strBonus + critBonus;
  const beastArmor = beast.level * (6 - beast.tier); // beast armor = its level * (6 - tier)
  return Math.max(4, total - beastArmor);
}

/** Damage a beast deals to the adventurer (min 2). No STR/crit for beasts in this demo. [DESIGN: no crit] */
export function beastDamage({ beast, armor, defenseBoostPct = 0 }) {
  const base = beast.level * (6 - beast.tier);
  const elem = elementalDamage(base, beast.type, TYPE_OF_ARMOR[armor.type]);
  const armorBase = armor.level * (6 - armor.tier);
  const rawDmg = Math.max(2, elem - armorBase);
  if (defenseBoostPct > 0) {
    const reduction = Math.floor(rawDmg * (defenseBoostPct / 100));
    return Math.max(1, rawDmg - reduction);
  }
  return rawDmg;
}

export function companionAttackBoostPct(friendliness = 0) {
  return Math.max(0, Math.min(100, Math.round(Number(friendliness) || 0)));
}

export function companionDefenseBoostPct(friendliness = 0) {
  const f = Math.max(0, Math.min(100, Number(friendliness) || 0));
  return Math.round(f * 0.4); // up to 40% damage reduction at 100% friendliness
}

export function companionStrike({ companion, level, beast, bonusPct = 0, friendliness = 0 }) {
  if (!companion) return 0;
  const tier = companion.tier || companion.rarity || 5;
  const rawBase = (6 - tier) * DEFAULT_CONFIG.companionBase + level;
  const fVal = companion.friendliness !== undefined ? companion.friendliness : friendliness;
  const totalBonus = (bonusPct || 0) + companionAttackBoostPct(fVal);
  const base = totalBonus > 0 ? Math.round(rawBase * (1 + totalBonus / 100)) : rawBase;
  return elementalDamage(base, companion.type, beast.type); // ignores armor [DESIGN]
}

export const maxHpFor = (vit, cap = 1023) => Math.min(cap, 100 + vit * 15);
export const levelFromXp = (xp) => Math.max(1, Math.floor(Math.sqrt(xp))); // [DESIGN: LS uses sqrt-style curve]
export const beastPower = (beast) => beast.level * (6 - beast.tier);
export const goldReward = (beast) => Math.floor(((6 - beast.tier) * beast.level) / 2); // docs
export const xpReward = (beast) => Math.max(4, Math.floor(beastPower(beast) / 2)); // [DESIGN approximation]

// ---------- Game state ----------
export function createGame({
  beastData,
  seed = Date.now(),
  weaponType = 'Blade', // 'Blade' | 'Bludgeon' | 'Magic'
  armorType = null, // defaults to the same combat type as the weapon
  companionId = null,
  config = {},
  name = 'Adventurer',
} = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const g = {
    cfg,
    beasts: beastData.beasts,
    prefixes: beastData.prefixes,
    seed,
    rng: mulberry32(seed),
    name,
    phase: 'explore', // explore | battle | levelup | dead
    xp: 0,
    level: 1,
    gold: cfg.startGold,
    stats: { STR: 0, DEX: 0, VIT: 0, INT: 0, WIS: 0, CHA: 0, LUCK: 0 },
    weapon: { type: weaponType, tier: 5, level: 1 },
    armor: { type: armorType || ARMOR_FOR_TYPE[TYPE_OF_WEAPON[weaponType]], tier: 5, level: 1 },
    companion: companionId ? g_beastById(beastData.beasts, companionId) : null,
    hp: 100,
    maxHp: 100,
    pendingStatPoints: 0,
    beast: null,
    ambushed: false,
    turns: 0,
    kills: 0,
    captured: [], // named beasts defeated => the "Beast Dex" (mirrors the real NFT mint on first named-beast victory)
    log: [],
  };
  for (let i = 0; i < cfg.startStatPoints; i++) g.stats[STATS[randInt(g, 0, STATS.length - 1)]]++;
  g.maxHp = maxHpFor(g.stats.VIT, cfg.maxHealth);
  g.hp = g.maxHp;
  say(g, `${name} enters the Gauntlet with ${g.maxHp} HP.`);
  return g;
}
function g_beastById(beasts, id) {
  return beasts.find((b) => b.id === id) || null;
}
function say(g, msg) {
  g.log.push(msg);
  if (g.log.length > 200) g.log.shift();
}

// ---------- Beast generation ----------
export function spawnBeast(g) {
  const maxLvl = Math.max(1, Math.ceil(g.level * g.cfg.beastLevelPerPlayerLevel));
  const level = randInt(g, 1, maxLvl);
  // Higher tiers (rarer) are more likely at low levels per docs ("Tier Distribution"); we weight T5 up early. [DESIGN]
  const r = g.rng();
  const lowBias = Math.max(0.15, 0.6 - g.level * 0.03);
  let tier;
  if (r < lowBias) tier = 5;
  else if (r < lowBias + 0.25) tier = 4;
  else if (r < lowBias + 0.45) tier = 3;
  else if (r < lowBias + 0.57) tier = 2;
  else tier = 1;
  const pool = g.beasts.filter((b) => b.tier === tier);
  const species = pool[randInt(g, 0, pool.length - 1)];
  const beast = { ...species, level, prefix: null };
  if (level >= g.cfg.namedLevel) beast.prefix = g.prefixes[randInt(g, 0, g.prefixes.length - 1)];
  beast.displayName = beast.prefix ? `${beast.prefix} ${beast.name}` : beast.name;
  beast.maxHp = g.cfg.beastHpBase + beastPower(beast) * g.cfg.beastHpPerPower;
  beast.hp = beast.maxHp;
  return beast;
}

// ---------- Actions ----------
export function explore(g) {
  if (g.phase !== 'explore') return { kind: 'blocked', reason: `phase is ${g.phase}` };
  g.turns++;
  const w = g.cfg.eventWeights;
  const r = g.rng();
  if (r < w.beast) {
    g.beast = spawnBeast(g);
    g.phase = 'battle';
    // Ambush: 50% base, reduced by WIS/level (docs: WIS avoids ambush penalties)
    const wisSave = Math.min(1, g.stats.WIS / g.level);
    g.ambushed = g.rng() < 0.5 * (1 - wisSave);
    say(g, `A ${g.beast.displayName} (${g.beast.type} T${g.beast.tier}, Lv ${g.beast.level}) appears!`);
    if (g.ambushed) {
      say(g, `Ambush! The ${g.beast.displayName} strikes first.`);
      beastStrike(g);
    }
    return { kind: 'beast', beast: g.beast, ambushed: g.ambushed };
  }
  if (r < w.beast + w.obstacle) {
    const tier = randInt(g, 1, 5);
    const lvl = randInt(g, 1, Math.max(1, Math.ceil(g.level * 1.2)));
    const avoid = g.rng() < Math.min(1, g.stats.INT / g.level); // docs: INT/level avoids obstacles
    if (avoid) {
      say(g, 'You spot a trap in time and slip past it.');
      return { kind: 'obstacle', avoided: true };
    }
    const dmg = Math.max(2, lvl * (6 - tier));
    g.hp = Math.max(0, g.hp - dmg);
    say(g, `A hidden obstacle hits you for ${dmg}.`);
    if (g.hp === 0) die(g, 'an obstacle');
    return { kind: 'obstacle', avoided: false, dmg };
  }
  const found = g.rng() < 0.5;
  if (found) {
    const gold = randInt(g, 3, 6 + g.level * 2);
    g.gold += gold;
    say(g, `You find ${gold} gold.`);
    return { kind: 'discovery', gold };
  }
  const heal = randInt(g, 5, 10 + g.level);
  g.hp = Math.min(g.maxHp, g.hp + heal);
  say(g, `You find a healing herb (+${heal} HP).`);
  return { kind: 'discovery', heal };
}

export function attack(g) {
  if (g.phase !== 'battle') return { kind: 'blocked' };
  const crit = g.rng() < Math.min(100, g.stats.LUCK) / 100; // docs: crit chance = LUCK%
  const wpn = { ...g.weapon, level: g.level }; // weapon levels with you [DESIGN]
  let dmg = playerDamage({ weapon: wpn, str: g.stats.STR, crit, beast: g.beast });
  const bonusPct = g.companionBonusPct || (g.companion ? g.companion.bonusPct : 0) || 0;
  const friendliness = g.companion ? (g.companion.friendliness || 0) : 0;
  const comp = companionStrike({ companion: g.companion, level: g.level, beast: g.beast, bonusPct, friendliness });
  dmg += comp;
  g.beast.hp = Math.max(0, g.beast.hp - dmg);
  const boostNotes = [];
  if (friendliness > 0) boostNotes.push(`♥${friendliness}% friend`);
  if (bonusPct > 0) boostNotes.push(`+${bonusPct}% Dojo`);
  const boostStr = boostNotes.length > 0 ? ` (${boostNotes.join(', ')})` : '';
  say(g, `You hit ${g.beast.displayName} for ${dmg}${crit ? ' (CRIT!)' : ''}${comp ? ` incl. ${g.companion.name} strike ${comp}${boostStr}` : ''}.`);
  if (g.beast.hp === 0) return victory(g);
  beastStrike(g);
  return { kind: 'attack', dmg, crit, comp, companionBonusPct: bonusPct, friendliness };
}

export function flee(g) {
  if (g.phase !== 'battle') return { kind: 'blocked' };
  const chance = Math.min(1, g.stats.DEX / g.level); // docs: DEX/level
  if (g.rng() < chance) {
    say(g, `You escape from ${g.beast.displayName}.`);
    g.beast = null;
    g.phase = 'explore';
    if (g.dungeon && !g.dungeon.cleared) {
      g.dungeon.stepIndex++;
      if (g.dungeon.stepIndex >= g.dungeon.stepsCount) {
        g.dungeon.cleared = true;
      }
    }
    return { kind: 'fled', success: true };
  }
  say(g, 'You fail to escape!');
  beastStrike(g);
  return { kind: 'fled', success: false };
}

function beastStrike(g) {
  const friendliness = g.companion ? (g.companion.friendliness || 0) : 0;
  const defBoost = companionDefenseBoostPct(friendliness);
  const dmg = beastDamage({ beast: g.beast, armor: { ...g.armor, level: g.level }, defenseBoostPct: defBoost });
  g.hp = Math.max(0, g.hp - dmg);
  const guardNote = defBoost > 0 && g.companion ? ` [${g.companion.name} guarded -${defBoost}% dmg]` : '';
  say(g, `${g.beast.displayName} hits you for ${dmg}.${guardNote}`);
  if (g.hp === 0) die(g, g.beast.displayName);
}

function victory(g) {
  const b = g.beast;
  const gold = goldReward(b);
  const xp = xpReward(b);
  g.gold += gold;
  g.xp += xp;
  g.kills++;
  say(g, `${b.displayName} is defeated! +${gold} gold, +${xp} XP.`);
  let captured = false;
  if (b.prefix && !g.captured.some((c) => c.id === b.id && c.prefix === b.prefix)) {
    g.captured.push({ id: b.id, name: b.name, prefix: b.prefix, type: b.type, tier: b.tier, level: b.level, turn: g.turns });
    captured = true;
    say(g, `★ CAPTURED: ${b.displayName} added to your Beast Dex!`);
  }
  const newLevel = levelFromXp(g.xp);
  let gained = 0;
  if (newLevel > g.level) {
    gained = newLevel - g.level;
    g.level = newLevel;
    g.pendingStatPoints += gained;
    say(g, `LEVEL UP! You are now level ${g.level}. Spend ${g.pendingStatPoints} stat point(s).`);
  }

  if (g.dungeon && !g.dungeon.cleared) {
    g.dungeon.loot.gold += gold;
    g.dungeon.loot.xp += xp;
    g.dungeon.loot.kills++;
    if (captured) g.dungeon.loot.captured.push(b);
    g.dungeon.stepIndex++;
    if (g.dungeon.stepIndex >= g.dungeon.stepsCount) {
      g.dungeon.cleared = true;
      say(g, `★ FLOOR ${g.dungeon.floor} CLEARED! The boss has fallen!`);
    }
  }

  g.beast = null;
  const inActiveDungeon = Boolean(g.dungeon && !g.dungeon.cleared);
  g.phase = g.pendingStatPoints > 0 && !inActiveDungeon ? 'levelup' : 'explore';
  return {
    kind: 'victory',
    gold,
    xp,
    captured,
    levelUp: gained > 0,
    defeated: b,
    dungeonCleared: Boolean(g.dungeon && g.dungeon.cleared),
  };
}

function die(g, by) {
  g.phase = 'dead';
  g.diedTo = by;
  say(g, `You were slain by ${by}. Final level ${g.level}.`);
}

export function allocateStat(g, stat) {
  if (g.pendingStatPoints <= 0 || !STATS.includes(stat)) return { kind: 'blocked' };
  g.stats[stat]++;
  g.pendingStatPoints--;
  if (stat === 'VIT') {
    g.maxHp = maxHpFor(g.stats.VIT, g.cfg.maxHealth);
    g.hp = Math.min(g.maxHp, g.hp + 15); // docs: VIT upgrades heal instantly
  }
  if (g.pendingStatPoints === 0 && g.phase === 'levelup') g.phase = 'explore';
  return { kind: 'stat', stat };
}

// ---------- Market (only in the explore phase, locked during active dungeons) ----------
export const potionPrice = (g) => Math.max(1, g.level - 2 * g.stats.CHA); // docs: CHA = -2 gold/point on potions, min 1
export const upgradePrice = (g, slot) => {
  const next = g[slot].tier - 1;
  if (next < 1) return null;
  return Math.max(1, (6 - next) * g.cfg.upgradePricePerTier - g.stats.CHA); // CHA -1 gold/point on items
};

export function isMarketLocked(g) {
  return Boolean(g.dungeon && !g.dungeon.cleared);
}

export function buyPotion(g) {
  if (isMarketLocked(g)) return { kind: 'blocked', reason: 'locked_in_dungeon' };
  if (g.phase !== 'explore' && g.phase !== 'levelup') return { kind: 'blocked' };
  const price = potionPrice(g);
  if (g.gold < price || g.hp >= g.maxHp) return { kind: 'blocked', price };
  g.gold -= price;
  g.hp = Math.min(g.maxHp, g.hp + g.cfg.potionHeal);
  say(g, `Potion: +${g.cfg.potionHeal} HP for ${price}g.`);
  return { kind: 'potion', price };
}

export function buyUpgrade(g, slot) {
  if (isMarketLocked(g)) return { kind: 'blocked', reason: 'locked_in_dungeon' };
  if (g.phase !== 'explore' && g.phase !== 'levelup') return { kind: 'blocked' };
  if (slot !== 'weapon' && slot !== 'armor') return { kind: 'blocked' };
  const price = upgradePrice(g, slot);
  if (price === null || g.gold < price) return { kind: 'blocked', price };
  g.gold -= price;
  g[slot].tier -= 1;
  say(g, `${slot} upgraded to T${g[slot].tier} for ${price}g.`);
  return { kind: 'upgrade', slot, price };
}

// ---------- Deterministic Dungeon Generator & Progression ----------

/**
 * Procedurally generates a self-avoiding walkable path across a 6x6 grid.
 * Path starts in the top-left area and winds towards the boss chamber near bottom-right.
 * Returns an array of { row, col } coordinates of length stepsCount (e.g. 10–12 steps).
 */
export function generateProceduralPath({ seed, stepsCount = 12, rows = 6, cols = 6 }) {
  if (stepsCount >= rows * cols) {
    const full = [];
    for (let i = 0; i < stepsCount; i++) {
      full.push({ row: Math.floor(i / cols), col: i % cols });
    }
    return full;
  }

  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const DIRS = [
    [0, 1],   // right
    [1, 0],   // down
    [0, -1],  // left
    [-1, 0],  // up
  ];

  // Dynamic starting position near top-left (row 0..1, col 0..1)
  const startR = Math.floor(rng() * 2);
  const startC = Math.floor(rng() * 2);

  const path = [];
  const visited = new Set();

  function dfs(r, c) {
    path.push({ row: r, col: c });
    visited.add(`${r},${c}`);

    if (path.length === stepsCount) return true;

    // Pick directions with preference towards bottom-right (5, 5) with slight random jitter.
    // Calculate weights first to ensure a deterministic, anti-symmetric sort comparator.
    const weightedDirs = DIRS.map(([dr, dc]) => {
      const dist = Math.hypot((r + dr) - (rows - 1), (c + dc) - (cols - 1));
      const jitter = (rng() - 0.5) * 1.8;
      return { dr, dc, weight: dist + jitter };
    });
    weightedDirs.sort((a, b) => a.weight - b.weight);

    for (const { dr, dc } of weightedDirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited.has(`${nr},${nc}`)) {
        if (dfs(nr, nc)) return true;
      }
    }

    path.pop();
    visited.delete(`${r},${c}`);
    return false;
  }

  const found = dfs(startR, startC);
  if (!found || path.length < stepsCount) {
    // Fallback serpentine path across the grid
    const fallback = [];
    let r = 0, c = 0, dir = 1;
    for (let i = 0; i < stepsCount; i++) {
      fallback.push({ row: r, col: c });
      c += dir;
      if (c >= cols) { c = cols - 1; r++; dir = -1; }
      else if (c < 0) { c = 0; r++; dir = 1; }
    }
    return fallback;
  }

  return path;
}

export function generateDungeonLayout({ seed, stepsCount = 12, floor = 1 }) {
  const rng = mulberry32((seed ^ (floor * 0x654321)) >>> 0);
  const coords = generateProceduralPath({ seed: seed ^ (floor * 0x3344), stepsCount, rows: 6, cols: 6 });
  const steps = [];
  // Chambers 0 to stepsCount - 2: distributed between beast, trap, discovery
  for (let i = 0; i < stepsCount - 1; i++) {
    const r = rng();
    let type = 'beast';
    if (r < 0.55) {
      type = 'beast';
    } else if (r < 0.82) {
      type = 'trap';
    } else {
      type = 'discovery';
    }
    steps.push({
      index: i,
      row: coords[i] ? coords[i].row : Math.floor(i / 6),
      col: coords[i] ? coords[i].col : i % 6,
      type,
      visited: false,
    });
  }
  // Chamber stepsCount - 1 (last chamber) is ALWAYS boss
  const lastCoord = coords[stepsCount - 1] || { row: Math.floor((stepsCount - 1) / 6), col: (stepsCount - 1) % 6 };
  steps.push({
    index: stepsCount - 1,
    row: lastCoord.row,
    col: lastCoord.col,
    type: 'boss',
    visited: false,
  });
  return steps;
}

export function spawnBoss(g, floor = 1) {
  // Boss is T1 or T2 elite beast with high stats and guaranteed prefix
  const bossTier = floor > 1 && g.rng() < 0.6 ? 1 : 2;
  const pool = g.beasts.filter((b) => b.tier === bossTier) || g.beasts;
  const species = pool[randInt(g, 0, pool.length - 1)] || pool[0];
  const level = Math.max(2, Math.ceil(g.level * 1.4));
  const prefix = g.prefixes[randInt(g, 0, g.prefixes.length - 1)] || 'Doom';
  const boss = {
    ...species,
    level,
    prefix,
    isBoss: true,
    displayName: `${prefix} ${species.name}`,
  };
  boss.maxHp = Math.floor((g.cfg.beastHpBase + beastPower(boss) * g.cfg.beastHpPerPower) * 1.35);
  boss.hp = boss.maxHp;
  return boss;
}

export function startDungeon(g, { stepsCount = 12, floor = 1, seed = null } = {}) {
  // Ensure each dungeon entry has a deterministic dynamic seed derived from game seed and RNG
  const dynamicSeed = seed !== null
    ? seed
    : ((g.seed ^ (floor * 0x7f4a7c15) ^ Math.floor(g.rng() * 0xffffff)) >>> 0);
  const steps = generateDungeonLayout({ seed: dynamicSeed, stepsCount, floor });
  g.dungeon = {
    floor,
    seed: dynamicSeed,
    stepIndex: 0,
    stepsCount,
    steps,
    cleared: false,
    activeStep: null,
    loot: { gold: 0, xp: 0, kills: 0, captured: [] },
  };
  g.phase = 'explore';
  say(g, `Floor ${floor} entered! ${stepsCount} chambers await in 6×6 labyrinth. Boss lurks in chamber ${stepsCount}.`);
  return g.dungeon;
}

export function stepDungeon(g) {
  if (!g.dungeon) return explore(g);
  if (g.dungeon.cleared) return { kind: 'blocked', reason: 'dungeon_already_cleared' };
  if (g.phase !== 'explore') return { kind: 'blocked', reason: `phase is ${g.phase}` };

  const d = g.dungeon;
  if (d.stepIndex >= d.stepsCount) {
    d.cleared = true;
    return { kind: 'dungeon_cleared', dungeon: d };
  }

  const step = d.steps[d.stepIndex];
  step.visited = true;
  d.activeStep = step;
  g.turns++;

  if (step.type === 'boss') {
    const boss = spawnBoss(g, d.floor);
    g.beast = boss;
    g.phase = 'battle';
    say(g, `👑 BOSS CHAMBER: ${boss.displayName} (T${boss.tier} ${boss.type}, Lv ${boss.level}) roars!`);
    return { kind: 'boss', beast: boss, step: d.stepIndex + 1, total: d.stepsCount };
  }

  if (step.type === 'beast') {
    const beast = spawnBeast(g);
    g.beast = beast;
    g.phase = 'battle';
    const wisSave = Math.min(1, g.stats.WIS / Math.max(1, g.level));
    g.ambushed = g.rng() < 0.45 * (1 - wisSave);
    say(g, `A ${beast.displayName} (${beast.type} T${beast.tier}, Lv ${beast.level}) blocks the path!`);
    if (g.ambushed) {
      say(g, `Ambush! The ${beast.displayName} strikes first.`);
      beastStrike(g);
    }
    return { kind: 'beast', beast, ambushed: g.ambushed, step: d.stepIndex + 1, total: d.stepsCount };
  }

  if (step.type === 'trap') {
    const tier = randInt(g, 1, 5);
    const lvl = Math.max(1, Math.ceil(g.level * 1.3));
    const avoid = g.rng() < Math.min(0.85, Math.max(g.stats.INT, g.stats.DEX) / Math.max(2, g.level * 1.4));
    if (avoid) {
      say(g, `Trap triggered! DEX/INT check passed: deftly slipped past the razor spikes.`);
      d.stepIndex++;
      if (d.stepIndex >= d.stepsCount) d.cleared = true;
      return { kind: 'trap', avoided: true, step: d.stepIndex, total: d.stepsCount };
    }
    const dmg = Math.max(8, Math.floor(lvl * (6 - tier) * 1.6));
    g.hp = Math.max(0, g.hp - dmg);
    say(g, `Trap sprung! Razor spikes strike you for ${dmg} damage!`);
    if (g.hp === 0) die(g, 'a dungeon spike trap');
    d.stepIndex++;
    if (d.stepIndex >= d.stepsCount) d.cleared = true;
    return { kind: 'trap', avoided: false, dmg, step: d.stepIndex, total: d.stepsCount };
  }

  // Discovery (chest)
  const gold = randInt(g, 8, 16 + g.level * 3);
  g.gold += gold;
  d.loot.gold += gold;
  say(g, `Treasure chest discovered! Found ${gold} gold!`);
  d.stepIndex++;
  if (d.stepIndex >= d.stepsCount) d.cleared = true;
  return { kind: 'discovery', gold, step: d.stepIndex, total: d.stepsCount };
}

// ---------- Summary for the end screen ----------
export function summary(g) {
  return {
    name: g.name,
    level: g.level,
    kills: g.kills,
    turns: g.turns,
    gold: g.gold,
    captured: g.captured,
    diedTo: g.diedTo || null,
    seed: g.seed,
  };
}
