// scripts/verify-flee-and-chamber.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;
const SERVER_PORT = 4179;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
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
    const { WebSocket } = await import('node:http').then(async () => ({ WebSocket: globalThis.WebSocket }));
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
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

// Simple static server for dist
function startDistServer(distDir, port) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading ' + req.url);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function run() {
  console.log('=== Starting Verification of Flee & Chamber Advancements ===');
  const distDir = path.resolve('dist');
  const server = await startDistServer(distDir, SERVER_PORT);
  console.log(`Static server running on http://localhost:${SERVER_PORT}`);

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--window-size=360,740',
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
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 740,
      deviceScaleFactor: 2,
      mobile: true,
    });

    await cdp.send('Page.navigate', { url: `http://localhost:${SERVER_PORT}` });
    await sleep(1500);

    // Setup album with starter beasts to unlock Gauntlet
    await cdp.eval(`
      (() => {
        const data = JSON.parse(localStorage.getItem('br.album') || '{}');
        data.caughtIds = ['1', '2', '3'];
        data.activeCompanionId = '1';
        localStorage.setItem('br.album', JSON.stringify(data));
      })()
    `);

    // Reload
    await cdp.send('Page.navigate', { url: `http://localhost:${SERVER_PORT}` });
    await sleep(1500);

    // Navigate to Gauntlet
    console.log('Navigating to Gauntlet view...');
    await cdp.eval(`
      const btn = Array.from(document.querySelectorAll('.bottom-tab-btn')).find(b => b.textContent.includes('Gauntlet'));
      if (btn) btn.click();
    `);
    await sleep(800);

    const atCamp = await cdp.eval(`Boolean(document.querySelector('.camp-scene-wrap'))`);
    console.log('1. At Gauntlet Camp:', atCamp);
    if (!atCamp) throw new Error('Expected to be at Gauntlet Camp');

    // Check Enter the Gauntlet button
    const startGauntletBtn = await cdp.eval(`
      (() => {
        const btn = document.getElementById('btn-start-gauntlet');
        const rect = btn.getBoundingClientRect();
        return { text: btn.textContent.trim(), width: rect.width, height: rect.height, disabled: btn.disabled };
      })()
    `);
    console.log('Enter Gauntlet Button:', startGauntletBtn);
    if (startGauntletBtn.disabled) throw new Error('Enter Gauntlet button is disabled');

    // Click Enter the Gauntlet
    console.log('Clicking "ENTER THE GAUNTLET"...');
    await cdp.eval(`document.getElementById('btn-start-gauntlet').click();`);
    await sleep(800);

    const inDungeon = await cdp.eval(`Boolean(document.querySelector('.dungeon-run-wrap'))`);
    console.log('2. Inside Dungeon after clicking Enter Gauntlet:', inDungeon);
    if (!inDungeon) throw new Error('Failed to enter dungeon');

    // Verify auto-battle toggle is OFF by default
    const initialAutoBattleState = await cdp.eval(`
      (() => {
        const chk = document.getElementById('chk-auto-battle');
        return { exists: Boolean(chk), checked: chk ? chk.checked : null };
      })()
    `);
    console.log('Initial Auto-Battle Switch State:', initialAutoBattleState);
    if (initialAutoBattleState.checked !== false) {
      throw new Error(`Expected auto-battle to be unchecked/OFF, got: ${initialAutoBattleState.checked}`);
    }

    // Verify layout and tap target separation between explore button and auto-battle switch
    const layoutMetrics = await cdp.eval(`
      (() => {
        const expBtn = document.getElementById('btn-explore');
        const autoBox = document.querySelector('.auto-battle-toggle-box');
        const chk = document.getElementById('chk-auto-battle');
        if (!expBtn || !autoBox) return null;
        const expRect = expBtn.getBoundingClientRect();
        const boxRect = autoBox.getBoundingClientRect();
        const verticalGap = boxRect.top - expRect.bottom;
        const overlaps = !(
          expRect.right < boxRect.left ||
          expRect.left > boxRect.right ||
          expRect.bottom < boxRect.top ||
          expRect.top > boxRect.bottom
        );
        return {
          expHeight: expRect.height,
          boxHeight: boxRect.height,
          verticalGap,
          overlaps,
        };
      })()
    `);
    console.log('3. Tap Target Layout Metrics:', layoutMetrics);
    if (layoutMetrics) {
      if (layoutMetrics.overlaps) {
        throw new Error('Explore button and Auto-Battle toggle box OVERLAP!');
      }
      if (layoutMetrics.verticalGap < 10) {
        throw new Error(`Vertical gap too small: ${layoutMetrics.verticalGap}px`);
      }
      console.log(`Clean separation confirmed: ${layoutMetrics.verticalGap}px gap with ZERO overlap.`);
    }

    // Advance chambers and test tapping
    console.log('4. Advancing chamber with "ENTER CHAMBER"...');
    await cdp.eval(`
      (() => {
        const btn = document.getElementById('btn-explore');
        if (btn) btn.click();
      })()
    `);
    await sleep(600);

    // Verify auto-battle did NOT turn on from tapping Enter Chamber
    const autoBattleAfterAdvance = await cdp.eval(`
      (() => {
        const chk = document.getElementById('chk-auto-battle');
        return chk ? chk.checked : false;
      })()
    `);
    console.log('Auto-battle state after tapping Enter Chamber:', autoBattleAfterAdvance);
    if (autoBattleAfterAdvance === true) {
      throw new Error('Auto-battle was activated automatically after tapping Enter Chamber!');
    }

    // Check if in battle or in corridor
    let stage = await cdp.eval(`
      (() => {
        if (document.querySelector('.battle-stage-panel')) return 'battle';
        if (document.querySelector('.chamber-corridor-scene')) return 'corridor';
        return 'other';
      })()
    `);
    console.log('Stage after advance:', stage);

    // Advance until we encounter a battle or reach end
    let chamberAdvances = 0;
    while (stage === 'corridor' && chamberAdvances < 8) {
      chamberAdvances++;
      console.log(`Advancing chamber step ${chamberAdvances}...`);
      await cdp.eval(`document.getElementById('btn-explore').click();`);
      await sleep(600);
      stage = await cdp.eval(`
        (() => {
          if (document.querySelector('.battle-stage-panel')) return 'battle';
          if (document.querySelector('.chamber-corridor-scene')) return 'corridor';
          return 'other';
        })()
      `);
      console.log(`Stage after advance ${chamberAdvances}:`, stage);
    }

    if (stage === 'battle') {
      console.log('5. In Battle Stage! Verifying Flee Button...');
      const fleeInfo = await cdp.eval(`
        (() => {
          const btn = document.getElementById('btn-flee');
          return {
            text: btn ? btn.textContent.trim() : null,
            visible: Boolean(btn),
          };
        })()
      `);
      console.log('Flee button text:', fleeInfo.text);
      if (!fleeInfo.text.startsWith('FLEE (')) {
        throw new Error(`Flee button does not show percentage: ${fleeInfo.text}`);
      }

      // Check fleeing
      console.log('Testing Flee action in combat...');
      const fleeResult = await cdp.eval(`
        (() => {
          const hpBefore = document.querySelector('.battle-stage-panel')?.textContent;
          const heroHpText = document.querySelector('.dungeon-hud-header .num')?.textContent;
          document.getElementById('btn-flee').click();
          return { heroHpText };
        })()
      `);
      await sleep(800);

      const afterFleeStage = await cdp.eval(`
        (() => {
          if (document.querySelector('.battle-stage-panel')) return 'battle';
          if (document.querySelector('.chamber-corridor-scene')) return 'corridor';
          if (document.querySelector('.death-screen-wrap')) return 'dead';
          if (document.querySelector('.dungeon-cleared-wrap')) return 'cleared';
          return 'unknown';
        })()
      `);
      console.log('Stage after Flee attempt:', afterFleeStage);

      // Either successfully escaped to corridor/cleared, or failed and remained in battle (or dead if lethal)
      if (afterFleeStage === 'corridor') {
        console.log('Flee succeeded! Player escaped cleanly to corridor.');
      } else if (afterFleeStage === 'battle') {
        console.log('Flee failed! Player took beast damage and remained in battle.');
      }
    }

    // Verify Flee back to camp button
    console.log('6. Quitting back to Camp...');
    await cdp.eval(`
      window.confirm = () => true;
      const qBtn = document.getElementById('btn-quit-dungeon');
      if (qBtn) qBtn.click();
    `);
    await sleep(800);

    const backCamp = await cdp.eval(`Boolean(document.querySelector('.camp-scene-wrap'))`);
    console.log('Returned to Camp:', backCamp);
    if (!backCamp) throw new Error('Failed to return to Camp');

    console.log('=== ALL FLEE & CHAMBER VERIFICATIONS PASSED SUCCESSFULLY ===');
  } finally {
    chrome.kill();
    server.close();
  }
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
