// Balance check: a simple bot plays many seeded runs and reports how deep it gets.
// The bot (app/js/bot.js) explores, fights what it sees, drinks healing below 40% and wears the best gear.
// A careful human does better; the numbers are for spotting a level that is far too hard or easy.
// Usage: node tools/balance.mjs [runs]
import * as G from '../app/js/game.js';
import { botAction } from '../app/js/bot.js';
export { botAction };

export function playRun(seed, maxTurns = 15000) {
  const s = G.newGame({ seed });
  s.botChase = null;
  while (!s.over && s.turn < maxTurns) {
    const before = s.turn, a = botAction(s);
    G.act(s, a);
    if (s.turn === before) G.act(s, { type: 'wait' }); // the bot bumped into something: let time pass
  }
  return s;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = Number(process.argv[2] ?? 200);
  const depths = new Array(9).fill(0), causes = {};
  let wins = 0, turns = 0, stuck = 0, levels = 0;
  const t0 = performance.now();
  for (let r = 0; r < runs; r++) {
    const s = playRun(`bal-${r}`);
    if (s.over?.won) wins++; else if (s.over) causes[s.over.cause] = (causes[s.over.cause] ?? 0) + 1; else stuck++;
    depths[s.stats.maxDepth]++; turns += s.turn; levels += s.player.level;
  }
  console.log(`${runs} runs in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`wins ${wins} (${((wins / runs) * 100).toFixed(1)}%), timed out ${stuck}, avg turns ${(turns / runs).toFixed(0)}, avg level ${(levels / runs).toFixed(1)}`);
  console.log('deepest depth reached:', depths.slice(1).map((n, i) => `${i + 1}:${n}`).join('  '));
  console.log('killed by:', Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
}
