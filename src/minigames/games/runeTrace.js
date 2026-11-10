// src/minigames/games/runeTrace.js
import { mountPhaser } from '../phaserHost.js';
import { hardness, lerp } from '../tuning.js';
import { TUNING_TABLE } from '../tuningTable.js';

const makeScene = (Phaser, outerCtx) =>
  class RuneTrace extends Phaser.Scene {
    constructor(c) {
      super('RuneTrace');
      this.ctx = c || outerCtx;
    }

    init(data) {
      const ctx = this.ctx || data?.ctx || outerCtx;
      this.ctx = ctx;
      const tier = ctx.beast.tier ?? ctx.beast.rarity ?? 5;
      const k = hardness(tier, ctx.settings?.difficulty ?? 1);
      const cfg = TUNING_TABLE.runeTrace;

      this.p = {
        corridorWidth: lerp(cfg.corridorWidth.easy, cfg.corridorWidth.hard, k),
        timeLimitSec: lerp(cfg.timeLimitSec.easy, cfg.timeLimitSec.hard, k),
        controlPoints: Math.round(lerp(cfg.controlPoints.easy, cfg.controlPoints.hard, k)),
      };

      this.rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
      this.stability = 100;
      this.timeLeft = this.p.timeLimitSec;
      this.isTracing = false;
      this.reachedEnd = false;
      this.over = false;
    }

    create() {
      const { width: W, height: H } = this.scale;

      this.add.rectangle(W / 2, H / 2, W - 16, H - 16, 0x0a0c16, 0.85).setStrokeStyle(1.5, 0x242438);

      // Generate smooth spline points from left to right
      const pts = [];
      pts.push(new Phaser.Math.Vector2(45, H / 2));
      const stepX = (W - 90) / (this.p.controlPoints + 1);

      for (let i = 1; i <= this.p.controlPoints; i++) {
        const px = 45 + i * stepX;
        const py = 50 + this.rng() * (H - 100);
        pts.push(new Phaser.Math.Vector2(px, py));
      }
      pts.push(new Phaser.Math.Vector2(W - 45, H / 2));

      this.curve = new Phaser.Curves.Spline(pts);
      this.curvePoints = this.curve.getPoints(120);

      // Draw corridor & line
      this.graphics = this.add.graphics();
      this.drawPath();

      // Start & End nodes
      const startPt = pts[0];
      const endPt = pts[pts.length - 1];

      this.startNode = this.add.circle(startPt.x, startPt.y, 18, 0x3ecf6e, 0.9).setStrokeStyle(3, 0xffffff);
      this.startText = this.add.text(startPt.x, startPt.y, 'START', { fontSize: '9px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);

      this.endNode = this.add.circle(endPt.x, endPt.y, 18, 0xffd24a, 0.9).setStrokeStyle(3, 0xffffff);
      this.endText = this.add.text(endPt.x, endPt.y, 'END', { fontSize: '9px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);

      this.startNode.setInteractive({ useHandCursor: true });
      this.startNode.on('pointerdown', () => {
        if (this.over) return;
        this.isTracing = true;
        this.ctx.sfx?.good?.();
      });

      this.input.on('pointerup', () => {
        if (!this.reachedEnd && !this.over) {
          this.isTracing = false;
        }
      });

      this.hud = this.add.text(14, 12, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#ffd24a',
        fontStyle: 'bold',
      });
      this.updateHud();
    }

    drawPath() {
      this.graphics.clear();
      // Draw outer corridor
      this.graphics.lineStyle(this.p.corridorWidth, 0x1d243d, 0.45);
      this.curve.draw(this.graphics);

      // Draw center spline
      this.graphics.lineStyle(4, 0x3d8bff, 0.9);
      this.curve.draw(this.graphics);
    }

    update(time, delta) {
      if (this.over) return;
      const dt = delta / 1000;
      this.timeLeft -= dt;

      const pointer = this.input.activePointer;

      if (this.isTracing) {
        // Find distance to closest point on spline
        let minDist = 9999;
        for (const pt of this.curvePoints) {
          const d = Phaser.Math.Distance.Between(pointer.x, pointer.y, pt.x, pt.y);
          if (d < minDist) minDist = d;
        }

        const halfWidth = this.p.corridorWidth / 2;
        if (minDist > halfWidth) {
          // Outside corridor - drain stability!
          this.stability = Math.max(0, this.stability - 35 * dt);
          this.cameras.main.shake(60, 0.003);
          this.ctx.sfx?.bad?.();
        }

        // Check if reached end node
        const distToEnd = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.endNode.x, this.endNode.y);
        if (distToEnd <= 22) {
          this.reachedEnd = true;
          this.endGame(true, 'RUNE SIGIL COMPLETE!');
        }
      }

      this.updateHud();

      if (this.stability <= 0) {
        this.endGame(false, 'STABILITY COLLAPSED!');
      } else if (this.timeLeft <= 0) {
        this.endGame(false, 'TIME EXPIRED!');
      }
    }

    updateHud() {
      const status = this.isTracing ? 'TRACING...' : 'PRESS & DRAG FROM START';
      this.hud.setText(
        `Stability: ${Math.round(this.stability)}%  |  Time: ${Math.max(0, this.timeLeft).toFixed(1)}s  |  ${status}`
      );
    }

    endGame(success, reason) {
      this.over = true;
      this.hud.setText(reason);

      if (success) {
        this.cameras.main.flash(140, 255, 255, 255);
        this.ctx.sfx?.good?.();
        const grade = this.stability >= 85 ? 'perfect' : this.stability >= 50 ? 'hit' : 'graze';
        this.time.delayedCall(450, () => this.ctx.finish({ success: true, grade, score: Math.round(this.stability) }));
      } else {
        this.cameras.main.shake(140, 0.008);
        this.ctx.sfx?.bad?.();
        this.time.delayedCall(450, () => this.ctx.finish({ success: false, grade: 'miss', score: Math.round(this.stability) }));
      }
    }
  };

export const runeTrace = {
  id: 'runeTrace',
  title: 'RUNE TRACE',
  blurb: 'Drag along the glowing channel without leaving the boundary.',
  controls: 'Click & drag from START to END',
  tiers: [1, 2, 3, 4, 5],
  weights: { Magical: 3, Hunter: 1.5, Brute: 0.5 },
  mount: (ctx) => mountPhaser(ctx.mount, makeScene, ctx),
};
