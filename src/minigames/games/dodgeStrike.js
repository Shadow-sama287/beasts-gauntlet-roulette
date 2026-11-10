// src/minigames/games/dodgeStrike.js
import { mountPhaser } from '../phaserHost.js';
import { hardness, lerp } from '../tuning.js';
import { TUNING_TABLE } from '../tuningTable.js';

const makeScene = (Phaser, outerCtx) =>
  class DodgeStrike extends Phaser.Scene {
    constructor(c) {
      super('DodgeStrike');
      this.ctx = c || outerCtx;
    }

    init(data) {
      const ctx = this.ctx || data?.ctx || outerCtx;
      this.ctx = ctx;
      const tier = ctx.beast.tier ?? ctx.beast.rarity ?? 5;
      const k = hardness(tier, ctx.settings?.difficulty ?? 1);
      const cfg = TUNING_TABLE.dodgeStrike;

      this.p = {
        slams: Math.round(lerp(cfg.slams.easy, cfg.slams.hard, k)),
        telegraphMs: lerp(cfg.telegraphMs.easy, cfg.telegraphMs.hard, k),
        intervalMs: lerp(cfg.intervalMs.easy, cfg.intervalMs.hard, k),
        hitsAllowed: cfg.hitsAllowed[tier] ?? 2,
        strikeWindowMs: lerp(cfg.strikeWindowMs.easy, cfg.strikeWindowMs.hard, k),
      };

      this.rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
      this.currentLane = 1; // 0: Left, 1: Center, 2: Right
      this.slamsCompleted = 0;
      this.damageTaken = 0;
      this.phase = 'dodge'; // 'dodge' | 'stagger' | 'over'
      this.laneX = [120, 240, 360];
    }

    create() {
      const { width: W, height: H } = this.scale;
      this.laneX = [W * 0.22, W * 0.5, W * 0.78];
      const laneW = W * 0.26;

      // Arena background & 3 lane pillars
      this.add.rectangle(W / 2, H / 2, W - 16, H - 16, 0x0a0a14, 0.85).setStrokeStyle(1.5, 0x242436);
      this.laneRects = this.laneX.map((lx, i) => {
        const r = this.add.rectangle(lx, H / 2, laneW, H - 24, 0x141422, 0.4).setStrokeStyle(1, 0x2a2a3e);
        r.setInteractive({ useHandCursor: true });
        r.on('pointerdown', () => this.setLane(i));
        return r;
      });

      // Player avatar
      this.playerY = H - 36;
      this.player = this.add.circle(this.laneX[this.currentLane], this.playerY, 14, 0x3d8bff).setStrokeStyle(2, 0xffffff);

      // HUD
      this.hud = this.add.text(14, 10, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#ffd24a',
        fontStyle: 'bold',
      });
      this.updateHud();

      // Controls: Left / Right arrows or A / D
      this.input.keyboard.on('keydown', (e) => {
        const k = e.key.toUpperCase();
        if (this.phase === 'dodge') {
          if ((k === 'ARROWLEFT' || k === 'A') && this.currentLane > 0) this.setLane(this.currentLane - 1);
          else if ((k === 'ARROWRIGHT' || k === 'D') && this.currentLane < 2) this.setLane(this.currentLane + 1);
        } else if (this.phase === 'stagger') {
          if (e.code === 'Space' || k === 'ENTER') this.executeStrike();
        }
      });

      // Pointer click to strike in stagger phase
      this.input.on('pointerdown', () => {
        if (this.phase === 'stagger') this.executeStrike();
      });

      // Schedule first slam
      this.time.delayedCall(600, () => this.triggerSlam());
    }

    setLane(lane) {
      if (this.phase !== 'dodge') return;
      this.currentLane = Math.max(0, Math.min(2, lane));
      this.player.x = this.laneX[this.currentLane];
      this.ctx.sfx?.tick?.(280 + this.currentLane * 60);
    }

    triggerSlam() {
      if (this.phase !== 'dodge') return;
      const targetLane = Math.floor(this.rng() * 3);
      const laneRect = this.laneRects[targetLane];
      const { height: H } = this.scale;

      // Telegraph warning
      laneRect.setFillStyle(0xff2222, 0.5);
      this.ctx.sfx?.bad?.();

      this.time.delayedCall(this.p.telegraphMs, () => {
        if (this.phase !== 'dodge') return;
        // Slam impact!
        this.cameras.main.shake(120, 0.008);
        laneRect.setFillStyle(0xff0000, 0.85);

        // Check if player in lane
        if (this.currentLane === targetLane) {
          this.damageTaken++;
          this.cameras.main.flash(90, 255, 60, 60);
          this.ctx.sfx?.bad?.();
          this.updateHud();

          if (this.damageTaken > this.p.hitsAllowed) {
            this.phase = 'over';
            this.hud.setText('OVERWHELMED BY SLAMS!');
            this.time.delayedCall(500, () => this.ctx.finish({ success: false, grade: 'miss', score: this.slamsCompleted }));
            return;
          }
        } else {
          this.ctx.sfx?.good?.();
        }

        this.time.delayedCall(160, () => {
          laneRect.setFillStyle(0x141422, 0.4);
          this.slamsCompleted++;
          this.updateHud();

          if (this.slamsCompleted >= this.p.slams) {
            this.openStaggerWindow();
          } else {
            this.time.delayedCall(this.p.intervalMs - this.p.telegraphMs, () => this.triggerSlam());
          }
        });
      });
    }

    openStaggerWindow() {
      this.phase = 'stagger';
      const { width: W, height: H } = this.scale;

      this.hud.setText('⚡ BEAST STAGGERED! STRIKE NOW! [Space / Click]');
      this.cameras.main.flash(120, 255, 210, 74);

      // Gold strike target in center
      this.strikeTarget = this.add.circle(W / 2, H / 2, 42, 0xffd24a, 0.8).setStrokeStyle(4, 0xffffff);
      this.tweens.add({
        targets: this.strikeTarget,
        scale: 1.25,
        yoyo: true,
        repeat: -1,
        duration: 200,
      });

      this.staggerTimer = this.time.delayedCall(this.p.strikeWindowMs, () => {
        if (this.phase === 'stagger') {
          this.phase = 'over';
          this.hud.setText('STAGGER WINDOW EXPIRED!');
          this.ctx.sfx?.bad?.();
          this.time.delayedCall(450, () => this.ctx.finish({ success: false, grade: 'miss', score: this.slamsCompleted }));
        }
      });
    }

    executeStrike() {
      if (this.phase !== 'stagger') return;
      this.phase = 'over';
      if (this.staggerTimer) this.staggerTimer.remove();

      this.cameras.main.flash(160, 255, 255, 255);
      this.ctx.sfx?.good?.();

      let grade = 'hit';
      if (this.damageTaken === 0) grade = 'perfect';
      else if (this.damageTaken === this.p.hitsAllowed) grade = 'graze';

      this.hud.setText('FINISHING STRIKE LANDED!');
      this.time.delayedCall(500, () => this.ctx.finish({ success: true, grade, score: this.slamsCompleted + 2 }));
    }

    updateHud() {
      const hpLeft = Math.max(0, this.p.hitsAllowed + 1 - this.damageTaken);
      this.hud.setText(`Slams: ${this.slamsCompleted}/${this.p.slams}  |  Guard: ${hpLeft}/${this.p.hitsAllowed + 1}`);
    }
  };

export const dodgeStrike = {
  id: 'dodgeStrike',
  title: 'DODGE & STRIKE',
  blurb: 'Dodge the lane slams, then strike the beast when staggered.',
  controls: 'A/D or Arrows to dodge, Space/Click to strike',
  tiers: [1, 2, 3, 4, 5],
  weights: { Brute: 3, Hunter: 1, Magical: 0.5 },
  mount: (ctx) => mountPhaser(ctx.mount, makeScene, ctx),
};
