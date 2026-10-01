// Your own sprites: read an Aseprite-style sprite sheet JSON (Pixel Editor exports exactly this).
// Each frame tag names a sprite to replace (hero, goblin, wall_face...); its first frame is used.
// Frames whose file name is a sprite name work too. Trimmed frames are put back in their full cell.
import { SPRITES } from './sprites.js';

export const SPRITE_NAMES = Object.keys(SPRITES);
const ALIASES = {
  player: 'hero', knight: 'hero', you: 'hero', boss: 'warden', golem: 'warden', ghost: 'wraith', orc: 'ogre',
  'goblin archer': 'archer', 'goblin-archer': 'archer', wall: 'wall_face', 'wall face': 'wall_face', 'wall top': 'wall_top',
  ground: 'floor', tile: 'floor', 'door open': 'door_open', stair: 'stairs', coin: 'gold', coins: 'gold', gem: 'heart', 'ember heart': 'heart',
  bottle: 'potion', paper: 'scroll',
};
export function spriteName(raw) {
  const n = String(raw).trim().toLowerCase().replace(/\.(png|aseprite|ase)$/, '');
  if (SPRITE_NAMES.includes(n)) return n;
  if (ALIASES[n]) return ALIASES[n];
  const u = n.replace(/[\s-]+/g, '_');
  return SPRITE_NAMES.includes(u) ? u : null;
}

// → { frames: [{ frame, source, size }], map: { spriteName: frameIndex } }
export function parseSheet(json) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  if (!raw || !raw.frames || !raw.meta) throw new Error('not a sprite sheet JSON');
  const list = Array.isArray(raw.frames) ? raw.frames : Object.entries(raw.frames).map(([filename, f]) => ({ filename, ...f }));
  if (!list.length) throw new Error('sheet has no frames');
  const frames = list.map((f) => ({
    frame: f.frame,
    source: f.spriteSourceSize ?? { x: 0, y: 0, w: f.frame.w, h: f.frame.h },
    size: f.sourceSize ?? { w: f.frame.w, h: f.frame.h },
    filename: f.filename ?? '',
  }));
  if (frames.some((f) => f.size.w > 256 || f.size.h > 256)) throw new Error('frames larger than 256 px');
  const map = {};
  for (const tag of raw.meta.frameTags ?? []) {
    const name = spriteName(tag.name);
    if (name && !(name in map) && tag.from >= 0 && tag.from < frames.length) map[name] = tag.from;
  }
  frames.forEach((f, i) => {
    const name = spriteName(f.filename.replace(/\s+\d+(\.\w+)?$/, ''));
    if (name && !(name in map)) map[name] = i;
  });
  if (!Object.keys(map).length) throw new Error('no frame is tagged with a sprite name');
  return { frames, map, image: raw.meta.image ?? null };
}
