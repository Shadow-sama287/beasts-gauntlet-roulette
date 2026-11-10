// src/minigames/games/tugStruggle.js
import { mountPhaser } from '../phaserHost.js';
import { hardness, lerp } from '../tuning.js';
import { TUNING_TABLE } from '../tuningTable.js';

const makeScene = (Phaser, outerCtx) =>
  class TugStruggle extends Phaser.Scene {
    constructor(c) {
      super('TugStruggle');
      this.ctx = c || outerCtx;
    }

    init(data) {
      const ctx = this.ctx || data?.ctx || outerCtx;
      this.ctx = ctx;
      const tier = ctx.beast.tier ?? ctx.beast.rarity ?? 5;
      const k = hardness(tier, ctx.settings?.difficulty ?? 1);
      const cfg = TUNING_TABLE.tugStruggle;

      this.p = {
        tapPower: cfg.tapPower,
        pushbackPerSec: lerp(cfg.pushbackPerSec.easy, cfg.pushbackPerSec.hard, k),
        surgeIntervalMs: lerp(cfg.surgeIntervalMs.easy, cfg.surgeIntervalMs.hard, k),
        surgeDurationMs: cfg.surgeDurationMs,
        surgeMultiplier: cfg.surgeMultiplier,
        timeLimitSec: lerp(cfg.timeLimitSec.easy, cfg.timeLimitSec.hard, k),
      };

      this.progress = 0.45; // Start near middle
      this.timeLeft = this.p.timeLimitSec;
      this.isSurging = false;
      this.isTelegraphing = false;
      this.over = false;
    }

    create() {
      const { width: W, height: H } = this.scale;

      this.add.rectangle(W / 2, H / 2, W - 16, H - 16, 0x0e0c14, 0.85).setStrokeStyle(1.5, 0x242436);

      // Warning glow banner
      this.surgeBanner = this.add.rectangle(W / 2, 40, W - 32, 28, 0xff0000, 0).setStrokeStyle(1.5, 0xff2222, 0);

      // Tug Track Bar
      const barW = W - 60;
      const barH = 26;
      this.barBg = this.add.rectangle(W / 2, H / 2 + 10, barW, barH, 0x1a1a2e).setStrokeStyle(2, 0x3d3d5c);
      this.barFill = this.add.rectangle(W / 2 - barW / 2, H / 2 + 10, 0, barH - 4, 0x3d8bff).setOrigin(0, 0.5);

      // Goal Line at 100%
      this.add.rectangle(W / 2 + barW / 2, H / 2 + 10, 4, barH + 8, 0xffd24a);

      this.hud = this.add.text(14, 12, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#ffd24a',
        fontStyle: 'bold',
      });

      this.promptText = this.add
        .text(W / 2, H / 2 + 54, 'MASH [Space] OR CLICK FAST!', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '13px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      // Inputs
      this.input.keyboard.on('keydown', (e) => {
        if (e.code === 'Space' || e.key === 'Enter') this.tap();
      });
      this.input.on('pointerdown', () => this.tap());

      // Start surge cycle
      this.scheduleSurge();
    }

    scheduleSurge() {
      if (this.over) return;
      this.time.delayedCall(this.p.surgeIntervalMs, () => {
        if (this.over) return;
        // Telegraph 500ms before
        this.isTelegraphing = true;
        this.promptText.setText('⚠️ BEAST SURGING! EASE OFF!');
        this.promptText.setColor('#ff4444');
        this.cameras.main.shake(100, 0.004);
        this.surgeBanner.setFillStyle(0xff2222, 0.35);
        this.surgeBanner.setStrokeStyle(1.5, 0xff2222, 0.8);
        this.ctx.sfx?.bad?.();

        this.time.delayedCall(500, () => {
          if (this.over) return;
          this.isTelegraphing = false;
          this.isSurging = true;
          this.cameras.main.shake(this.p.surgeDurationMs, 0.007);
          this.surgeBanner.setFillStyle(0xff0000, 0.75);

          this.time.delayedCall(this.p.surgeDurationMs, () => {
            if (this.over) return;
            this.isSurging = false;
            this.surgeBanner.setFillStyle(0xff0000, 0);
            this.surgeBanner.setStrokeStyle(1.5, 0xff2222, 0);
            this.promptText.setText('MASH [Space] OR CLICK FAST!');
            this.promptText.setColor('#ffffff');
            this.scheduleSurge();
          });
        });
      });
    }

    tap() {
      if (this.over) return;
      // If surging, taps are 30% power
      const mult = this.isSurging ? 0.3 : 1.0;
      this.progress = Math.min(1.0, this.progress + this.p.tapPower * mult);
      this.ctx.sfx?.tick?.(this.isSurging ? 160 : 340);

      if (this.progress >= 1.0) {
        this.win();
      }
    }

    update(time, delta) {
      if (this.over) return;
      const dt = delta / 1000;
      this.timeLeft -= dt;

      // Beast pushback
      const pushMult = this.isSurging ? this.p.surgeMultiplier : 1.0;
      this.progress = Math.max(0, this.progress - this.p.pushbackPerSec * pushMult * dt);

      // Render Bar
      const { width: W } = this.scale;
      const barW = W - 60;
      this.barFill.width = this.progress * barW;
      const pct = Math.round(this.progress * 100);

      if (this.isSurging) {
        this.barFill.setFillStyle(0xff4444);
      } else {
        this.barFill.setFillStyle(pct > 80 ? 0xffd24a : 0x3d8bff);
      }

      this.hud.setText(`Power: ${pct}%  |  Time: ${Math.max(0, this.timeLeft).toFixed(1)}s`);

      if (this.timeLeft <= 0) {
        this.lose('TIME EXPIRED!');
      }
    }

    win() {
      this.over = true;
      this.cameras.main.flash(160, 255, 255, 255);
      this.ctx.sfx?.good?.();
      this.hud.setText('BEAST SUBDUED!');
      const grade = this.timeLeft >= this.p.timeLimitSec * 0.4 ? 'perfect' : 'hit';
      this.time.delayedCall(450, () => this.ctx.finish({ success: true, grade, score: 100 }));
    }

    lose(reason) {
      this.over = true;
      this.cameras.main.shake(140, 0.008);
      this.ctx.sfx?.bad?.();
      this.hud.setText(reason);
      this.time.delayedCall(450, () => this.ctx.finish({ success: false, grade: 'miss', score: Math.round(this.progress * 100) }));
    }
  };

export const tugStruggle = {
  id: 'tugStruggle',
  title: 'TUG STRUGGLE',
  blurb: 'Mash to pull the beast in. Ease off when it surges!',
  controls: 'Mash Space / Click (Ease off on Surge)',
  tiers: [1, 2, 3, 4, 5],
  weights: { Brute: 3, Hunter: 1.5, Magical: 0.5 },
  mount: (ctx) => mountPhaser(ctx.mount, makeScene, ctx),
};
