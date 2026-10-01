import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, hashString, seedCode, dailySeed } from '../app/js/rng.js';
import { generate, distances, canStep, W, H, T, DEPTHS, idx, blocksSight } from '../app/js/dungeon.js';
import { computeFov } from '../app/js/fov.js';
import { astar, dijkstraMap } from '../app/js/path.js';
import * as G from '../app/js/game.js';
import { MONSTERS, ITEMS, XP_LEVELS, monsterTable, itemTable, aName } from '../app/js/data.js';
import { playRun } from '../tools/balance.mjs';

const SEEDS = ['A', 'B', 'C', 'K7QX2M', 'daily-2026-10-01', 'forge', 'x', 'ZZZZZZ'];
const walkable = (t) => t !== T.WALL && t !== T.LAVA;

// A hand-drawn test room. '@' marks the player; the map is padded with wall.
function room(s, rows) {
  const tiles = new Array(W * H).fill(T.WALL);
  const CH = { '#': T.WALL, '.': T.FLOOR, '+': T.DOOR, "'": T.OPEN, '>': T.STAIRS, '~': T.LAVA, '@': T.FLOOR };
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    tiles[idx(x + 1, y + 1)] = CH[c];
    if (c === '@') { s.player.x = x + 1; s.player.y = y + 1; }
  }));
  s.map = { tiles, explored: new Array(W * H).fill(0), stairs: null, theme: 'mine', name: 'Test', arena: null };
  s.monsters = []; s.items = [];
  G.updateFov(s);
  return s;
}
const fresh = (seed = 'TEST') => G.newGame({ seed });
const OPEN_ROOM = ['...........', '...........', '.....@.....', '...........', '...........'];
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

test('rng: deterministic, in range, readable seed codes', () => {
  const a = new Rng(42), b = new Rng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  const r = new Rng(7);
  for (let i = 0; i < 1000; i++) { const n = r.int(3, 9); assert.ok(n >= 3 && n <= 9 && Number.isInteger(n)); }
  assert.equal(hashString('forge'), hashString('forge'));
  assert.notEqual(hashString('forge'), hashString('forgf'));
  const code = seedCode([0, 5, 10, 15, 20, 30]);
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(dailySeed('2026-10-01'), 'daily-2026-10-01');
  const counts = [0, 0, 0];
  for (let i = 0; i < 3000; i++) counts[r.weighted([[0, 1], [1, 2], [2, 3]])]++;
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
});

test('dungeon: every level is connected, has far stairs, and repeats for the same seed', () => {
  for (const seed of SEEDS) for (let d = 1; d <= DEPTHS; d++) {
    const L = generate(seed, d);
    const dist = distances(L.tiles, ...L.start);
    let walk = 0, reach = 0;
    L.tiles.forEach((t, i) => { if (walkable(t)) { walk++; if (dist[i] >= 0) reach++; } });
    assert.equal(reach, walk, `${seed}/${d}: every walkable tile reachable`);
    assert.ok(walk > 300, `${seed}/${d}: enough room`);
    for (let x = 0; x < W; x++) { assert.equal(L.tiles[idx(x, 0)], T.WALL); assert.equal(L.tiles[idx(x, H - 1)], T.WALL); }
    for (let y = 0; y < H; y++) { assert.equal(L.tiles[idx(0, y)], T.WALL); assert.equal(L.tiles[idx(W - 1, y)], T.WALL); }
    assert.equal(L.tiles[idx(...L.start)], T.FLOOR);
    if (d < DEPTHS) {
      assert.ok(L.stairs);
      const sd = dist[idx(...L.stairs)], max = Math.max(...dist);
      assert.ok(sd >= max * 0.85 - 1, `${seed}/${d}: stairs are far from the start`);
    } else {
      assert.equal(L.stairs, null);
      assert.ok(L.arena && L.arena.w === 15);
    }
    const lava = L.tiles.filter((t) => t === T.LAVA).length;
    if (d < 7) assert.equal(lava, 0);
    // doors sit in walls: wall on both sides along one axis
    L.tiles.forEach((t, i) => {
      if (t !== T.DOOR) return;
      const x = i % W, y = (i / W) | 0;
      const h = L.tiles[idx(x - 1, y)] === T.WALL && L.tiles[idx(x + 1, y)] === T.WALL;
      const v = L.tiles[idx(x, y - 1)] === T.WALL && L.tiles[idx(x, y + 1)] === T.WALL;
      assert.ok(h || v, `${seed}/${d}: door at ${x},${y} sits in a wall`);
    });
  }
  assert.deepEqual(generate('A', 3).tiles, generate('A', 3).tiles);
  assert.notDeepEqual(generate('A', 1).tiles, generate('B', 1).tiles);
  assert.ok([7].every((d) => SEEDS.some((s) => generate(s, d).tiles.includes(T.LAVA))), 'ember caves have lava');
});

test('movement: no cutting wall corners, no diagonal steps through doorways', () => {
  const s = room(fresh(), ['#.#', '.@.', "#'#", '...']);
  const { tiles } = s.map, { x, y } = s.player;
  assert.equal(canStep(tiles, x, y, 1, 0), true);
  assert.equal(canStep(tiles, x, y, -1, -1), false); // corner
  assert.equal(canStep(tiles, x, y, 0, 1), true);
  assert.equal(canStep(tiles, x, y + 1, 1, 1), false); // out of a doorway diagonally
  assert.equal(canStep(tiles, x, y, 5, 0), false);
});

test('fov: walls block sight, the radius is round, and sight is symmetric', () => {
  const s = room(fresh(), ['.......................', '@...#..................', '.......................']);
  const { x, y } = s.player;
  assert.ok(G.isVisible(s, x + 3, y));
  assert.ok(G.isVisible(s, x + 4, y), 'the wall itself is seen');
  assert.ok(!G.isVisible(s, x + 5, y) && !G.isVisible(s, x + 6, y), 'tiles straight behind the pillar are hidden');
  assert.ok(G.isVisible(s, x + 8, y - 1), 'off-axis tiles past the pillar are seen');
  assert.ok(!G.isVisible(s, x + 9, y), 'beyond the radius is dark');
  // symmetry on real levels
  for (const seed of SEEDS.slice(0, 4)) for (const d of [1, 3, 6]) {
    const L = generate(seed, d), rng = new Rng(hashString(seed + d));
    const opaque = (px, py) => px < 0 || py < 0 || px >= W || py >= H || blocksSight(L.tiles[idx(px, py)]);
    const floors = []; L.tiles.forEach((t, i) => { if (t === T.FLOOR) floors.push(i); });
    const fovOf = (i) => { const set = new Set(); computeFov(i % W, (i / W) | 0, G.FOV_RADIUS, opaque, (vx, vy) => set.add(idx(vx, vy))); return set; };
    for (let k = 0; k < 40; k++) {
      const a = rng.pick(floors), fa = fovOf(a);
      for (const b of fa) {
        if (L.tiles[b] !== T.FLOOR) continue;
        assert.ok(fovOf(b).has(a), `${seed}/${d}: ${a % W},${(a / W) | 0} sees ${b % W},${(b / W) | 0} but not back`);
      }
    }
  }
});

test('pathfinding: A* finds shortest paths, Dijkstra maps match breadth-first search', () => {
  for (const seed of SEEDS.slice(0, 4)) for (const d of [1, 3, 5, 7]) {
    const L = generate(seed, d), rng = new Rng(hashString(`path${seed}${d}`));
    const floors = []; L.tiles.forEach((t, i) => { if (t === T.FLOOR) floors.push(i); });
    const step = (x, y, dx, dy) => (canStep(L.tiles, x, y, dx, dy) ? 1 : Infinity);
    for (let k = 0; k < 15; k++) {
      const a = rng.pick(floors), b = rng.pick(floors);
      const bfs = distances(L.tiles, a % W, (a / W) | 0);
      const path = astar(a % W, (a / W) | 0, b % W, (b / W) | 0, step, 1e6);
      assert.ok(path, 'path exists');
      assert.equal(path.length, bfs[b], 'shortest');
      let [px, py] = [a % W, (a / W) | 0];
      for (const [nx, ny] of path) { assert.ok(canStep(L.tiles, px, py, nx - px, ny - py)); [px, py] = [nx, ny]; }
      assert.deepEqual([px, py], [b % W, (b / W) | 0]);
      // a Dijkstra map from b, walked backwards, gives the same distances as BFS from b
      const dm = dijkstraMap([b], (x, y, dx, dy) => canStep(L.tiles, x, y, dx, dy));
      const fromB = distances(L.tiles, b % W, (b / W) | 0);
      assert.equal(dm[a], fromB[a]);
    }
  }
  const s = room(fresh(), ['@.#.']);
  assert.equal(astar(s.player.x, s.player.y, s.player.x + 3, s.player.y, (x, y, dx, dy) => (canStep(s.map.tiles, x, y, dx, dy) ? 1 : Infinity)), null);
});

test('tables: every monster and item is reachable at some depth, levels need more XP', () => {
  for (let d = 1; d <= DEPTHS; d++) { assert.ok(monsterTable(d).length >= 3); assert.ok(itemTable(d).length >= 6); }
  const seenM = new Set(), seenI = new Set();
  for (let d = 1; d <= DEPTHS; d++) { monsterTable(d).forEach(([id]) => seenM.add(id)); itemTable(d).forEach(([id]) => seenI.add(id)); }
  for (const [id, m] of Object.entries(MONSTERS)) if (!m.boss) assert.ok(seenM.has(id), id);
  for (const [id, it] of Object.entries(ITEMS)) if (it.weight > 0) assert.ok(seenI.has(id), id);
  for (let i = 1; i < XP_LEVELS.length; i++) assert.ok(XP_LEVELS[i] > XP_LEVELS[i - 1]);
  assert.equal(aName('ogre'), 'an ogre');
  assert.equal(aName('Forge Warden'), 'the Forge Warden');
});

test('a new run: same seed, same run; the player starts with a dagger and a potion', () => {
  const a = G.newGame({ seed: 'SAME' }), b = G.newGame({ seed: 'SAME' }), c = G.newGame({ seed: 'OTHER' });
  assert.equal(G.stateHash(a), G.stateHash(b));
  assert.notEqual(G.stateHash(a), G.stateHash(c));
  assert.equal(a.depth, 1);
  assert.equal(a.player.weapon.id, 'dagger');
  assert.deepEqual(a.player.inv, [{ id: 'heal' }]);
  assert.ok(a.monsters.length >= 7 && a.items.length >= 8);
  assert.ok(a.monsters.every((m) => !(m.x === a.player.x && m.y === a.player.y)));
  for (const code of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '>', 'g', 'u3', 'd0']) assert.equal(G.encodeAction(G.decodeAction(code)), code);
});

test('combat: hits, kills, experience and levels', () => {
  assert.equal(G.hitChance(200, 0), 95);
  assert.equal(G.hitChance(0, 0), 5);
  assert.equal(G.hitChance(80, 2), 70);
  const s = room(fresh(), OPEN_ROOM);
  const rat = G.spawn(s, 'rat', s.player.x + 1, s.player.y);
  let swings = 0;
  while (s.monsters.includes(rat) && swings < 30) { G.act(s, { type: 'move', dx: 1, dy: 0 }); swings++; }
  assert.ok(!s.monsters.includes(rat), 'the rat dies');
  assert.equal(s.stats.kills, 1);
  assert.equal(s.player.xp, MONSTERS.rat.xp);
  assert.ok(s.log.some((l) => l.text === 'You slay the rat.'));
  G.spawn(s, 'warden', 1, 1, { asleep: true }); // far away, asleep
  s.player.xp = XP_LEVELS[0] - 1;
  const ogre = G.spawn(s, 'goblin', s.player.x + 1, s.player.y);
  ogre.hp = 1;
  const before = s.player.maxHp;
  for (let i = 0; i < 30 && s.monsters.includes(ogre); i++) G.act(s, { type: 'move', dx: 1, dy: 0 });
  assert.equal(s.player.level, 2);
  assert.equal(s.player.maxHp, before + 4);
});

test('death and victory end the run', () => {
  const s = room(fresh(), OPEN_ROOM);
  s.player.hp = 1;
  G.spawn(s, 'ogre', s.player.x + 1, s.player.y);
  for (let i = 0; i < 100 && !s.over; i++) G.act(s, { type: 'wait' });
  assert.equal(s.over.won, false);
  assert.equal(s.over.cause, 'an ogre');
  assert.equal(s.player.hp, 0);
  const turn = s.turn;
  G.act(s, { type: 'wait' });
  assert.equal(s.turn, turn, 'nothing happens after death');

  const w = room(fresh(), OPEN_ROOM);
  w.items.push({ x: w.player.x + 1, y: w.player.y, item: { id: 'heart' } });
  G.act(w, { type: 'move', dx: 1, dy: 0 });
  assert.equal(w.over.won, true);
  assert.ok(G.score(w) >= 1000);
});

test('items: potions, scrolls, weapons and armour', () => {
  const s = room(fresh(), OPEN_ROOM), p = s.player;
  p.hp = 5;
  G.act(s, { type: 'use', index: 0 });
  assert.equal(p.hp, 17);
  assert.equal(p.inv.length, 0);
  p.inv.push({ id: 'might' }, { id: 'vigor' }, { id: 'sword' }, { id: 'leather' }, { id: 'chain' });
  G.act(s, { type: 'use', index: 0 });
  assert.equal(p.might, 1);
  G.act(s, { type: 'use', index: 0 });
  assert.equal(p.maxHp, 26);
  G.act(s, { type: 'use', index: 0 });
  assert.equal(p.weapon.id, 'sword');
  assert.deepEqual(p.inv[0], { id: 'dagger' });
  assert.deepEqual(G.playerDmg(p), [3, 7]);
  G.act(s, { type: 'use', index: 1 });
  assert.equal(p.armour.id, 'leather');
  G.act(s, { type: 'use', index: 1 });
  assert.equal(p.armour.id, 'chain');
  assert.deepEqual(p.inv.map((i) => i.id), ['dagger', 'leather']);

  // fire hits what is in sight, not what hides behind a wall
  const f = room(fresh(), ['.........#...', '....@....#...', '.........#...']);
  const near = G.spawn(f, 'skeleton', f.player.x + 2, f.player.y), hidden = G.spawn(f, 'skeleton', f.player.x + 7, f.player.y);
  f.player.inv = [{ id: 'fire' }, { id: 'slumber' }];
  G.act(f, { type: 'use', index: 0 });
  assert.ok(near.hp < MONSTERS.skeleton.hp || !f.monsters.includes(near));
  assert.equal(hidden.hp, MONSTERS.skeleton.hp);
  // slumber: an adjacent monster stops attacking
  const z = room(fresh(), OPEN_ROOM);
  const ogre = G.spawn(z, 'ogre', z.player.x + 1, z.player.y);
  z.player.inv = [{ id: 'slumber' }];
  G.act(z, { type: 'use', index: 0 });
  assert.equal(ogre.slumber, 20);
  const hp = z.player.hp;
  for (let i = 0; i < 10; i++) G.act(z, { type: 'wait' });
  assert.ok(z.player.hp >= hp, 'a sleeping ogre does not attack');

  // teleport and mapping on a real level
  const t = fresh('TELE');
  const from = { x: t.player.x, y: t.player.y };
  t.player.inv = [{ id: 'teleport' }, { id: 'mapping' }];
  G.act(t, { type: 'use', index: 0 });
  assert.ok(cheb(from, t.player) >= 12);
  G.act(t, { type: 'use', index: 0 });
  t.map.tiles.forEach((tile, i) => { if (tile !== T.WALL) assert.equal(t.map.explored[i], 1); });
});

test('picking up: gold, a full pack, and dropped items stay where they are', () => {
  const s = room(fresh(), OPEN_ROOM), p = s.player;
  s.items.push({ x: p.x + 1, y: p.y, item: { id: 'gold', n: 33 } }, { x: p.x + 2, y: p.y, item: { id: 'sword' } });
  G.act(s, { type: 'move', dx: 1, dy: 0 });
  assert.equal(s.stats.gold, 33);
  p.inv = Array.from({ length: G.INV_SIZE }, () => ({ id: 'heal' }));
  G.act(s, { type: 'move', dx: 1, dy: 0 });
  assert.equal(s.items.length, 1, 'the sword stays on the floor');
  assert.match(s.log.at(-1).text, /pack is full/);
  p.inv.pop();
  G.act(s, { type: 'pickup' });
  assert.equal(p.inv.at(-1).id, 'sword');
  G.act(s, { type: 'drop', index: p.inv.length - 1 });
  assert.equal(s.items.length, 1);
  G.act(s, { type: 'move', dx: 1, dy: 0 });
  G.act(s, { type: 'move', dx: -1, dy: 0 });
  assert.equal(s.items.length, 1, 'walking over a dropped item does not pick it up');
});

test('doors open when walked into, by the player and by monsters', () => {
  const s = room(fresh(), ['.....#.....', '..@..+.....', '.....#.....']);
  for (let i = 0; i < 3; i++) G.act(s, { type: 'move', dx: 1, dy: 0 });
  assert.equal(s.map.tiles[idx(s.player.x, s.player.y)], T.OPEN);
  const m = room(fresh(), ['.....#.....', '..@..+...g.', '.....#.....'.replace('g', '.')]);
  const gob = G.spawn(m, 'goblin', 10, 2);
  gob.target = [m.player.x, m.player.y];
  for (let i = 0; i < 8; i++) G.act(m, { type: 'wait' });
  assert.equal(m.map.tiles[idx(6, 2)], T.OPEN);
  assert.ok(gob.x < 6 || m.player.hp < m.player.maxHp || cheb(gob, m.player) <= 1);
});

test('monsters: chase, shoot, flee, sleep, and the Warden calls for help', () => {
  const s = room(fresh(), ['...............', '.@.............', '...............']);
  const gob = G.spawn(s, 'goblin', s.player.x + 8, s.player.y);
  const d0 = cheb(gob, s.player);
  G.act(s, { type: 'wait' }); G.act(s, { type: 'wait' });
  assert.ok(cheb(gob, s.player) < d0, 'a goblin that sees you comes closer');

  const a = room(fresh(), ['...............', '.@.............', '...............']);
  G.spawn(a, 'archer', a.player.x + 5, a.player.y);
  let shots = 0;
  for (let i = 0; i < 10; i++) shots += G.act(a, { type: 'wait' }).filter((e) => e.t === 'shot').length;
  assert.ok(shots >= 2, 'an archer in range shoots');

  const f = room(fresh(), OPEN_ROOM);
  const coward = G.spawn(f, 'goblin', f.player.x + 1, f.player.y);
  coward.hp = 2;
  G.act(f, { type: 'wait' });
  assert.ok(cheb(coward, f.player) >= 2, 'a badly hurt goblin runs');
  assert.ok(f.log.some((l) => /turns to flee/.test(l.text)));

  const z = room(fresh(), ['...........#.....', '.@.........#.....', '...........#.....']);
  const sleeper = G.spawn(z, 'rat', 15, 2, { asleep: true });
  for (let i = 0; i < 10; i++) G.act(z, { type: 'wait' });
  assert.deepEqual([sleeper.x, sleeper.y], [15, 2], 'an unseen sleeper stays put');

  const b = room(fresh(), OPEN_ROOM);
  const warden = G.spawn(b, 'warden', b.player.x + 3, b.player.y);
  warden.hp = 40;
  G.act(b, { type: 'wait' });
  assert.equal(b.monsters.filter((m) => m.id === 'imp').length, 2);
});

test('auto-explore uncovers the level, and travel walks to a known tile', () => {
  const s = fresh('EXPLORE');
  s.monsters = [];
  let steps = 0;
  for (let a; steps < 4000 && (a = G.exploreStep(s)); steps++) G.act(s, a);
  assert.ok(steps < 4000);
  const dist = distances(s.map.tiles, s.player.x, s.player.y);
  s.map.tiles.forEach((t, i) => { if (dist[i] >= 0) assert.equal(s.map.explored[i], 1, `tile ${i % W},${(i / W) | 0} explored`); });
  assert.equal(s.items.filter((it) => it.item.id === 'gold').length, 0, 'all gold collected');
  for (let a, n = 0; n < 500 && (a = G.travelStep(s, ...s.map.stairs)); n++) G.act(s, a);
  assert.ok(G.onStairs(s));
  G.act(s, { type: 'descend' });
  assert.equal(s.depth, 2);
});

test('save and load: a restored run continues exactly like the original', () => {
  const full = playRun('SAVE-1', 400);
  delete full.botChase;
  const actions = full.actions;
  const half = G.replay({ seed: 'SAVE-1', actions }, 200);
  const restored = G.deserialize(G.serialize(half));
  for (let i = 200; i < actions.length; i++) G.act(restored, G.decodeAction(actions[i]));
  assert.equal(G.stateHash(restored), G.stateHash(G.replay({ seed: 'SAVE-1', actions })));
});

test('replays: a whole run replays to the identical final state', () => {
  for (const seed of ['REPLAY-1', 'REPLAY-2']) {
    const run = playRun(seed);
    delete run.botChase;
    const again = G.replay({ seed, actions: run.actions });
    assert.equal(G.stateHash(again), G.stateHash(run), seed);
    assert.deepEqual(again.over, run.over);
  }
});

test('balance smoke: the bot gets past the first depths and nothing throws', () => {
  let depth = 0;
  for (let r = 0; r < 8; r++) depth += playRun(`smoke-${r}`, 6000).stats.maxDepth;
  assert.ok(depth / 8 >= 2.5, `average depth ${depth / 8}`);
});
