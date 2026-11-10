import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(CHROME_PATH, [
  '--remote-debugging-port=9225',
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=360,740',
  '--user-data-dir=' + process.env.TEMP + '/chrome-test-' + Date.now()
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  await sleep(1500);
  try {
    const list = await (await fetch('http://127.0.0.1:9225/json/list')).json();
    let target = list.find((t) => t.type === 'page');
    if (!target) {
      target = await (await fetch('http://127.0.0.1:9225/json/new?http://192.168.1.7:5173/')).json();
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);

    let id = 1;
    const send = (method, params = {}) => new Promise((resolve) => {
      const curId = id++;
      const handler = (msg) => {
        const d = JSON.parse(msg.data);
        if (d.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(d.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

    await new Promise((resolve) => { ws.onopen = resolve; });
    console.log('Connected to dev server page');

    await send('Page.enable');
    await send('Page.navigate', { url: 'http://192.168.1.7:5173/' });
    await sleep(1500);

    await send('Console.enable');
    await send('Runtime.enable');

    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.method === 'Console.messageAdded') {
        console.log('[BROWSER CONSOLE]', d.params.message.level, d.params.message.text);
      }
      if (d.method === 'Runtime.exceptionThrown') {
        console.error('[BROWSER EXCEPTION]', d.params.exceptionDetails.text, d.params.exceptionDetails.exception);
      }
    });

    // Seed album in localStorage so Gauntlet is unlocked
    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('br.album', JSON.stringify({
          caughtIds: ['1'],
          activeCompanionId: '1',
          caughtAt: { '1': Date.now() },
          friendliness: { '1': 15 }
        }));
        location.reload();
      `
    });
    await sleep(1500);

    // Click Gauntlet tab
    await send('Runtime.evaluate', {
      expression: `document.querySelector('[data-screen="gauntlet"]')?.click()`
    });
    await sleep(600);

    // Check what is rendered
    const viewState = await send('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            hasCamp: Boolean(document.querySelector('.camp-scene-wrap')),
            hasDungeon: Boolean(document.querySelector('.dungeon-run-wrap')),
            hasCleared: Boolean(document.querySelector('.dungeon-cleared-wrap')),
            htmlSnippet: document.querySelector('.screen')?.className
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Current View State:', viewState.result.value);

    // Inspect gauntlet context
    console.log('Inspecting gauntlet context...');
    const ctxDump = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const ctx = window.__gauntletContext;
          if (!ctx) return { error: 'No ctx' };
          const g = ctx.getGame();
          return {
            hasG: Boolean(g),
            phase: g?.phase,
            hasDungeon: Boolean(g?.dungeon),
            dungeonFloor: g?.dungeon?.floor,
            cleared: g?.dungeon?.cleared,
            hasBtnStart: Boolean(document.getElementById('btn-start-gauntlet'))
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Context dump before start:', ctxDump.result ? ctxDump.result.value : ctxDump);

    // Click start gauntlet
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btn-start-gauntlet')?.click()`
    });
    await sleep(400);

    const postStartDump = await send('Runtime.evaluate', {
      expression: `
        (() => {
          try {
            const ctx = window.__gauntletContext;
            const g = ctx.getGame();
            ctx.handleDungeonCleared();
            ctx.render();
            return {
              hasDungeon: Boolean(g?.dungeon),
              dungeonCleared: g?.dungeon?.cleared,
              hasClearedWrap: Boolean(document.querySelector('.dungeon-cleared-wrap'))
            };
          } catch (err) {
            return { evalError: err.message, stack: err.stack };
          }
        })()
      `,
      returnByValue: true
    });
    console.log('Post start dump:', postStartDump.result ? postStartDump.result.value : postStartDump);

    // Now test if we are on Dungeon Cleared screen
    const clearedInfo = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const clearedWrap = document.querySelector('.dungeon-cleared-wrap');
          const returnBtn = document.getElementById('btn-return-camp');
          const exitBtn = document.getElementById('btn-cleared-exit');
          const statBtns = document.querySelectorAll('.stat-alloc-btn');
          const bodyClasses = document.body.className;
          const rect = returnBtn ? returnBtn.getBoundingClientRect() : null;
          return {
            hasClearedWrap: Boolean(clearedWrap),
            returnBtnText: returnBtn?.textContent?.trim(),
            returnBtnDisabled: returnBtn?.disabled,
            returnBtnRect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null,
            hasExitBtn: Boolean(exitBtn),
            statBtnsCount: statBtns.length,
            bodyClasses
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Cleared Screen Info:', clearedInfo.result.value);

    // Test clicking a stat button if any
    console.log('Testing stat point allocation...');
    const statAllocRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const firstStat = document.querySelector('.stat-alloc-btn');
          if (firstStat) {
            const labelBefore = firstStat.textContent;
            firstStat.click();
            return { allocated: true, labelBefore };
          }
          return { allocated: false, reason: 'No stat points pending' };
        })()
      `,
      returnByValue: true
    });
    console.log('Stat allocation result:', statAllocRes.result.value);
    await sleep(400);

    // Try clicking Return to Camp
    console.log('Clicking RETURN TO CAMP...');
    const clickRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.getElementById('btn-return-camp');
          if (!btn) return { error: 'No return button' };
          btn.click();
          return {
            clicked: true,
            hasCamp: Boolean(document.querySelector('.camp-scene-wrap')),
            hasCleared: Boolean(document.querySelector('.dungeon-cleared-wrap')),
            bodyClasses: document.body.className
          };
        })()
      `,
      returnByValue: true
    });
    console.log('After clicking Return to Camp:', clickRes.result.value);

    // Wait 500ms and check state again
    await sleep(500);
    const finalState = await send('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            hasCamp: Boolean(document.querySelector('.camp-scene-wrap')),
            hasCleared: Boolean(document.querySelector('.dungeon-cleared-wrap')),
            hasDungeon: Boolean(document.querySelector('.dungeon-run-wrap')),
            bodyClasses: document.body.className,
            bottomNavVisible: !document.body.classList.contains('hide-bottom-nav')
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Final State after return:', finalState.result.value);

    // Test clicking Exit to Hub
    console.log('Testing again with EXIT TO HUB button...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const ctx = window.__gauntletContext;
          ctx.handleDungeonCleared();
          ctx.render();
        })()
      `
    });
    await sleep(400);
    const exitHubRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const exitBtn = document.getElementById('btn-cleared-exit');
          if (exitBtn) {
            exitBtn.click();
            return { clickedExit: true };
          }
          return { error: 'No exit button' };
        })()
      `,
      returnByValue: true
    });
    console.log('Exit to Hub button result:', exitHubRes.result.value);
    await sleep(500);

    const postExitState = await send('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            currentScreen: window.currentScreen || document.querySelector('.screen')?.className,
            hasCleared: Boolean(document.querySelector('.dungeon-cleared-wrap')),
            bottomNavVisible: !document.body.classList.contains('hide-bottom-nav')
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Post Exit State:', postExitState.result.value);

  } finally {
    chrome.kill();
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  chrome.kill();
});
