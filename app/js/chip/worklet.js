// AudioWorklet: runs the same Player as the WAV exporter, so live playback is sample-identical.
import { Player, CHANNELS } from './synth.js';

class ChipProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.player = null; this.playing = false; this.lastPos = ''; this.meterAt = 0;
    this.port.onmessage = ({ data: m }) => {
      if (m.type === 'song') {
        if (!this.player) this.player = new Player(m.song, sampleRate);
        else { const { order, row } = this.player; this.player.song = m.song; if (order >= m.song.order.length) this.player.order = 0; if (row >= this.player.pattern().rows) this.player.row = 0; }
      } else if (m.type === 'play') {
        this.player.loop = true;
        this.player.reset(m.order ?? 0, m.row ?? 0); this.player.loopPattern = m.loopPattern ?? null; this.playing = true;
      } else if (m.type === 'stop') {
        this.playing = false; this.player.stop();
      } else if (m.type === 'mute') { if (this.player) this.player.mute = m.mute; }
      else if (m.type === 'jam') { if (this.player) this.player.jamNote(m.note, m.inst); }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!this.player) return true;
    const p = this.player;
    if (!this.playing) p.paused = true;
    p.process(out);
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    const pos = `${p.order}:${p.row}`;
    if (this.playing && pos !== this.lastPos) { this.lastPos = pos; this.port.postMessage({ type: 'pos', order: p.order, row: p.row }); }
    if (currentTime - this.meterAt > 1 / 30) { this.meterAt = currentTime; this.port.postMessage({ type: 'meter', peaks: p.voices.map((v) => v.peak), active: Array.from({ length: CHANNELS }, (_, i) => p.voices[i].active) }); }
    return true;
  }
}
registerProcessor('chip-processor', ChipProcessor);
