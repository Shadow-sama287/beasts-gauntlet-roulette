// src/minigames/games/runeEcho.js
import { mountPhaser } from '../phaserHost.js';
import { hardness, lerp } from '../tuning.js';
import { TUNING_TABLE } from '../tuningTable.js';

export function makeSequence(rng, len, symbols = 4) {
  const seq = [];
  const r = typeof rng === 'function' ? rng : Math.random;
  for (let i = 0; i < len; i++) {
    let s;
    do {
      s = Math.floor(r() * symbols);
    } while (i > 0 && s === seq[i - 1] && r() < 0.7);
    seq.push(s);
  }
  return seq;
}

const RUNE_DEFS = [
  { id: 0, label: '▲', key: 'UP', altKey: 'W', color: 0x3d8bff, name: 'North' },
  { id: 1, label: '▶', key: 'RIGHT', altKey: 'D', color: 0xffd24a, name: 'East' },
  { id: 2, label: '▼', key: 'DOWN', altKey: 'S', color: 0xa45cff, name: 'South' },
  { id: 3, label: '◀', key: 'LEFT', altKey: 'A', color: 0x3ecf6e, name: 'West' },
];

const makeScene = (Phaser, outerCtx) =>
  class RuneEcho extends Phaser.Scene {
    constructor(c) {
      super('RuneEcho');
      this.ctx = c || outerCtx;
    }

    init(data) {
      const ctx = this.ctx || data?.ctx || outerCtx;
      this.ctx = ctx;
      const tier = ctx.beast.tier ?? ctx.beast.rarity ?? 5;
      const k = hardness(tier, ctx.settings?.difficulty ?? 1);
      const cfg = TUNING_TABLE.runeEcho;
      this.p = {
        len: Math.round(lerp(cfg.seqLength.easy, cfg.seqLength.hard, k)),
        flashMs: lerp(cfg.flashMs.easy, cfg.flashMs.hard, k),
        mistakesAllowed: k < 0.6 ? cfg.mistakesAllowed.easy : cfg.mistakesAllowed.hard,
      };

      const rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
      this.seq = makeSequence(rng, this.p.len, 4);
      this.playerStep = 0;
      this.mistakes = 0;
      this.state = 'showing'; // 'showing' | 'input' | 'done'
      this.buttons = [];
    }

    create() {
      const { width: W, height: H } = this.scale;
      const cx = W / 2;
      const cy = H / 2;
      const dist = 65;

      this.add.rectangle(cx, cy, W - 16, H - 16, 0x0c0c16, 0.8).setStrokeStyle(1.5, 0x2a2a3e);

      this.hud = this.add.text(14, 12, 'WATCH THE ECHO...', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: '#ffd24a',
        fontStyle: 'bold',
      });

      const positions = [
        { x: cx, y: cy - dist }, // Up
        { x: cx + dist * 1.3, y: cy }, // Right
        { x: cx, y: cy + dist }, // Down
        { x: cx - dist * 1.3, y: cy }, // Left
      ];

      RUNE_DEFS.forEach((def, i) => {
        const pos = positions[i];
        const circle = this.add.circle(pos.x, pos.y, 28, 0x181828).setStrokeStyle(2, def.color);
        circle.setInteractive({ useHandCursor: true });

        const txt = this.add
          .text(pos.x, pos.y, def.label, {
            fontFamily: 'ui-monospace, monospace',
            fontSize: '20px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5);

        circle.on('pointerdown', () => this.handlePlayerInput(i));
        this.buttons.push({ def, circle, txt });
      });

      // Keyboard listeners
      this.input.keyboard.on('keydown', (e) => {
        if (this.state !== 'input') return;
        const k = e.key.toUpperCase();
        if (k === 'ARROWUP' || k === 'W') this.handlePlayerInput(0);
        else if (k === 'ARROWRIGHT' || k === 'D') this.handlePlayerInput(1);
        else if (k === 'ARROWDOWN' || k === 'S') this.handlePlayerInput(2);
        else if (k === 'ARROWLEFT' || k === 'A') this.handlePlayerInput(3);
      });

      // Playback sequence after short delay
      this.time.delayedCall(400, () => this.playSequence(0));
    }

    playSequence(idx) {
      if (idx >= this.seq.length) {
        this.state = 'input';
        this.hud.setText(`YOUR TURN! REPEAT [${this.seq.length}] (Arrows / WASD / Click)`);
        return;
      }

      const runeIdx = this.seq[idx];
      this.flashRune(runeIdx, this.p.flashMs * 0.75, () => {
        this.time.delayedCall(this.p.flashMs * 0.25, () => this.playSequence(idx + 1));
      });
    }

    flashRune(idx, duration, callback) {
      const btn = this.buttons[idx];
      if (!btn) return;

      btn.circle.setFillStyle(btn.def.color, 0.9);
      btn.circle.setScale(1.15);
      this.ctx.sfx?.tick?.(200 + idx * 80);

      this.tweens.add({
        targets: btn.circle,
        scale: 1.0,
        duration: duration,
        onComplete: () => {
          btn.circle.setFillStyle(0x181828);
          if (callback) callback();
        },
      });
    }

    handlePlayerInput(idx) {
      if (this.state !== 'input') return;

      const expected = this.seq[this.playerStep];
      const btn = this.buttons[idx];

      if (idx === expected) {
        this.flashRune(idx, 160);
        this.playerStep++;
        this.ctx.sfx?.good?.();
        this.hud.setText(`CORRECT! ${this.playerStep}/${this.seq.length}`);

        if (this.playerStep >= this.seq.length) {
          this.state = 'done';
          const grade = this.mistakes === 0 ? 'perfect' : 'hit';
          this.cameras.main.flash(120, 255, 255, 255);
          this.time.delayedCall(450, () => this.ctx.finish({ success: true, grade, score: this.seq.length }));
        }
      } else {
        this.mistakes++;
        this.ctx.sfx?.bad?.();
        this.cameras.main.shake(120, 0.006);

        if (this.mistakes > this.p.mistakesAllowed) {
          this.state = 'done';
          this.hud.setText('ECHO SHATTERED!');
          this.time.delayedCall(500, () => this.ctx.finish({ success: false, grade: 'miss', score: this.playerStep }));
        } else {
          this.hud.setText(`MISTAKE! 1 GRACE REMAINING. TRY AGAIN!`);
        }
      }
    }
  };

export const runeEcho = {
  id: 'runeEcho',
  title: 'RUNE ECHO',
  blurb: 'Memorize the arcane glyph sequence and repeat it.',
  controls: 'Arrow keys / WASD or click runes',
  tiers: [1, 2, 3, 4, 5],
  weights: { Magical: 3, Hunter: 1, Brute: 0.5 },
  mount: (ctx) => mountPhaser(ctx.mount, makeScene, ctx),
};
