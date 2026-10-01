// Field of view: symmetric shadowcasting (after Albert Ford's "Symmetric Shadowcasting").
// Each of the four quadrants is scanned row by row; slopes are kept as exact fractions, so there is
// no floating-point drift. The result is symmetric: if A can see B, B can see A. Monsters use that
// to decide whether they can see the player and shoot at them, without a second FOV pass.

// quadrant transforms: (row, col) → map offset
const QUADS = [(r, c) => [c, -r], (r, c) => [r, c], (r, c) => [c, r], (r, c) => [-r, c]];

// slopes are fractions { n, d } with d > 0
const roundTiesUp = (num, den) => Math.floor((2 * num + den) / (2 * den)); // floor(num/den + 1/2)
const roundTiesDown = (num, den) => Math.ceil((2 * num - den) / (2 * den)); // ceil(num/den - 1/2)

// opaque(x, y) → true for walls and closed doors; visit(x, y) marks a tile visible.
export function computeFov(ox, oy, radius, opaque, visit) {
  visit(ox, oy);
  const r2 = radius * radius + radius;
  for (const tr of QUADS) {
    const at = (row, col) => { const [dx, dy] = tr(row, col); return [ox + dx, oy + dy]; };
    const isWall = (row, col) => col != null && opaque(...at(row, col));
    const reveal = (row, col) => { const [dx, dy] = tr(row, col); if (dx * dx + dy * dy <= r2) visit(ox + dx, oy + dy); };
    // a row covers columns between two slopes; depth is the distance from the origin
    const scan = (depth, start, end) => {
      if (depth > radius) return;
      const minCol = roundTiesUp(depth * start.n, start.d), maxCol = roundTiesDown(depth * end.n, end.d);
      let prev = null;
      for (let col = minCol; col <= maxCol; col++) {
        const wall = isWall(depth, col);
        // symmetric: the tile's centre lies within the row's slopes
        const symmetric = col * start.d >= depth * start.n && col * end.d <= depth * end.n;
        if (wall || symmetric) reveal(depth, col);
        if (prev !== null && prev && !wall) start = { n: 2 * col - 1, d: 2 * depth };
        if (prev !== null && !prev && wall) scan(depth + 1, start, { n: 2 * col - 1, d: 2 * depth });
        prev = wall;
      }
      if (prev === false) scan(depth + 1, start, end);
    };
    scan(1, { n: -1, d: 1 }, { n: 1, d: 1 });
  }
}
