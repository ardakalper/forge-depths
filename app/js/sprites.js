// Hand-drawn 16×16 pixel art. Each sprite is 16 strings; every character is a palette slot and '.'
// is transparent. Digits 1–7 are theme slots, so the same wall and floor art is recoloured for each
// part of the dungeon. 'X' and 'x' are item tint slots (potion liquid, scroll seal).

export const SIZE = 16;

export const PALETTE = {
  k: '#0e0b12', d: '#26202e', g: '#4a4458', G: '#7c7590', w: '#c9c2d6', W: '#f4efe6',
  b: '#4f3322', B: '#835536', t: '#c08a55', s: '#efc39b',
  r: '#7d2530', R: '#d1423a', o: '#ea7a2c', y: '#f6c24a', Y: '#fff1a6',
  n: '#244f36', N: '#4b9a4e', l: '#a3dc6a',
  c: '#24506e', C: '#4c9fc7', a: '#a6e3ef',
  p: '#43285a', P: '#8657b0', m: '#d98ad0',
};

// theme slots, derived from one hue per part of the dungeon so every theme has the same contrast:
// 1 wall top (darkest), 4 wall top texture, 2–3 wall face, 5–7 floor
const hsl = (h, sat, l) => {
  const k = (n) => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const theme = (h, sat) => ({ 1: hsl(h, sat, 0.06), 4: hsl(h, sat, 0.1), 2: hsl(h, sat, 0.27), 3: hsl(h, sat, 0.37), 5: hsl(h, sat * 0.8, 0.14), 6: hsl(h, sat * 0.8, 0.19), 7: hsl(h, sat * 0.8, 0.23) });
export const THEME_COLOURS = {
  mine: theme(28, 0.3), cave: theme(172, 0.28), halls: theme(226, 0.3), crypt: theme(285, 0.12), ember: theme(358, 0.36), forge: theme(255, 0.08),
};

export const TINTS = {
  heal: ['#d1423a', '#7d2530'], might: ['#ea7a2c', '#8a3c16'], vigor: ['#4b9a4e', '#244f36'],
  teleport: ['#8657b0', '#43285a'], mapping: ['#4c9fc7', '#24506e'], fire: ['#ea7a2c', '#7d2530'], slumber: ['#a6e3ef', '#4c9fc7'],
};

export const SPRITES = {
  // ---------- tiles ----------
  floor: [
    '6666666566666665', '6766666566676665', '6666666566666665', '6666666566666665',
    '6666666566666665', '6666666566666665', '6666666566666665', '5555555555555555',
    '6666666566666665', '6666666566666665', '6676666566666665', '6666666566666665',
    '6666666566666765', '6666666566666665', '6666666566666665', '5555555555555555',
  ],
  floor2: [
    '6666666666666666', '6676666666666666', '6666666666665666', '6666666666655666',
    '6666666666666666', '6666666666666666', '6666556666666666', '6666665666667666',
    '6666666666666666', '6666666666666666', '6676666666666666', '6666666665666666',
    '6666666655566666', '6666666666666666', '6666666666666766', '6666666666666666',
  ],
  floor3: [
    '6666666666666666', '6666666666666666', '6656666666666666', '6655666666676666',
    '6666666666666666', '6666666666666666', '6666666666666666', '6666666675666666',
    '6666666666666666', '6666666666666666', '6666666666666666', '6676666666665666',
    '6666666666666656', '6666656666666666', '6666666666666666', '6666666666666666',
  ],
  wall_top: [
    '4444444444444444', '4444444444444444', '4444144444444414', '4444444444444444',
    '4444444444444444', '4144444444414444', '4444444444444444', '4444444444444444',
    '4444444414444444', '4444444444444444', '4444444444444444', '4414444444444144',
    '4444444444444444', '4444444444444444', '4444441444444444', '4444444444444444',
  ],
  wall_face: [
    '4444444444444444', '3333333133333331', '3222222132222221', '3222222132222221',
    '1111111111111111', '3331333333313333', '2221322222213222', '2221322222213222',
    '1111111111111111', '3333333133333331', '3222222132222221', '3222222132222221',
    '1111111111111111', '3331333333313333', '2221322222213222', '1111111111111111',
  ],
  rock_face: [
    '4441444444144444', '3333133333313333', '3322213332221333', '3222213222221233',
    '1222113222211223', '1111133111111222', '3333332233331111', '3322222223333331',
    '3222212222222231', '2222112222221221', '1222111222211111', '1113333311133333',
    '1332222213322222', '1322222112222222', '1222221111222221', '1111111111111111',
  ],
  door: [
    '1111111111111111', '1kkkkkkkkkkkkkk1', '1kBBtBBBBtBBBBk1', '1kBBtBBBBtBBBBk1',
    '1kbbbbbbbbbbbbk1', '1kBBtBBBBtBBBBk1', '1kBBtBBBBtBBBBk1', '1kBBtBBBBtyykBk1',
    '1kBBtBBBBtyykBk1', '1kBBtBBBBtBBBBk1', '1kbbbbbbbbbbbbk1', '1kBBtBBBBtBBBBk1',
    '1kBBtBBBBtBBBBk1', '1kBBtBBBBtBBBBk1', '1kbbbbbbbbbbbbk1', '1kkkkkkkkkkkkkk1',
  ],
  door_open: [
    '1111111111111111', '1kk555555555555k', '1kBk55555555555k', '1kBk66666666666k',
    '1kBk66666666666k', '1kBk66666666666k', '1kBk66666666666k', '1kBk66666666666k',
    '1kBk66666666666k', '1kBk66666666666k', '1kBk66666666666k', '1kBk66666666666k',
    '1kBk66666666666k', '1kBk66666666666k', '1kbk66666666666k', '1kk666666666666k',
  ],
  stairs: [
    '5555555555555555', '5kkkkkkkkkkkkkk5', '5k333333333333k5', '5k222222222222k5',
    '5kkkkkkkkkkkkkk5', '5k1k33333333333k', '5k1k22222222222k', '5k1kkkkkkkkkkkkk',
    '5k1k1k333333333k', '5k1k1k222222222k', '5k1k1kkkkkkkkkkk', '5k1k1k1k3333333k',
    '5k1k1k1k2222222k', '5k1k1k1kkkkkkkkk', '5kkkkkkkkkkkkkkk', '5555555555555555',
  ],
  lava: [
    'rRRRoRRRRRRoRRRr', 'RRoooRRRRRoooRRR', 'RooyooRRRooyyoRR', 'RRoooRRRRRoooRRR',
    'RRRRRRRrRRRRRRRR', 'RRRRRRrrrRRRRRRR', 'RRRoRRRrRRRRoRRR', 'RRoyoRRRRRRoyoRR',
    'RRRoRRRRRRRRoRRR', 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRrRRRRRR', 'RRoooRRRRrrRRRRR',
    'RooyyoRRRRRRRRoR', 'RRoooRRRRRRRRoyo', 'RRRRRRRRRRRRRRoR', 'rRRRRRRRRRRRRRRr',
  ],
  lava2: [
    'rRRRRRRRRoRRRRRr', 'RRRRRRRRoooRRRRR', 'RRoRRRRooyyoRRRR', 'RoyoRRRRoooRRRRR',
    'RRoRRRRRRRRRRRRR', 'RRRRRRRRRRRRRrRR', 'RRRRRrRRRRRRrrrR', 'RRRRrrrRRoRRRrRR',
    'RRRRRrRRoyoRRRRR', 'RRRRRRRRRoRRRRRR', 'RoooRRRRRRRRRRRR', 'ooyyoRRRRRRRoooR',
    'RoooRRRRRRRRoyyo', 'RRRRRRRRRRRRRooo', 'RRRRRoRRRRRRRRRR', 'rRRRoyoRRRRRRRRr',
  ],
  bones: [
    '................', '................', '................', '................',
    '................', '.........WW.....', '........WkkW....', '........WWWW....',
    '.........WW.....', '................', '...W.......w....', '....w....ww.....',
    '.....w..w.......', '......ww........', '.....w..w.......', '................',
  ],
  mushroom: [
    '................', '................', '................', '................',
    '................', '................', '................', '..........kk....',
    '.........kaak...', '....kk..kaCaak..', '...kaak.kkwkk...', '..kaCaak..wk....',
    '..kkwkk...wk....', '....wk....k.....', '....k...........', '................',
  ],
  rubble: [
    '................', '................', '................', '................',
    '................', '................', '................', '................',
    '..........kk....', '.........k32k...', '...kk....k22k...', '..k32k....kk....',
    '..k22k.kk.......', '...kk.k32k......', '......kkk.......', '................',
  ],
  embers: [
    '................', '................', '................', '................',
    '................', '................', '...........y....', '................',
    '.....o..........', '................', '..........o.....', '.......y........',
    '................', '...o........y...', '................', '................',
  ],

  // ---------- the hero ----------
  hero: [
    '................', '......kkkk......', '.....kwwGGk...k.', '....kwGGGGGk.kwk',
    '....kGGkkGGk.kwk', '....kGGkkGGk.kwk', '.....kGkkGk..kwk', '....kkkkkkkk.kwk',
    '...kRRRRRRRRkkyk', '..kRRkRRRRkRRkbk', '..kssRRyyRRksskk', '..kkkbbbbbbkkk..',
    '....kGGkkGGk....', '....kGGkkGGk....', '....kbbkkbbk....', '....kkk..kkk....',
  ],

  // ---------- monsters ----------
  rat: [
    '................', '................', '................', '................',
    '................', '................', '...kk...........', '..kGGk..kkkk....',
    '.kGkGGkkGGGGk...', '.kGGGGGGGGGGGk..', 'kmGGkGGGGGGGGGk.', '.kkGGGGGGGGGGGkk',
    '..kkGGkkkkGGkk.k', '...kGk...kGk..km', '...kk.....kk....', '................',
  ],
  bat: [
    '................', '................', '................', '.k............k.',
    '.kk....kk....kk.', '.kpk..kPPk..kpk.', '.kppkkPPPPkkppk.', 'kpppppPRPRpppppk',
    'kppppPPPPPPppppk', '.kpkkpPWWPpkkpk.', '.kk..kpPPpk..kk.', '......kkkk......',
    '................', '................', '................', '................',
  ],
  goblin: [
    '................', '................', '..k...kkkk...k..', '.klk.kNNNNk.klk.',
    '.kNlkNNNNNNkNlk.', '..kNNNyNNyNNNk..', '...kNNkNNkNNk...', '....kNNkkNNk....',
    '...kkbkNNkbkk...', '..kNkbbbbbbkNk..', '..kNkbbBBbbkNk..', '..kkkbbbbbbkkk..',
    '....kbbkkbbk....', '....kNNkkNNk....', '....kkk..kkk....', '................',
  ],
  slime: [
    '................', '................', '................', '................',
    '................', '......kkkk......', '....kkllllkk....', '...klllWllllk...',
    '..kllWWllllllk..', '..klllllllllNk..', '.klklkllllklNNk.', '.klllllllllNNNk.',
    '.kllNlllllNNNNk.', '.kNNNNNNNNNNNNk.', '..kkkkkkkkkkkk..', '................',
  ],
  archer: [
    '................', '....kkkkk.......', '...knnnnnk..k...', '..knnnnnnnk.kBk.',
    '..knNyNNyNk..kBk', '...kNNNNNk...kBk', '..k.kkNkk.k..kBk', '.kNkknnnnkkNkkwk',
    '.kNknnnnnnnkkNBk', '..kkbbbbbbbk.kBk', '....bbbBbbbk.kBk', '....kbbkbbk..kBk',
    '....kNNkNNk..kBk', '....kNNkNNk...k.', '....kkk.kkk.....', '................',
  ],
  skeleton: [
    '................', '.....kkkkk......', '....kWWWWWk.....', '...kWWWWWWWk....',
    '...kWkkWkkWk....', '...kWkkWkkWk....', '....kWWkWWk.....', '.....kWkWk......',
    '...kkkkWkkkk....', '..kWkWWWWWkWk...', '..kWkkWkWkkWk...', '..kk.kWWWk.kk...',
    '.....kWkWk......', '....kWk.kWk.....', '....kWk.kWk.....', '....kkk.kkk.....',
  ],
  ogre: [
    '................', '.....kkkkkk.....', '....kttttttk....', '...ktkkttkktk...',
    '...ktyktykttk...', '...ktttttttk....', '..kkktWkkWtkkk..', '.kttkkttttkkttk.',
    'kttttbbbbbbttttk', 'kttkbbbbbbbbkttk', 'kttkbbbBBbbbkttk', '.kkkbbbbbbbbkkk.',
    '...kttkkkkttk...', '...kttk..kttk...', '...kkkk..kkkk...', '................',
  ],
  wraith: [
    '................', '.....kkkkkk.....', '....kaaaaaak....', '...kaaaaaaaak...',
    '...kakkaakkak...', '...kakCaakCak...', '...kaaaaaaaak...', '..kaaakkkkaaak..',
    '..kaaaaaaaaaak..', '.kCaaaaaaaaaaCk.', '.kCaaaaaaaaaaCk.', '.kCCaaaaaaaaCCk.',
    '..kCCaCaaCaCCk..', '..kCkkCkkCkkCk..', '...k..k..k..k...', '................',
  ],
  imp: [
    '................', '..k........k....', '.kyk......kyk...', '.kok.kkkk.kok...',
    '..kokRRRRkok....', '...kRYRRYRk.....', '...kRRkkRRk..k..', '....kRRRRk..kyk.',
    '...kkRRRRkk.kok.', '..kRkRRoRRkRkk..', '..kRkRRRRRk.k...', '...k.kRRRk......',
    '.....kRkRk......', '....kRk.kRk.....', '....kk...kk.....', '................',
  ],
  warden: [
    '...kk......kk...', '..kGGk.kk.kGGk..', '..kGGGkGGkGGGk..', '...kGGGGGGGGk...',
    '...kGkkGGkkGk...', '...kGkoGGokGk...', '..kkGGGGGGGGkk..', '.kGGkGGkkGGkGGk.',
    'kGGGGkkoykkGGGGk', 'kGGgkGGyoGGkgGGk', 'kGGgkGGGGGGkgGGk', '.kkkkgGGGGgkkkk.',
    '...kGGGkkGGGk...', '...kGGk..kGGk...', '..kkkkk..kkkkk..', '................',
  ],

  // ---------- items ----------
  potion: [
    '................', '................', '......kkkk......', '......kbbk......',
    '.......kk.......', '......kWWk......', '.....kWXXWk.....', '....kXWXXXXk....',
    '....kXXXXXXk....', '...kXWXXXXXXk...', '...kXXXXXXXxk...', '...kxXXXXXxxk...',
    '....kxxxxxxk....', '.....kkkkkk.....', '................', '................',
  ],
  scroll: [
    '................', '................', '................', '...kkkkkkkkkk...',
    '..kWwwwwwwwwWk..', '..kkWWWWWWWWkk..', '...kWwwwwwwWk...', '...kWWWWWWWWk...',
    '...kWwwwwwXXk...', '...kWWWWWWXxk...', '..kkWWWWWWWWkk..', '..kWwwwwwwwwWk..',
    '...kkkkkkkkkk...', '................', '................', '................',
  ],
  dagger: [
    '................', '................', '................', '...........kk...',
    '..........kWk...', '.........kWwk...', '........kWwk....', '.......kWwk.....',
    '......kWwk......', '...kk.kwk.......', '...kykkk........', '....kbk.........',
    '...kbkyk........', '..kbk.kk........', '...k............', '................',
  ],
  sword: [
    '................', '.............kk.', '............kWk.', '...........kWwk.',
    '..........kWwk..', '.........kWwk...', '........kWwk....', '.......kWwk.....',
    '......kWwk......', '..kk.kWwk.......', '..kykkwk........', '...kyyk.........',
    '...kbkyk........', '..kbk.kk........', '.kbk............', '..k.............',
  ],
  axe: [
    '................', '.........kkk....', '........kWwGk...', '.......kWwGGGk..',
    '.......kwGGGGGk.', '........kGkbGGk.', '.........kbkkk..', '........kbk.....',
    '.......kbk......', '......kbk.......', '.....kbk........', '....kbk.........',
    '...kbk..........', '..kyk...........', '..kk............', '................',
  ],
  hammer: [
    '................', '....kkkkkkk.....', '...kWwwwwwGk....', '...kwGGGGGGk....',
    '...kGGGGGGgk....', '....kkkbkkk.....', '.......bk.......', '......kbk.......',
    '......kbk.......', '......kbk.......', '......kbk.......', '......kbk.......',
    '......kbk.......', '......kyk.......', '......kkk.......', '................',
  ],
  leather: [
    '................', '................', '...kkk....kkk...', '..kBBBkkkkBBBk..',
    '..kBtBBBBBBtBk..', '..kBBBkBBkBBBk..', '..kkBBBkkBBBkk..', '...kBBBBBBBBk...',
    '...kbbbbbbbbk...', '...kBBByBBBBk...', '...kBBBBBBBBk...', '...kBBBBBBBBk...',
    '...kbbbbbbbbk...', '....kkkkkkkk....', '................', '................',
  ],
  chain: [
    '................', '................', '...kkk....kkk...', '..kGwGkkkkGwGk..',
    '..kwGwGwGwGwGk..', '..kGwGkGwkGwGk..', '..kkGwGkkGwGkk..', '...kGwGwGwGwk...',
    '...kwGwGwGwGk...', '...kGwGwGwGwk...', '...kwGwGwGwGk...', '...kGwGwGwGwk...',
    '...kgggggggggk..', '....kkkkkkkk....', '................', '................',
  ],
  plate: [
    '................', '................', '..kkkk....kkkk..', '.kWwGGkkkkGGwWk.',
    '.kwGGGWWWWGGGGk.', '.kGGGkwWWGkGGgk.', '..kkGGwWWGGGkk..', '...kGGWWWGGGk...',
    '...kGwwGGGGgk...', '...kkkkkkkkkk...', '...kGGWWGGGgk...', '...kGwGGGGGgk...',
    '...kGGGGGGGgk...', '....kkkkkkkk....', '................', '................',
  ],
  gold: [
    '................', '................', '................', '................',
    '................', '................', '.......kkk......', '......kYyyk.....',
    '.....kkyyyk.....', '....kYyykkkkk...', '...kkyyykYyyyk..', '..kYyyykyyyyok..',
    '..kyyyyokyyook..', '...kooookkkkk...', '....kkkkk.......', '................',
  ],
  heart: [
    '................', '................', '.......kk.......', '......kYYk......',
    '.....kYyyok.....', '....kYyyyook....', '...kYyyoooook...', '...kyyoooRRok...',
    '...koooooRRrk...', '....koooRRrk....', '.....koRRrk.....', '......kRrk......',
    '.......kkk......', '................', '................', '................',
  ],
};

// sprite name for an item id
export function itemSprite(id) {
  if (['heal', 'might', 'vigor'].includes(id)) return 'potion';
  if (['teleport', 'mapping', 'fire', 'slumber'].includes(id)) return 'scroll';
  return id;
}

// RGBA pixels for a sprite: Uint8ClampedArray(16*16*4)
export function pixels(name, { theme = 'mine', tint = null } = {}) {
  const rows = SPRITES[name];
  if (!rows) throw new Error(`no sprite ${name}`);
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const tc = THEME_COLOURS[theme], [X, x] = TINTS[tint] ?? ['#d1423a', '#7d2530'];
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    const ch = rows[py][px];
    if (ch === '.') continue;
    const hex = ch === 'X' ? X : ch === 'x' ? x : /[1-7]/.test(ch) ? tc[ch] : PALETTE[ch];
    const i = (py * SIZE + px) * 4;
    out[i] = parseInt(hex.slice(1, 3), 16); out[i + 1] = parseInt(hex.slice(3, 5), 16); out[i + 2] = parseInt(hex.slice(5, 7), 16); out[i + 3] = 255;
  }
  return out;
}
