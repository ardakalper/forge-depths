import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePng } from '../../tools/png.mjs';

const BASE = '/?nosw=1&attract=0';
const game = (page, fn, arg) => page.evaluate(fn, arg);

// Put the run into a known spot: a monster-free level, or one monster next to the hero.
async function clearMonsters(page) { await game(page, () => { window.__fd.s.monsters = []; window.__fd.G.updateFov(window.__fd.s); window.__fd.updateUI(); }); }

test('title screen: menu, daily date, hall of fame and help', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.locator('h1')).toHaveText('Forge Depths');
  await expect(page.locator('#daily-date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('#btn-continue')).toBeHidden();
  await page.click('#btn-scores');
  await expect(page.locator('#scores-body')).toContainText('No runs yet');
  await page.keyboard.press('Escape');
  await page.click('#btn-help-t');
  await expect(page.locator('#dlg-help')).toContainText('Forge Warden');
  await page.keyboard.press('Escape');
});

test('a new run: moving, the log, the sidebar and the minimap', async ({ page }) => {
  await page.goto(`${BASE}&seed=E2E-MOVE`);
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#run-label')).toContainText('E2E-MOVE');
  await expect(page.locator('#depth-name')).toHaveText('Depth 1 · The Old Mine');
  await expect(page.locator('#hp-text')).toHaveText('20 / 20');
  await expect(page.locator('#log')).toContainText('You climb down into the Old Mine');
  await expect(page.locator('#g-weapon')).toContainText('Dagger');
  await expect(page.locator('#pack button:not(:disabled)')).toHaveCount(1);
  await clearMonsters(page);
  const before = await game(page, () => window.__fd.s.turn);
  // try every direction until one is open
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
    await page.keyboard.press(key);
    if (await game(page, () => window.__fd.s.turn) > before) break;
  }
  expect(await game(page, () => window.__fd.s.turn)).toBe(before + 1);
  await page.keyboard.press('Space');
  expect(await game(page, () => window.__fd.s.turn)).toBe(before + 2);
  // the canvas has been drawn
  const lit = await page.evaluate(() => { const c = document.querySelector('#view'); const d = c.getContext('2d').getImageData(c.width / 2 - 20, c.height / 2 - 20, 40, 40).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i] + d[i + 1] + d[i + 2]; return n; });
  expect(lit).toBeGreaterThan(40 * 40 * 60);
});

test('auto-explore walks the level, then travel and descend', async ({ page }) => {
  await page.goto(`${BASE}&seed=E2E-EXPLORE`);
  await clearMonsters(page);
  await page.keyboard.press('x');
  await expect.poll(() => game(page, () => window.__fd.runner), { timeout: 60_000 }).toBeNull();
  const st = await game(page, () => { const s = window.__fd.s; return { onStairs: window.__fd.G.onStairs(s), explored: s.map.explored.filter(Boolean).length, turn: s.turn }; });
  expect(st.turn).toBeGreaterThan(50);
  expect(st.explored).toBeGreaterThan(400);
  expect(st.onStairs).toBe(true);
  await expect(page.locator('[data-cmd="descend"]')).toBeEnabled();
  await page.keyboard.press('>');
  await expect(page.locator('#depth-name')).toHaveText('Depth 2 · The Old Mine');
  await expect(page.locator('#banner')).toContainText('Depth 2');
  // click-to-travel: click a seen tile a few steps away
  await clearMonsters(page);
  const target = await game(page, () => {
    const { s, G } = window.__fd, p = s.player;
    for (let r = 4; r > 1; r--) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const x = p.x + dx, y = p.y + dy;
      if (G.travelStep(s, x, y) && s.map.tiles[G.idx(x, y)] === 1) return { x, y, dx, dy };
    }
    return null;
  });
  expect(target).not.toBeNull();
  const box = await page.locator('#view').boundingBox();
  const ts = await game(page, () => window.__fd.renderer.ts / window.__fd.renderer.dpr);
  // the camera is centred on the hero unless clamped at the map edge, so read where the hero is drawn
  const at = await game(page, ({ x, y }) => { const r = window.__fd.renderer; return { px: (x * r.ts - r.cam.x) / r.dpr, py: (y * r.ts - r.cam.y) / r.dpr }; }, target);
  await page.mouse.click(box.x + at.px + ts / 2, box.y + at.py + ts / 2);
  await expect.poll(() => game(page, () => [window.__fd.s.player.x, window.__fd.s.player.y]), { timeout: 10_000 }).toEqual([target.x, target.y]);
});

test('fighting, items from the pack and levelling up', async ({ page }) => {
  await page.goto(`${BASE}&seed=E2E-FIGHT`);
  // a sleeping-free rat right next to the hero, in a cleared level
  const dir = await game(page, () => {
    const { s, G } = window.__fd, p = s.player;
    s.monsters = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (G.T.FLOOR === s.map.tiles[G.idx(p.x + dx, p.y + dy)]) { G.spawn(s, 'rat', p.x + dx, p.y + dy); s.player.xp = 9; G.updateFov(s); return [dx, dy]; }
    return null;
  });
  expect(dir).not.toBeNull();
  const key = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' }[dir.join(',')];
  for (let i = 0; i < 30 && (await game(page, () => window.__fd.s.monsters.length)); i++) await page.keyboard.press(key);
  await expect(page.locator('#log')).toContainText('You slay the rat.');
  await expect(page.locator('#log')).toContainText('You reach level 2!');
  await expect(page.locator('#lvl')).toHaveText('2');
  // drink the potion from the pack popover
  await game(page, () => { window.__fd.s.player.hp = 5; window.__fd.updateUI(); });
  await page.click('#pack button[data-i="0"]');
  await expect(page.locator('#item-pop')).toBeVisible();
  await expect(page.locator('#pop-use')).toHaveText('Drink');
  await page.click('#pop-use');
  await expect(page.locator('#hp-text')).toHaveText('17 / 24');
  // equip with a number key, drop with shift
  await game(page, () => { window.__fd.s.player.inv.push({ id: 'axe' }, { id: 'leather' }); window.__fd.updateUI(); });
  await page.keyboard.press('Digit1');
  await expect(page.locator('#g-weapon')).toContainText('Axe');
  await page.keyboard.press('Digit2');
  await expect(page.locator('#g-armour')).toContainText('Leather armour');
  await expect(page.locator('#st-def')).toHaveText('1');
  await page.keyboard.press('Shift+Digit1');
  await expect(page.locator('#log')).toContainText('You drop the dagger.');
});

test('death: the summary, sharing, the hall of fame and the replay', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${BASE}&seed=E2E-DEATH`);
  await game(page, () => {
    const { s, G } = window.__fd, p = s.player;
    s.monsters = []; p.hp = 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (s.map.tiles[G.idx(p.x + dx, p.y + dy)] === G.T.FLOOR) { G.spawn(s, 'ogre', p.x + dx, p.y + dy); break; }
    G.updateFov(s);
  });
  for (let i = 0; i < 60 && !(await game(page, () => window.__fd.s.over)); i++) await page.keyboard.press('Space');
  await expect(page.locator('#dlg-over')).toBeVisible();
  await expect(page.locator('#over-title')).toHaveText('You died');
  await expect(page.locator('#over-text')).toContainText('Slain by an ogre on depth 1');
  await expect(page.locator('#over-depths i.on')).toHaveCount(1);
  await page.click('#o-share');
  const shared = await page.locator('#dlg-over').getAttribute('data-shared');
  expect(shared).toContain('Forge Depths · Seed E2E-DEATH');
  expect(shared).toContain('🟩⬛⬛⬛⬛⬛⬛⬛ Depth 1/8');
  expect(shared).toContain('?seed=E2E-DEATH');
  await expect(page.locator('#toast')).toContainText('copied');
  // the save is gone, the score is kept
  expect(await page.evaluate(() => localStorage.getItem('forge-depths:run'))).toBeNull();
  // replay: the recorded run plays back to the same death
  await page.click('#o-replay');
  await expect(page.locator('#replay-bar')).toBeVisible();
  await page.click('[data-speed="32"]');
  await expect.poll(() => game(page, () => window.__fd.replay?.paused), { timeout: 20_000 }).toBe(true);
  await expect(page.locator('#replay-info')).toHaveText(/turn (\d+) \/ \1/);
  await page.click('#r-exit');
  await page.click('#btn-scores');
  await expect(page.locator('#scores-body tr')).toHaveCount(1);
  await expect(page.locator('#scores-body')).toContainText('Slain by an ogre');
});

test('victory on the last depth', async ({ page }) => {
  await page.goto(`${BASE}&seed=E2E-WIN`);
  await game(page, () => {
    const { s, G } = window.__fd, p = s.player;
    s.monsters = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (s.map.tiles[G.idx(p.x + dx, p.y + dy)] === G.T.FLOOR && !G.itemAt(s, p.x + dx, p.y + dy)) { s.items.push({ x: p.x + dx, y: p.y + dy, item: { id: 'heart' } }); window.__dir = [dx, dy]; break; }
  });
  const [dx, dy] = await game(page, () => window.__dir);
  await page.keyboard.press({ '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' }[`${dx},${dy}`]);
  await expect(page.locator('#over-title')).toHaveText('Victory!');
  await expect(page.locator('#over-depths i.won')).toHaveCount(1);
});

test('the daily run and saved runs', async ({ page }) => {
  await page.goto(BASE);
  await page.click('#btn-daily');
  const daily = await game(page, () => ({ seed: window.__fd.s.seed, mode: window.__fd.s.mode, date: window.__fd.s.date }));
  expect(daily.mode).toBe('daily');
  expect(daily.seed).toBe(`daily-${daily.date}`);
  await expect(page.locator('#run-label')).toContainText(`Daily ${daily.date}`);
  await clearMonsters(page);
  for (let i = 0; i < 5; i++) await page.keyboard.press('Space');
  const turn = await game(page, () => window.__fd.s.turn);
  await page.click('#b-menu');
  await expect(page.locator('#btn-continue')).toBeVisible();
  await expect(page.locator('#continue-info')).toContainText(`daily ${daily.date}`);
  await page.reload();
  await page.click('#btn-continue');
  expect(await game(page, () => window.__fd.s.turn)).toBe(turn);
  expect(await game(page, () => window.__fd.s.mode)).toBe('daily');
  // the same seed gives the same dungeon in a fresh tab
  const layout = await game(page, () => window.__fd.G.newGame({ seed: window.__fd.s.seed }).map.tiles.join(''));
  const page2 = await page.context().newPage();
  await page2.goto(`${BASE}&daily=${daily.date}`);
  expect(await page2.evaluate(() => window.__fd.s.map.tiles.join(''))).toBe(layout);
});

test('seed dialog starts a shared dungeon', async ({ page }) => {
  await page.goto(BASE);
  await page.click('#btn-seed');
  await page.fill('#seed-input', 'k7qx2m');
  await page.click('#seed-form button[value="go"]');
  await expect(page.locator('#run-label')).toContainText('K7QX2M');
  expect(await game(page, () => window.__fd.s.seed)).toBe('K7QX2M');
});

test('music and sound toggles drive the chiptune engine', async ({ page }) => {
  await page.goto(`${BASE}&seed=E2E-SOUND`);
  await page.keyboard.press('Space'); // first gesture starts audio
  await expect.poll(() => game(page, () => window.__fd.sound.playing), { timeout: 10_000 }).toBe('depths');
  await page.keyboard.press('m');
  await expect.poll(() => game(page, () => window.__fd.sound.playing)).toBeNull();
  await expect(page.locator('#b-music')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#b-music');
  await expect.poll(() => game(page, () => window.__fd.sound.playing)).toBe('depths');
  await page.click('#b-sfx');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('forge-depths:settings')))).toEqual({ music: true, sfx: false });
});

test('your own sprites from a Pixel Editor sheet replace the built-in hero', async ({ page }, info) => {
  // a 16×16 sheet with one frame tagged "hero": a solid magenta square
  const px = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = 255; px[i + 1] = 0; px[i + 2] = 255; px[i + 3] = 255; }
  const dir = info.outputPath('sheet'); mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/sheet.png`, encodePng(16, 16, px));
  writeFileSync(`${dir}/sheet.json`, JSON.stringify({ frames: { 'knight 0.png': { frame: { x: 0, y: 0, w: 16, h: 16 }, sourceSize: { w: 16, h: 16 }, spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 }, duration: 100 } }, meta: { app: 'pixel-editor', image: 'sheet.png', frameTags: [{ name: 'Hero', from: 0, to: 0 }] } }));
  await page.goto(BASE);
  await page.click('#btn-sprites');
  await page.setInputFiles('#sp-json', `${dir}/sheet.json`);
  await page.setInputFiles('#sp-png', `${dir}/sheet.png`);
  await page.click('#sp-apply');
  await expect(page.locator('#sp-status')).toHaveText('1 sprites replaced.');
  await expect(page.locator('#sprite-names span.on')).toHaveText('hero');
  await page.keyboard.press('Escape');
  await page.click('#btn-new');
  await clearMonsters(page);
  await page.waitForTimeout(400);
  const magenta = await page.evaluate(() => {
    const { renderer: r, s } = window.__fd, c = document.querySelector('#view');
    const x = Math.round(s.player.x * r.ts - r.cam.x + r.ts / 2), y = Math.round(s.player.y * r.ts - r.cam.y + r.ts / 2);
    const d = c.getContext('2d').getImageData(x, y, 1, 1).data;
    return d[0] > 120 && d[1] < 60 && d[2] > 120;
  });
  expect(magenta).toBe(true);
  // it survives a reload
  await page.reload();
  await page.click('#btn-sprites');
  await expect(page.locator('#sprite-names span.on')).toHaveText('hero');
});

test('phone: the d-pad moves and the layout stacks', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}&seed=E2E-PHONE`);
  await expect(page.locator('#dpad')).toBeVisible();
  await clearMonsters(page);
  const before = await game(page, () => window.__fd.s.turn);
  await page.click('#dpad [data-d="0,0"]');
  expect(await game(page, () => window.__fd.s.turn)).toBe(before + 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});
