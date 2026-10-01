// Sound: one AudioWorklet runs Chiptune Studio's engine. It plays the current track, and its jam
// voice plays the sound effects on top. Nothing starts before the first click or key press.
import { SONGS, JINGLES, SFX } from './music.js';

export class Sound {
  constructor() { this.ctx = null; this.node = null; this.music = true; this.sfx = true; this.track = null; this.playing = null; this.starting = null; }
  start() {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      await this.ctx.audioWorklet.addModule(new URL('./chip/worklet.js', import.meta.url));
      this.node = new AudioWorkletNode(this.ctx, 'chip-processor', { outputChannelCount: [2] });
      this.gain = this.ctx.createGain(); this.gain.gain.value = 0.8;
      this.node.connect(this.gain).connect(this.ctx.destination);
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.apply();
    })().catch((e) => { console.warn('audio unavailable', e); });
    return this.starting;
  }
  // choose the music for what is on screen; it only restarts when the track changes
  play(track) { this.track = track; this.apply(); }
  apply() {
    if (!this.node) return;
    const want = this.music ? this.track : null;
    if (want === this.playing) return;
    this.node.port.postMessage({ type: 'song', song: SONGS[this.track ?? 'depths'] });
    this.node.port.postMessage(want ? { type: 'play' } : { type: 'stop' });
    this.playing = want;
  }
  setMusic(on) { this.music = on; this.apply(); }
  setSfx(on) { this.sfx = on; }
  note(n, inst) { if (this.sfx && this.node) this.node.port.postMessage({ type: 'jam', note: n, inst }); }
  jingle(name) {
    const [notes, inst, gap] = JINGLES[name];
    notes.forEach((n, i) => setTimeout(() => this.note(n, inst), i * gap));
  }
  // game events → sound
  events(ev) {
    for (const e of ev) {
      if (e.t === 'hit') this.note(e.crit ? 50 : 58, SFX.hit);
      else if (e.t === 'hurt') this.note(e.ranged ? 60 : 50, SFX.hurt);
      else if (e.t === 'miss') this.note(96, SFX.hat);
      else if (e.t === 'die') this.note(36, SFX.roar);
      else if (e.t === 'door') this.note(43, SFX.thud);
      else if (e.t === 'shot') this.note(e.kind === 'fire' ? 55 : 79, SFX.zap);
      else if (e.t === 'pickup') { if (e.id === 'gold') this.jingle('gold'); else this.note(79, SFX.blip); }
      else if (e.t === 'heal' || e.t === 'buff') this.jingle('heal');
      else if (e.t === 'levelup') this.jingle('levelup');
      else if (e.t === 'descend') this.jingle('descend');
      else if (e.t === 'teleport' || e.t === 'mapping') this.note(60, SFX.zap);
      else if (e.t === 'fire' || e.t === 'summon') this.note(48, SFX.roar);
      else if (e.t === 'slumber') this.note(84, SFX.chime);
      else if (e.t === 'death') this.jingle('death');
      else if (e.t === 'win') this.jingle('victory');
    }
  }
}
