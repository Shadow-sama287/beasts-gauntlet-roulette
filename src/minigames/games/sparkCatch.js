// src/minigames/games/sparkCatch.js
import { mountPhaser } from '../phaserHost.js';
import { hardness, lerp } from '../tuning.js';
import { TUNING_TABLE } from '../tuningTable.js';

const makeScene = (Phaser, outerCtx) =>
  class SparkCatch extends Phaser.Scene {
    constructor(c) {
      super('SparkCatch');
      this.ctx = c || outerCtx;
    }

    init(data) {
      const ctx = this.ctx || data?.ctx || outerCtx;
      this.ctx = ctx;
      const tier = ctx.beast.tier ?? ctx.beast.rarity ?? 5;
      const k = hardness(tier, ctx.settings?.difficulty ?? 1);
      const cfg = TUNING_TABLE.sparkCatch;

      this.p = {
        durationSec: cfg.durationSec,
        spawnIntervalMs: lerp(cfg.spawnIntervalMs.easy, cfg.spawnIntervalMs.hard, k),
        lifetimeMs: lerp(cfg.lifetimeMs.easy, cfg.lifetimeMs.hard, k),
        decoyRatio: lerp(cfg.decoyRatio.easy, cfg.decoyRatio.hard, k),
        catchesNeeded: Math.round(lerp(cfg.catchesNeeded.easy, cfg.catchesNeeded.hard, k)),
        mistakesAllowed: cfg.mistakesAllowed,
      };

      this.rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
      this.catches = 0;
      this.mistakes = 0;
      this.timeLeft = this.p.durationSec;
      this.over = false;
      this.activeSparks = [];
    }

    create() {
      const { width: W, height: H } = this.scale;

      this.add.rectangle(W / 2, H / 2, W - 16, H - 16, 0x0c0f18, 0.85).setStrokeStyle(1.5, 0x223048);

      this.hud = this.add.text(14, 12, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#ffd24a',
        fontStyle: 'bold',
      });
      this.updateHud();

      this.spawnTimer = this.time.addEvent({
        delay: this.p.spawnIntervalMs,
        callback: () => this.spawnSpark(),
        loop: true,
      });

      // Keyboard space support
      this.input.keyboard.on('keydown', (e) => {
        if (e.code === 'Space' || e.key === 'Enter') {
          const goodSpark = this.activeSparks.find((s) => s.alive && !s.isDecoy);
          if (goodSpark) this.handleCatch(goodSpark);
        }
      });

      // Spawn initial batch
      this.spawnSpark();
      this.spawnSpark();
    }

    spawnSpark() {
      if (this.over) return;
      const { width: W, height: H } = this.scale;
      const pad = 42;
      const x = pad + this.rng() * (W - pad * 2);
      const y = pad + 16 + this.rng() * (H - pad * 2);

      const isDecoy = this.rng() < this.p.decoyRatio;
      const color = isDecoy ? 0x2a1638 : 0xffd24a;
      const strokeColor = isDecoy ? 0x8822bb : 0xffffff;

      const circle = this.add.circle(x, y, 22, color, 0.9).setStrokeStyle(2.5, strokeColor);
      circle.setInteractive({ useHandCursor: true });

      if (isDecoy) {
        this.add.text(x, y, '✖', { fontSize: '14px', color: '#ff4444' }).setOrigin(0.5);
      } else {
        this.add.circle(x, y, 10, 0xffffff, 0.8);
      }

      const sparkObj = { circle, isDecoy, alive: true };
      this.activeSparks.push(sparkObj);

      circle.on('pointerdown', () => this.handleCatch(sparkObj));

      // Lifetime fade & shrink
      this.tweens.add({
        targets: circle,
        scale: 0.1,
        duration: this.p.lifetimeMs,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (sparkObj.alive) {
            sparkObj.alive = false;
            circle.destroy();
          }
        },
      });
    }

    handleCatch(spark) {
      if (this.over || !spark.alive) return;
      spark.alive = false;
      spark.circle.destroy();

      if (spark.isDecoy) {
        this.mistakes++;
        this.cameras.main.shake(120, 0.007);
        this.ctx.sfx?.bad?.();
        this.updateHud();

        if (this.mistakes > this.p.mistakesAllowed) {
          this.endGame(false, 'TOO MANY DECOY SPARKS TOUCHED!');
        }
      } else {
        this.catches++;
        this.ctx.sfx?.good?.();
        this.updateHud();

        if (this.catches >= this.p.catchesNeeded) {
          this.endGame(true, 'ALL SPARKS HARVESTED!');
        }
      }
    }

    update(time, delta) {
      if (this.over) return;
      this.timeLeft -= delta / 1000;
      this.updateHud();

      if (this.timeLeft <= 0) {
        if (this.catches >= this.p.catchesNeeded) {
          this.endGame(true, 'SPARKS CAPTURED!');
        } else {
          this.endGame(false, 'TIME RAN OUT!');
        }
      }
    }

    updateHud() {
      this.hud.setText(
        `Sparks: ${this.catches}/${this.p.catchesNeeded}  |  Mistakes: ${this.mistakes}/${this.p.mistakesAllowed}  |  Time: ${Math.max(0, this.timeLeft).toFixed(1)}s`
      );
    }

    endGame(success, reason) {
      this.over = true;
      if (this.spawnTimer) this.spawnTimer.remove();
      this.hud.setText(reason);

      if (success) {
        this.cameras.main.flash(140, 255, 255, 255);
        this.ctx.sfx?.good?.();
        const grade = this.mistakes === 0 ? 'perfect' : this.mistakes === 1 ? 'hit' : 'graze';
        this.time.delayedCall(450, () => this.ctx.finish({ success: true, grade, score: this.catches }));
      } else {
        this.cameras.main.shake(140, 0.008);
        this.ctx.sfx?.bad?.();
        this.time.delayedCall(450, () => this.ctx.finish({ success: false, grade: 'miss', score: this.catches }));
      }
    }
  };

export const sparkCatch = {
  id: 'sparkCatch',
  title: 'SPARK CATCH',
  blurb: 'Click the radiant sparks before they fade. Avoid dark decoys!',
  controls: 'Click / tap radiant sparks',
  tiers: [1, 2, 3, 4, 5],
  weights: { Hunter: 2.5, Magical: 2, Brute: 1 },
  mount: (ctx) => mountPhaser(ctx.mount, makeScene, ctx),
};
