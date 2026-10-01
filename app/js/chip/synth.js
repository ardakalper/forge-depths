// Chiptune synth engine. Pure JS, no Web Audio objects: the same code runs inside the AudioWorklet
// for live playback and in the main thread for WAV export, so both are sample-identical.
//
// Timing follows classic trackers: the clock ticks at bpm * 2 / 5 Hz (125 BPM → 50 Hz) and a row
// lasts `speed` ticks. Effects and envelopes advance once per tick; oscillators run per sample.

export const CHANNELS = 4;
export const NOTE_OFF = -1;
export const WAVES = ['pulse', 'saw', 'triangle', 'noise'];
export const DUTIES = [0.125, 0.25, 0.5, 0.75];
export const midiToFreq = (n) => 440 * 2 ** ((n - 69) / 12);
export const tickRate = (bpm) => (bpm * 2) / 5;
export const samplesPerTick = (bpm, sr) => sr / tickRate(bpm);

// NES-style 4-bit triangle: 32 steps, 15 → 0 → 15
export const TRI_STEPS = Array.from({ length: 32 }, (_, i) => (i < 16 ? 15 - i : i - 16));

// 15-bit LFSR noise; short mode taps bit 6 for the metallic 93-step loop
export function lfsrStep(reg, short) {
  const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
  return (reg >> 1) | (bit << 14);
}

function newVoice() {
  return {
    inst: null, note: null, freq: 0, slideFreq: 0, active: false, released: false,
    env: 0, stage: 'off', stageTick: 0, vol: 15, phase: 0, noiseAcc: 0, lfsr: 1, out: 0,
    fx: 0, param: 0, vibPos: 0, arp: 0, peak: 0,
  };
}

export class Player {
  // song: see song.js. sampleRate in Hz. opts.loop: wrap at the end of the order list.
  constructor(song, sampleRate, { loop = true } = {}) {
    this.song = song; this.sr = sampleRate; this.loop = loop; this.loopPattern = null;
    this.voices = Array.from({ length: CHANNELS }, newVoice);
    this.mute = new Array(CHANNELS).fill(false);
    this.reset();
    this.dcIn = 0; this.dcOut = 0;
    this.jam = newVoice(); // preview voice for live keyboard playing
  }
  reset(order = 0, row = 0) {
    this.order = order; this.row = row; this.tick = 0;
    this.speed = this.song.speed; this.bpm = this.song.bpm;
    this.tickSamples = samplesPerTick(this.bpm, this.sr);
    this.sampleInTick = 0; this.ended = false; this.paused = false;
    for (const v of this.voices) Object.assign(v, newVoice());
  }
  pattern() { return this.song.patterns[this.song.order[this.order]]; }

  // ---- per tick ----
  startRow() {
    const pat = this.pattern();
    for (let ch = 0; ch < CHANNELS; ch++) {
      const cell = pat.cells[this.row][ch];
      const v = this.voices[ch];
      const [note, inst, vol, fx, param] = cell;
      v.fx = fx ?? 0; v.param = param ?? 0;
      if (fx === 0xf && param != null) { if (param < 0x20) this.speed = Math.max(1, param); else { this.bpm = param; this.tickSamples = samplesPerTick(this.bpm, this.sr); } }
      if (inst != null) v.inst = this.song.instruments[inst] ?? v.inst;
      if (note === NOTE_OFF) this.release(v);
      else if (note != null && v.inst) this.trigger(v, note);
      if (vol != null) v.vol = vol;
    }
  }
  trigger(v, note) {
    v.note = note; v.freq = midiToFreq(note); v.slideFreq = v.freq; v.active = true; v.released = false;
    v.stage = 'attack'; v.stageTick = 0; v.env = v.inst.attack === 0 ? 1 : 0; v.vibPos = 0; v.phase = 0; v.lfsr = 1;
    v.vol = 15;
  }
  release(v) { if (v.active) { v.released = true; v.stage = 'release'; v.stageTick = 0; v.relFrom = v.env; } }
  tickVoice(v, tick) {
    if (!v.active || !v.inst) return;
    const I = v.inst;
    // envelope (ticks)
    v.stageTick += 1;
    if (v.stage === 'attack') { v.env = I.attack ? Math.min(1, v.stageTick / I.attack) : 1; if (v.env >= 1) { v.stage = 'decay'; v.stageTick = 0; } }
    else if (v.stage === 'decay') { const s = I.sustain / 15; v.env = I.decay ? Math.max(s, 1 - (1 - s) * (v.stageTick / I.decay)) : s; if (v.env <= s) { v.stage = 'sustain'; v.env = s; } }
    else if (v.stage === 'release') { v.env = I.release ? Math.max(0, v.relFrom * (1 - v.stageTick / I.release)) : 0; if (v.env <= 0) { v.active = false; v.stage = 'off'; } }
    if (v.stage === 'sustain' && I.sustain === 0) { v.active = false; v.stage = 'off'; }
    // instrument pitch sweep (kicks, zaps) in semitones per tick
    if (I.sweep) v.slideFreq *= 2 ** (I.sweep / 12);
    // effects
    let semis = 0;
    const x = v.param >> 4, y = v.param & 15;
    if (v.fx === 0x0 && v.param) semis = [0, x, y][tick % 3];               // arpeggio 0xy
    else if (v.fx === 0x1) v.slideFreq *= 2 ** (v.param / (12 * 16));        // slide up, 1/16 semitone per tick
    else if (v.fx === 0x2) v.slideFreq *= 2 ** (-v.param / (12 * 16));       // slide down
    else if (v.fx === 0xa) v.vol = Math.max(0, Math.min(15, v.vol + (x ? x : -y) * 0.5)); // volume slide
    if (I.arp && I.arp.length > 1) semis += I.arp[tick % I.arp.length];
    let vib = 0;
    const vd = v.fx === 0x4 ? y / 8 : I.vibDepth, vs = v.fx === 0x4 ? Math.max(1, x) : I.vibSpeed;
    if (vd) { v.vibPos += 1; vib = Math.sin((v.vibPos / Math.max(1, 16 / vs)) * Math.PI) * vd; }
    v.freq = Math.max(8, Math.min(16000, v.slideFreq * 2 ** ((semis + vib) / 12)));
  }
  doTick() {
    if (this.tick === 0) this.startRow();
    for (const v of this.voices) this.tickVoice(v, this.tick);
    this.tickVoice(this.jam, this.tick);
    this.tick += 1;
    if (this.tick >= this.speed) {
      this.tick = 0; this.row += 1;
      if (this.row >= this.pattern().rows) {
        this.row = 0;
        if (this.loopPattern != null) { this.order = this.loopPattern; return; }
        this.order += 1;
        if (this.order >= this.song.order.length) { if (this.loop) this.order = 0; else { this.order = this.song.order.length - 1; this.row = this.pattern().rows - 1; this.ended = true; } }
      }
    }
  }

  // ---- per sample ----
  voiceSample(v) {
    if (!v.active || !v.inst) return 0;
    const I = v.inst, f = v.freq;
    let s;
    if (I.wave === 'noise') {
      v.noiseAcc += (f * 8) / this.sr;
      while (v.noiseAcc >= 1) { v.noiseAcc -= 1; v.lfsr = lfsrStep(v.lfsr, I.noiseShort); }
      s = v.lfsr & 1 ? -1 : 1;
    } else {
      v.phase += f / this.sr; if (v.phase >= 1) v.phase -= Math.floor(v.phase);
      if (I.wave === 'pulse') s = v.phase < I.duty ? 1 : -1;
      else if (I.wave === 'saw') s = Math.floor(v.phase * 16) / 7.5 - 1;
      else s = TRI_STEPS[Math.floor(v.phase * 32) & 31] / 7.5 - 1;
    }
    return s * v.env * (v.vol / 15) * (I.volume / 15) * 0.22;
  }
  // Fills `out` (Float32Array) with mono samples; `chOut` optional per-channel peak array.
  process(out) {
    for (let i = 0; i < out.length; i++) {
      if (this.sampleInTick <= 0) { if (!this.ended && !this.paused) this.doTick(); else this.idleTick(); this.sampleInTick += this.tickSamples; }
      this.sampleInTick -= 1;
      let mix = 0;
      for (let ch = 0; ch < CHANNELS; ch++) {
        const s = this.voiceSample(this.voices[ch]);
        const v = this.voices[ch];
        v.peak = Math.max(v.peak * 0.9995, Math.abs(s));
        if (!this.mute[ch]) mix += s;
      }
      mix += this.voiceSample(this.jam);
      // DC blocker, then a gentle soft clip
      const y = mix - this.dcIn + 0.996 * this.dcOut; this.dcIn = mix; this.dcOut = y;
      out[i] = Math.tanh(y * 1.2) / 1.2;
    }
    return out;
  }
  // stopped or finished: no row advance, voices fade out, the jam voice keeps its envelope running
  idleTick() {
    for (const v of this.voices) { if (v.active && !v.released) this.release(v); this.tickVoice(v, this.tick); }
    this.tickVoice(this.jam, this.tick);
    this.tick = (this.tick + 1) % Math.max(1, this.speed);
  }
  stop() { this.paused = true; for (const v of this.voices) this.release(v); }
  // Preview a note on the jam voice (instrument editor / keyboard)
  jamNote(note, inst) { this.jam.inst = this.song.instruments[inst]; if (note === NOTE_OFF) this.release(this.jam); else this.trigger(this.jam, note); }
  position() { return { order: this.order, row: this.row, ended: this.ended }; }
}

// Exact song length in samples (no loop), following speed / tempo changes in the effect column.
export function songSamples(song, sr) {
  let speed = song.speed, bpm = song.bpm, total = 0;
  for (const pi of song.order) {
    const p = song.patterns[pi];
    for (let r = 0; r < p.rows; r++) {
      for (const cell of p.cells[r]) if (cell[3] === 0xf && cell[4] != null) { if (cell[4] < 0x20) speed = Math.max(1, cell[4]); else bpm = cell[4]; }
      total += speed * samplesPerTick(bpm, sr);
    }
  }
  return Math.ceil(total);
}

// Offline render of the whole song (plus a release tail) to a Float32Array.
export function renderSong(song, sr = 44100, { tail = 0.6, mute } = {}) {
  const p = new Player(song, sr, { loop: false });
  if (mute) p.mute = mute.slice();
  const n = songSamples(song, sr) + Math.round(tail * sr);
  return p.process(new Float32Array(n));
}
