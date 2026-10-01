// App icons: the hero on a dark tile with a verdigris rim.
import { writeFileSync, mkdirSync } from 'node:fs';
import { pixels, SIZE } from '../app/js/sprites.js';
import { encodePng } from './png.mjs';
const hero = pixels('hero');
function icon(size, pad, round) {
  const out = new Uint8ClampedArray(size * size * 4), cell = (size * (1 - 2 * pad)) / SIZE, off = size * pad;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, r = size * 0.22, c = size / 2;
    const dx = Math.max(Math.abs(x + 0.5 - c) - (c - r), 0), dy = Math.max(Math.abs(y + 0.5 - c) - (c - r), 0), d = Math.hypot(dx, dy);
    if (round && d > r) continue;
    let col = round && d > r - size * 0.03 ? [0x4f, 0xd1, 0xc5] : [0x17, 0x13, 0x1d];
    const px = Math.floor((x - off) / cell), py = Math.floor((y - off) / cell);
    if (px >= 0 && py >= 0 && px < SIZE && py < SIZE && hero[(py * SIZE + px) * 4 + 3]) { const j = (py * SIZE + px) * 4; col = [hero[j], hero[j + 1], hero[j + 2]]; }
    out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = 255;
  }
  return encodePng(size, size, out);
}
mkdirSync(new URL('../app/icons/', import.meta.url), { recursive: true });
for (const s of [192, 512]) writeFileSync(new URL(`../app/icons/icon-${s}.png`, import.meta.url), icon(s, 0.16, true));
writeFileSync(new URL('../app/icons/maskable-512.png', import.meta.url), icon(512, 0.24, false));
console.log('icons written');
