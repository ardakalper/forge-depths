// Monsters, items and the tables that decide what appears at which depth.

export const MONSTERS = {
  rat: { name: 'rat', hp: 4, dmg: [1, 2], acc: 70, def: 0, speed: 100, xp: 1, depth: [1, 3], weight: 10 },
  bat: { name: 'bat', hp: 5, dmg: [1, 3], acc: 70, def: 1, speed: 150, xp: 2, depth: [1, 4], weight: 6, erratic: 0.5 },
  goblin: { name: 'goblin', hp: 8, dmg: [1, 4], acc: 75, def: 1, speed: 100, xp: 3, depth: [1, 5], weight: 6, flees: 0.3 },
  slime: { name: 'slime', hp: 14, dmg: [2, 4], acc: 70, def: 0, speed: 50, xp: 4, depth: [2, 6], weight: 5 },
  archer: { name: 'goblin archer', hp: 7, dmg: [1, 3], acc: 75, def: 1, speed: 100, xp: 4, depth: [2, 7], weight: 5, ranged: { range: 6, dmg: [1, 3], rate: 0.6, kind: 'arrow' }, kite: true },
  skeleton: { name: 'skeleton', hp: 14, dmg: [3, 6], acc: 75, def: 2, speed: 100, xp: 6, depth: [3, 8], weight: 7 },
  ogre: { name: 'ogre', hp: 26, dmg: [4, 9], acc: 70, def: 2, speed: 80, xp: 10, depth: [5, 8], weight: 4 },
  wraith: { name: 'wraith', hp: 16, dmg: [3, 6], acc: 80, def: 3, speed: 120, xp: 10, depth: [6, 8], weight: 4 },
  imp: { name: 'fire imp', hp: 12, dmg: [2, 4], acc: 80, def: 2, speed: 100, xp: 9, depth: [6, 8], weight: 4, ranged: { range: 5, dmg: [3, 6], rate: 0.5, kind: 'fire' }, kite: true },
  warden: { name: 'Forge Warden', hp: 100, dmg: [6, 11], acc: 80, def: 4, speed: 100, xp: 60, boss: true },
};

export const ITEMS = {
  heal: { name: 'potion of healing', kind: 'potion', weight: 8, depth: [1, 8], text: 'Heals 12 HP or 40% of your health, whichever is more.' },
  might: { name: 'potion of might', kind: 'potion', weight: 2, depth: [2, 8], text: 'Permanently adds 1 to your damage.' },
  vigor: { name: 'potion of vigor', kind: 'potion', weight: 2, depth: [2, 8], text: 'Permanently adds 6 to your maximum health.' },
  teleport: { name: 'scroll of teleport', kind: 'scroll', weight: 3, depth: [1, 8], text: 'Moves you to a distant part of the level.' },
  mapping: { name: 'scroll of mapping', kind: 'scroll', weight: 3, depth: [1, 8], text: 'Reveals the layout of the level.' },
  fire: { name: 'scroll of fire', kind: 'scroll', weight: 3, depth: [2, 8], text: 'Burns every monster in sight for 8–14 damage.' },
  slumber: { name: 'scroll of slumber', kind: 'scroll', weight: 3, depth: [1, 8], text: 'Puts every monster in sight to sleep for 20 turns.' },
  dagger: { name: 'dagger', kind: 'weapon', dmg: [1, 4], acc: 10, weight: 0, depth: [1, 1], text: 'Quick and accurate.' },
  sword: { name: 'sword', kind: 'weapon', dmg: [2, 6], acc: 5, weight: 3, depth: [1, 5], text: 'A sound blade.' },
  axe: { name: 'axe', kind: 'weapon', dmg: [3, 8], acc: 0, weight: 2, depth: [3, 8], text: 'Heavy hits.' },
  hammer: { name: 'warhammer', kind: 'weapon', dmg: [5, 11], acc: -10, weight: 1.5, depth: [5, 8], text: 'Crushing, but hard to land.' },
  leather: { name: 'leather armour', kind: 'armour', def: 1, weight: 3, depth: [1, 4], text: 'Light protection.' },
  chain: { name: 'chain mail', kind: 'armour', def: 3, weight: 2, depth: [3, 8], text: 'Solid protection.' },
  plate: { name: 'plate armour', kind: 'armour', def: 5, weight: 1, depth: [6, 8], text: 'The best protection the forge ever made.' },
  gold: { name: 'gold', kind: 'gold', weight: 0, depth: [1, 8] },
  heart: { name: 'Ember Heart', kind: 'heart', weight: 0, depth: [8, 8], text: 'The heart of the forge. Take it and the run is won.' },
};

// XP needed to go from level n to n + 1 is XP_LEVELS[n - 1] (cumulative)
export const XP_LEVELS = [10, 25, 45, 70, 100, 140, 190, 250, 320, 400, 500, 620, 760, 920, 1100];

const inDepth = (d, [a, b]) => d >= a && d <= b;
export const monsterTable = (depth) => Object.entries(MONSTERS).filter(([, m]) => !m.boss && inDepth(depth, m.depth)).map(([id, m]) => [id, m.weight]);
export const itemTable = (depth) => Object.entries(ITEMS).filter(([, it]) => it.weight > 0 && inDepth(depth, it.depth)).map(([id, it]) => [id, it.weight]);

export const article = (name) => (/^[A-Z]/.test(name) ? 'the' : /^[aeiou]/i.test(name) ? 'an' : 'a');
export const aName = (name) => `${article(name)} ${name}`;
export const theName = (name) => `the ${name}`;
export const cap = (s) => s[0].toUpperCase() + s.slice(1);
export function itemName(item) {
  if (item.id === 'gold') return `${item.n} gold`;
  return ITEMS[item.id].name;
}
