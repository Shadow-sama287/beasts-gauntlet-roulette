// src/minigames/phaserHost.js
// Lazy loads Phaser 3 on demand to keep initial page bundle ultra-light.

let phaserPromise = null;

export function loadPhaser() {
  return (phaserPromise ??= import('phaser').then((m) => m.default ?? m));
}

/**
 * Mounts a Phaser scene into a DOM container and returns a handle with a destroy() method.
 * @param {HTMLElement} container
 * @param {(Phaser: any) => any} makeScene
 * @param {import('./types.js').MiniGameCtx} ctx
 * @param {{ w: number, h: number }} size
 * @returns {Promise<{ destroy: () => void }>}
 */
export async function mountPhaser(container, makeScene, ctx, size = { w: 480, h: 260 }) {
  const Phaser = await loadPhaser();
  const SceneClass = makeScene(Phaser, ctx);

  let game = null;
  const sceneInstance = new SceneClass(ctx);
  sceneInstance.ctx = ctx;

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: size.w,
    height: size.h,
    transparent: true,
    audio: { noAudio: true }, // Procedural Web Audio in audio.js
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [sceneInstance],
  });

  return {
    destroy: () => {
      try {
        if (game) game.destroy(true);
      } catch (err) {
        console.warn('Phaser destroy exception:', err);
      }
      if (container) {
        const canvases = container.querySelectorAll('canvas');
        canvases.forEach((c) => c.remove());
      }
    },
  };
}
