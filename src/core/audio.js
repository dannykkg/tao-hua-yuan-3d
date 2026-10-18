export class Ambience {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.streamGain = null;
    this.windGain = null;
    this.caveGain = null;
    this.birdTimer = 6;
    this.pluckTimer = 9;
    this.started = false;
    this.lastChirp = 0;
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.enabled ? 0.42 : 0;
    master.connect(ctx.destination);
    this.master = master;

    // shared noise buffer
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    this.noiseBuffer = buf;

    // stream: band-passed noise, softly modulated
    const stream = ctx.createBufferSource();
    stream.buffer = buf;
    stream.loop = true;
    const sf = ctx.createBiquadFilter();
    sf.type = "bandpass";
    sf.frequency.value = 680;
    sf.Q.value = 0.65;
    const sg = ctx.createGain();
    sg.gain.value = 0.0;
    stream.connect(sf).connect(sg).connect(master);
    stream.start();
    this.streamGain = sg;

    // wind: low-passed noise, very quiet
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = "lowpass";
    wf.frequency.value = 240;
    const wg = ctx.createGain();
    wg.gain.value = 0.07;
    wind.connect(wf).connect(wg).connect(master);
    wind.start();
    this.windGain = wg;

    // cave drone
    const drone = ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 58;
    const dg = ctx.createGain();
    dg.gain.value = 0.0;
    drone.connect(dg).connect(master);
    drone.start();
    this.caveGain = dg;

    this.started = true;
    this.schedule();
  }

  schedule() {
    if (!this.ctx) return;
    const loop = () => {
      if (!this.enabled) {
        setTimeout(loop, 4000);
        return;
      }
      this.chirp();
      setTimeout(loop, 7000 + Math.random() * 12000);
    };
    setTimeout(loop, 3500 + Math.random() * 4000);
    const pluckLoop = () => {
      if (!this.enabled) {
        setTimeout(pluckLoop, 6000);
        return;
      }
      this.pluck();
      setTimeout(pluckLoop, 7000 + Math.random() * 10000);
    };
    setTimeout(pluckLoop, 6000);
  }

  chirp() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2100 + Math.random() * 1400;
    for (let i = 0; i < notes; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const st = t + i * (0.08 + Math.random() * 0.08);
      osc.frequency.setValueAtTime(base, st);
      osc.frequency.exponentialRampToValueAtTime(base * (1.12 + Math.random() * 0.25), st + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.85, st + 0.14);
      g.gain.setValueAtTime(0.0, st);
      g.gain.linearRampToValueAtTime(0.025 + Math.random() * 0.02, st + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.2);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() - 0.5) * 1.4;
      osc.connect(g).connect(pan).connect(this.master);
      osc.start(st);
      osc.stop(st + 0.24);
    }
  }

  pluck() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const scale = [146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63];
    const f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() > 0.75 ? 2 : 1);
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    osc.type = "triangle";
    osc2.type = "sine";
    osc.frequency.value = f;
    osc2.frequency.value = f * 2.01;
    const dur = 5 + Math.random() * 3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.018, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.5);
    osc.connect(g).connect(this.master);
    osc2.connect(g2).connect(this.master);
    osc.start(t); osc2.start(t);
    osc.stop(t + dur + 0.1); osc2.stop(t + dur * 0.55);
  }

  update(dt, { streamDistance = 20, caveFactor = 0, wind = 0.08 } = {}) {
    if (!this.ctx || !this.streamGain) return;
    const near = Math.max(0, 1 - streamDistance / 18);
    const target = this.enabled ? (0.018 + near * 0.065) * (1 - caveFactor * 0.85) : 0;
    this.streamGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
    this.windGain.gain.setTargetAtTime(this.enabled ? wind * (0.7 + 0.5 * Math.random() * 0) : 0, this.ctx.currentTime, 0.8);
    this.caveGain.gain.setTargetAtTime(this.enabled ? caveFactor * 0.055 : 0, this.ctx.currentTime, 0.6);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) {
      if (on) this.ensure();
      return;
    }
    this.master.gain.setTargetAtTime(on ? 0.42 : 0, this.ctx.currentTime, 0.15);
    if (on && this.ctx.state === "suspended") this.ctx.resume();
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }
}
