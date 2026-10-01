// Pathfinding: A* on the 8-connected grid with a binary heap, and Dijkstra maps (multi-source
// breadth-first distances) for auto-explore.
import { W, H, DIRS, idx } from './dungeon.js';

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item, pri) {
    const a = this.a; a.push([pri, item]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
}

// step(x, y, dx, dy) → cost of that step, or Infinity if it is not allowed.
// Returns the path as [[x, y], ...] without the start, or null. Heuristic: Chebyshev distance,
// admissible as long as every step costs at least 1.
export function astar(sx, sy, tx, ty, step, maxNodes = 4000) {
  const start = idx(sx, sy), goal = idx(tx, ty);
  if (start === goal) return [];
  const g = new Float64Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
  const h = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty));
  const open = new Heap();
  g[start] = 0; open.push(start, h(sx, sy));
  let expanded = 0;
  while (open.size) {
    const i = open.pop();
    if (closed[i]) continue;
    if (i === goal) break;
    closed[i] = 1;
    if (++expanded > maxNodes) return null;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of DIRS) {
      const cost = step(x, y, dx, dy);
      if (cost === Infinity) continue;
      const j = idx(x + dx, y + dy);
      // tiny tie-breaker prefers straight steps, so paths look less zig-zaggy
      const ng = g[i] + cost + (dx && dy ? 0.001 : 0);
      if (ng < g[j]) { g[j] = ng; from[j] = i; open.push(j, ng + h(x + dx, y + dy)); }
    }
  }
  if (from[goal] < 0) return null;
  const path = [];
  for (let i = goal; i !== start; i = from[i]) path.push([i % W, (i / W) | 0]);
  return path.reverse();
}

// Multi-source distances. sources: tile indices; step(x, y, dx, dy) → boolean.
export function dijkstraMap(sources, step) {
  const dist = new Int32Array(W * H).fill(-1), queue = [];
  for (const s of sources) if (dist[s] < 0) { dist[s] = 0; queue.push(s); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = (i / W) | 0;
    for (let k = 0; k < 8; k++) {
      const dx = DIRS[k][0], dy = DIRS[k][1];
      // walk the map backwards: from (x, y) to a neighbour that could step onto (x, y)
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = idx(nx, ny);
      if (dist[j] >= 0 || !step(nx, ny, -dx, -dy)) continue;
      dist[j] = dist[i] + 1; queue.push(j);
    }
  }
  return dist;
}
