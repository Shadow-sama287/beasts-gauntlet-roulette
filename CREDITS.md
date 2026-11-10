# Beast Gauntlet & Roulette — Third-Party Credits & Licenses

All assets and code libraries used in Beast Gauntlet & Roulette are bundled locally to ensure 100% offline gameplay without runtime network dependencies.

## 1. Starknet Beasts Onchain Art & Metadata
- **Project:** Beasts NFT Collection (Starknet Sepolia)
- **Source:** Starknet Sepolia Contract `0x0158160018cfba994db696f83c9db350d suppression...` / beasts.app
- **License:** CC0 1.0 Universal / Public Domain & Community NFT assets
- **Usage:** Pre-baked SVG artwork for canonical species IDs 1–75 and custom species IDs 10012–10041 stored in `public/beasts/art/` and `public/beasts/`.

## 2. Combat Engine & Game Rules
- **Project:** Loot Survivor
- **Author:** Provable Games
- **Documentation:** https://docs.provable.games/lootsurvivor/combat
- **License:** MIT License / Open Documentation
- **Usage:** Combat formulas (player damage, weapon/armor tiers, elemental type triangle: Brute > Hunter > Magical > Brute), adapted into pure seeded JavaScript in `src/engine.js`.

## 3. Libraries & Runtimes
- **Phaser 3:**
  - **Author:** Richard Davey / Photon Storm Ltd
  - **License:** MIT License (https://opensource.org/licenses/MIT)
  - **Usage:** Minigame runner and canvas host dynamically loaded for arcade minigames.
- **Vite:**
  - **Author:** Evan You and Vite Contributors
  - **License:** MIT License
  - **Usage:** Local build tooling and development server.

## 4. Audio & Sound FX
- **Engine:** MOB Sound Studio synthetic Web Audio API procedural synthesizer (`src/audio.js`).
- **Composition:** Procedural 8-bit chiptune compositions ("Primal Beats", "Dungeon Depths", "Gauntlet Arena", "Astral Singularity") generated on the fly via Web Audio oscillators without external audio sample files.
- **License:** Dedicated CC0 / MIT by project creators.

## 5. Visual Styling & Typography
- **Design Tokens:** Custom Dark-Fantasy Arcade retro theme with gold/cyan/purple accents.
- **Fonts:** System and local font stack (`Pixelify Sans`, `Press Start 2P`, `Silkscreen`, system sans-serif) avoiding external Google Fonts or CDN requests.
- **Icons:** Custom handcrafted inline SVG pixel icons.
