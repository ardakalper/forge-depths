// The soundtrack, written for Chiptune Studio's engine (js/chip/synth.js): four channels of pulse,
// saw, 4-bit triangle and LFSR noise. Songs use Chiptune Studio's song format, so they can be
// opened and edited there. Instruments 8 and up are sound effects, played on the engine's jam voice.

const NOTE_OFF = -1;
const inst = (name, wave, o) => ({ name, wave, duty: 0.5, attack: 0, decay: 8, sustain: 0, release: 0, volume: 12, sweep: 0, vibDepth: 0, vibSpeed: 4, arp: null, noiseShort: false, ...o });

export const INSTRUMENTS = [
  inst('Lead', 'pulse', { duty: 0.25, decay: 10, sustain: 9, release: 8, volume: 10, vibDepth: 0.15, vibSpeed: 3 }),
  inst('Arp', 'pulse', { duty: 0.125, decay: 14, sustain: 5, release: 4, volume: 7 }),
  inst('Bass', 'triangle', { decay: 0, sustain: 15, release: 3, volume: 15 }),
  inst('Kick', 'triangle', { decay: 6, volume: 15, sweep: -2.2 }),
  inst('Snare', 'noise', { decay: 7, volume: 10 }),
  inst('Hat', 'noise', { decay: 2, volume: 6, noiseShort: true }),
  inst('Saw', 'saw', { attack: 1, decay: 10, sustain: 8, release: 6, volume: 9, vibDepth: 0.1, vibSpeed: 4 }),
  inst('Hum', 'pulse', { duty: 0.5, attack: 6, decay: 20, sustain: 7, release: 14, volume: 7, vibDepth: 0.08, vibSpeed: 2 }),
  // sound effects
  inst('sfx hit', 'noise', { decay: 4, volume: 13 }),
  inst('sfx hurt', 'pulse', { duty: 0.5, decay: 9, volume: 13, sweep: -1.4 }),
  inst('sfx blip', 'pulse', { duty: 0.25, decay: 5, volume: 10 }),
  inst('sfx zap', 'saw', { decay: 8, volume: 10, sweep: 1.1 }),
  inst('sfx thud', 'triangle', { decay: 6, volume: 15, sweep: -1.8 }),
  inst('sfx roar', 'noise', { decay: 26, volume: 12 }),
  inst('sfx chime', 'triangle', { decay: 14, volume: 13 }),
];
export const SFX = { hit: 8, hurt: 9, blip: 10, zap: 11, thud: 12, roar: 13, chime: 14, hat: 5 };

const CH = 4;
const emptyPattern = (rows) => ({ rows, cells: Array.from({ length: rows }, () => Array.from({ length: CH }, () => [null, null, null, null, null])) });

// One pattern from parts:
//   lead   [[row, note], ...] on channel 0 with instrument `leadInst`
//   chords [[root, arpParam], [root, arpParam]]: two half-pattern chords, arpeggiated on channel 1
//   bass   (row, root) → note | null, on channel 2
//   drums  16-step string: K kick, S snare, H hat, '.' rest
function pattern({ rows = 32, lead, leadInst = 0, chords, bass, drums }) {
  const p = emptyPattern(rows), half = rows / 2;
  for (const [row, n] of lead) p.cells[row][0] = [n, n === NOTE_OFF ? null : leadInst, null, null, null];
  chords.forEach(([root, arp], h) => {
    for (let r = 0; r < half; r++) p.cells[h * half + r][1] = [r === 0 ? root + 24 : null, r === 0 ? 1 : null, null, 0x0, arp];
    for (let r = 0; r < half; r++) { const n = bass(r, root); if (n != null) p.cells[h * half + r][2] = [n, 2, null, null, null]; }
  });
  for (let r = 0; r < rows; r++) {
    const d = drums[r % drums.length];
    if (d === 'K') p.cells[r][3] = [52, 3, null, null, null];
    else if (d === 'S') p.cells[r][3] = [70, 4, null, null, null];
    else if (d === 'H') p.cells[r][3] = [96, 5, null, null, null];
  }
  return p;
}

const MIN = 0x37, MAJ = 0x47;

// "Old Stone": D minor, slow and low, for the upper depths and the title screen
function depths() {
  const bass = (r, root) => (r === 0 ? root : r === 6 ? root + 7 : r === 8 ? root + 12 : r === 12 ? root + 7 : null);
  const drums = 'K.......H...S...K.......H.......';
  const P = (lead, chords) => pattern({ lead, leadInst: 7, chords, bass, drums });
  return {
    title: 'Old Stone', bpm: 96, speed: 6, instruments: structuredClone(INSTRUMENTS),
    patterns: [
      P([[0, 69], [6, 67], [8, 65], [12, 64], [16, 62], [22, 65], [24, 70], [28, 69]], [[38, MIN], [34, MAJ]]),
      P([[0, 67], [4, 70], [8, 69], [12, 67], [16, 64], [20, 61], [24, 64], [28, NOTE_OFF]], [[31, MIN], [33, MAJ]]),
      P([[0, 74], [6, 72], [8, 69], [12, 65], [16, 67], [20, 64], [24, 72], [28, 69]], [[38, MIN], [36, MAJ]]),
      P([[0, 70], [4, 69], [8, 67], [12, 65], [16, 64], [20, 61], [24, 64], [30, NOTE_OFF]], [[34, MAJ], [33, MAJ]]),
    ],
    order: [0, 1, 0, 2, 3, 1],
  };
}

// "Heart Forge": E minor, driving, for the ember caves and the Warden
function forge() {
  const bass = (r, root) => (r % 2 === 0 ? root + (r % 4 === 2 ? 12 : 0) : null);
  const drums = 'K.H.S.H.K.K.S.HH';
  const P = (lead, chords) => pattern({ lead, leadInst: 6, chords, bass, drums });
  return {
    title: 'Heart Forge', bpm: 132, speed: 5, instruments: structuredClone(INSTRUMENTS),
    patterns: [
      P([[0, 76], [2, 74], [4, 71], [8, 71], [10, 72], [12, 74], [16, 72], [18, 71], [20, 67], [24, 69], [28, 71]], [[40, MIN], [36, MAJ]]),
      P([[0, 74], [2, 72], [4, 69], [8, 66], [12, 69], [16, 71], [20, 75], [24, 71], [28, NOTE_OFF]], [[38, MAJ], [35, MAJ]]),
      P([[0, 79], [4, 78], [6, 76], [8, 74], [12, 76], [16, 72], [20, 71], [22, 69], [24, 71], [28, 67]], [[40, MIN], [36, MAJ]]),
    ],
    order: [0, 1, 0, 2, 1],
  };
}

export const SONGS = { depths: depths(), forge: forge() };
export const trackFor = (depth) => (depth >= 7 ? 'forge' : 'depths');

// short jingles: [notes, instrument, ms between notes]
export const JINGLES = {
  levelup: [[72, 76, 79, 84], SFX.chime, 75],
  descend: [[67, 64, 60, 55, 48], SFX.thud, 90],
  death: [[64, 63, 62, 61, 60, 48], SFX.hurt, 160],
  victory: [[72, 76, 79, 84, 79, 84, 88], SFX.blip, 110],
  gold: [[84, 91], SFX.blip, 60],
  heal: [[72, 79, 84], SFX.chime, 70],
};
