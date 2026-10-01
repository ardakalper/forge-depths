// The page: title screen with the attract-mode bot, a run (input, auto-explore, saving), the game-over
// screen with sharing and replays, the hall of fame, and custom sprites.
import * as G from './game.js';
import { THEMES, DEPTHS, T } from './dungeon.js';
import { ITEMS, MONSTERS, XP_LEVELS, aName, cap, itemName } from './data.js';
import { seedCode, dailySeed } from './rng.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { trackFor } from './music.js';
import { botAction } from './bot.js';
import { itemSprite, SIZE } from './sprites.js';
import { parseSheet, SPRITE_NAMES } from './sheet.js';

const $ = (q) => document.querySelector(q);
const params = new URLSearchParams(location.search);
const KEY = { run: 'forge-depths:run', scores: 'forge-depths:scores', last: 'forge-depths:last', settings: 'forge-depths:settings', sprites: 'forge-depths:sprites' };
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const randomSeed = () => seedCode(crypto.getRandomValues(new Uint32Array(6)));

let mode = 'title'; // title | play | replay
let s = null, runner = null, replay = null, attract = null, lastKeyAt = 0;
const renderer = new Renderer($('#view'));
const attractR = new Renderer($('#attract'), { view: [30, 18], focus: innerWidth > 1000 ? [0.72, 0.5] : [0.5, 0.5] });
const sound = new Sound();
const settings = { music: true, sfx: true, ...store.get(KEY.settings, {}) };
sound.music = settings.music; sound.sfx = settings.sfx;

// ---------- small UI helpers ----------
let toastTimer = 0;
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}
function banner(big, small) {
  const b = $('#banner'); b.hidden = true; void b.offsetWidth;
  $('#banner-big').textContent = big; $('#banner-small').textContent = small; b.hidden = false;
  clearTimeout(banner.t); banner.t = setTimeout(() => { b.hidden = true; }, 2700);
}
const iconCache = new Map();
function icon(name, theme = 'mine', tint = null) {
  const key = `${name}|${theme}|${tint}|${renderer.custom ? 'c' : ''}`;
  if (!iconCache.has(key)) iconCache.set(key, renderer.sprite(name, theme, tint).toDataURL());
  return iconCache.get(key);
}
const img = (src, alt = '') => Object.assign(document.createElement('img'), { src, alt, width: 32, height: 32 });

function saveSettings() {
  store.set(KEY.settings, settings);
  for (const [id, on] of [['#t-music', settings.music], ['#b-music', settings.music], ['#t-sfx', settings.sfx], ['#b-sfx', settings.sfx]]) $(id).setAttribute('aria-pressed', String(on));
}
function toggleMusic() { settings.music = !settings.music; sound.setMusic(settings.music); saveSettings(); }
function toggleSfx() { settings.sfx = !settings.sfx; sound.setSfx(settings.sfx); saveSettings(); }

// ---------- screens ----------
function showTitle() {
  mode = 'title'; runner = null; replay = null;
  $('#game').hidden = true; $('#title').hidden = false; $('#replay-bar').hidden = true;
  $('#daily-date').textContent = today();
  const saved = store.get(KEY.run);
  $('#btn-continue').hidden = !saved;
  if (saved) { try { const o = JSON.parse(saved); $('#continue-info').textContent = `depth ${o.depth} · level ${o.player.level} · ${o.mode === 'daily' ? `daily ${o.date}` : o.seed}`; } catch { $('#btn-continue').hidden = true; } }
  sound.play('depths');
  attractR.resize();
}
function showGame() {
  $('#title').hidden = true; $('#game').hidden = false;
  closeDialogs();
  requestAnimationFrame(() => { renderer.resize(); });
}
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); $('#item-pop').hidden = true; }

function runLabel(st) {
  if (st.mode === 'daily') return `Daily <b>${st.date}</b>`;
  return `Seed <b>${st.seed}</b>`;
}

function startRun({ seed, mode: m = 'random', date = null }) {
  s = G.newGame({ seed, mode: m, date });
  mode = 'play'; runner = null;
  renderer.reset(); showGame();
  $('#run-label').innerHTML = runLabel(s);
  sound.play(trackFor(1));
  banner('Depth 1', THEMES[1].name);
  save(); updateUI();
}
function continueRun() {
  try { s = G.deserialize(store.get(KEY.run)); } catch { store.del(KEY.run); toast('That save could not be read.'); return showTitle(); }
  mode = 'play'; runner = null;
  renderer.reset(); showGame();
  $('#run-label').innerHTML = runLabel(s);
  sound.play(trackFor(s.depth));
  banner(`Depth ${s.depth}`, THEMES[s.depth].name);
  updateUI();
}
const save = () => { if (s && !s.over && mode === 'play') store.set(KEY.run, G.serialize(s)); };

// ---------- playing ----------
function doAction(a) {
  if (mode !== 'play' || !s || s.over) return [];
  const ev = G.act(s, a);
  react(ev);
  if (s.over) finishRun(); else save();
  updateUI();
  return ev;
}
function react(ev, quiet = false) {
  renderer.events(ev, s, performance.now());
  if (!quiet) sound.events(ev);
  if (ev.some((e) => e.t === 'descend')) {
    banner(`Depth ${s.depth}`, THEMES[s.depth].name);
    if (mode === 'play' || !quiet) sound.play(trackFor(s.depth));
  }
}

function finishRun() {
  runner = null;
  store.del(KEY.run);
  const entry = {
    score: G.score(s), won: s.over.won, depth: s.stats.maxDepth, level: s.player.level, gold: s.stats.gold, kills: s.stats.kills,
    turns: s.turn, cause: s.over.cause ?? null, seed: s.seed, mode: s.mode, date: s.date, when: today(),
  };
  const scores = store.get(KEY.scores, []);
  scores.push(entry); scores.sort((a, b) => b.score - a.score);
  store.set(KEY.scores, scores.slice(0, 20));
  store.set(KEY.last, { seed: s.seed, mode: s.mode, date: s.date, actions: s.actions });
  setTimeout(() => showOver(entry), s.over.won ? 1400 : 1100);
}

function showOver(e) {
  $('#over-title').textContent = e.won ? 'Victory!' : 'You died';
  $('#over-text').textContent = e.won
    ? `You carried the Ember Heart out of the forge in ${e.turns} turns.`
    : `Slain by ${e.cause} on depth ${e.depth}, ${THEMES[e.depth].name}.`;
  $('#over-depths').replaceChildren(...Array.from({ length: DEPTHS }, (_, i) => Object.assign(document.createElement('i'), { className: i < e.depth ? (e.won ? 'on won' : 'on') : '' })));
  const stat = (k, v, cls = '') => Object.assign(document.createElement('div'), { className: cls, innerHTML: `<dt>${k}</dt><dd>${v}</dd>` });
  $('#over-stats').replaceChildren(stat('Score', e.score, 'score'), stat('Depth', `${e.depth} / ${DEPTHS}`), stat('Level', e.level), stat('Kills', e.kills), stat('Gold', e.gold), stat('Turns', e.turns));
  $('#dlg-over').dataset.result = JSON.stringify(e);
  $('#dlg-over').showModal();
}

function shareText(e) {
  const squares = Array.from({ length: DEPTHS }, (_, i) => (i < e.depth ? (e.won ? '🟨' : '🟩') : '⬛')).join('');
  const url = `${location.origin}${location.pathname}?${e.mode === 'daily' ? `daily=${e.date}` : `seed=${encodeURIComponent(e.seed)}`}`;
  return [
    `Forge Depths · ${e.mode === 'daily' ? `Daily ${e.date}` : `Seed ${e.seed}`}`,
    `${squares} ${e.won ? 'Victory!' : `Depth ${e.depth}/${DEPTHS}`}`,
    `Level ${e.level} · ${e.kills} kills · ${e.gold} gold · ${e.turns} turns · score ${e.score}`,
    e.won ? 'Took the Ember Heart.' : `Slain by ${e.cause}.`,
    url,
  ].join('\n');
}

// ---------- auto-explore, travel, rest ----------
function startRunner(kind, target = null) {
  if (mode !== 'play' || s.over) return;
  if (kind !== 'travel' && G.threats(s).length) { toast('Not with enemies in sight.'); return; }
  runner = { kind, target, n: 0, hp: s.player.hp };
  tickRunner();
}
function tickRunner() {
  const r = runner;
  if (!r || mode !== 'play' || s.over) { runner = null; return; }
  let a = null;
  if (r.kind === 'explore') {
    a = G.exploreStep(s);
    if (!a) {
      const st = s.map.stairs;
      if (G.onStairs(s)) { toast('Explored. Press > to descend.'); runner = null; updateUI(); return; }
      if (st && s.map.explored[G.idx(...st)]) { r.kind = 'travel'; r.target = st; r.toStairs = true; }
      else { toast(s.depth === DEPTHS ? 'Explored. The Warden waits in its hall.' : 'Nothing left to explore.'); runner = null; return; }
    }
  }
  if (r.kind === 'travel') {
    if (s.player.x === r.target[0] && s.player.y === r.target[1]) { if (r.toStairs) toast('Explored. Press > to descend.'); runner = null; updateUI(); return; }
    a = G.travelStep(s, ...r.target);
  }
  if (r.kind === 'rest') {
    if (s.player.hp >= s.player.maxHp) { toast('You feel rested.'); runner = null; return; }
    if (r.n > 500) { runner = null; return; }
    a = { type: 'wait' };
  }
  if (!a) { runner = null; return; }
  const ev = doAction(a);
  r.n++;
  const stop = ev.some((e) => ['hurt', 'spot', 'wake', 'descend', 'death', 'win', 'levelup', 'summon'].includes(e.t)) || s.player.hp < r.hp || (r.kind !== 'travel' && G.threats(s).length);
  if (stop || runner !== r) { if (runner === r) runner = null; return; }
  r.hp = s.player.hp;
  setTimeout(tickRunner, r.kind === 'rest' ? 12 : 60);
}

// ---------- input ----------
const MOVES = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0], Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
  KeyK: [0, -1], KeyJ: [0, 1], KeyH: [-1, 0], KeyL: [1, 0], KeyY: [-1, -1], KeyU: [1, -1], KeyB: [-1, 1], KeyN: [1, 1],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyC: [1, 1],
};
const move = (dx, dy) => doAction(dx || dy ? { type: 'move', dx, dy } : { type: 'wait' });
function command(cmd) {
  if (mode !== 'play') return;
  $('#item-pop').hidden = true;
  if (cmd === 'explore') startRunner('explore');
  else if (cmd === 'rest') startRunner('rest');
  else if (cmd === 'descend') doAction({ type: 'descend' });
  else if (cmd === 'pickup') doAction({ type: 'pickup' });
}

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  firstGesture();
  if (document.querySelector('dialog[open]')) return; // dialogs handle their own keys (Escape closes them)
  if (e.key === 'Escape') { $('#item-pop').hidden = true; runner = null; return; }
  if (mode === 'replay') {
    if (e.code === 'Space') { e.preventDefault(); $('#r-pause').click(); }
    else if (e.key === 'Escape' || e.key === 'q') $('#r-exit').click();
    return;
  }
  if (mode !== 'play') return;
  if (runner) { runner = null; e.preventDefault(); return; }
  const now = performance.now();
  if (e.repeat && now - lastKeyAt < 75) { e.preventDefault(); return; }
  lastKeyAt = now;
  if (e.key === '>' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); return command('descend'); }
  if (e.key === '?' || e.code === 'F1') { e.preventDefault(); return $('#dlg-help').showModal(); }
  if (MOVES[e.code]) { e.preventDefault(); return move(...MOVES[e.code]); }
  if (e.code === 'Space' || e.code === 'Period' || e.code === 'Numpad5') { e.preventDefault(); return move(0, 0); }
  if (e.code === 'KeyX') return command('explore');
  if (e.code === 'KeyR') return command('rest');
  if (e.code === 'KeyG' || e.code === 'Comma') return command('pickup');
  if (e.code === 'KeyM') return toggleMusic();
  const digit = /^Digit(\d)$/.exec(e.code);
  if (digit) {
    e.preventDefault();
    const i = digit[1] === '0' ? 9 : Number(digit[1]) - 1;
    if (!s.player.inv[i]) return;
    return doAction({ type: e.shiftKey ? 'drop' : 'use', index: i });
  }
});

// mouse: hover describes a tile, click travels or attacks
const view = $('#view');
function describe(x, y) {
  const i = G.idx(x, y);
  if (!s.map.explored[i]) return null;
  const parts = [];
  if (s.player.x === x && s.player.y === y) parts.push('<b>You</b>');
  const m = G.isVisible(s, x, y) && G.monsterAt(s, x, y);
  if (m) {
    const def = MONSTERS[m.id], hurt = m.hp < m.maxHp ? (m.hp <= m.maxHp / 3 ? ', badly hurt' : ', hurt') : '';
    const state = m.slumber > 0 ? ', fast asleep' : m.asleep ? ', asleep' : '';
    parts.push(`<b>${cap(aName(def.name))}</b>${hurt}${state}<br>${def.dmg.join('–')} damage${def.ranged ? `, shoots ${def.ranged.range} tiles` : ''}`);
  }
  const it = G.itemAt(s, x, y);
  if (it) parts.push(`<b>${cap(itemName(it.item))}</b>${ITEMS[it.item.id].text ? `<br>${ITEMS[it.item.id].text}` : ''}`);
  const t = s.map.tiles[i];
  if (t === T.STAIRS) parts.push('Stairs down');
  else if (t === T.DOOR) parts.push('A closed door');
  else if (t === T.LAVA) parts.push('Molten lava');
  return parts.join('<br>') || null;
}
view.addEventListener('mousemove', (e) => {
  if (mode !== 'play' && mode !== 'replay') return;
  const r = view.getBoundingClientRect(), tile = renderer.tileAt(e.clientX - r.left, e.clientY - r.top);
  const html = tile && describe(...tile), tip = $('#tip');
  if (!html) { tip.hidden = true; return; }
  tip.innerHTML = html; tip.hidden = false;
  const vr = $('#viewport').getBoundingClientRect();
  tip.style.left = `${Math.min(vr.width - tip.offsetWidth - 8, e.clientX - vr.left + 16)}px`;
  tip.style.top = `${Math.min(vr.height - tip.offsetHeight - 8, e.clientY - vr.top + 16)}px`;
});
view.addEventListener('mouseleave', () => { $('#tip').hidden = true; });
view.addEventListener('click', (e) => {
  firstGesture();
  if (mode !== 'play' || s.over) return;
  if (runner) { runner = null; return; }
  const r = view.getBoundingClientRect(), tile = renderer.tileAt(e.clientX - r.left, e.clientY - r.top);
  if (!tile) return;
  const [x, y] = tile, p = s.player, dx = x - p.x, dy = y - p.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) return move(dx, dy);
  if (dx === 0 && dy === 0) return G.itemAt(s, x, y) ? command('pickup') : G.onStairs(s) ? command('descend') : move(0, 0);
  if (!s.map.explored[G.idx(x, y)]) return;
  startRunner('travel', [x, y]);
});
$('#dpad').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-d]');
  if (!b || mode !== 'play') return;
  runner = null;
  move(...b.dataset.d.split(',').map(Number));
});
document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => { firstGesture(); command(b.dataset.cmd); }));

// pack: click an item for its description, use and drop
let popIndex = -1;
$('#pack').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b || mode !== 'play') return;
  const i = Number(b.dataset.i), item = s.player.inv[i];
  if (!item) return;
  if (e.shiftKey) { $('#item-pop').hidden = true; return doAction({ type: 'drop', index: i }); }
  popIndex = i;
  const def = ITEMS[item.id], pop = $('#item-pop');
  $('#pop-name').textContent = cap(def.name);
  const extra = def.kind === 'weapon' ? ` ${def.dmg.join('–')} damage, ${def.acc >= 0 ? '+' : ''}${def.acc} to hit.` : def.kind === 'armour' ? ` Armour ${def.def}.` : '';
  $('#pop-text').textContent = def.text + extra;
  $('#pop-use').textContent = def.kind === 'weapon' ? 'Wield' : def.kind === 'armour' ? 'Wear' : def.kind === 'potion' ? 'Drink' : 'Read';
  pop.hidden = false;
  const r = b.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left - pop.offsetWidth / 2 + r.width / 2))}px`;
  pop.style.top = `${Math.max(8, r.top - pop.offsetHeight - 8)}px`;
});
$('#pop-use').addEventListener('click', () => { $('#item-pop').hidden = true; doAction({ type: 'use', index: popIndex }); });
$('#pop-drop').addEventListener('click', () => { $('#item-pop').hidden = true; doAction({ type: 'drop', index: popIndex }); });
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#item-pop, #pack')) $('#item-pop').hidden = true; });

// ---------- sidebar ----------
function updateUI() {
  if (!s) return;
  const p = s.player;
  $('#lvl').textContent = p.level;
  $('#depth-name').textContent = `Depth ${s.depth} · ${s.map.name}`;
  $('#hp-fill').style.width = `${(100 * p.hp) / p.maxHp}%`;
  $('#hp-text').textContent = `${p.hp} / ${p.maxHp}`;
  $('.bar.hp').classList.toggle('low', p.hp <= p.maxHp * 0.3);
  const from = p.level > 1 ? XP_LEVELS[p.level - 2] : 0, to = XP_LEVELS[p.level - 1] ?? p.xp;
  $('#xp-fill').style.width = `${to > from ? (100 * (p.xp - from)) / (to - from) : 100}%`;
  $('#xp-text').textContent = `XP ${p.xp} / ${to}`;
  $('#st-dmg').textContent = G.playerDmg(p).join('–');
  $('#st-acc').textContent = `${G.playerAcc(p)}`;
  $('#st-def').textContent = G.playerDef(p);
  $('#st-gold').textContent = s.stats.gold;
  const theme = s.map.theme;
  const slot = (el, item, empty) => {
    el.replaceChildren();
    el.classList.toggle('empty', !item);
    if (!item) { el.textContent = empty; return; }
    const def = ITEMS[item.id], info = document.createElement('div');
    info.innerHTML = `${cap(def.name)}<small>${def.kind === 'weapon' ? `${def.dmg.join('–')} dmg` : `armour ${def.def}`}</small>`;
    el.append(img(icon(itemSprite(item.id), theme, item.id), def.name), info);
  };
  slot($('#g-weapon'), p.weapon, 'no weapon');
  slot($('#g-armour'), p.armour, 'no armour');
  $('#pack').replaceChildren(...Array.from({ length: G.INV_SIZE }, (_, i) => {
    const li = document.createElement('li'), b = document.createElement('button'), item = p.inv[i];
    b.dataset.i = i; b.disabled = !item;
    b.append(Object.assign(document.createElement('kbd'), { textContent: (i + 1) % 10 }));
    if (item) { b.append(img(icon(itemSprite(item.id), theme, item.id), ITEMS[item.id].name)); b.title = cap(ITEMS[item.id].name); }
    li.append(b); return li;
  }));
  const here = G.itemAt(s, p.x, p.y);
  $('[data-cmd="descend"]').classList.toggle('hot', G.onStairs(s));
  $('[data-cmd="descend"]').disabled = !G.onStairs(s);
  $('[data-cmd="pickup"]').disabled = !here;
  // log: newest at the bottom, this turn's lines bright
  const log = $('#log'), lines = s.log.slice(-60);
  log.replaceChildren(...lines.map((l, i) => {
    const el = Object.assign(document.createElement('p'), { textContent: l.text, className: l.kind });
    if (l.turn >= s.turn - 1) el.classList.add('new'); else if (lines.length - i > 12) el.classList.add('old');
    return el;
  }));
  log.scrollTop = log.scrollHeight;
  renderer.minimap($('#minimap'), s);
}

// ---------- replays ----------
function startReplay(data) {
  closeDialogs();
  s = G.newGame(data);
  mode = 'replay'; runner = null;
  replay = { data, i: 0, speed: 8, paused: false, acc: 0 };
  renderer.reset(); showGame();
  $('#run-label').innerHTML = `Replay · ${runLabel(s)}`;
  $('#replay-bar').hidden = false;
  sound.play(trackFor(1));
  updateUI();
}
function stepReplay(dt) {
  const r = replay;
  if (!r || r.paused) return;
  r.acc += dt * r.speed;
  let changed = false;
  while (r.acc >= 1 && r.i < r.data.actions.length) {
    r.acc -= 1;
    const ev = G.act(s, G.decodeAction(r.data.actions[r.i++]));
    react(ev, r.speed > 8);
    changed = true;
  }
  if (r.i >= r.data.actions.length) { r.paused = true; $('#r-pause').textContent = '▶'; toast('End of the replay.'); }
  if (changed) updateUI();
  $('#replay-info').textContent = `turn ${r.i} / ${r.data.actions.length}`;
}
$('#r-pause').addEventListener('click', () => {
  if (!replay) return;
  if (replay.i >= replay.data.actions.length) { startReplay(replay.data); return; }
  replay.paused = !replay.paused; $('#r-pause').textContent = replay.paused ? '▶' : '❚❚';
});
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { if (replay) replay.speed = Number(b.dataset.speed); }));
$('#r-exit').addEventListener('click', () => { showTitle(); });

// ---------- title buttons and dialogs ----------
let gestured = false;
function firstGesture() { if (gestured) return; gestured = true; sound.start(); }
addEventListener('pointerdown', firstGesture, { once: false });
$('#btn-new').addEventListener('click', () => startRun({ seed: randomSeed() }));
$('#btn-daily').addEventListener('click', () => startRun({ seed: dailySeed(today()), mode: 'daily', date: today() }));
$('#btn-continue').addEventListener('click', continueRun);
$('#btn-seed').addEventListener('click', () => { $('#seed-input').value = ''; $('#dlg-seed').showModal(); });
$('#seed-form').addEventListener('submit', (e) => {
  const v = $('#seed-input').value.trim().toUpperCase();
  if (e.submitter?.value !== 'go') return;
  if (!v) { e.preventDefault(); return; }
  startRun({ seed: v, mode: 'seed' });
});
$('#btn-scores').addEventListener('click', showScores);
$('#btn-help-t').addEventListener('click', () => $('#dlg-help').showModal());
$('#b-help').addEventListener('click', () => $('#dlg-help').showModal());
$('#b-menu').addEventListener('click', () => { if (mode === 'play') save(); showTitle(); });
$('#t-music').addEventListener('click', toggleMusic); $('#b-music').addEventListener('click', toggleMusic);
$('#t-sfx').addEventListener('click', toggleSfx); $('#b-sfx').addEventListener('click', toggleSfx);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
$('#o-share').addEventListener('click', async () => {
  const text = shareText(JSON.parse($('#dlg-over').dataset.result));
  try { await navigator.clipboard.writeText(text); toast('Result copied. Paste it anywhere.'); } catch { toast('Copying is blocked here.'); }
  $('#dlg-over').dataset.shared = text;
});
$('#o-replay').addEventListener('click', () => { const last = store.get(KEY.last); if (last) startReplay(last); });
$('#o-new').addEventListener('click', () => startRun({ seed: randomSeed() }));
$('#o-title').addEventListener('click', () => { closeDialogs(); showTitle(); });

function showScores() {
  const scores = store.get(KEY.scores, []);
  const d = scores.filter((e) => e.mode === 'daily' && e.date === today()).sort((a, b) => b.score - a.score)[0];
  $('#daily-best').textContent = d ? `Today's daily best: ${d.score} (${d.won ? 'victory' : `depth ${d.depth}`})` : "You haven't played today's daily run yet.";
  $('#scores-body').replaceChildren(...(scores.length ? scores.map((e, i) => {
    const tr = document.createElement('tr');
    const cells = [i + 1, e.score, e.won ? 'Victory' : `Slain by ${e.cause}`, e.depth, e.level, e.mode === 'daily' ? `daily ${e.date}` : e.seed, e.when];
    cells.forEach((c, k) => tr.append(Object.assign(document.createElement('td'), { textContent: c, className: k === 2 && e.won ? 'win' : '' })));
    return tr;
  }) : [Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="7" class="muted">No runs yet. The depths are waiting.</td>' })]));
  $('#dlg-scores').showModal();
}

// ---------- custom sprites ----------
let spriteDraft = { json: null, png: null };
$('#btn-sprites').addEventListener('click', () => {
  $('#sprite-names').replaceChildren(...SPRITE_NAMES.map((n) => Object.assign(document.createElement('span'), { textContent: n, className: renderer.custom?.has(n) ? 'on' : '' })));
  $('#sp-status').textContent = renderer.custom ? `${renderer.custom.size} sprites replaced.` : 'Using the built-in sprites.';
  $('#dlg-sprites').showModal();
});
const readFile = (file, as) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r[as](file); });
$('#sp-json').addEventListener('change', async (e) => { spriteDraft.json = e.target.files[0] ? await readFile(e.target.files[0], 'readAsText') : null; });
$('#sp-png').addEventListener('change', async (e) => { spriteDraft.png = e.target.files[0] ? await readFile(e.target.files[0], 'readAsDataURL') : null; });
$('#sp-apply').addEventListener('click', async () => {
  if (!spriteDraft.json || !spriteDraft.png) { $('#sp-status').textContent = 'Pick both the JSON and the PNG.'; return; }
  try {
    const n = await applySprites(spriteDraft);
    store.set(KEY.sprites, spriteDraft);
    $('#sp-status').textContent = `${n} sprites replaced.`;
    document.querySelectorAll('#sprite-names span').forEach((el) => el.classList.toggle('on', renderer.custom.has(el.textContent)));
    toast('Your sprites are in.');
  } catch (err) { $('#sp-status').textContent = `That did not work: ${err.message}.`; }
});
$('#sp-clear').addEventListener('click', () => {
  store.del(KEY.sprites); renderer.setCustom(null); attractR.setCustom(null); iconCache.clear();
  document.querySelectorAll('#sprite-names span').forEach((el) => el.classList.remove('on'));
  $('#sp-status').textContent = 'Using the built-in sprites.';
  if (s) updateUI();
});
async function applySprites({ json, png }) {
  const sheet = parseSheet(json);
  const image = new Image(); image.src = png; await image.decode();
  const map = new Map();
  for (const [name, i] of Object.entries(sheet.map)) {
    const f = sheet.frames[i];
    const full = document.createElement('canvas'); full.width = f.size.w; full.height = f.size.h;
    full.getContext('2d').drawImage(image, f.frame.x, f.frame.y, f.frame.w, f.frame.h, f.source.x, f.source.y, f.frame.w, f.frame.h);
    const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(full, 0, 0, SIZE, SIZE);
    map.set(name, cv);
  }
  renderer.setCustom(map); attractR.setCustom(map); iconCache.clear();
  if (s) updateUI();
  return map.size;
}

// ---------- the frame loop ----------
let lastFrame = performance.now(), attractAcc = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - lastFrame) / 1000); lastFrame = now;
  if (mode === 'title') {
    if (params.get('attract') !== '0') {
      if (!attract || (attract.over && (attractAcc += dt) > 3)) { attract = G.newGame({ seed: `attract-${randomSeed()}` }); attract.botChase = null; attractAcc = 0; attractR.reset(); }
      if (!attract.over) { attractAcc += dt; while (attractAcc > 0.12) { attractAcc -= 0.12; const ev = G.act(attract, botAction(attract)); if (!ev.length) G.act(attract, { type: 'wait' }); attractR.events(ev, attract, now); if (attract.over) break; } }
      attractR.draw(attract, now, { overlay: 0.15 });
    }
  } else if (s) {
    if (mode === 'replay') stepReplay(dt);
    renderer.draw(s, now);
  }
  requestAnimationFrame(frame);
}

// ---------- start ----------
new ResizeObserver(() => { if (mode !== 'title') renderer.resize(); }).observe($('#viewport'));
new ResizeObserver(() => { attractR.resize(); }).observe($('#title'));
saveSettings();
const savedSprites = store.get(KEY.sprites);
if (savedSprites) applySprites(savedSprites).catch(() => store.del(KEY.sprites));
document.fonts?.load('20px VT323').catch(() => {});
if (params.get('seed')) startRun({ seed: params.get('seed').toUpperCase(), mode: 'seed' });
else if (params.has('daily')) { const d = /^\d{4}-\d{2}-\d{2}$/.test(params.get('daily')) ? params.get('daily') : today(); startRun({ seed: dailySeed(d), mode: 'daily', date: d }); }
else showTitle();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && !params.has('nosw') && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// test hook
window.__fd = { get s() { return s; }, get mode() { return mode; }, get runner() { return runner; }, get replay() { return replay; }, act: doAction, G, bot: botAction, sound, renderer, startRun, updateUI, KEY };
