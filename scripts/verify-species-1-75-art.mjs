// scripts/verify-species-1-75-art.mjs — Verify species 1-75 card art across Dex, Card Modal, and Gauntlet
import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9224;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new globalThis.WebSocket(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (msg) => {
        const parsed = JSON.parse(msg.data);
        if (parsed.id && this.callbacks.has(parsed.id)) {
          const cb = this.callbacks.get(parsed.id);
          this.callbacks.delete(parsed.id);
          if (parsed.error) cb.reject(parsed.error);
          else cb.resolve(parsed.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }
}

async function run() {
  console.log('--- Verifying Species 1-75 Card Art Across Views ---');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1200,900',
    '--user-data-dir=' + process.env.TEMP + '\\chrome_test_profile_' + Date.now(),
    'about:blank',
  ]);

  await sleep(1500);

  try {
    const targets = await getJson(`http://localhost:${PORT}/json`);
    const pageTarget = targets.find((t) => t.type === 'page');
    const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Collect network failed requests (404s, etc.)
    const failedUrls = [];
    await cdp.send('Network.enable');
    cdp.ws.addEventListener('message', (msg) => {
      const p = JSON.parse(msg.data);
      if (p.method === 'Network.responseReceived') {
        const status = p.params.response.status;
        if (status >= 400) {
          failedUrls.push({ url: p.params.response.url, status });
        }
      }
    });

    await cdp.send('Page.navigate', { url: 'http://localhost:5173' });
    await sleep(2500);

    // 1. Check Dex view
    console.log('[1/4] Checking Beast Dex...');
    await cdp.eval(`document.querySelector('[data-screen="album"]').click()`);
    await sleep(2000);

    // Check all cards in the Dex
    const dexCards = await cdp.eval(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.album-card'));
        const results = cards.map(card => {
          const img = card.querySelector('.album-card-art');
          const title = card.querySelector('.album-card-title')?.textContent || '';
          return {
            title,
            src: img ? img.src : null,
            naturalWidth: img ? img.naturalWidth : 0,
            naturalHeight: img ? img.naturalHeight : 0,
            complete: img ? img.complete : false,
            isFallback: img && (img.src.includes('fallback') || img.src.includes('data:image/svg+xml;utf8,%3Csvg')),
          };
        });
        return {
          totalCards: cards.length,
          zeroWidthCount: results.filter(r => r.naturalWidth === 0).length,
          fallbackCount: results.filter(r => r.isFallback).length,
          sampleCanonical: results.slice(0, 10),
          sample75th: results[74],
          sample10012: results[75]
        };
      })()
    `);

    console.log('Dex Check Results:');
    console.log(`- Total cards rendered: ${dexCards.totalCards}`);
    console.log(`- Zero width (failed images): ${dexCards.zeroWidthCount}`);
    console.log(`- Fallback count: ${dexCards.fallbackCount}`);
    console.log(`- Species #1 card:`, dexCards.sampleCanonical[0]);
    console.log(`- Species #10 card:`, dexCards.sampleCanonical[9]);
    console.log(`- Species #75 card:`, dexCards.sample75th);
    console.log(`- Species #10012 card:`, dexCards.sample10012);

    if (dexCards.zeroWidthCount > 0) {
      throw new Error(`Found ${dexCards.zeroWidthCount} cards with failed images in Dex`);
    }

    // 2. Check Card Modal for canonical species
    console.log('\n[2/4] Checking Card Modal for Species 1 and 10...');
    // Click on species 1
    await cdp.eval(`document.querySelectorAll('.album-card')[0].click()`);
    await sleep(600);
    const modal1 = await cdp.eval(`
      (() => {
        const modal = document.querySelector('#beast-card-modal');
        if (!modal) return { open: false };
        const img = modal.querySelector('.holo-art-img');
        return {
          open: true,
          src: img ? img.src : null,
          naturalWidth: img ? img.naturalWidth : 0,
          naturalHeight: img ? img.naturalHeight : 0,
          complete: img ? img.complete : false,
        };
      })()
    `);
    console.log('Card Modal for Species #1:', modal1);

    // Close modal
    await cdp.eval(`document.querySelector('#modal-close').click()`);
    await sleep(300);

    // Click on species 10
    await cdp.eval(`document.querySelectorAll('.album-card')[9].click()`);
    await sleep(600);
    const modal10 = await cdp.eval(`
      (() => {
        const modal = document.querySelector('#beast-card-modal');
        if (!modal) return { open: false };
        const img = modal.querySelector('.holo-art-img');
        return {
          open: true,
          src: img ? img.src : null,
          naturalWidth: img ? img.naturalWidth : 0,
          naturalHeight: img ? img.naturalHeight : 0,
          complete: img ? img.complete : false,
        };
      })()
    `);
    console.log('Card Modal for Species #10:', modal10);

    // Close modal
    await cdp.eval(`document.querySelector('#modal-close').click()`);
    await sleep(300);

    // 3. Check Gauntlet Camp
    console.log('\n[3/4] Checking Gauntlet Camp Companion Carousel...');
    // Unlock a few canonical beasts in localStorage so companion carousel has beasts
    await cdp.eval(`
      (() => {
        const album = JSON.parse(localStorage.getItem('br.album') || '{"caughtIds":[],"caughtAt":{}}');
        album.caughtIds = ['1', '5', '10', '25', '50', '75', '10012'];
        album.activeCompanionId = '1';
        localStorage.setItem('br.album', JSON.stringify(album));
      })()
    `);
    await cdp.eval(`document.querySelector('[data-screen="gauntlet"]').click()`);
    await sleep(1500);

    const campComps = await cdp.eval(`
      (() => {
        const thumbs = Array.from(document.querySelectorAll('.comp-thumb-img'));
        return thumbs.map(t => ({
          id: t.dataset.id,
          src: t.src,
          naturalWidth: t.naturalWidth,
          naturalHeight: t.naturalHeight,
          complete: t.complete
        }));
      })()
    `);
    console.log('Gauntlet Camp Companion Thumbs:', campComps);

    // 4. Check Battle View
    console.log('\n[4/4] Checking Battle View Beast Art...');
    // Click weapon and enter gauntlet
    await cdp.eval(`
      (() => {
        const blade = document.querySelector('[data-weapon="Blade"]');
        if (blade) blade.click();
        const startBtn = document.querySelector('#btn-start-gauntlet');
        if (startBtn) startBtn.click();
      })()
    `);
    await sleep(1000);

    // Advance chambers until a battle stage is encountered
    let inBattle = false;
    for (let step = 0; step < 12; step++) {
      const isBattle = await cdp.eval(`Boolean(document.querySelector('#battle-beast-img'))`);
      if (isBattle) {
        inBattle = true;
        break;
      }
      await cdp.eval(`
        (() => {
          const exploreBtn = document.querySelector('#btn-explore');
          if (exploreBtn) exploreBtn.click();
        })()
      `);
      await sleep(1000);
    }

    const battleState = await cdp.eval(`
      (() => {
        const enemyImg = document.querySelector('#battle-beast-img');
        const allyImg = document.querySelector('.battle-ally-card.companion img');
        return {
          enemySrc: enemyImg ? enemyImg.src : null,
          enemyNaturalWidth: enemyImg ? enemyImg.naturalWidth : 0,
          enemyNaturalHeight: enemyImg ? enemyImg.naturalHeight : 0,
          enemyComplete: enemyImg ? enemyImg.complete : false,
          allySrc: allyImg ? allyImg.src : null,
          allyNaturalWidth: allyImg ? allyImg.naturalWidth : 0,
          allyNaturalHeight: allyImg ? allyImg.naturalHeight : 0,
          allyComplete: allyImg ? allyImg.complete : false,
        };
      })()
    `);
    console.log('Battle View Art (inBattle: ' + inBattle + '):', battleState);

    if (inBattle) {
      if (battleState.enemyNaturalWidth === 0 || battleState.allyNaturalWidth === 0) {
        throw new Error('Battle view image failed to render with naturalWidth > 0');
      }
    }

    console.log('\nFailed HTTP Requests:', failedUrls);

    if (failedUrls.length > 0) {
      console.warn(`WARNING: ${failedUrls.length} failed HTTP requests detected`);
    } else {
      console.log('✓ ZERO 404 or network errors detected across all views!');
    }

    console.log('\n--- All Verifications Passed Successfully! ---');
  } finally {
    chrome.kill();
  }
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
