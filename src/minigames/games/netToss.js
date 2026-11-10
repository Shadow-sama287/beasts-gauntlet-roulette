// src/minigames/games/netToss.js
import { mountPhaser } from '../phaserHost.js';
import { hardness, lerp } from '../tuning.js';
import { TUNING_TABLE } from '../tuningTable.js';

const makeScene = (Phaser, outerCtx) =>
  class NetToss extends Phaser.Scene {
    constructor(c) {
      super('NetToss');
      this.ctx = c || outerCtx;
    }

    init(data) {
      const ctx = this.ctx || data?.ctx || outerCtx;
      this.ctx = ctx;
      const tier = ctx.beast.tier ?? ctx.beast.rarity ?? 5;
      const k = hardness(tier, ctx.settings?.difficulty ?? 1);
      const cfg = TUNING_TABLE.netToss;
      this.p = {
        throws: Math.round(lerp(cfg.throws.easy, cfg.throws.hard, k)),
        needHits: k < 0.5 ? cfg.needHits.easy : cfg.needHits.hard,
        speed: lerp(cfg.speed.easy, cfg.speed.hard, k),
        netR: lerp(cfg.netR.easy, cfg.netR.hard, k),
        flightMs: lerp(cfg.flightMs.easy, cfg.flightMs.hard, k),
      };
      this.thrown = 0;
      this.hits = 0;
      this.over = false;
      const rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
      this.phase = [0, 1, 2, 3].map(() => rng() * Math.PI * 2);
    }

    create() {
      const { width: W, height: H } = this.scale;
      // Background arena grid
      this.add.rectangle(W / 2, H / 2, W - 16, H - 16, 0x0f0f18, 0.8).setStrokeStyle(1.5, 0x2a2a3e);

      // Target beast orb
      const tierColor = this.ctx.beast.rarity === 1 ? 0xff8a1f : this.ctx.beast.rarity === 2 ? 0xa45cff : 0x3d8bff;
      this.target = this.add.circle(W / 2, H / 2, 18, tierColor).setStrokeStyle(3, 0xffffff).setDepth(2);
      this.targetGlow = this.add.circle(W / 2, H / 2, 28, tierColor, 0.3).setDepth(1);

      this.hud = this.add.text(14, 12, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: '#ffd24a',
        fontStyle: 'bold',
      });

      this.input.on('pointerdown', (p) => this.throwNet(p.x, p.y));
      this.input.keyboard.on('keydown', (e) => {
        if (e.code === 'Space' || e.key === 'Enter') {
          if (this.target) this.throwNet(this.target.x, this.target.y);
        }
      });
      this.updateHud();
    }

    update(time) {
      if (this.over) return;
      const t = (time / 1000) * this.p.speed;
      const { width: W, height: H } = this.scale;

      this.target.x = W / 2 + Math.sin(t * 0.9 + this.phase[0]) * W * 0.36 + Math.sin(t * 1.7 + this.phase[1]) * W * 0.08;
      this.target.y = H / 2 + Math.sin(t * 1.1 + this.phase[2]) * H * 0.30 + Math.sin(t * 2.3 + this.phase[3]) * H * 0.06;

      if (this.targetGlow) {
        this.targetGlow.x = this.target.x;
        this.targetGlow.y = this.target.y;
      }
    }

    throwNet(x, y) {
      if (this.over || this.thrown >= this.p.throws) return;
      this.thrown++;
      this.updateHud();

      const ring = this.add.circle(x, y, this.p.netR * 1.8).setStrokeStyle(3, 0xffd24a).setFillStyle();
      this.tweens.add({ targets: ring, radius: this.p.netR, duration: this.p.flightMs, ease: 'Quad.easeIn' });

      this.time.delayedCall(this.p.flightMs, () => {
        const d = Phaser.Math.Distance.Between(x, y, this.target.x, this.target.y);
        const hit = d <= this.p.netR;
        const graze = !hit && d <= this.p.netR * 1.25;

        if (hit) {
          this.hits++;
          this.ctx.sfx?.good?.();
          this.cameras.main.flash(80, 255, 255, 255);
        } else if (graze) {
          this.hits += 1;
          this.ctx.sfx?.good?.();
        } else {
          this.ctx.sfx?.bad?.();
          this.cameras.main.shake(90, 0.005);
        }

        ring.destroy();
        this.updateHud();
        this.check(d, hit, graze);
      });
    }

    check(d, hit, graze) {
      const done = this.hits >= this.p.needHits;
      const out = this.thrown >= this.p.throws;
      if (!done && !out) return;
      this.over = true;
      const success = done;
      let grade = 'miss';
      if (success) {
        grade = d <= this.p.netR * 0.35 ? 'perfect' : graze ? 'graze' : 'hit';
      }
      this.time.delayedCall(450, () => this.ctx.finish({ success, grade, score: Math.round(this.hits) }));
    }

    updateHud() {
      this.hud.setText(`Nets: ${this.p.throws - this.thrown}  |  Hits: ${Math.floor(this.hits)}/${this.p.needHits}`);
    }
  };

export const netToss = {
  id: 'netToss',
  title: 'NET TOSS',
  blurb: 'Lead your throw. The net lands a moment after you click.',
  controls: 'Click / tap to throw',
  tiers: [1, 2, 3, 4, 5],
  weights: { Hunter: 3, Magical: 1, Brute: 0.7 },
  mount: (ctx) => mountPhaser(ctx.mount, makeScene, ctx),
};
