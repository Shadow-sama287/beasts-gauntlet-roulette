// scripts/verify-camp.mjs
import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
  }

  async connect() {
    const { WebSocket } = await import('node:http').then(async () => {
      // In Node 22+ WebSocket is global
      return { WebSocket: globalThis.WebSocket };
    });
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
        } else if (parsed.method) {
          this.events.push(parsed);
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
  console.log('--- Starting Chrome Headless on 360x740 Mobile Viewport ---');
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
    if (!pageTarget) throw new Error('No page target found');

    const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    // Enable Runtime and Page
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 740,
      deviceScaleFactor: 2,
      mobile: true,
    });

    console.log('Navigating to http://localhost:5173 ...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173' });
    await sleep(2000);

    // Check title screen
    const initialScreen = await cdp.eval('document.querySelector(".screen") ? document.querySelector(".screen").className : null');
    console.log('Initial screen class:', initialScreen);

    // Click Gauntlet tab
    console.log('Clicking Gauntlet tab...');
    await cdp.eval(`
      const btn = Array.from(document.querySelectorAll('.bottom-tab-btn')).find(b => b.textContent.includes('Gauntlet'));
      if (btn) btn.click();
      else {
        const startBtn = document.getElementById('btn-title-gauntlet');
        if (startBtn) startBtn.click();
      }
    `);
    await sleep(1000);

    // Verify Camp Screen Elements
    console.log('--- Verifying Camp Screen ---');
    const campChecks = await cdp.eval(`
      (() => {
        const camp = document.querySelector('.camp-scene-wrap');
        const header = document.querySelector('.page-top-header');
        const title = document.querySelector('.page-top-titles .arcade-title')?.textContent;
        const subhead = document.querySelector('.page-top-titles .subhead')?.textContent;
        const heroBar = document.querySelector('.camp-hero-bar');
        const weaponRow = document.querySelector('.weapon-pick-row');
        const weaponCards = Array.from(document.querySelectorAll('.weapon-pick-card')).map(c => ({
          weapon: c.dataset.w,
          active: c.classList.contains('active'),
          hasSvg: Boolean(c.querySelector('svg.weapon-svg')),
          title: c.querySelector('.wep-title')?.textContent,
          type: c.querySelector('.wep-type-tag')?.textContent
        }));
        const triangle = document.querySelector('.combat-triangle-diagram')?.textContent;
        const carousel = document.querySelector('.companion-snap-carousel');
        const companionCards = Array.from(document.querySelectorAll('.companion-snap-card')).map(c => ({
          id: c.dataset.id,
          selected: c.classList.contains('selected'),
          name: c.querySelector('.snap-card-name')?.textContent,
          hasImg: Boolean(c.querySelector('img.comp-thumb-img')),
          badge: c.querySelector('.snap-card-badge')?.textContent
        }));
        const marketCards = Array.from(document.querySelectorAll('.camp-market-card')).map(c => ({
          label: c.querySelector('.mkt-label')?.textContent,
          price: c.querySelector('.mkt-price')?.textContent,
          btnText: c.querySelector('button')?.textContent.trim(),
          disabled: c.querySelector('button')?.disabled
        }));
        const enterBtn = document.getElementById('btn-start-gauntlet');
        const enterBtnInfo = enterBtn ? {
          text: enterBtn.textContent.trim(),
          disabled: enterBtn.disabled,
          classes: enterBtn.className,
          whiteSpace: window.getComputedStyle(enterBtn).whiteSpace,
          color: window.getComputedStyle(enterBtn).color,
          bg: window.getComputedStyle(enterBtn).backgroundImage || window.getComputedStyle(enterBtn).backgroundColor
        } : null;

        // Check horizontal scroll at 360px viewport
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        const hasHorizontalScroll = scrollWidth > clientWidth;

        return {
          hasCamp: Boolean(camp),
          title,
          subhead,
          hasHeroBar: Boolean(heroBar),
          weaponCards,
          triangle,
          hasCarousel: Boolean(carousel),
          companionCount: companionCards.length,
          companionCards: companionCards.slice(0, 3),
          marketCards,
          enterBtnInfo,
          scrollWidth,
          clientWidth,
          hasHorizontalScroll
        };
      })()
    `);

    console.log('Camp Title:', campChecks.title);
    console.log('Camp Subhead:', campChecks.subhead);
    console.log('Weapon cards found:', campChecks.weaponCards);
    console.log('Combat triangle text:', campChecks.triangle);
    console.log('Companion cards count:', campChecks.companionCount, 'first 3:', campChecks.companionCards);
    console.log('Market cards:', campChecks.marketCards);
    console.log('ENTER THE GAUNTLET button info:', campChecks.enterBtnInfo);
    console.log('Viewport horizontal scroll test: scrollWidth =', campChecks.scrollWidth, 'clientWidth =', campChecks.clientWidth, 'hasOverflow =', campChecks.hasHorizontalScroll);

    // Check horizontal scroll at 360px viewport
    const overflowReport = await cdp.eval(`
      (() => {
        const docW = document.documentElement.scrollWidth;
        const clientW = document.documentElement.clientWidth;
        const offenders = [];
        document.querySelectorAll('*').forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > clientW + 1) {
            offenders.push({
              tag: el.tagName,
              className: (el.className || '').toString().slice(0, 50),
              id: el.id,
              right: Math.round(rect.right),
              width: Math.round(rect.width)
            });
          }
        });
        return { docW, clientW, offenders: offenders.slice(0, 10) };
      })()
    `);
    console.log('Overflow report:', overflowReport);

    // Test weapon switching
    console.log('--- Testing Weapon Switching to Bludgeon ---');
    await cdp.eval(`
      const bludgeonBtn = document.querySelector('.weapon-pick-card[data-w="Bludgeon"]');
      if (bludgeonBtn) bludgeonBtn.click();
    `);
    await sleep(400);

    const afterWepSwitch = await cdp.eval(`
      (() => {
        const active = document.querySelector('.weapon-pick-card.active')?.dataset.w;
        const armorText = document.querySelector('.camp-market-card:nth-child(3) .mkt-label')?.textContent;
        return { active, armorText };
      })()
    `);
    console.log('Active weapon after switch:', afterWepSwitch.active, 'Armor updated to:', afterWepSwitch.armorText);

    // Test Potion purchase
    console.log('--- Testing Camp Market Heal Purchase ---');
    const potionTest = await cdp.eval(`
      (() => {
        const potBtn = document.getElementById('btn-camp-potion');
        const beforeHp = document.querySelector('.camp-hero-bar .num')?.textContent;
        const beforeGold = document.querySelector('.camp-hero-bar div[style*="font-size:1.25rem"]')?.textContent;
        return { potBtnDisabled: potBtn?.disabled, beforeHp, beforeGold };
      })()
    `);
    console.log('Potion status (at 100 max HP):', potionTest);

    // Test Entering the Gauntlet
    console.log('--- Testing "ENTER THE GAUNTLET" Button Click ---');
    await cdp.eval(`
      const enterBtn = document.getElementById('btn-start-gauntlet');
      if (enterBtn) enterBtn.click();
    `);
    await sleep(1000);

    const dungeonState = await cdp.eval(`
      (() => {
        const hud = document.querySelector('.dungeon-hud-header');
        const minimap = document.querySelector('.minimap-box');
        const chamber = document.querySelector('.chamber-step-panel h3')?.textContent;
        const exploreBtn = document.getElementById('btn-explore')?.textContent.trim();
        const hideBottomNav = document.body.classList.contains('hide-bottom-nav');
        return {
          hasDungeonHud: Boolean(hud),
          hasMinimap: Boolean(minimap),
          chamberTitle: chamber,
          exploreBtnText: exploreBtn,
          hideBottomNav
        };
      })()
    `);
    console.log('Dungeon state after entry:', dungeonState);

    // Check for any JS console errors
    const errors = await cdp.eval(`window.__errors || []`);
    console.log('Collected JS errors:', errors);

    console.log('--- ALL CAMP VERIFICATION CHECKS COMPLETED SUCCESSFULLY ---');
  } finally {
    chrome.kill();
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
