// Seeded randomness. Everything in a run draws from these generators, so a seed plus the list of
// player actions reproduces the run exactly (daily seeds, share links and replays rely on it).

// cyrb53-style string hash folded to 32 bits
export function hashString(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2 ^ (h2 >>> 7)) >>> 0;
}

// mulberry32: the whole state is one 32-bit integer, so it saves as { s }
export class Rng {
  constructor(seed) { this.s = seed >>> 0; }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  // entries: [[value, weight], ...]
  weighted(entries) {
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * total;
    for (const [v, w] of entries) { r -= w; if (r < 0) return v; }
    return entries[entries.length - 1][0];
  }
}

// Seeds people can read out loud: six characters without look-alikes (no 0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function seedCode(randomInts) { return Array.from(randomInts.slice(0, 6), (n) => ALPHABET[n % ALPHABET.length]).join(''); }
export const dailySeed = (date) => `daily-${date}`;
