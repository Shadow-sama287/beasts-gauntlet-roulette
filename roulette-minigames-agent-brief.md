# Roulette & Minigames — Roast + Agent Brief (Round 2)

**Scope:** the Roulette (the game's starting point), its 5 tier-specific capture minigames, the first-run gate into the Gauntlet, and the leftover bugs seen in the latest Gauntlet/Camp screenshots.

**Verdict:** The previous pass helped. The bottom tab bar, minimap, Camp screen and switch toggles are real improvements. But the **core loop (spin → minigame → tame → dungeon) is still the weakest and flakiest part**, and it is the part every player touches first. The minigames sometimes don't start or don't finish, they open in a cramped area, the beast art is tiny, and they feel static. Fix reliability first, then make them dynamic.

> Note for the agent: no screenshots of the minigame screens were provided. The minigame findings below come from the owner's description. **Before changing anything, open each of the 5 minigames, play each at least 20 times, and write down what you actually find** (see §2.3). Treat this brief's minigame concepts as a spec for the framework, and adapt the per-tier ideas to what already exists.

**Constraints (unchanged):** Vite + vanilla JS + plain CSS, fully offline, no CDN, self-hosted assets, `npm test` stays green (add tests for new logic), seeded RNG (`mulberry32`) for anything tied to a spin, test at 360px width on a real phone. Code reference (may be outdated): `src/roulette.js`, `src/engine.js`, `src/chain/verifiableSpin`, `src/art/beastArt.js`.

**Order of work:** 1) blank-screen bug and minigame reliability → 2) full-screen minigame framework → 3) roulette screen redesign → 4) first-run gate → 5) per-tier minigame redesign + juice → 6) Gauntlet leftovers → 7) QA matrix.

---

## 0. First-run gate (rule from the owner)

**The roulette is the starting point. A new player cannot tame a first beast or enter the dungeon until they have spun the roulette.**

- On a fresh save: Home shows one primary action, **SPIN THE ROULETTE**.
- **Gauntlet** (and Dojo, which needs a companion) are **locked** in the tab bar and on Home: padlock icon, dimmed, and tapping shows a one-line toast ("Tame your first beast to unlock") and routes to the Roulette.
- Guard routes too: if someone navigates directly to the Gauntlet or Dojo while locked, redirect to the Roulette.
- First spin is a guided tutorial (overlay hints, `SPIN` pulse). **Assumption (flag if wrong):** the first spin always lands T4/T5 on easy difficulty and the first capture is guaranteed to succeed after a short tutorial attempt, so every new player leaves with a companion.
- On first successful capture: auto-set it as the **Active Companion**, show a "YOUR FIRST COMPANION" reveal, then unlock the Gauntlet and show **ENTER THE GAUNTLET** as the next action.
- Remove any default/pre-granted companion on fresh saves (existing saves are grandfathered in). **Reset All** must bring the gate back.
- Add unit tests: fresh state → Gauntlet locked; after first capture → unlocked; reset → locked again.

---

## 1. Roulette screen

**Roast:**
- The top is three nested boxes (HUD card, a gold-bordered pity card, a reel card), all competing. The pity labels wrap ("RARE+ (T3) PITY:" breaks over two lines).
- The reel uses 2-letter pentagon sigils (RA, GO, SP) instead of real beast art, cards are cut off at the edges, and the yellow pointer line slices through the Goblin card.
- **SPIN REEL (Space)** is a dull olive color that looks disabled. A phone user sees "(Space)" for nothing.
- "Auto-Spin (stage demo)" is dev jargon with a gray native checkbox.
- The bottom ~45% of the screen is empty.
- **Pity numbers look wrong:** the UI shows Rare+ pity 15 spins and Legend pity 45 spins, but the engine (per the README) guarantees a Legendary/Epic after 6 spins without rarity ≤ 2. Make one set of constants the single source of truth for engine, UI, odds table, README, and tests.

**Do:**
- **Slim HUD (one row):** spins left, essence (x/10), credits. Move pity, STARR TRACK and odds into a collapsible **"Odds & Pity"** bottom sheet opened from an ODDS button. Show only a thin STARR progress bar under the reel.
- **Reel as the hero**, vertically centered in the viewport: large cards using **portrait art** (see §4), rarity-colored glow, a clear center notch/pointer drawn above the cards (not over their text).
- Spin feel: fast start, long ease-out, a **tick sound and haptic per card passing the pointer**, slows near the end with a short near-miss wobble, then **snaps exactly to center**. The animation must land on the result computed from the seeded/verifiable spin before the animation starts, and the winning card must be the one under the pointer. Add a test for this.
- Landing: rarity-colored burst (T1 Legendary gets screen shake, gold flash, bigger sound), then the beast is revealed large and the minigame begins (§2).
- **SPIN button:** big, always-bright gold when enabled, label `SPIN · 25 LEFT`. Only look disabled when 0 spins, and then explain how to get more. Hide "(Space)" on touch.
- **Auto-spin conflicts with minigames** (they need input). Remove it, or redefine it as "Quick spin" (shorter reel animation). Never show "(stage demo)".
- Use the empty lower half: put SPIN in the thumb zone at the bottom, and show recent pulls or a "next guaranteed" line above it.
- Make the Lucky Spin state (10 essence) obvious: reel glows, button says `LUCKY SPIN`, and the player sees the 1.6x target-zone bonus before the minigame.

---

## 2. Minigames — the core of this brief

### 2.1 Problems reported
- Work sometimes, don't start or don't finish other times.
- Open in a small area, with very little room to play.
- Beast card art is small.
- Un-dynamic, cluttered, buggy.

### 2.2 Full-screen framework (build once, all 5 minigames use it)
- **Full-screen takeover** (`100dvh`, safe-area padding). Not inside a card or modal. Hide the tab bar while playing.
- Three zones: **top HUD** (timer, lives/attempts, taming progress bar) · **play field (at least 60% of the viewport height)** · **bottom thumb zone** (controls). No paragraphs of text. Instructions are one line plus a 2-second animated demo the first time only.
- **The beast is the centerpiece:** large idle-animated portrait with a rarity aura. Not the whole trading card shrunk down; use the portrait/art window (see §4).
- One common interface so all 5 behave identically:
  - `mount(container, { beast, tier, seed, lucky, difficulty })`, `start()`, `pause()`, `destroy()`
  - emits `onProgress(0..1)` and `onComplete({ success, score, stars })`
- One state machine: `INTRO` (beast reveal ~1.2s) → `HINT` (first time only) → `COUNTDOWN` (3-2-1) → `PLAY` → `RESULT`. Illegal transitions are ignored.
- **Difficulty is data, not code:** per tier, an object with speed, target-zone size, duration, lives. T5 easiest → T1 hardest. Lucky Spin multiplies target zones by 1.6x as today.

### 2.3 Reliability checklist ("works sometimes")
Reproduce first, then fix. Likely causes to check:
- Listeners, timers, `requestAnimationFrame` loops, or audio nodes **leaking from the previous run**; state not reset between spins.
- **Double-start**: click and Space key both firing, or the Space handler from the roulette screen still active during a minigame.
- The verifiable-spin seed (block hash) arriving late or failing offline; the minigame starting with an undefined seed. It must fall back to a local seed immediately and never block.
- Stale closures after re-render; elements being re-created while the loop still holds old references.
- Canvas sized once and not on resize/orientation change; ignoring `devicePixelRatio`.
- Using `click` instead of `pointerdown` (300ms delays, missed taps); no `pointercancel` handling.
- Timing based on frame counts instead of delta time (speed differs by phone refresh rate).
- Audio context suspended until a user gesture.
- The page scrolling, zooming or pull-to-refreshing during play.

**Rules to implement:**
- One shared game loop with delta time; cancel it in `destroy()`. `destroy()` removes every listener, timer and audio node, and is called on every exit path (win, fail, back, tab switch, route change).
- Ignore re-entrant `start()`. Pause on `visibilitychange`.
- Use `pointerdown`/`pointerup`/`pointercancel` with `touch-action: none` and `overscroll-behavior: none` on the play field. Block the long-press context menu.
- Never leave the player on a stuck screen: add a watchdog (if a minigame doesn't reach `PLAY` within 3s or doesn't report completion within its max duration + margin, show a "Retry" / "Skip (counts as fail)" option and log the error).
- Wrap each minigame in an error boundary: an exception shows a friendly recovery screen, never a blank page.
- **Blank-screen bug:** a screenshot shows a fully blank dark screen with no content or loading text. Find out whether it's a stuck page transition, a failed render, or a thrown error, and make sure it can never happen (fallback UI + error boundary + transition timeout).
- Tests: each controller starts once, completes once, leaves **zero listeners/timers** after `destroy()`; same seed → same pattern; 20 consecutive start/destroy cycles don't change memory/listener counts.
- Add a hidden debug overlay (long-press on the HUD or `?debug=1`) showing state, FPS, seed, listener count.

### 2.4 Make them dynamic ("juice")
Every minigame needs all of these:
- **Progress meter** labeled TAMING that visibly fills as the player succeeds. The beast reacts: flinches on hits, struggles as progress rises, slumps near success.
- Hit feedback: PERFECT / GOOD / MISS pop-ups, hit-stop (30–60ms), particles, small screen shake on big hits, haptic tick (`navigator.vibrate`, guarded), SFX with pitch rising along the combo.
- Combo counter and multiplier that visibly escalate, with a combo-break sound.
- Danger feedback: red vignette and a heartbeat sound when one miss from failing.
- **Result:** success → capture animation (orb or seal closes, flash, the card flips into the Dex with a NEW! badge and the real art). Fail → "IT ESCAPED" with a consolation (credits/essence) and a one-tap retry rule. **Design decision to confirm:** whether a failed capture consumes the spin (as it does now) and whether it still gives credits. Keep the existing economy (duplicates give essence 6 − rarity, 10 essence → Lucky Spin).
- Short rounds: 15–25s, so spin → minigame → result stays fast.

### 2.5 Per-tier concepts (suggestions — keep what already works)
If the current five are weak, use these as a starting point. The agent should first list the existing five, then map them.

| Tier | Idea | Core input |
|---|---|---|
| T5 Common | Stop-the-marker timing bar with a moving target zone | single tap |
| T4 Uncommon | Short 3-lane rhythm tap synced to a MOB Studio BPM | 3 taps |
| T3 Rare | Follow-the-beast: keep a ring on a moving target by dragging | drag |
| T2 Epic | Dodge-and-seal: swipe to dodge projectiles while a seal charges | swipe + hold |
| T1 Legendary | 3-phase boss capture combining timing, dodge and rhythm, with a visible beast HP/taming bar per phase | mixed |

---

## 3. Beast art in these screens

- In the Gauntlet Camp companion list, the **entire beast trading card (with its tiny stat tiles) is scaled down into a small frame**, so the art is unreadable. Show only the **portrait/art window** in lists, reels, Camp and minigames. Show the full card only in the Dex inspector or reveal.
- The roulette reel uses sigils (RA/GO/SP). Use the same real-art pipeline as the Dex (pre-baked art keyed by species ID, silhouette for unknown). One art source for Dex, Roulette, Minigames, Camp, Gauntlet.
- Add an idle animation (bob/glow) wherever a beast is a centerpiece.

---

## 4. Gauntlet leftovers (from the latest screenshots)

**Good:** the minimap, the 12-chamber structure, the auto-battle switch, banked stat points, the CHA discount shown at Camp, and the camp triangle strip all work. Keep them.

**Still wrong:**
- **Emoji remain:** door, skull, crown, coin, bolt/skull cells in the minimap. Replace with pixel SVG/sprites.
- The dungeon screen is still a card with a door emoji and ~45% dead space. Make it a full-screen scene (corridor art, parallax, torch flicker, a visible hero + companion).
- **Off-by-one copy:** "CHAMBER 1 OF 12" with button "ADVANCE TO CHAMBER 1" while the minimap already marks chamber 1 as current. Show "Chamber 0/12 → Advance to chamber 1" or highlight the **next** cell, but be consistent.
- Level 5 with 4 unspent stat points is only mentioned in the log. Add a HUD badge ("+4 at Camp").
- Low HP (35/145) has no warning. Add a red pulse under 30% HP and make **auto-battle stop** (or ask) when HP is low.
- The "NAMED CAPTURE" toast is plain text. Do a short card-flip moment with the beast's art.
- **Death screen:** skull emoji + one line. Show a run summary (chambers cleared, kills, gold, XP, captures) and the killer's beast art, plus ENTER NEW RUN / RETURN.
- **Camp:** the companion carousel is still clipped on the right, "Strikes each turn" repeats on every card (show it once), the lower part of the card is empty, and the SELECT buttons are tiny. Make the stat chips (STR/DEX/…) tappable to show what each does.

---

## 5. Known bugs checklist
- Blank screen with no content
- Minigames sometimes don't start/finish; double-start; leaked listeners/timers
- Minigame play area too small; cluttered controls; keyboard hints on touch
- Beast card art tiny (whole card scaled down); sigils on the reel
- Reel: pointer overlaps card, cards clipped at the edges, result may not match the card under the pointer
- SPIN button looks disabled; "(Space)" and "(stage demo)" text
- Pity labels wrap; **pity values (15/45) disagree with the engine (6)**; verify the Dex count (46) is consistent everywhere
- Gauntlet gate not enforced (player can reach the dungeon before spinning)
- Gauntlet: chamber off-by-one copy; emoji icons; dead space; no low-HP warning
- Camp carousel clipped; repeated text on every card

---

## 6. QA & acceptance

**QA matrix (do before saying "done"):**
- Each of the 5 minigames × 20 consecutive runs, with a mix of win and fail. Zero stuck screens, zero console errors.
- Run each minigame on a 360px-wide phone and a larger phone, portrait only, and with the browser toolbar shown/hidden.
- Play fully **offline** (airplane mode) and with Wi-Fi on but no block-hash response.
- Background the tab during a minigame, then return. Game must pause and resume (or fail cleanly).
- Rapid double taps on SPIN. Must never start two spins or two minigames.
- Fresh save: Gauntlet locked → first spin → first capture → Gauntlet unlocked → Reset All → locked again.

**Acceptance criteria:**
- Every minigame opens full-screen with the beast portrait large and a play field of at least 60% of the viewport.
- All 5 minigames share one framework and one state machine, and leave no listeners/timers behind after `destroy()`.
- No blank or stuck screens. Failures show recovery UI.
- Roulette reel lands exactly on the verified result, uses real beast art, and the SPIN button is clearly active.
- Pity/odds constants come from one source and match the UI, engine, tests and README.
- A new player cannot enter the Gauntlet before their first capture.
- No emoji icons remain in the roulette, minigame, or Gauntlet screens.
- `npm test` passes with new tests for the gate, the reel result, and minigame lifecycle.
