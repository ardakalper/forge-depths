// Draws a run on a canvas: tiles with torchlight, remembered tiles, items, monsters and the hero,
// plus the effects that game events ask for (damage numbers, arrows, fire, sparks).
import { SIZE, pixels, itemSprite } from './sprites.js';
import { W, H, T, idx } from './dungeon.js';
import { FOV_RADIUS } from './game.js';
import { MONSTERS } from './data.js';
import { hashString } from './rng.js';

const DECO = { mine: 'rubble', cave: 'mushroom', halls: 'rubble', crypt: 'bones', ember: 'embers', forge: 'embers' };
const PARTICLE = { rat: '#7c7590', bat: '#8657b0', goblin: '#4b9a4e', slime: '#a3dc6a', archer: '#4b9a4e', skeleton: '#f4efe6', ogre: '#c08a55', wraith: '#a6e3ef', imp: '#ea7a2c', warden: '#f6c24a' };
const CAVES = new Set(['cave', 'ember']);
const tileHash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

export class Renderer {
  constructor(canvas, { view = [17, 11], focus = [0.5, 0.5] } = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.view = view; this.focus = focus;
    this.cache = new Map(); this.custom = null;
    this.pos = new Map(); this.fx = []; this.particles = [];
    this.cam = null; this.shake = 0; this.ts = 32; this.last = 0;
  }
  // sprites from a Pixel Editor sheet replace the built-in ones by name
  setCustom(map) { this.custom = map; }
  sprite(name, theme = 'mine', tint = null) {
    if (this.custom?.has(name)) return this.custom.get(name);
    const key = `${name}|${theme}|${tint}`;
    let cv = this.cache.get(key);
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
      cv.getContext('2d').putImageData(new ImageData(pixels(name, { theme, tint }), SIZE, SIZE), 0, 0);
      this.cache.set(key, cv);
    }
    return cv;
  }
  resize() {
    const r = this.c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.c.width = Math.max(1, Math.round(r.width * dpr)); this.c.height = Math.max(1, Math.round(r.height * dpr));
    // integer scaling keeps pixels square; aim for about view[0] × view[1] tiles on screen
    const scale = Math.max(1, Math.floor(Math.min(this.c.width / (SIZE * this.view[0]), this.c.height / (SIZE * this.view[1]))));
    this.ts = SIZE * scale; this.dpr = dpr;
    this.ctx.imageSmoothingEnabled = false;
  }
  reset() { this.pos.clear(); this.fx = []; this.particles = []; this.cam = null; }
  // screen (CSS px relative to the canvas) → tile
  tileAt(px, py) {
    if (!this.cam) return null;
    const x = Math.floor((px * this.dpr + this.cam.x) / this.ts), y = Math.floor((py * this.dpr + this.cam.y) / this.ts);
    return x >= 0 && y >= 0 && x < W && y < H ? [x, y] : null;
  }

  // ---------- events → effects ----------
  events(ev, s, now) {
    const p = s.player;
    for (const e of ev) {
      if (e.t === 'hit') { this.text(e.x, e.y, String(e.dmg), e.crit ? '#f6c24a' : '#f4efe6', now, e.crit ? 1.4 : 1); this.bump('p', e.x - p.x, e.y - p.y, now); this.burst(e.x, e.y, '#f4efe6', 4, now); }
      else if (e.t === 'miss') { this.text(e.x, e.y, 'miss', '#7c7590', now, 0.8); if (!e.player) this.bump('p', e.x - p.x, e.y - p.y, now); else if (e.from && !e.ranged) this.bumpAt(e.from, e.x, e.y, s, now); }
      else if (e.t === 'hurt') { this.text(e.x, e.y, String(e.dmg), '#d1423a', now, 1.1); this.shake = Math.min(10, 3 + e.dmg); this.burst(e.x, e.y, '#d1423a', 5, now); if (e.from && !e.ranged) this.bumpAt(e.from, e.x, e.y, s, now); }
      else if (e.t === 'heal') this.text(e.x, e.y, `+${e.n}`, '#a3dc6a', now, 1.1);
      else if (e.t === 'die') this.burst(e.x, e.y, PARTICLE[e.id] ?? '#fff', 16, now, 1.6);
      else if (e.t === 'shot') this.fx.push({ k: 'shot', from: e.from, to: e.to, kind: e.kind, t0: now, dur: 140 + 25 * Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]) });
      else if (e.t === 'fire') { for (const [x, y] of e.cells) this.burst(x, y, '#ea7a2c', 18, now, 1.8); this.burst(p.x, p.y, '#f6c24a', 20, now, 2.2); this.shake = 6; }
      else if (e.t === 'slumber') for (const [x, y] of e.cells) this.text(x, y, 'z z', '#a6e3ef', now, 1);
      else if (e.t === 'teleport') { this.burst(e.from[0], e.from[1], '#d98ad0', 18, now, 1.6); this.burst(e.to[0], e.to[1], '#d98ad0', 18, now, 1.6); this.pos.delete('p'); }
      else if (e.t === 'levelup') { this.text(p.x, p.y, 'LEVEL UP', '#9df2e6', now, 1.3, 1600); this.burst(p.x, p.y, '#4fd1c5', 24, now, 2); }
      else if (e.t === 'summon') this.burst(e.x, e.y, '#ea7a2c', 14, now, 1.4);
      else if (e.t === 'pickup' && e.id === 'gold') this.burst(p.x, p.y, '#f6c24a', 8, now);
      else if (e.t === 'descend') this.reset();
    }
  }
  text(x, y, str, colour, now, size = 1, dur = 900) { this.fx.push({ k: 'text', x, y, str, colour, size, t0: now, dur }); }
  bump(key, dx, dy, now) { this.fx.push({ k: 'bump', key, dx: Math.sign(dx), dy: Math.sign(dy), t0: now, dur: 130 }); }
  bumpAt([fx, fy], tx, ty, s, now) {
    const m = s.monsters.find((o) => o.x === fx && o.y === fy);
    if (m) this.bump(m.uid, tx - fx, ty - fy, now);
  }
  burst(x, y, colour, n, now, speed = 1) {
    const rnd = (k) => ((hashString(`${x},${y},${now},${k}`) % 1000) / 1000);
    for (let i = 0; i < n; i++) {
      const a = rnd(i) * Math.PI * 2, v = (0.6 + rnd(i + 99) * 1.4) * speed;
      this.particles.push({ x: x + 0.5, y: y + 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0.5 + rnd(i + 7) * 0.4, age: 0, colour });
    }
  }

  // ---------- drawing ----------
  draw(s, now, { overlay = 0 } = {}) {
    const { ctx, ts } = this, cw = this.c.width, ch = this.c.height;
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000); this.last = now;
    const { tiles, explored, theme } = s.map, vis = s.visible, p = s.player;
    // smooth movement: displayed positions chase the real ones
    const follow = (key, x, y) => {
      let d = this.pos.get(key);
      if (!d || Math.abs(d.x - x) + Math.abs(d.y - y) > 3) { d = { x, y }; this.pos.set(key, d); }
      const k = Math.min(1, dt * 18);
      d.x += (x - d.x) * k; d.y += (y - d.y) * k;
      if (Math.abs(d.x - x) < 0.01) d.x = x;
      if (Math.abs(d.y - y) < 0.01) d.y = y;
      return d;
    };
    const pd = follow('p', p.x, p.y);
    const live = new Set(['p']);
    for (const m of s.monsters) { live.add(m.uid); follow(m.uid, m.x, m.y); }
    for (const k of this.pos.keys()) if (!live.has(k)) this.pos.delete(k);
    // camera centred on the hero, clamped to the map
    const tx = (pd.x + 0.5) * ts - cw * this.focus[0], ty = (pd.y + 0.5) * ts - ch * this.focus[1];
    const clampC = (v, size, view) => (size <= view ? (size - view) / 2 : Math.max(0, Math.min(size - view, v)));
    const want = { x: clampC(tx, W * ts, cw), y: clampC(ty, H * ts, ch) };
    if (!this.cam) this.cam = { ...want };
    this.cam.x += (want.x - this.cam.x) * Math.min(1, dt * 10); this.cam.y += (want.y - this.cam.y) * Math.min(1, dt * 10);
    this.shake = Math.max(0, this.shake - dt * 40);
    const sx = this.shake ? (Math.sin(now * 0.09) * this.shake * this.ts) / 64 : 0, sy = this.shake ? (Math.cos(now * 0.11) * this.shake * this.ts) / 64 : 0;
    const ox = Math.round(-this.cam.x + sx), oy = Math.round(-this.cam.y + sy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(1, 0, 0, 1, ox, oy);

    const x0 = Math.max(0, Math.floor(-ox / ts)), y0 = Math.max(0, Math.floor(-oy / ts));
    const x1 = Math.min(W - 1, Math.ceil((cw - ox) / ts)), y1 = Math.min(H - 1, Math.ceil((ch - oy) / ts));
    const lavaFrame = Math.floor(now / 450) % 2;
    // tiles
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      if (!explored[i]) continue;
      const t = tiles[i], h = tileHash(x, y), X = x * ts, Y = y * ts;
      if (t === T.WALL) {
        const below = y + 1 < H ? tiles[idx(x, y + 1)] : T.WALL;
        ctx.drawImage(this.sprite(below !== T.WALL ? (CAVES.has(theme) ? 'rock_face' : 'wall_face') : 'wall_top', theme), X, Y, ts, ts);
      } else if (t === T.LAVA) {
        ctx.drawImage(this.sprite((lavaFrame + h) % 2 ? 'lava' : 'lava2', theme), X, Y, ts, ts);
      } else {
        const base = t === T.DOOR ? 'door' : t === T.OPEN ? 'door_open' : t === T.STAIRS ? 'stairs' : CAVES.has(theme) ? (h % 2 ? 'floor2' : 'floor3') : ['floor', 'floor2', 'floor3'][h % 3];
        ctx.drawImage(this.sprite(base, theme), X, Y, ts, ts);
        if (t === T.FLOOR && h % 23 === 0) ctx.drawImage(this.sprite(DECO[theme], theme), X, Y, ts, ts);
      }
      if (!vis[i]) { ctx.fillStyle = 'rgba(5, 5, 14, 0.55)'; ctx.fillRect(X, Y, ts, ts); }
    }
    // items: remembered ones are drawn dim
    for (const it of s.items) {
      const i = idx(it.x, it.y);
      if (!explored[i] || it.x < x0 || it.x > x1 || it.y < y0 || it.y > y1) continue;
      ctx.globalAlpha = vis[i] ? 1 : 0.45;
      const bob = vis[i] && it.item.id === 'heart' ? Math.round(Math.sin(now / 250) * 1.5) * (ts / SIZE) : 0;
      ctx.drawImage(this.sprite(itemSprite(it.item.id), theme, it.item.id), it.x * ts, it.y * ts + bob, ts, ts);
      ctx.globalAlpha = 1;
    }
    // monsters in sight
    const bumpOf = (key) => {
      const b = this.fx.find((f) => f.k === 'bump' && f.key === key);
      if (!b) return [0, 0];
      const q = Math.sin(Math.min(1, (now - b.t0) / b.dur) * Math.PI) * 0.3;
      return [b.dx * q, b.dy * q];
    };
    const px1 = ts / SIZE;
    // monsters in sight and the hero, back to front so lower ones overlap higher ones
    const actors = s.monsters.filter((m) => vis[idx(m.x, m.y)]).map((m) => ({ m, y: this.pos.get(m.uid).y }));
    actors.push({ m: null, y: pd.y });
    actors.sort((a, b) => a.y - b.y || (a.m ? 0 : 1) - (b.m ? 0 : 1));
    for (const { m } of actors) {
      if (!m) {
        const [bx, by] = bumpOf('p');
        ctx.drawImage(this.sprite('hero', theme), Math.round((pd.x + bx) * ts), Math.round((pd.y + by) * ts), ts, ts);
        continue;
      }
      const d = this.pos.get(m.uid), [bx, by] = bumpOf(m.uid), def = MONSTERS[m.id];
      const asleep = m.asleep || m.slumber > 0;
      const bob = asleep ? 0 : Math.round(Math.sin(now / 220 + m.uid) * 0.6 + 0.4) * px1;
      const sc = def.boss ? 1.25 : 1, size = ts * sc;
      const X = (d.x + bx) * ts + (ts - size) / 2, Y = (d.y + by) * ts + ts - size - bob;
      ctx.drawImage(this.sprite(m.id, theme), Math.round(X), Math.round(Y), size, size);
      if (m.hp < m.maxHp) {
        const w = Math.round(ts * 0.75), bx0 = Math.round((d.x + bx) * ts + (ts - w) / 2), by0 = Math.round((d.y + by) * ts + ts - px1 * 1.5);
        ctx.fillStyle = '#0e0b12'; ctx.fillRect(bx0 - px1 / 2, by0 - px1 / 2, w + px1, px1 * 2);
        ctx.fillStyle = '#d1423a'; ctx.fillRect(bx0, by0, Math.max(px1, Math.round((w * m.hp) / m.maxHp)), px1);
      }
      if (asleep) {
        ctx.font = `${Math.round(ts * 0.38)}px VT323, monospace`; ctx.fillStyle = '#a6e3ef';
        const zz = Math.floor(now / 500) % 2 ? 'z' : 'Z';
        ctx.fillText(zz, Math.round((d.x + 0.7) * ts), Math.round((d.y + 0.15) * ts - Math.sin(now / 400) * px1 * 2));
      }
    }
    // torchlight: visible tiles darken with distance and flicker a little; lava glows on its own
    const flicker = Math.sin(now / 90) * 0.015 + Math.sin(now / 37) * 0.01;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      if (!vis[i] || tiles[i] === T.LAVA) continue;
      const dd = Math.hypot(x - pd.x, y - pd.y) / (FOV_RADIUS + 0.5);
      const a = Math.min(0.5, dd * dd * 0.5 + flicker);
      if (a > 0.01) { ctx.fillStyle = `rgba(12, 7, 4, ${a.toFixed(3)})`; ctx.fillRect(x * ts, y * ts, ts, ts); }
    }
    // effects
    this.fx = this.fx.filter((f) => now - f.t0 < f.dur);
    for (const f of this.fx) {
      const q = (now - f.t0) / f.dur;
      if (f.k === 'text') {
        ctx.font = `${Math.round(ts * 0.5 * f.size)}px VT323, monospace`; ctx.textAlign = 'center';
        const X = (f.x + 0.5) * ts, Y = (f.y + 0.2) * ts - q * ts * 0.8;
        ctx.globalAlpha = 1 - Math.max(0, q - 0.6) / 0.4;
        ctx.fillStyle = '#0e0b12'; ctx.fillText(f.str, X + px1, Y + px1);
        ctx.fillStyle = f.colour; ctx.fillText(f.str, X, Y);
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
      } else if (f.k === 'shot') {
        const X = (f.from[0] + (f.to[0] - f.from[0]) * q + 0.5) * ts, Y = (f.from[1] + (f.to[1] - f.from[1]) * q + 0.5) * ts;
        if (f.kind === 'fire') {
          for (let k = 0; k < 4; k++) { ctx.fillStyle = ['#fff1a6', '#f6c24a', '#ea7a2c', '#d1423a'][k]; const r = px1 * (3 - k * 0.6); const back = k * 0.06; ctx.fillRect(X - (f.to[0] - f.from[0]) * back * ts - r, Y - (f.to[1] - f.from[1]) * back * ts - r, r * 2, r * 2); }
        } else {
          const ang = Math.atan2(f.to[1] - f.from[1], f.to[0] - f.from[0]);
          ctx.strokeStyle = '#c9c2d6'; ctx.lineWidth = px1;
          ctx.beginPath(); ctx.moveTo(X - Math.cos(ang) * ts * 0.35, Y - Math.sin(ang) * ts * 0.35); ctx.lineTo(X, Y); ctx.stroke();
        }
      }
    }
    for (const pt of this.particles) {
      pt.age += dt; pt.x += pt.vx * dt * 2; pt.y += pt.vy * dt * 2; pt.vy += dt * 5;
      ctx.globalAlpha = Math.max(0, 1 - pt.age / pt.life);
      ctx.fillStyle = pt.colour; ctx.fillRect(Math.round(pt.x * ts), Math.round(pt.y * ts), px1 * 1.5, px1 * 1.5);
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((pt) => pt.age < pt.life);
    // vignette
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    if (overlay) { ctx.fillStyle = `rgba(7, 6, 10, ${overlay})`; ctx.fillRect(0, 0, cw, ch); }
  }

  // small overview of the explored level
  minimap(cv, s) {
    const c = cv.getContext('2d'), { tiles, explored } = s.map, vis = s.visible;
    if (cv.width !== W * 3) { cv.width = W * 3; cv.height = H * 3; }
    c.fillStyle = '#07060a'; c.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < W * H; i++) {
      if (!explored[i]) continue;
      const t = tiles[i];
      c.fillStyle = t === T.WALL ? (vis[i] ? '#6e6574' : '#3a3440') : t === T.STAIRS ? '#4fd1c5' : t === T.LAVA ? '#d1423a' : t === T.DOOR || t === T.OPEN ? '#835536' : vis[i] ? '#2c2632' : '#1a161e';
      c.fillRect((i % W) * 3, ((i / W) | 0) * 3, 3, 3);
    }
    for (const m of s.monsters) if (vis[idx(m.x, m.y)]) { c.fillStyle = '#d1423a'; c.fillRect(m.x * 3, m.y * 3, 3, 3); }
    c.fillStyle = '#fff1a6'; c.fillRect(s.player.x * 3 - 1, s.player.y * 3 - 1, 5, 5);
  }
}
