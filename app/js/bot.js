// A simple player used for the title screen's attract mode, the balance tool and the tests.
// It explores, fights whatever is in sight, drinks healing below 40% and wears the best gear.
import * as G from './game.js';
import { ITEMS } from './data.js';

const avg = (r) => (r[0] + r[1]) / 2;
export function botAction(s) {
  const p = s.player, inv = p.inv;
  const find = (pred) => inv.findIndex(pred);
  let i = find((it) => it.id === 'might' || it.id === 'vigor');
  if (i >= 0) return { type: 'use', index: i };
  i = find((it) => ITEMS[it.id].kind === 'weapon' && avg(ITEMS[it.id].dmg) + ITEMS[it.id].acc / 10 > avg(ITEMS[p.weapon.id].dmg) + ITEMS[p.weapon.id].acc / 10);
  if (i >= 0) return { type: 'use', index: i };
  i = find((it) => ITEMS[it.id].kind === 'armour' && ITEMS[it.id].def > G.playerDef(p));
  if (i >= 0) return { type: 'use', index: i };
  const threats = G.threats(s);
  if (p.hp < p.maxHp * 0.4 && (i = find((it) => it.id === 'heal')) >= 0) return { type: 'use', index: i };
  if (threats.length >= 3 && (i = find((it) => it.id === 'fire')) >= 0) return { type: 'use', index: i };
  if (p.hp < p.maxHp * 0.3 && threats.length && (i = find((it) => it.id === 'slumber' || it.id === 'teleport')) >= 0) return { type: 'use', index: i };
  const near = (ms) => ms.sort((a, b) => Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) - Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)))[0];
  if (threats.length) {
    const m = near(threats);
    s.botChase = [m.x, m.y];
    if (Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) === 1) return { type: 'move', dx: m.x - p.x, dy: m.y - p.y };
    const t = G.travelStep(s, m.x, m.y);
    if (t) return t;
  }
  // go where the last enemy was seen before exploring on
  if (s.botChase) {
    const [cx, cy] = s.botChase;
    const t = (cx !== p.x || cy !== p.y) && G.travelStep(s, cx, cy);
    if (t) return t;
    s.botChase = null;
  }
  const step = G.exploreStep(s);
  if (step) return step;
  if (G.onStairs(s)) return { type: 'descend' };
  if (s.map.stairs && s.map.explored[G.idx(...s.map.stairs)]) { const t = G.travelStep(s, ...s.map.stairs); if (t) return t; }
  if ((i = find((it) => it.id === 'mapping')) >= 0) return { type: 'use', index: i };
  // last depth: go and find the Warden in its arena
  if (s.map.arena) { const a = s.map.arena, t = G.travelStep(s, a.x + (a.w >> 1), a.y + (a.h >> 1)); if (t) return t; }
  // something is in the way (often asleep in a corridor): go and fight the nearest monster the bot can reach
  for (const m of s.monsters.slice().sort((a, b) => Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) - Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)))) {
    if (!s.map.explored[G.idx(m.x, m.y)]) continue;
    if (Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) === 1) return { type: 'move', dx: m.x - p.x, dy: m.y - p.y };
    const t = G.travelStep(s, m.x, m.y);
    if (t) return t;
  }
  return { type: 'wait' };
}
