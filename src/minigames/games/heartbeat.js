// src/minigames/games/heartbeat.js
import { mountPhaser } from '../phaserHost.js';
import { hardness, lerp } from '../tuning.js';
import { TUNING_TABLE } from '../tuningTable.js';

const makeScene = (Phaser, outerCtx) =>
  class Heartbeat extends Phaser.Scene {
    constructor(c) {
      super('Heartbeat');
      this.ctx = c || outerCtx;
    }

    init(data) {
      const ctx = this.ctx || data?.ctx || outerCtx;
      this.ctx = ctx;
      const tier = ctx.beast.tier ?? ctx.beast.rarity ?? 5;
      const k = hardness(tier, ctx.settings?.difficulty ?? 1);
      const cfg = TUNING_TABLE.heartbeat;

      const rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
      const bpm = Math.round(cfg.minBpm + rng() * (cfg.maxBpm - cfg.minBpm));
      this.beatIntervalMs = (60 / bpm) * 1000;

      const scale = lerp(cfg.windowScale.easy, cfg.windowScale.hard, k);
      const latency = ctx.settings?.latencyMs ?? cfg.defaultLatencyMs;

      this.p = {
        bpm,
        latencyMs: latency,
        testBeats: Math.round(lerp(cfg.testBeats.easy, cfg.testBeats.hard, k)),
        perfectMs: cfg.perfectMs * scale,
        hitMs: cfg.hitMs * scale,
        grazeMs: cfg.grazeMs * scale,
      };

      this.currentBeat = 0;
      this.totalBeats = 2 + this.p.testBeats; // 2 count-in + test beats
      this.beatResults = [];
      this.beatTimes = [];
      this.hasTappedThisBeat = false;
      this.over = false;
    }

    create() {
      const { width: W, height: H } = this.scale;

      this.add.rectangle(W / 2, H / 2, W - 16, H - 16, 0x120c14, 0.85).setStrokeStyle(1.5, 0x36222e);

      // Heart/Pulse orb
      this.heart = this.add.circle(W / 2, H / 2, 38, 0xff3366, 0.9).setStrokeStyle(3, 0xffffff);

      this.hud = this.add.text(14, 12, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#ffd24a',
        fontStyle: 'bold',
      });

      this.ratingText = this.add
        .text(W / 2, H / 2 + 65, 'LISTEN TO THE RHYTHM...', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '14px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      this.updateHud();

      // Keyboard & Pointer
      this.input.keyboard.on('keydown', (e) => {
        if (e.code === 'Space' || e.key === 'Enter') this.handleTap();
      });
      this.input.on('pointerdown', () => this.handleTap());

      // Start beat loop
      this.nextBeatTime = this.time.now + 400;
      this.time.delayedCall(400, () => this.triggerNextBeat());
    }

    triggerNextBeat() {
      if (this.over) return;
      this.currentBeat++;
      const now = this.time.now;
      this.beatTimes.push(now);
      this.hasTappedThisBeat = false;

      // Pulse visual & audio
      this.heart.setScale(1.3);
      this.tweens.add({ targets: this.heart, scale: 1.0, duration: this.beatIntervalMs * 0.45, ease: 'Quad.easeOut' });

      // Expanding ripple ring
      const { width: W, height: H } = this.scale;
      const ripple = this.add.circle(W / 2, H / 2, 40).setStrokeStyle(2, 0xff6699);
      this.tweens.add({
        targets: ripple,
        radius: 110,
        alpha: 0,
        duration: this.beatIntervalMs * 0.7,
        onComplete: () => ripple.destroy(),
      });

      const isCountIn = this.currentBeat <= 2;
      this.ctx.sfx?.tick?.(isCountIn ? 240 : 360);

      if (isCountIn) {
        this.ratingText.setText(`COUNT-IN: BEAT ${this.currentBeat}/2`);
      } else {
        const testIndex = this.currentBeat - 2;
        this.ratingText.setText(`BEAT ${testIndex}/${this.p.testBeats} — TAP NOW!`);
      }

      this.updateHud();

      if (this.currentBeat < this.totalBeats) {
        this.time.delayedCall(this.beatIntervalMs, () => {
          if (!isCountIn && !this.hasTappedThisBeat && !this.over) {
            this.beatResults.push('miss');
          }
          this.triggerNextBeat();
        });
      } else {
        // Last beat
        this.time.delayedCall(this.beatIntervalMs, () => {
          if (!isCountIn && !this.hasTappedThisBeat && !this.over) {
            this.beatResults.push('miss');
          }
          this.finishGame();
        });
      }
    }

    handleTap() {
      if (this.over || this.currentBeat <= 2) return;
      if (this.hasTappedThisBeat) return;
      this.hasTappedThisBeat = true;

      const now = this.time.now - this.p.latencyMs;
      const currentBeatTime = this.beatTimes[this.beatTimes.length - 1];
      const delta = Math.abs(now - currentBeatTime);

      let grade = 'miss';
      if (delta <= this.p.perfectMs) {
        grade = 'perfect';
        this.ctx.sfx?.good?.();
        this.ratingText.setText('★ PERFECT!');
        this.ratingText.setColor('#ffd24a');
      } else if (delta <= this.p.hitMs) {
        grade = 'hit';
        this.ctx.sfx?.good?.();
        this.ratingText.setText('✓ HIT');
        this.ratingText.setColor('#3ecf6e');
      } else if (delta <= this.p.grazeMs) {
        grade = 'graze';
        this.ctx.sfx?.good?.();
        this.ratingText.setText('~ GRAZE');
        this.ratingText.setColor('#3d8bff');
      } else {
        grade = 'miss';
        this.ctx.sfx?.bad?.();
        this.ratingText.setText('✖ MISS');
        this.ratingText.setColor('#ff4444');
      }

      this.beatResults.push(grade);
    }

    updateHud() {
      this.hud.setText(`Tempo: ${this.p.bpm} BPM  |  Beat: ${Math.max(0, this.currentBeat - 2)}/${this.p.testBeats}`);
    }

    finishGame() {
      this.over = true;
      const hits = this.beatResults.filter((r) => r === 'perfect' || r === 'hit').length;
      const grazes = this.beatResults.filter((r) => r === 'graze').length;
      const effectiveScore = hits + grazes * 0.5;
      const success = effectiveScore >= this.p.testBeats * 0.6;

      let grade = 'miss';
      if (success) {
        grade = hits === this.p.testBeats ? 'perfect' : hits >= this.p.testBeats * 0.75 ? 'hit' : 'graze';
        this.cameras.main.flash(140, 255, 255, 255);
        this.ctx.sfx?.good?.();
      } else {
        this.cameras.main.shake(140, 0.008);
        this.ctx.sfx?.bad?.();
      }

      this.time.delayedCall(500, () => this.ctx.finish({ success, grade, score: Math.round(effectiveScore) }));
    }
  };

export const heartbeat = {
  id: 'heartbeat',
  title: 'HEARTBEAT',
  blurb: 'Tap with the pulsing rhythm of the wild beast.',
  controls: 'Tap Space / Click on the beat',
  tiers: [1, 2, 3, 4, 5],
  weights: { Magical: 2, Hunter: 1.5, Brute: 0.8 },
  mount: (ctx) => mountPhaser(ctx.mount, makeScene, ctx),
};
