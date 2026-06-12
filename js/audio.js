/* WebAudio synthesized sound effects — no audio assets required. */
'use strict';

class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastPlay = {};
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = .5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  throttle(name, ms) {
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < ms) return true;
    this.lastPlay[name] = now;
    return false;
  }

  tone({ f = 440, f2 = null, dur = .12, type = 'square', vol = .25, delay = 0, curve = 'exp' }) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    gn.gain.setValueAtTime(vol, t0);
    if (curve === 'exp') gn.gain.exponentialRampToValueAtTime(.0008, t0 + dur);
    else gn.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(gn); gn.connect(this.master);
    o.start(t0); o.stop(t0 + dur + .02);
  }

  noise({ dur = .25, vol = .3, delay = 0, lpFrom = 3000, lpTo = 300 }) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(lpFrom, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, lpTo), t0 + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(vol, t0);
    gn.gain.exponentialRampToValueAtTime(.0008, t0 + dur);
    src.connect(filt); filt.connect(gn); gn.connect(this.master);
    src.start(t0);
  }

  play(name) {
    if (this.muted) return;
    switch (name) {
      case 'chip':
        this.tone({ f: 880, dur: .07, type: 'square', vol: .18 });
        this.tone({ f: 1320, dur: .1, type: 'square', vol: .15, delay: .06 });
        break;
      case 'key':
        this.tone({ f: 1180, dur: .06, type: 'triangle', vol: .25 });
        this.tone({ f: 1570, dur: .09, type: 'triangle', vol: .22, delay: .05 });
        break;
      case 'boot':
        this.tone({ f: 392, f2: 784, dur: .16, type: 'sawtooth', vol: .14 });
        this.tone({ f: 588, f2: 1176, dur: .14, type: 'triangle', vol: .14, delay: .06 });
        break;
      case 'door':
        this.tone({ f: 220, f2: 440, dur: .12, type: 'square', vol: .15 });
        this.noise({ dur: .1, vol: .1, lpFrom: 1800, lpTo: 400 });
        break;
      case 'socket':
        this.tone({ f: 523, dur: .08, type: 'square', vol: .16 });
        this.tone({ f: 659, dur: .08, type: 'square', vol: .16, delay: .07 });
        this.tone({ f: 784, dur: .12, type: 'square', vol: .16, delay: .14 });
        break;
      case 'bump':
        if (this.throttle('bump', 150)) return;
        this.tone({ f: 95, f2: 60, dur: .06, type: 'square', vol: .1 });
        break;
      case 'push':
        if (this.throttle('push', 120)) return;
        this.noise({ dur: .09, vol: .12, lpFrom: 700, lpTo: 200 });
        break;
      case 'splash':
        this.noise({ dur: .3, vol: .25, lpFrom: 2400, lpTo: 250 });
        this.tone({ f: 340, f2: 90, dur: .25, type: 'sine', vol: .18 });
        break;
      case 'sizzle':
        this.noise({ dur: .3, vol: .2, lpFrom: 5000, lpTo: 900 });
        break;
      case 'boom':
        this.noise({ dur: .5, vol: .4, lpFrom: 1200, lpTo: 60 });
        this.tone({ f: 120, f2: 35, dur: .45, type: 'sine', vol: .35 });
        break;
      case 'death':
        this.tone({ f: 600, f2: 80, dur: .5, type: 'sawtooth', vol: .22 });
        this.noise({ dur: .4, vol: .22, lpFrom: 2000, lpTo: 100 });
        break;
      case 'teleport':
        this.tone({ f: 300, f2: 1400, dur: .18, type: 'sine', vol: .2 });
        this.tone({ f: 1400, f2: 300, dur: .18, type: 'sine', vol: .14, delay: .1 });
        break;
      case 'button':
        if (this.throttle('button', 80)) return;
        this.tone({ f: 660, f2: 510, dur: .05, type: 'square', vol: .12 });
        break;
      case 'toggle':
        this.tone({ f: 350, f2: 520, dur: .08, type: 'square', vol: .1 });
        break;
      case 'thief':
        this.tone({ f: 520, f2: 260, dur: .18, type: 'sawtooth', vol: .18 });
        this.tone({ f: 390, f2: 195, dur: .22, type: 'sawtooth', vol: .16, delay: .12 });
        break;
      case 'trap':
        this.tone({ f: 180, f2: 90, dur: .1, type: 'square', vol: .18 });
        break;
      case 'clone':
        this.tone({ f: 500, f2: 900, dur: .1, type: 'triangle', vol: .16 });
        break;
      case 'tictoc':
        this.tone({ f: 1050, dur: .05, type: 'square', vol: .14 });
        break;
      case 'win': {
        const seq = [523, 659, 784, 1047, 1319, 1568];
        seq.forEach((f, i) => this.tone({ f, dur: .16, type: 'square', vol: .2, delay: i * .09 }));
        this.tone({ f: 2093, dur: .5, type: 'triangle', vol: .18, delay: seq.length * .09, curve: 'lin' });
        break;
      }
      case 'start':
        this.tone({ f: 440, dur: .08, type: 'square', vol: .15 });
        this.tone({ f: 660, dur: .1, type: 'square', vol: .15, delay: .08 });
        break;
    }
  }
}
