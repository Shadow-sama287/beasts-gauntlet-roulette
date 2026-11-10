// src/minigames/runner.js

import { classicTimingBar } from './games/classics.js';

/**
 * Runs a minigame with the specified context.
 * Guarantees handle.destroy() is called exactly once when finished.
 * @param {import('./types.js').MiniGame} game
 * @param {import('./types.js').MiniGameCtx} ctx
 * @returns {Promise<import('./types.js').TameResult>}
 */
export function runMiniGame(game, ctx) {
  return new Promise((resolve) => {
    let handle = null;
    let done = false;
    let pending = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      if (handle && typeof handle.destroy === 'function') {
        try {
          handle.destroy();
        } catch (e) {
          console.warn('Error destroying minigame handle:', e);
        }
      } else {
        pending = true;
      }
      resolve(result);
    };

    Promise.resolve()
      .then(() => game.mount({ ...ctx, finish }))
      .then((h) => {
        handle = h;
        if (pending && handle && typeof handle.destroy === 'function') {
          try {
            handle.destroy();
          } catch (e) {}
        }
      })
      .catch((err) => {
        console.error(`Minigame ${game.id} mount failed:`, err);
        // Fallback to classic timing bar if any minigame fails!
        try {
          classicTimingBar.mount({ ...ctx, finish });
        } catch (fallbackErr) {
          console.error('Fallback minigame also failed:', fallbackErr);
          finish({ success: true, grade: 'hit', score: 5 });
        }
      });
  });
}
