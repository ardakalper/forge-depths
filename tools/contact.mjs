// Dev aid: every sprite on one sheet, scaled up, over a floor tile. node tools/contact.mjs [theme] [out.png]
import { writeFileSync } from 'node:fs';
import { SPRITES, SIZE, pixels, PALETTE } from '../app/js/sprites.js';
import { encodePng } from './png.mjs';
const theme = process.argv[2] ?? 'mine', out = process.argv[3] ?? 'contact.png';
for (const [name, rows] of Object.entries(SPRITES)) {
  if (rows.length !== SIZE) throw new Error(`${name}: ${rows.length} rows`);
  rows.forEach((r, i) => { if (r.length !== SIZE) throw new Error(`${name} row ${i}: ${r.length} chars`); for (const c of r) if (c !== '.' && !PALETTE[c] && !/[1-7Xx]/.test(c)) throw new Error(`${name}: bad char ${c}`); });
}
const names = Object.keys(SPRITES), S = 6, COLS = 8, cell = SIZE * S + 8;
const w = COLS * cell, h = Math.ceil(names.length / COLS) * cell;
const img = new Uint8ClampedArray(w * h * 4).fill(255);
const floor = pixels('floor', { theme });
names.forEach((name, n) => {
  const ox = (n % COLS) * cell + 4, oy = Math.floor(n / COLS) * cell + 4;
  const px = pixels(name, { theme, tint: name === 'potion' ? 'heal' : name === 'scroll' ? 'fire' : null });
  for (let y = 0; y < SIZE * S; y++) for (let x = 0; x < SIZE * S; x++) {
    const si = ((y / S | 0) * SIZE + (x / S | 0)) * 4, di = ((oy + y) * w + ox + x) * 4;
    const src = px[si + 3] ? px : floor;
    img[di] = src[si]; img[di + 1] = src[si + 1]; img[di + 2] = src[si + 2]; img[di + 3] = 255;
  }
});
writeFileSync(out, encodePng(w, h, img));
console.log(names.length, 'sprites →', out);
