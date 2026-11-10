# Beast Gauntlet & Roulette ⚔️🎰

[![Repository](https://img.shields.io/badge/GitHub-Shadow--sama287%2Fbeasts--gauntlet--roulette-181717?logo=github)](https://github.com/Shadow-sama287/beasts-gauntlet-roulette)
[![Tests](https://img.shields.io/badge/Unit%20Tests-73%20Passing-brightgreen?logo=node.js)](https://github.com/Shadow-sama287/beasts-gauntlet-roulette)
[![Network](https://img.shields.io/badge/Offline-100%25%20Self--Contained-blue)](https://github.com/Shadow-sama287/beasts-gauntlet-roulette)
[![Chain](https://img.shields.io/badge/Chain-Starknet%20Sepolia-orange)](https://github.com/Shadow-sama287/beasts-gauntlet-roulette)
[![Stack](https://img.shields.io/badge/Stack-Vite%20%2B%20Vanilla%20JS%20%2B%20Phaser%203-purple)](https://github.com/Shadow-sama287/beasts-gauntlet-roulette)

A dark-fantasy browser game suite built for the Starknet Beastathon hackathon sprint using **Vite + vanilla JavaScript + plain CSS** with zero external dependencies, no CDN links, and 100% offline gameplay.

It merges **Loot Survivor dungeon roguelike combat** with a **high-stakes taming arcade**, a **4-lane chiptune rhythm Dojo**, and an **interactive 3D holographic card inspector**. All 75 canonical species from Musical Onchain Beasts (MOB) and 30 Artathon community creations (105 total beasts) come alive with authentic pre-baked Starknet Sepolia SVGs.

---

## 🎮 Game Modes

### 1. ⚔️ Dungeon Gauntlet (Loot Survivor Roguelike)
- **Gauntlet Camp Pre-Run Hub**: Prepare for your run in a unified base camp:
  - Choose your starter weapon (**Blade**, **Bludgeon**, or **Magic**).
  - Inspect the interactive **Combat Triangle diagram**.
  - Select your **Companion Ally** from captured beasts with combat-type filter chips (*All*, *Magical*, *Hunter*, *Brute*).
  - Forge gear upgrades and purchase instant healing potions with accumulated gold.
- **Combat Triangle**: Exploit type affinities based on Loot Survivor mechanics:
  - **Hunter (Blade 🏹)**: Strong vs Magical (+50% dmg), weak vs Brute (-50% dmg).
  - **Magical (Magic 🪄)**: Strong vs Brute (+50% dmg), weak vs Hunter (-50% dmg).
  - **Brute (Bludgeon 🔨)**: Strong vs Hunter (+50% dmg), weak vs Magical (-50% dmg).
- **Dungeon Exploration**: Traverse multi-room floors encountering ambushes, hidden treasure vaults, and traps, culminating in a fierce **Boss Chamber**.
- **Companion Strike Synergy**: Equipped companions attack alongside you each turn. Companion damage scales directly with your training score from the **Beast Dojo** (+5% to +20% bonus)!
- **Named Beast Captures**: Slay legendary named beasts (bearing prefixes like *Doom*, *Blood*, *Onslaught*) to capture them into your **Beast Dex**.
- **RPG Progression**: Distribute attribute points on level-up across 6 core stats: `STR`, `DEX`, `VIT`, `INT`, `WIS`, and `CHA`.
- **Hands-Free Auto-Battle**: Toggle auto-battle mode for automated demonstration during presentations.

### 2. 🎰 Beast Roulette & Dynamic Reflex Minigames
- **Case-Opening Horizontal Reel Strip**: Smooth horizontal card reel with ticking audio, rising pitch tension, and responsive auto-centering.
- **Roster & Rarity**: Spin across 105 beasts categorized into 5 tiers:
  - **T1 Legendary** (Weight: 1)
  - **T2 Epic / Mythic** (Weight: 2)
  - **T3 Rare** (Weight: 4)
  - **T4 Uncommon** (Weight: 8)
  - **T5 Common** (Weight: 15)
- **Pity System**: Bad-luck protection per `GACHA_CONFIG.pity` (Rare+ T3 guaranteed within 15 spins without one, Legendary T1 guaranteed within 45 spins without one, plus Starr Road progression via duplicate credits).
- **5 Tier Dynamic Reflex Minigames**:
  - **T1 Legendary — Harmonic Convergence**: Dual energy needles converge from left and right into a central singularity Nexus.
  - **T2 Epic — Dual Ward Lock**: Two-stage consecutive timing strikes to shatter mystical beast wards.
  - **T3 Rare — Drifting Sanctuary**: Dynamic moving target sanctuary drifts smoothly while needle sweeps.
  - **T4 Uncommon — Focus Ring**: Contracting concentric energy pulse circle; strike at exact ring alignment.
  - **T5 Common — Steady Sweep**: Classic reflex timing bar with generous sweet spot.
- **Phaser 3 Arcade Minigame Suite**: Dynamic minigame challenges (Net Toss, Rune Echo, Dodge & Strike, Tug Struggle, Spark Catch, Rune Trace, Heartbeat) lazy-loaded via dynamic import.
- **Essence & Lucky Spin**: Duplicate catches yield essence (`6 - rarity`). Accumulating 10 Essence triggers a **Lucky Spin** where sweet spot target zones expand by **1.6×**!
- **Auto-Spin Mode**: Hands-free automated spin and minigame demonstration.

### 3. 🥋 Beast Dojo (Reflex & Rhythm Training)
- **4-Lane Falling-Note Rhythm Game**: Hit incoming musical runes across 4 lanes (▲ / ◀ / ▼ / ▶ or W/A/S/D / 1-4) synchronized to chiptune BPM tracks (130, 110, 145, 95 BPM).
- **Strict Timing Windows**: `PERFECT` (≤80ms), `GOOD` (≤160ms), and `MISS`.
- **Combo Multipliers & Companion Feedback**: Build up to a 4× combo multiplier with beat-synchronized visual feedback from your active companion.
- **Gauntlet Strike Bonus**: High scores unlock a +5% to +20% companion attack bonus in the Dungeon Gauntlet!

### 4. 🎵 MOB Sound Studio & FFT Visualizer
- **Procedural 8-bit Synthetic Chiptune**: Built entirely with the Web Audio API—zero mp3/wav files, zero external requests.
- **Original Compositions**: 4 retro chiptune tracks:
  - *Primal Beats* (130 BPM)
  - *Dungeon Depths* (110 BPM)
  - *Gauntlet Arena* (145 BPM)
  - *Astral Singularity* (95 BPM)
- **Real-time Visualizer**: Live FFT frequency spectrum visualizer canvas reacting to oscillator output.

### 5. 📖 Beast Dex & 3D Holographic Card Inspector
- **105-Beast Census**: 75 canonical Starknet Sepolia species + 30 Artathon community creations.
- **Authentic Artwork**: 100% bundled SVG artwork baked from Starknet Sepolia (`public/beasts/` and `public/beasts/art/`) with zero missing assets or sigil fallbacks.
- **Spoiler-Free Discovery**: Uncaught beasts display mysterious dark silhouettes with rarity frames; captured beasts glow in radiant gold.
- **Interactive 3D Holographic Card Inspector**: Click any card to launch an interactive 3D modal featuring:
  - Mouse/touch tilt tracking with real-time holographic specular sheen.
  - `ONCHAIN` and `ARTATHON SUBMISSION` authenticity badges.
  - Token ID, Combat Type, Tier, and base combat stats.
  - Direct links to `https://beasts.app/#/beast/<id>` and Sepolia Starkscan.
  - One-click Companion Equipping for Gauntlet and Dojo.

---

## ⚖️ Real vs. Simulated Disclosures

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **Beast Art & Designs** | **Real** | All 105 beast SVGs (75 canonical species + 30 Artathon creations) are baked statically from live Starknet Sepolia contracts (`public/beasts/` and `public/beasts/art/`). Tagged with `ONCHAIN` and `ARTATHON SUBMISSION` badges. |
| **Fallback Sigils** | **Real** | 75 offline fallback SVGs in `public/beasts/fallback/` guarantee complete offline resilience under any network conditions. |
| **Verifiable Spins** | **Real** | Spin seeds derived from public Starknet Sepolia block hashes (`starknet_blockHashAndNumber`) and SHA-256 digests. |
| **SNIP-12 Run Receipts** | **Real** | Cryptographic gas-free run receipt signed with `account.signMessage` featuring 31-byte felt hash. |
| **Read-Only Wallet** | **Real** | Optional connection to ArgentX or Braavos on Starknet Sepolia; checks `owner_of` with 2s timeout and address cache. |
| **Beast Profiles** | **Real** | Every card links directly to `https://beasts.app/#/beast/<id>` and Sepolia Starkscan (`target="_blank" rel="noopener"`). |
| **Zero Wallet / Free** | **Real** | No gas, no private keys, no transactions. Completely playable offline without network. |
| **Combat Math** | **Real** | Faithfully implements Loot Survivor combat formulas from Provable Games documentation. |
| **Beast Capture** | **Simulated** | Stored locally in browser `localStorage`. Labeled: *"Simulated capture (no wallet tx)"*. |
| **Roulette & Minigames** | **Simulated** | Deterministic seeded RNG (`mulberry32`) with rarity weights and reflex timing. |

---

## 🛠️ Tech Stack & Architecture

- **Combat Engine**: `src/engine.js` (pure, deterministic seeded RNG, 100% unit tested).
- **Roulette Engine**: `src/roulette.js` (pure, seeded RNG, unit tested).
- **Verifiable Spin**: `src/chain/verifiableSpin.js` (Starknet block-hash seeding, replay derivation).
- **Wallet Adapter**: `src/chain/wallet.js` (read-only Starknet adapter, gas-free signing).
- **Ownership Engine**: `src/chain/ownership.js` (batch `owner_of` read with concurrency 8, cached per address).
- **Run Receipt**: `src/chain/receipt.js` (SNIP-12 typed data generator, 31-byte felt SHA-256 hash).
- **Art Engine**: `src/art/beastArt.js` (local bundled files -> onchain 2s timeout -> sigils).
- **Onchain Layer**: `src/onchain.js` (read-only Starknet Sepolia token_uri parser and ByteArray codec).
- **Minigame Framework**: `src/minigames/` (lazy-loaded Phaser 3 host + pure canvas fallbacks).
- **UI Architecture**: Modular ES modules in `src/ui/` (`gauntlet.js`, `dojo.js`, `cardModal.js`, `jukebox.js`, `reelStrip.js`, `settings.js`, `transition.js`).
- **Audio Engine**: `src/audio.js` (procedural Web Audio API synthetic oscillators, zero CDN).
- **Styling**: Plain CSS with custom arcade design tokens, 8-bit scanline shutter transitions, and safe-area responsive padding down to 360px viewport width.

---

## 🚀 Quickstart

```bash
# 1. Clone repository
git clone https://github.com/Shadow-sama287/beasts-gauntlet-roulette.git
cd beasts-gauntlet-roulette

# 2. Install dependencies
npm install

# 3. Run full test suite (73 unit tests across combat, onchain, verifiable spin, wallet, receipt, and minigames)
npm test

# 4. Generate Beast Art Census Report (verifies all 105 SVGs)
node scripts/art-report.mjs

# 5. Start local development server
npm run dev

# 6. Run automated headless simulations
node scripts/simulate-playthrough.mjs
node scripts/simulate-gauntlet.mjs

# 7. Build for production
npm run build

# 8. Preview production build locally
npm run preview
```

---

## ⌨️ Controls & Navigation

- **Navigation**: Persistent fixed bottom tab bar with 6 screens (**Home**, **Gauntlet**, **Roulette**, **Dojo**, **Dex**, **Settings**). Auto-hides during active combat and minigames to preserve screen real estate.
- **Space**: Primary action across all scenes (Explore / Attack in Gauntlet, Spin / Strike in Roulette, Hit notes in Dojo).
- **G**: Jump to Gauntlet.
- **R**: Jump to Roulette.
- **D**: Jump to Dojo.
- **A**: Jump to Beast Dex.
- **S / J**: Jump to Settings & Sound Studio.
- **H**: Jump to Home.
- **Esc**: Close 3D Holographic Card modal / Return to Hub.

---

## 📜 Credits & Acknowledgements

- **Provable Games** — For the Loot Survivor combat mechanics, formulas, and beast roster.
- **Musical Onchain Beasts (MOB) / [beasts.app](https://beasts.app)** — Onchain NFT art, sound concepts, and species designs on Starknet Sepolia.
- Third-party licenses and asset credits are documented in [`CREDITS.md`](./CREDITS.md).
- Built for the Starknet Beastathon Gameathon.
