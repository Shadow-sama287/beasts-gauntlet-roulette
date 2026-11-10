// src/ui/errorBoundary.js — Friendly arcade recovery boundary
// Prevents blank screen on render or execution exceptions.

/**
 * Renders an arcade-themed error recovery screen in container.
 * @param {HTMLElement} container
 * @param {Error|string} error
 * @param {{ onRetry?: function, onReset?: function }} options
 */
export function renderErrorRecovery(container, error, options = {}) {
  const errMessage = error?.message || String(error) || 'An unexpected error occurred';
  console.error('[Error Boundary Triggered]:', error);

  container.innerHTML = `
    <div class="screen error-boundary-screen" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:85vh; padding:20px; text-align:center;">
      <div class="arcade-card" style="max-width:440px; width:100%; border:2px solid var(--bad); background:#150c18; padding:24px; border-radius:12px; box-shadow:0 0 30px rgba(255, 68, 68, 0.25);">
        <div style="margin-bottom:12px;">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--bad)">
            <path d="M12 2L1 21h22L12 2zm0 4.5l8.5 13.5H3.5L12 6.5zm-1 6v3h2v-3h-2zm0 4v2h2v-2h-2z"/>
          </svg>
        </div>
        <h2 class="arcade-title" style="color:var(--bad); font-size:1.4rem; margin-bottom:8px;">
          ARCADE RECOVERY
        </h2>
        <p style="font-size:0.85rem; color:var(--muted); line-height:1.4; margin-bottom:14px;">
          Something went wrong while rendering this stage. Don't worry, your collection is safe.
        </p>

        <div style="background:#0a050d; border:1px solid #331525; padding:10px; border-radius:6px; font-size:0.75rem; color:#ff9999; font-family:var(--font-mono, monospace); word-break:break-word; text-align:left; margin-bottom:18px; max-height:120px; overflow-y:auto;">
          ${errMessage}
        </div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          <button id="btn-err-retry" class="btn-primary" style="height:48px; font-size:1rem; width:100%;">
            Retry Stage
          </button>
          <button id="btn-err-home" class="btn-ghost" style="height:44px; border:1px solid var(--line); width:100%;">
            Return to Title Screen
          </button>
          <button id="btn-err-clear" class="btn-ghost" style="font-size:0.72rem; color:var(--muted); margin-top:4px;">
            Clear Corrupted Cache & Restart
          </button>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-err-retry').onclick = () => {
    if (options.onRetry) options.onRetry();
    else window.location.reload();
  };

  container.querySelector('#btn-err-home').onclick = () => {
    if (options.onReset) options.onReset();
    else window.location.href = window.location.pathname;
  };

  container.querySelector('#btn-err-clear').onclick = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };
}
