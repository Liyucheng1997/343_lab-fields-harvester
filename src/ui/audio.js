// 程序合成音效：柴油机、脱粒滚筒、秸秆抛撒、风声、卸粮
export class FarmAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  start() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // 棕噪声
      d[i] = last * 3.5 * 0.5 + w * 0.5 * 0.15;
    }
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };

    // 发动机：两路锯齿波 + 低通
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0.18;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.8;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 36;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 72;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    this.osc1.connect(lp); this.osc2.connect(g2); g2.connect(lp);
    // 发动机的“突突”调制
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 18;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.06;
    this.lfo.connect(lfoG); lfoG.connect(this.engGain.gain);
    lp.connect(this.engGain); this.engGain.connect(this.master);
    this.osc1.start(); this.osc2.start(); this.lfo.start();

    // 脱粒滚筒轰鸣
    this.thrGain = ctx.createGain(); this.thrGain.gain.value = 0;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 160; bp.Q.value = 0.9;
    noise().connect(bp); bp.connect(this.thrGain); this.thrGain.connect(this.master);

    // 秸秆抛撒沙沙声
    this.chaffGain = ctx.createGain(); this.chaffGain.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    noise().connect(hp); hp.connect(this.chaffGain); this.chaffGain.connect(this.master);

    // 风
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.05;
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 500;
    this.windFilter = wl;
    noise().connect(wl); wl.connect(this.windGain); this.windGain.connect(this.master);

    // 卸粮
    this.unlGain = ctx.createGain(); this.unlGain.gain.value = 0;
    const ub = ctx.createBiquadFilter(); ub.type = 'bandpass'; ub.frequency.value = 1100; ub.Q.value = 0.6;
    noise().connect(ub); ub.connect(this.unlGain); this.unlGain.connect(this.master);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.start();
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.3);
  }

  update({ speed, load, threshing, cutRate, storm, unloading, camDist }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const rpm = 0.55 + Math.min(1, Math.abs(speed) / 7) * 0.3 + load * 0.25 + (threshing ? 0.1 : 0);
    this.osc1.frequency.setTargetAtTime(30 + rpm * 22, t, 0.2);
    this.osc2.frequency.setTargetAtTime(60 + rpm * 44, t, 0.2);
    this.lfo.frequency.setTargetAtTime(14 + rpm * 10, t, 0.2);
    const near = 1 / (1 + Math.max(0, camDist - 8) * 0.04);
    this.engGain.gain.setTargetAtTime(0.16 * near, t, 0.2);
    this.thrGain.gain.setTargetAtTime((threshing ? 0.22 + load * 0.4 : 0) * near, t, 0.3);
    this.chaffGain.gain.setTargetAtTime(Math.min(0.12, cutRate * 0.0012) * near, t, 0.3);
    this.windGain.gain.setTargetAtTime(0.04 + storm * 0.35, t, 0.5);
    this.windFilter.frequency.setTargetAtTime(400 + storm * 900, t, 0.5);
    this.unlGain.gain.setTargetAtTime(unloading ? 0.12 * near : 0, t, 0.2);
  }
}
