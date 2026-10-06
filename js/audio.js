// ---------------------------------------------------------------------------
// Audio: synthesized engine hum, ambient wind, and SFX using Web Audio API.
// No external files required. Must be started from a user gesture.
// ---------------------------------------------------------------------------

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.ambientGain = null;
    this.started = false;
  }

  init() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Engine: two detuned sawtooths through a lowpass.
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 800;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 60;
    const mix = this.ctx.createGain();
    mix.gain.value = 0.5;
    this.engineOsc.connect(mix);
    osc2.connect(mix);
    mix.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    osc2.start();
    this._osc2 = osc2;

    // Ambient: filtered noise loop.
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.06;
    const noise = this._noiseBuffer(2);
    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    src.connect(lp);
    lp.connect(this.ambientGain);
    this.ambientGain.connect(this.master);
    src.start();

    this.started = true;
  }

  _noiseBuffer(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    return buf;
  }

  // Update engine pitch/volume from speed (0..1) and throttle.
  engine(speedNorm, throttle) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const freq = 55 + speedNorm * 220 + throttle * 20;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.05);
    this._osc2.frequency.setTargetAtTime(freq * 1.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(400 + speedNorm * 2500, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.12 + throttle * 0.05, t, 0.05);
  }

  // Short SFX blips.
  beep(freq = 880, dur = 0.12, vol = 0.3) {
    if (!this.started) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(this.master);
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur);
  }

  boost() {
    if (!this.started) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.5);
  }

  pickup() { this.beep(1200, 0.1, 0.25); }
  collision() {
    if (!this.started) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = 90;
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }
  countdown(go) { this.beep(go ? 1046 : 660, go ? 0.4 : 0.15, 0.35); }
}