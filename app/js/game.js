// The rules. A run is a plain object; act(state, action) advances it by one player action and returns
// events for the screen (hits, shots, deaths...). Nothing here touches the DOM or Math.random, so a
// seed and the list of actions replay a run exactly.
import { Rng, hashString } from './rng.js';
import { generate, W, H, T, DEPTHS, DIRS, idx, inBounds, canStep, blocksSight, blocksMove } from './dungeon.js';
import { computeFov } from './fov.js';
import { astar, dijkstraMap } from './path.js';
import { MONSTERS, ITEMS, XP_LEVELS, monsterTable, itemTable, aName, theName, cap, itemName } from './data.js';

export const FOV_RADIUS = 8;
export const INV_SIZE = 10;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hitChance = (acc, def) => clamp(acc - def * 5, 5, 95);

export function newGame({ seed, mode = 'random', date = null } = {}) {
  const s = {
    v: 1, seed: String(seed), mode, date, depth: 0, turn: 0, nextId: 1,
    rng: new Rng(hashString(`${seed}:play`)),
    player: { x: 0, y: 0, hp: 20, maxHp: 20, level: 1, xp: 0, might: 0, regen: 0, weapon: { id: 'dagger' }, armour: null, inv: [{ id: 'heal' }] },
    map: null, monsters: [], items: [], log: [], actions: [],
    stats: { kills: 0, gold: 0, maxDepth: 1, xp: 0 },
    over: null, visible: null,
  };
  enterDepth(s, 1, []);
  return s;
}

// ---------- helpers ----------
export const monsterAt = (s, x, y) => s.monsters.find((m) => m.x === x && m.y === y);
export const itemAt = (s, x, y) => s.items.find((it) => it.x === x && it.y === y);
export const playerAcc = (p) => 80 + ITEMS[p.weapon.id].acc + 2 * (p.level - 1);
export const playerDef = (p) => (p.armour ? ITEMS[p.armour.id].def : 0);
export function playerDmg(p) {
  const w = ITEMS[p.weapon.id], bonus = p.might + Math.floor((p.level - 1) / 3);
  return [w.dmg[0] + bonus, w.dmg[1] + bonus];
}
export const score = (s) => s.stats.gold + s.stats.xp * 2 + (s.stats.maxDepth - 1) * 100 + (s.over?.won ? 1000 : 0);
export const onStairs = (s) => s.map.tiles[idx(s.player.x, s.player.y)] === T.STAIRS;
export const isVisible = (s, x, y) => s.visible[idx(x, y)] === 1;
export const awake = (m) => !m.asleep && !(m.slumber > 0);
export const threats = (s) => s.monsters.filter((m) => isVisible(s, m.x, m.y) && awake(m));

function msg(s, text, kind = 'info') {
  s.log.push({ text, kind, turn: s.turn });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

export function updateFov(s) {
  const { tiles, explored } = s.map, vis = new Uint8Array(W * H);
  computeFov(s.player.x, s.player.y, FOV_RADIUS, (x, y) => !inBounds(x, y) || blocksSight(tiles[idx(x, y)]), (x, y) => {
    if (!inBounds(x, y)) return;
    const i = idx(x, y); vis[i] = 1; explored[i] = 1;
  });
  s.visible = vis;
}

function noticeMonsters(s, ev) {
  for (const m of s.monsters) {
    if (m.seen || !isVisible(s, m.x, m.y)) continue;
    m.seen = true;
    msg(s, `You see ${aName(MONSTERS[m.id].name)}${m.asleep ? ', asleep' : ''}.`, MONSTERS[m.id].boss ? 'bad' : 'info');
    ev.push({ t: 'spot', uid: m.uid });
  }
}

// Put a monster on the map without touching any random generator (used by tests and the boss summon).
export function spawn(s, id, x, y, { asleep = false } = {}) {
  const m = { uid: s.nextId++, id, x, y, hp: MONSTERS[id].hp, maxHp: MONSTERS[id].hp, energy: 0, asleep, slumber: 0, target: null, goal: null, seen: false };
  s.monsters.push(m);
  return m;
}

// ---------- levels ----------
function makeMonster(s, id, x, y, rng, asleep) {
  const def = MONSTERS[id];
  return { uid: s.nextId++, id, x, y, hp: def.hp, maxHp: def.hp, energy: rng.int(0, 99), asleep, slumber: 0, target: null, goal: null, seen: false };
}

function populate(s, lvl) {
  const rng = new Rng(hashString(`${s.seed}:pop:${s.depth}`));
  const { tiles } = s.map, depth = s.depth;
  const floors = [];
  for (let i = 0; i < W * H; i++) if (tiles[i] === T.FLOOR) floors.push(i);
  const free = (i) => !s.monsters.some((m) => idx(m.x, m.y) === i) && i !== idx(s.player.x, s.player.y);
  if (lvl.arena) {
    const a = lvl.arena;
    s.monsters.push(makeMonster(s, 'warden', a.x + (a.w >> 1), a.y + (a.h >> 1), rng, true));
  }
  const spots = floors.filter((i) => lvl.dist[i] >= 8);
  const count = Math.round(6 + depth * 1.6) + rng.int(0, 2);
  for (let n = 0; n < count; n++) {
    const i = rng.pick(spots);
    if (!free(i)) continue;
    s.monsters.push(makeMonster(s, rng.weighted(monsterTable(depth)), i % W, (i / W) | 0, rng, rng.chance(0.4)));
  }
  const itemSpots = floors.filter((i) => lvl.dist[i] >= 2);
  const place = (item) => {
    for (let tries = 0; tries < 20; tries++) {
      const i = rng.pick(itemSpots);
      if (s.items.some((it) => idx(it.x, it.y) === i)) continue;
      s.items.push({ x: i % W, y: (i / W) | 0, item });
      return;
    }
  };
  for (let n = rng.int(5, 7); n > 0; n--) place({ id: rng.weighted(itemTable(depth)) });
  for (let n = rng.int(3, 5); n > 0; n--) place({ id: 'gold', n: rng.int(4, 10) * depth + rng.int(0, 5) });
}

function enterDepth(s, depth, ev) {
  const lvl = generate(s.seed, depth);
  s.depth = depth;
  s.stats.maxDepth = Math.max(s.stats.maxDepth, depth);
  s.map = { tiles: lvl.tiles, explored: new Array(W * H).fill(0), stairs: lvl.stairs, theme: lvl.theme.key, name: lvl.theme.name, arena: lvl.arena };
  [s.player.x, s.player.y] = lvl.start;
  s.monsters = []; s.items = [];
  populate(s, lvl);
  updateFov(s);
  if (depth === 1) msg(s, 'You climb down into the Old Mine. Somewhere below, the Ember Heart still burns.', 'story');
  else if (depth === DEPTHS) msg(s, 'Depth 8: The Heart Forge. The air shimmers with heat. Something huge is breathing.', 'story');
  else msg(s, `You descend to depth ${depth}: ${lvl.theme.name}.`, 'story');
  noticeMonsters(s, ev);
}

// ---------- combat ----------
function gainXp(s, n, ev) {
  const p = s.player;
  p.xp += n; s.stats.xp += n;
  while (p.level <= XP_LEVELS.length && p.xp >= XP_LEVELS[p.level - 1]) {
    p.level++; p.maxHp += 4; p.hp += 4;
    msg(s, `You reach level ${p.level}! (+4 max HP${(p.level - 1) % 3 === 0 ? ', +1 damage' : ''})`, 'good');
    ev.push({ t: 'levelup', level: p.level });
  }
}

function killMonster(s, m, ev) {
  const def = MONSTERS[m.id];
  s.monsters.splice(s.monsters.indexOf(m), 1);
  s.stats.kills++;
  ev.push({ t: 'die', x: m.x, y: m.y, id: m.id });
  if (def.boss) {
    msg(s, 'The Forge Warden crashes down. The Ember Heart rolls free.', 'good');
    const old = itemAt(s, m.x, m.y);
    if (old) s.items.splice(s.items.indexOf(old), 1);
    s.items.push({ x: m.x, y: m.y, item: { id: 'heart' } });
  } else if (!itemAt(s, m.x, m.y) && s.rng.chance(0.15)) {
    s.items.push({ x: m.x, y: m.y, item: { id: 'gold', n: s.rng.int(2, 6) * s.depth } });
  }
  gainXp(s, def.xp, ev);
}

function damageMonster(s, m, dmg, ev, text) {
  m.hp -= dmg;
  ev.push({ t: 'hit', x: m.x, y: m.y, dmg, crit: text === 'crit' });
  const the = theName(MONSTERS[m.id].name);
  if (m.hp <= 0) { msg(s, `You ${text === 'burn' ? 'burn' : 'slay'} ${the}${text === 'burn' ? ' to ash' : ''}.`, 'good'); killMonster(s, m, ev); }
  else if (text === 'crit') msg(s, `You strike ${the} hard!`);
  else if (text === 'hit') msg(s, `You hit ${the}.`);
}

function playerAttack(s, m, ev) {
  const p = s.player, def = MONSTERS[m.id];
  if (m.asleep || m.slumber > 0) m.target = [p.x, p.y];
  m.asleep = false; m.slumber = 0;
  if (s.rng.int(1, 100) > hitChance(playerAcc(p), def.def)) {
    msg(s, `You miss ${theName(def.name)}.`);
    ev.push({ t: 'miss', x: m.x, y: m.y });
    return;
  }
  const [lo, hi] = playerDmg(p);
  let dmg = s.rng.int(lo, hi);
  const crit = s.rng.chance(0.08);
  if (crit) dmg *= 2;
  damageMonster(s, m, dmg, ev, crit ? 'crit' : 'hit');
}

function monsterAttack(s, m, ev, ranged = false) {
  const def = MONSTERS[m.id], p = s.player, armour = playerDef(p);
  const name = cap(theName(def.name));
  if (ranged) ev.push({ t: 'shot', from: [m.x, m.y], to: [p.x, p.y], kind: def.ranged.kind });
  if (s.rng.int(1, 100) > hitChance(def.acc, armour)) {
    msg(s, ranged ? (def.ranged.kind === 'fire' ? `${name}'s fire bolt flies wide.` : `${name}'s arrow misses.`) : `${name} misses you.`);
    ev.push({ t: 'miss', x: p.x, y: p.y, player: true, from: [m.x, m.y], ranged });
    return;
  }
  const [lo, hi] = ranged ? def.ranged.dmg : def.dmg;
  const dmg = Math.max(1, s.rng.int(lo, hi) - Math.floor(armour / 3));
  p.hp -= dmg;
  ev.push({ t: 'hurt', x: p.x, y: p.y, dmg, from: [m.x, m.y], ranged });
  msg(s, ranged ? (def.ranged.kind === 'fire' ? `${name} hurls fire at you.` : `${name} shoots you.`) : `${name} hits you.`, 'bad');
  if (p.hp <= 0) {
    p.hp = 0;
    s.over = { won: false, cause: aName(def.name), turn: s.turn };
    msg(s, `You die on depth ${s.depth}, slain by ${aName(def.name)}.`, 'bad');
    ev.push({ t: 'death' });
  }
}

// ---------- monster movement ----------
function moveMonster(s, m, x, y, ev) {
  const i = idx(x, y);
  if (s.map.tiles[i] === T.DOOR) { s.map.tiles[i] = T.OPEN; ev.push({ t: 'door', x, y }); }
  m.x = x; m.y = y;
}
const freeFor = (s, m, x, y) => !(x === s.player.x && y === s.player.y) && !s.monsters.some((o) => o !== m && o.x === x && o.y === y);

function stepToward(s, m, tx, ty, ev) {
  const { tiles } = s.map, p = s.player;
  const path = astar(m.x, m.y, tx, ty, (x, y, dx, dy) => {
    if (!canStep(tiles, x, y, dx, dy)) return Infinity;
    const nx = x + dx, ny = y + dy;
    if (nx === p.x && ny === p.y && !(nx === tx && ny === ty)) return Infinity;
    return s.monsters.some((o) => o !== m && o.x === nx && o.y === ny) ? 6 : 1;
  }, 1500);
  if (!path || !path.length) return false;
  let [nx, ny] = path[0];
  if (!freeFor(s, m, nx, ny)) {
    // blocked by another monster: take any free step that still gets closer, or hold
    const here = Math.max(Math.abs(m.x - tx), Math.abs(m.y - ty));
    const alt = DIRS.find(([dx, dy]) => canStep(tiles, m.x, m.y, dx, dy) && freeFor(s, m, m.x + dx, m.y + dy) && Math.max(Math.abs(m.x + dx - tx), Math.abs(m.y + dy - ty)) < here);
    if (!alt) return true;
    [nx, ny] = [m.x + alt[0], m.y + alt[1]];
  }
  moveMonster(s, m, nx, ny, ev);
  return true;
}

function stepAway(s, m, ev) {
  const { tiles } = s.map, p = s.player;
  const score2 = (x, y) => Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) * 100 + (x - p.x) ** 2 + (y - p.y) ** 2;
  let best = null, bestScore = score2(m.x, m.y);
  for (const [dx, dy] of DIRS) {
    if (!canStep(tiles, m.x, m.y, dx, dy) || !freeFor(s, m, m.x + dx, m.y + dy)) continue;
    const sc = score2(m.x + dx, m.y + dy);
    if (sc > bestScore) { best = [m.x + dx, m.y + dy]; bestScore = sc; }
  }
  if (!best) return false;
  moveMonster(s, m, best[0], best[1], ev);
  return true;
}

function randomStep(s, m, ev) {
  const dirs = s.rng.shuffle(DIRS.slice());
  const d = dirs.find(([dx, dy]) => canStep(s.map.tiles, m.x, m.y, dx, dy) && freeFor(s, m, m.x + dx, m.y + dy));
  if (d) moveMonster(s, m, m.x + d[0], m.y + d[1], ev);
}

function randomFloor(s) {
  for (let tries = 0; tries < 50; tries++) {
    const i = s.rng.int(0, W * H - 1);
    if (s.map.tiles[i] === T.FLOOR) return [i % W, (i / W) | 0];
  }
  return null;
}

function summon(s, m, ev) {
  let n = 0;
  for (const [dx, dy] of DIRS) {
    if (n === 2) break;
    const x = m.x + dx, y = m.y + dy;
    if (!canStep(s.map.tiles, m.x, m.y, dx, dy) || !freeFor(s, null, x, y)) continue;
    const imp = makeMonster(s, 'imp', x, y, s.rng, false);
    imp.target = [s.player.x, s.player.y]; imp.seen = true;
    s.monsters.push(imp); n++;
    ev.push({ t: 'summon', x, y });
  }
}

function monsterAct(s, m, ev) {
  const def = MONSTERS[m.id], p = s.player, { tiles } = s.map;
  const name = cap(theName(def.name));
  if (m.slumber > 0) { m.slumber--; return; }
  const sees = isVisible(s, m.x, m.y);
  const d = cheb(m, p);
  if (m.asleep) {
    if (sees && (def.boss || s.rng.chance(d <= 2 ? 0.5 : 0.15))) {
      m.asleep = false; m.target = [p.x, p.y];
      if (def.boss) msg(s, 'The Forge Warden wakes, and the forge roars with it!', 'bad');
      else msg(s, `${name} notices you.`);
      ev.push({ t: 'wake', uid: m.uid });
    }
    return;
  }
  if (sees) { m.target = [p.x, p.y]; m.route = null; }
  if (def.boss && !m.summoned && m.hp <= m.maxHp / 2) {
    m.summoned = true;
    msg(s, 'The Forge Warden calls fire imps out of the coals!', 'bad');
    summon(s, m, ev);
    return;
  }
  // cowards run for a few turns when badly hurt, then fight to the end
  if (def.flees && !m.fled && m.hp <= def.hp * def.flees) { m.fled = true; m.fear = 8; if (sees) msg(s, `${name} turns to flee.`); }
  if (m.fear > 0) { m.fear--; if (stepAway(s, m, ev)) return; }
  if (def.erratic && s.rng.chance(def.erratic)) { randomStep(s, m, ev); return; }
  if (def.kite && sees && d === 1 && s.rng.chance(0.4) && stepAway(s, m, ev)) return;
  if (d === 1 && canStep(tiles, m.x, m.y, p.x - m.x, p.y - m.y)) { monsterAttack(s, m, ev); return; }
  if (def.ranged && sees && d <= def.ranged.range && s.rng.chance(def.ranged.rate)) { monsterAttack(s, m, ev, true); return; }
  if (m.target) {
    if (m.x === m.target[0] && m.y === m.target[1]) m.target = null; // lost the trail
    else if (stepToward(s, m, m.target[0], m.target[1], ev)) return;
    else { m.target = null; return; }
  }
  // wander the level along a cached path; recompute only when something is in the way
  if (!m.goal || (m.x === m.goal[0] && m.y === m.goal[1])) { m.goal = randomFloor(s); m.route = null; }
  if (!m.goal) return;
  if (!m.route?.length) {
    m.route = astar(m.x, m.y, m.goal[0], m.goal[1], (x, y, dx, dy) => (canStep(tiles, x, y, dx, dy) ? 1 : Infinity), 2500);
    if (!m.route?.length) { m.goal = null; m.route = null; return; }
  }
  const [nx, ny] = m.route[0];
  if (Math.max(Math.abs(nx - m.x), Math.abs(ny - m.y)) === 1 && canStep(tiles, m.x, m.y, nx - m.x, ny - m.y) && freeFor(s, m, nx, ny)) { m.route.shift(); moveMonster(s, m, nx, ny, ev); }
  else m.route = null;
}

function endTurn(s, ev) {
  const p = s.player;
  if (++p.regen >= Math.max(3, 9 - (p.level >> 1))) { p.regen = 0; if (p.hp < p.maxHp) p.hp++; }
  updateFov(s);
  for (const m of s.monsters.slice()) {
    if (!s.monsters.includes(m)) continue;
    m.energy += MONSTERS[m.id].speed;
    while (m.energy >= 100 && !s.over) { m.energy -= 100; monsterAct(s, m, ev); }
    if (s.over) break;
  }
  updateFov(s);
  noticeMonsters(s, ev);
}

// ---------- player actions ----------
function pickup(s, ev, explicit) {
  const p = s.player, it = itemAt(s, p.x, p.y);
  if (!it) { if (explicit) msg(s, 'There is nothing here.'); return false; }
  const { item } = it;
  if (item.id === 'gold') {
    s.stats.gold += item.n; s.items.splice(s.items.indexOf(it), 1);
    msg(s, `You pick up ${item.n} gold.`, 'gold'); ev.push({ t: 'pickup', id: 'gold' });
    return true;
  }
  if (item.id === 'heart') {
    s.items.splice(s.items.indexOf(it), 1);
    s.over = { won: true, turn: s.turn };
    msg(s, 'You lift the Ember Heart. The forge falls silent. You win!', 'good');
    ev.push({ t: 'win' });
    return true;
  }
  if (it.dropped && !explicit) { msg(s, `There is ${aName(itemName(item))} here.`); return false; }
  if (p.inv.length >= INV_SIZE) { msg(s, `Your pack is full. There is ${aName(itemName(item))} here.`); return false; }
  p.inv.push(item); s.items.splice(s.items.indexOf(it), 1);
  msg(s, `You pick up ${aName(itemName(item))}.`); ev.push({ t: 'pickup', id: item.id });
  return true;
}

function playerMove(s, dx, dy, ev) {
  const p = s.player, { tiles } = s.map, nx = p.x + dx, ny = p.y + dy;
  if (!inBounds(nx, ny)) return false;
  const t = tiles[idx(nx, ny)];
  if (!canStep(tiles, p.x, p.y, dx, dy)) {
    if (t === T.LAVA) msg(s, 'That is molten lava. Better not.');
    else if (!blocksMove(t)) msg(s, 'You cannot squeeze past diagonally there.');
    return false;
  }
  const m = monsterAt(s, nx, ny);
  if (m) { playerAttack(s, m, ev); return true; }
  if (t === T.DOOR) { tiles[idx(nx, ny)] = T.OPEN; ev.push({ t: 'door', x: nx, y: ny }); }
  p.x = nx; p.y = ny;
  ev.push({ t: 'step' });
  pickup(s, ev, false);
  if (t === T.STAIRS) msg(s, 'Stairs lead further down. Press > to descend.', 'hint');
  return true;
}

function useItem(s, i, ev) {
  const p = s.player, item = p.inv[i];
  if (!item) return false;
  const def = ITEMS[item.id];
  const inSight = () => s.monsters.filter((m) => isVisible(s, m.x, m.y));
  if (def.kind === 'weapon') {
    p.inv[i] = p.weapon; p.weapon = item;
    msg(s, `You wield the ${def.name}.`);
  } else if (def.kind === 'armour') {
    if (p.armour) p.inv[i] = p.armour; else p.inv.splice(i, 1);
    p.armour = item;
    msg(s, `You put on the ${def.name}.`);
  } else {
    p.inv.splice(i, 1);
    if (item.id === 'heal') {
      const n = Math.min(p.maxHp - p.hp, Math.max(12, Math.round(p.maxHp * 0.4)));
      p.hp += n; msg(s, `You drink the potion of healing. (+${n} HP)`, 'good'); ev.push({ t: 'heal', x: p.x, y: p.y, n });
    } else if (item.id === 'might') {
      p.might++; msg(s, 'Strength floods your arms. (+1 damage)', 'good'); ev.push({ t: 'buff' });
    } else if (item.id === 'vigor') {
      p.maxHp += 6; p.hp += 6; msg(s, 'You feel hardier. (+6 max HP)', 'good'); ev.push({ t: 'buff' });
    } else if (item.id === 'teleport') {
      const spots = [];
      for (let j = 0; j < W * H; j++) {
        const x = j % W, y = (j / W) | 0;
        if (s.map.tiles[j] === T.FLOOR && Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) >= 12 && !monsterAt(s, x, y)) spots.push(j);
      }
      if (spots.length) {
        const j = s.rng.pick(spots), from = [p.x, p.y];
        p.x = j % W; p.y = (j / W) | 0;
        ev.push({ t: 'teleport', from, to: [p.x, p.y] });
        updateFov(s);
      }
      msg(s, 'The world lurches. You are somewhere else.', 'magic');
    } else if (item.id === 'mapping') {
      const { tiles, explored } = s.map;
      for (let j = 0; j < W * H; j++) {
        if (tiles[j] !== T.WALL) { explored[j] = 1; continue; }
        const x = j % W, y = (j / W) | 0;
        if (DIRS.some(([dx, dy]) => inBounds(x + dx, y + dy) && tiles[idx(x + dx, y + dy)] !== T.WALL)) explored[j] = 1;
      }
      msg(s, 'The layout of the level unfolds in your mind.', 'magic'); ev.push({ t: 'mapping' });
    } else if (item.id === 'fire') {
      const targets = inSight();
      ev.push({ t: 'fire', cells: targets.map((m) => [m.x, m.y]) });
      msg(s, targets.length ? 'Flames roar out of the scroll!' : 'Flames roar around you, but nothing is in sight.', 'magic');
      for (const m of targets) { m.asleep = false; m.slumber = 0; m.target = [p.x, p.y]; damageMonster(s, m, s.rng.int(8, 14), ev, 'burn'); }
    } else if (item.id === 'slumber') {
      const targets = inSight();
      for (const m of targets) m.slumber = MONSTERS[m.id].boss ? 6 : 20;
      ev.push({ t: 'slumber', cells: targets.map((m) => [m.x, m.y]) });
      msg(s, targets.length ? `A drowsy hush falls. ${targets.length === 1 ? 'One monster sleeps' : `${targets.length} monsters sleep`}.` : 'A drowsy hush falls, but nothing is in sight.', 'magic');
    }
  }
  ev.push({ t: 'use', id: item.id });
  return true;
}

function dropItem(s, i, ev) {
  const p = s.player, item = p.inv[i];
  if (!item) return false;
  if (itemAt(s, p.x, p.y)) { msg(s, 'There is already something here.'); return false; }
  p.inv.splice(i, 1);
  s.items.push({ x: p.x, y: p.y, item, dropped: true });
  msg(s, `You drop the ${itemName(item)}.`); ev.push({ t: 'drop' });
  return true;
}

// ---------- actions ----------
const NUMPAD = { '-1,1': '1', '0,1': '2', '1,1': '3', '-1,0': '4', '1,0': '6', '-1,-1': '7', '0,-1': '8', '1,-1': '9' };
const FROM_NUMPAD = Object.fromEntries(Object.entries(NUMPAD).map(([k, v]) => [v, k.split(',').map(Number)]));
export function encodeAction(a) {
  if (a.type === 'move') return NUMPAD[`${a.dx},${a.dy}`];
  if (a.type === 'wait') return '5';
  if (a.type === 'descend') return '>';
  if (a.type === 'pickup') return 'g';
  if (a.type === 'use') return `u${a.index}`;
  if (a.type === 'drop') return `d${a.index}`;
  throw new Error(`unknown action ${a.type}`);
}
export function decodeAction(code) {
  if (FROM_NUMPAD[code]) { const [dx, dy] = FROM_NUMPAD[code]; return { type: 'move', dx, dy }; }
  if (code === '5') return { type: 'wait' };
  if (code === '>') return { type: 'descend' };
  if (code === 'g') return { type: 'pickup' };
  if (code[0] === 'u') return { type: 'use', index: Number(code.slice(1)) };
  if (code[0] === 'd') return { type: 'drop', index: Number(code.slice(1)) };
  throw new Error(`unknown action ${code}`);
}

export function act(s, a) {
  const ev = [];
  if (s.over) return ev;
  let took = false;
  if (a.type === 'move') took = playerMove(s, a.dx, a.dy, ev);
  else if (a.type === 'wait') took = true;
  else if (a.type === 'pickup') took = pickup(s, ev, true);
  else if (a.type === 'use') took = useItem(s, a.index, ev);
  else if (a.type === 'drop') took = dropItem(s, a.index, ev);
  else if (a.type === 'descend') {
    if (!onStairs(s)) { msg(s, 'There are no stairs here.'); return ev; }
    s.actions.push('>'); s.turn++;
    enterDepth(s, s.depth + 1, ev);
    ev.push({ t: 'descend', depth: s.depth });
    return ev;
  }
  if (!took) return ev;
  s.actions.push(encodeAction(a)); s.turn++;
  if (!s.over) endTurn(s, ev);
  return ev;
}

// ---------- planning helpers for auto-explore and click-to-travel ----------
// Next step towards the nearest unexplored edge or item worth picking up; null when there is none.
export function exploreStep(s) {
  const { tiles, explored } = s.map, p = s.player;
  const sources = [];
  for (const it of s.items) {
    if (it.dropped || !explored[idx(it.x, it.y)]) continue;
    if (it.item.id === 'gold' || it.item.id === 'heart' || p.inv.length < INV_SIZE) sources.push(idx(it.x, it.y));
  }
  // frontier: explored walkable tiles next to an unexplored one (the map border is always wall)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!explored[i] || blocksMove(tiles[i])) continue;
    if (!explored[i - 1] || !explored[i + 1] || !explored[i - W] || !explored[i + W] || !explored[i - W - 1] || !explored[i - W + 1] || !explored[i + W - 1] || !explored[i + W + 1]) sources.push(i);
  }
  const dist = dijkstraMap(sources, (x, y, dx, dy) => canStep(tiles, x, y, dx, dy) && explored[idx(x + dx, y + dy)] === 1);
  const here = dist[idx(p.x, p.y)];
  if (here <= 0) return null;
  for (const [dx, dy] of DIRS) {
    const nx = p.x + dx, ny = p.y + dy;
    if (canStep(tiles, p.x, p.y, dx, dy) && dist[idx(nx, ny)] === here - 1 && !monsterAt(s, nx, ny)) return { type: 'move', dx, dy };
  }
  return null;
}

// Next step on the shortest known path to (tx, ty); null if there is none.
export function travelStep(s, tx, ty) {
  const { tiles, explored } = s.map, p = s.player;
  if (!inBounds(tx, ty) || !explored[idx(tx, ty)]) return null;
  const path = astar(p.x, p.y, tx, ty, (x, y, dx, dy) => {
    const nx = x + dx, ny = y + dy;
    if (!canStep(tiles, x, y, dx, dy) || !explored[idx(nx, ny)]) return Infinity;
    return monsterAt(s, nx, ny) && !(nx === tx && ny === ty) ? Infinity : 1;
  });
  if (!path || !path.length) return null;
  return { type: 'move', dx: path[0][0] - p.x, dy: path[0][1] - p.y };
}

// ---------- saving and replays ----------
export function serialize(s) {
  const { visible, rng, map, ...rest } = s;
  return JSON.stringify({ ...rest, rng: rng.s, map: { ...map, tiles: map.tiles.join(''), explored: map.explored.join('') } });
}
export function deserialize(str) {
  const o = JSON.parse(str);
  if (o.v !== 1) throw new Error('unknown save version');
  o.rng = new Rng(o.rng);
  o.map.tiles = Array.from(o.map.tiles, Number);
  o.map.explored = Array.from(o.map.explored, Number);
  updateFov(o);
  return o;
}
export function replay({ seed, mode, date, actions }, upTo = actions.length) {
  const s = newGame({ seed, mode, date });
  for (let i = 0; i < upTo; i++) act(s, decodeAction(actions[i]));
  return s;
}
// Hash of everything that matters for play. The message log is left out: bumping into a wall writes
// a message but takes no turn, so it is not recorded and a replay does not repeat it.
export const stateHash = (s) => hashString(serialize({ ...s, log: [] }));
export { W, H, T, DEPTHS, idx };
