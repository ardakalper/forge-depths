// Level generation. A level depends only on (seed, depth), never on what the player did, so
// everyone on the same daily seed walks the same dungeon.
//
//  rooms  — rooms placed without overlap, joined by a minimum spanning tree of L-shaped corridors
//           plus a few extra links so the map has loops, with doors where corridors meet rooms
//  caves  — cellular automaton (4-5 rule), only the largest connected cave is kept
//  forge  — lava pools added afterwards, each one rejected if it would cut the level in two
import { Rng, hashString } from './rng.js';

export const W = 64, H = 40;
export const DEPTHS = 8;
export const T = { WALL: 0, FLOOR: 1, DOOR: 2, OPEN: 3, STAIRS: 4, LAVA: 5 };
export const idx = (x, y) => y * W + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const blocksSight = (t) => t === T.WALL || t === T.DOOR;
export const blocksMove = (t) => t === T.WALL || t === T.LAVA;
const isDoor = (t) => t === T.DOOR || t === T.OPEN;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

export const THEMES = [
  null,
  { key: 'mine', name: 'The Old Mine', gen: 'rooms' },
  { key: 'mine', name: 'The Old Mine', gen: 'rooms' },
  { key: 'cave', name: 'Glowing Caves', gen: 'caves' },
  { key: 'halls', name: 'Sunken Halls', gen: 'rooms' },
  { key: 'halls', name: 'Sunken Halls', gen: 'rooms' },
  { key: 'crypt', name: 'Bone Crypt', gen: 'rooms' },
  { key: 'ember', name: 'Ember Caves', gen: 'caves', lava: 3 },
  { key: 'forge', name: 'The Heart Forge', gen: 'rooms', lava: 2, arena: true },
];

// One step from (x, y) by (dx, dy). Diagonal steps may not cut a wall corner or pass through a
// doorway, which makes corridors and doors worth fighting in. The same rule applies to attacks.
export function canStep(tiles, x, y, dx, dy) {
  const nx = x + dx, ny = y + dy;
  if (!inBounds(nx, ny)) return false;
  const t = tiles[idx(nx, ny)];
  if (blocksMove(t)) return false;
  if (dx && dy) {
    if (tiles[idx(nx, y)] === T.WALL || tiles[idx(x, ny)] === T.WALL) return false;
    if (isDoor(t) || isDoor(tiles[idx(x, y)])) return false;
  }
  return true;
}

// Breadth-first distances over walkable tiles (diagonal rule included); -1 = unreachable
export function distances(tiles, sx, sy) {
  const dist = new Int32Array(W * H).fill(-1), queue = [idx(sx, sy)];
  dist[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of DIRS) {
      if (!canStep(tiles, x, y, dx, dy)) continue;
      const j = idx(x + dx, y + dy);
      if (dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); }
    }
  }
  return dist;
}

const walkable = (t) => !blocksMove(t);
const countWalkable = (tiles) => tiles.reduce((n, t) => n + (walkable(t) ? 1 : 0), 0);

function carveRoom(tiles, r) { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[idx(x, y)] = T.FLOOR; }
const centre = (r) => [r.x + (r.w >> 1), r.y + (r.h >> 1)];

function carveCorridor(tiles, rng, [ax, ay], [bx, by]) {
  const horizontalFirst = rng.chance(0.5);
  const h = (y, x0, x1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) tiles[idx(x, y)] = T.FLOOR; };
  const v = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) tiles[idx(x, y)] = T.FLOOR; };
  if (horizontalFirst) { h(ay, ax, bx); v(bx, ay, by); } else { v(ax, ay, by); h(by, ax, bx); }
}

function placeRooms(rng, want, first = null) {
  const rooms = first ? [first] : [];
  for (let tries = 0; tries < 600 && rooms.length < want; tries++) {
    const w = rng.int(5, 11), h = rng.int(4, 7);
    const x = rng.int(2, W - w - 2), y = rng.int(2, H - h - 2);
    // keep at least two tiles of wall between rooms
    if (rooms.some((o) => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
    rooms.push({ x, y, w, h });
  }
  return rooms;
}

function roomsLevel(rng, theme) {
  const tiles = new Array(W * H).fill(T.WALL);
  let arena = null;
  if (theme.arena) { const w = 15, h = 9; arena = { x: rng.int(3, W - w - 3), y: rng.int(3, H - h - 3), w, h, arena: true }; }
  const rooms = placeRooms(rng, theme.key === 'crypt' ? rng.int(13, 16) : rng.int(9, 12), arena);
  rooms.forEach((r) => carveRoom(tiles, r));
  // minimum spanning tree (Prim) over room centres, Manhattan distance
  const inTree = [0], edges = [];
  const md = (a, b) => { const [ax, ay] = centre(rooms[a]), [bx, by] = centre(rooms[b]); return Math.abs(ax - bx) + Math.abs(ay - by); };
  while (inTree.length < rooms.length) {
    let best = null;
    for (const a of inTree) for (let b = 0; b < rooms.length; b++) {
      if (inTree.includes(b)) continue;
      const d = md(a, b);
      if (!best || d < best[2]) best = [a, b, d];
    }
    edges.push(best); inTree.push(best[1]);
  }
  // a few extra links to the nearest room not already linked, so the map loops
  for (let a = 0; a < rooms.length; a++) {
    if (!rng.chance(0.3)) continue;
    let best = null;
    for (let b = 0; b < rooms.length; b++) {
      if (b === a || edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue;
      const d = md(a, b);
      if (!best || d < best[1]) best = [b, d];
    }
    if (best && best[1] < 40) edges.push([a, best[0], best[1]]);
  }
  for (const [a, b] of edges) carveCorridor(tiles, rng, centre(rooms[a]), centre(rooms[b]));
  // doors: a corridor tile in a room's wall ring with wall on both sides along that wall
  for (const r of rooms) {
    if (r.arena) continue;
    const ring = [];
    for (let x = r.x; x < r.x + r.w; x++) ring.push([x, r.y - 1, 1], [x, r.y + r.h, 1]);
    for (let y = r.y; y < r.y + r.h; y++) ring.push([r.x - 1, y, 0], [r.x + r.w, y, 0]);
    for (const [x, y, horizontalWall] of ring) {
      if (tiles[idx(x, y)] !== T.FLOOR) continue;
      const sides = horizontalWall ? [tiles[idx(x - 1, y)], tiles[idx(x + 1, y)]] : [tiles[idx(x, y - 1)], tiles[idx(x, y + 1)]];
      const nextToDoor = DIRS.slice(0, 4).some(([dx, dy]) => tiles[idx(x + dx, y + dy)] === T.DOOR);
      if (sides.every((t) => t === T.WALL) && !nextToDoor && rng.chance(0.65)) tiles[idx(x, y)] = T.DOOR;
    }
  }
  return { tiles, rooms, arena };
}

function cavesLevel(rng) {
  for (;;) {
    let tiles = new Array(W * H).fill(T.WALL);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) tiles[idx(x, y)] = rng.chance(0.45) ? T.WALL : T.FLOOR;
    for (let it = 0; it < 5; it++) {
      const next = tiles.slice();
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && tiles[idx(x + dx, y + dy)] === T.WALL) n++;
        next[idx(x, y)] = n >= 5 || (it < 2 && n <= 1) ? T.WALL : T.FLOOR;
      }
      tiles = next;
    }
    // keep only the largest connected region
    const seen = new Int32Array(W * H).fill(-1);
    let best = -1, bestSize = 0;
    for (let i = 0; i < W * H; i++) {
      if (tiles[i] !== T.FLOOR || seen[i] >= 0) continue;
      const dist = distances(tiles, i % W, (i / W) | 0);
      let size = 0;
      for (let j = 0; j < W * H; j++) if (dist[j] >= 0) { seen[j] = i; size++; }
      if (size > bestSize) { bestSize = size; best = i; }
    }
    for (let i = 0; i < W * H; i++) if (tiles[i] === T.FLOOR && seen[i] !== best) tiles[i] = T.WALL;
    if (bestSize >= 700) return { tiles, rooms: [], arena: null };
  }
}

function addLava(rng, tiles, pools, keepClear) {
  let placed = 0;
  for (let tries = 0; tries < 60 && placed < pools; tries++) {
    const cx = rng.int(3, W - 4), cy = rng.int(3, H - 4);
    if (keepClear(cx, cy)) continue;
    const cells = [];
    const rx = rng.int(1, 3), ry = rng.int(1, 2);
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if (((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2 > 1) continue;
      // only open floor with floor all around: never on doors, corridors or against walls
      let open = tiles[idx(x, y)] === T.FLOOR;
      for (const [dx, dy] of DIRS) if (tiles[idx(x + dx, y + dy)] !== T.FLOOR && tiles[idx(x + dx, y + dy)] !== T.LAVA) open = false;
      if (open && !keepClear(x, y)) cells.push(idx(x, y));
    }
    if (cells.length < 3) continue;
    cells.forEach((i) => { tiles[i] = T.LAVA; });
    // reject the pool if any walkable tile became unreachable
    const start = tiles.findIndex(walkable);
    const dist = distances(tiles, start % W, (start / W) | 0);
    let reach = 0;
    for (let i = 0; i < W * H; i++) if (dist[i] >= 0) reach++;
    if (reach !== countWalkable(tiles)) { cells.forEach((i) => { tiles[i] = T.FLOOR; }); continue; }
    placed++;
  }
}

export function generate(seed, depth) {
  const rng = new Rng(hashString(`${seed}:level:${depth}`));
  const theme = THEMES[depth];
  const level = theme.gen === 'caves' ? cavesLevel(rng) : roomsLevel(rng, theme);
  const { tiles, rooms, arena } = level;
  // start: a room far from the arena (boss level), any room otherwise; caves: any floor tile
  let start;
  if (rooms.length) {
    const pool = arena ? rooms.filter((r) => !r.arena) : rooms;
    const room = arena ? pool.reduce((a, b) => (dist2(centre(b), centre(arena)) > dist2(centre(a), centre(arena)) ? b : a)) : rng.pick(pool);
    start = centre(room);
  } else {
    const floors = []; tiles.forEach((t, i) => { if (t === T.FLOOR) floors.push(i); });
    const i = rng.pick(floors); start = [i % W, (i / W) | 0];
  }
  if (theme.lava) {
    const near = (x, y) => Math.abs(x - start[0]) <= 3 && Math.abs(y - start[1]) <= 3;
    const inArena = (x, y) => arena && x >= arena.x - 1 && x <= arena.x + arena.w && y >= arena.y - 1 && y <= arena.y + arena.h;
    addLava(rng, tiles, theme.lava + rng.int(0, 2), (x, y) => near(x, y) || inArena(x, y));
  }
  // stairs: one of the tiles farthest from the start (none on the last depth: the Warden waits there)
  let stairs = null;
  const dist = distances(tiles, start[0], start[1]);
  if (depth < DEPTHS) {
    const max = Math.max(...dist);
    const far = [];
    for (let i = 0; i < W * H; i++) if (tiles[i] === T.FLOOR && dist[i] >= max * 0.85) far.push(i);
    const i = rng.pick(far);
    tiles[i] = T.STAIRS; stairs = [i % W, (i / W) | 0];
  }
  return { tiles, rooms, arena, start, stairs, theme, depth, dist };
}
const dist2 = ([ax, ay], [bx, by]) => (ax - bx) ** 2 + (ay - by) ** 2;
