/* 손맛 — Web Audio API 기반 사운드 (외부 오디오 파일 없이 코드로 직접 합성) */

const Sound = {
  enabled: true,
  ctx: null,
  masterGain: null,
  ambientNodes: null,

  _ensureContext() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this.enabled = false;
      return null;
    }
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.35;
    this.masterGain.connect(this.ctx.destination);
    return this.ctx;
  },

  /**
   * @param {'ambient'|'bite'|'reel'|'catch'|'ui'|'warn'} name
   */
  play(name) {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    switch (name) {
      case 'ui':
        this._tone(720, { duration: 0.08, type: 'triangle', gain: 0.35 });
        break;
      case 'reel':
        this._tone(300 + Math.random() * 60, { duration: 0.05, type: 'square', gain: 0.15 });
        break;
      case 'warn':
        this._tone(160, { duration: 0.16, type: 'sawtooth', gain: 0.2 });
        break;
      case 'bite':
        this._tone(523.25, { duration: 0.16, type: 'sine', gain: 0.45 });
        this._tone(783.99, { duration: 0.22, type: 'sine', gain: 0.4, delay: 0.12 });
        break;
      case 'catch':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
          this._tone(freq, { duration: 0.28, type: 'sine', gain: 0.32, delay: i * 0.09 })
        );
        break;
      case 'ambient':
        this._startAmbient();
        break;
      default:
        break;
    }
  },

  stop(name) {
    if (name === 'ambient') this._stopAmbient();
  },

  _tone(freq, opts) {
    const { duration = 0.15, type = 'sine', gain = 0.4, delay = 0 } = opts || {};
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  },

  _startAmbient() {
    if (this.ambientNodes) return;
    const ctx = this._ensureContext();
    if (!ctx) return;

    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start();
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.2);

    // 파도처럼 천천히 흔들리는 필터 주파수 (LFO)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    this.ambientNodes = { noise, filter, gain, lfo };
  },

  _stopAmbient() {
    if (!this.ambientNodes) return;
    const { noise, gain, lfo } = this.ambientNodes;
    const ctx = this.ctx;
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    setTimeout(() => {
      try {
        noise.stop();
        lfo.stop();
      } catch (e) {
        /* 이미 정지된 경우 무시 */
      }
    }, 500);
    this.ambientNodes = null;
  }
};
