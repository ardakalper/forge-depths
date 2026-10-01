// README screenshots. The bot plays seeded runs off-screen to reach interesting moments.
// Usage: npm start (port 4181) in another shell, then PW_CHROMIUM_PATH=... node tools/screenshots.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const exe = process.env.PW_CHROMIUM_PATH, OUT = process.env.OUT || 'docs/img', URL = 'http://localhost:4181/?nosw=1';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const newPage = async (q = '') => { const p = await browser.newPage({ viewport: { width: 1280, height: 800 } }); await p.goto(URL + q); await p.waitForFunction(() => window.__fd); return p; };

// bot-play until `until(s)` is true; the hero is kept alive so the run gets there
const play = (page, until, { keepAlive = true, max = 30000 } = {}) => page.evaluate(({ until, keepAlive, max }) => {
  const f = window.__fd, s = f.s, test = new Function('s', 'G', `return (${until})`);
  for (let n = 0; n < max && !s.over && !test(s, f.G); n++) {
    if (keepAlive && s.player.hp < s.player.maxHp * 0.5) s.player.hp = s.player.maxHp;
    const t = s.turn; f.act(f.bot(s)); if (s.turn === t) f.act({ type: 'wait' });
  }
  f.updateUI();
  return { depth: s.depth, turn: s.turn };
}, { until, keepAlive, max });

{ // title with the attract run behind it
  const page = await newPage();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/title.png` });
  await page.close();
}
{ // a fight in the Sunken Halls
  const page = await newPage('&seed=HALLS7');
  console.log(await play(page, 's.depth >= 4'));
  console.log(await play(page, "G.threats(s).length >= 2 && G.threats(s).some((m) => m.hp < m.maxHp)", { max: 3000 }));
  await page.evaluate(() => { const f = window.__fd; f.renderer.reset(); });
  await page.waitForTimeout(500);
  // one more swing so damage numbers are on screen
  await page.evaluate(() => { const f = window.__fd, s = f.s; f.act(f.bot(s)); });
  await page.waitForTimeout(260);
  await page.evaluate(() => { document.querySelector('#banner').hidden = true; });
  await page.screenshot({ path: `${OUT}/halls.png` });
  await page.close();
}
{ // the Forge Warden
  const page = await newPage('&seed=FORGE3');
  console.log(await play(page, 's.depth >= 8'));
  console.log(await play(page, "s.monsters.some((m) => m.id === 'warden' && G.isVisible(s, m.x, m.y) && !m.asleep && Math.max(Math.abs(m.x - s.player.x), Math.abs(m.y - s.player.y)) <= 3)", { max: 4000 }));
  await page.evaluate(() => { const f = window.__fd; f.renderer.reset(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const f = window.__fd, s = f.s; f.act(f.bot(s)); });
  await page.waitForTimeout(260);
  await page.evaluate(() => { document.querySelector('#banner').hidden = true; });
  await page.screenshot({ path: `${OUT}/forge.png` });
  await page.close();
}
{ // the end of a run
  const page = await newPage('&seed=GRAVE2');
  console.log(await play(page, 's.depth >= 5'));
  console.log(await play(page, 'false', { keepAlive: false, max: 8000 }));
  await page.waitForSelector('#dlg-over[open]');
  await page.evaluate(() => { document.querySelector('#banner').hidden = true; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/over.png` });
  await page.close();
}
await browser.close();
