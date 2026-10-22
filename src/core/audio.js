import { clamp } from "./utils.js";
import { RNG } from "./rng.js";

const NOTE = (midi) => 440 * 2 ** ((midi - 69) / 12);

const SCALES = {
  menu: [0, 3, 5, 7, 10, 12, 15, 17],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  phrygian: [0, 1, 3, 5, 7, 8, 10, 12],
  lydian: [0, 2, 4, 6, 7, 9, 11, 12]
};

const MODES = ["minor", "dorian", "phrygian", "lydian"];

/**
 * Procedural synth soundtrack and sound effects. No audio assets are loaded,
 * which keeps the Mini App tiny and makes every stage's music unique.
 */
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuffer = null;
    this.musicTimer = null;
    this.musicMode = null;
    this.musicSeed = 1;
    this.nextNoteTime = 0;
    this.step = 0;
    this.bpm = 96;
    this.paused = false;
    this.started = false;
    this._lastPlay = new Map();
    this._sceneGain = 1;
    this._convolver = null;
    this._theme = null;
    this._scale = SCALES.minor;
    this._root = 45;
    this._bar = 0;
    this._musicGeneration = 0;
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        try {
          await this.ctx.resume();
        } catch {
          /* ignore */
        }
      }
      return true;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    try {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.75;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.#sfxGain();
      this.sfxBus.connect(this.master);

      this.noiseBuffer = this.#buildNoise();
      this.started = true;
      try {
        await this.ctx.resume();
      } catch {
        /* autoplay policy */
      }
      return true;
    } catch (error) {
      console.warn("WebAudio unavailable", error);
      this.ctx = null;
      return false;
    }
  }

  #buildNoise() {
    const length = this.ctx.sampleRate * 1.2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  #musicGain() {
    return this.settings.music ? 0.3 * clamp(this.settings.musicVolume, 0, 1) : 0;
  }

  #sfxGain() {
    return this.settings.sfx ? 0.52 * clamp(this.settings.sfxVolume, 0, 1) : 0;
  }

  setSettings(settings) {
    this.settings = settings;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.linearRampToValueAtTime(
      this.paused ? this.#musicGain() * 0.22 : this.#musicGain(),
      now + 0.18
    );
    this.sfxBus.gain.cancelScheduledValues(now);
    this.sfxBus.gain.linearRampToValueAtTime(this.#sfxGain(), now + 0.12);
    if (!settings.music) this.stopMusic(0.25);
  }

  async unlock() {
    const ok = await this.init();
    if (!ok) return false;
    if (this.settings.music) {
      if (!this.musicMode) this.startMusic("menu");
      else this.setPaused(false);
    }
    return true;
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.ctx || !this.musicBus) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.linearRampToValueAtTime(
      this.#musicGain() * (paused ? 0.22 : 1),
      now + 0.2
    );
  }

  startMusic(mode = "menu", options = {}) {
    if (!this.ctx) return;
    const seed = options.seed ?? (mode === "menu" ? 117 : Date.now());
    if (this.musicMode === mode && this.musicSeed === seed && this.musicTimer) {
      this.setPaused(false);
      return;
    }
    this.stopMusic(0.18);
    this.musicMode = mode;
    this.musicSeed = seed >>> 0 || 1;
    this.paused = false;
    this.bpm = mode === "menu" ? 77 : clamp(options.tempo || 102, 82, 126);
    this._root = mode === "menu" ? 40 : options.root ?? 41;
    this._scale = SCALES[mode === "menu" ? "menu" : MODES[(options.mode || 0) % MODES.length]];
    this.step = 0;
    this._bar = 0;
    this._theme = null;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.#buildTheme();
    if (!this.settings.music) return;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), this.ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(this.#musicGain(), this.ctx.currentTime + 0.6);
    this.musicTimer = window.setInterval(() => this.#scheduleAhead(), 52);
    this.#scheduleAhead();
  }

  stopMusic(fade = 0.2) {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.musicBus) {
      const now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.linearRampToValueAtTime(0, now + Math.max(0.01, fade));
    }
    this.musicMode = null;
  }

  #buildTheme() {
    const rng = new RNG(this.musicSeed + this._bar * 7919);
    const scale = this._scale;
    const pickup = () => scale[Math.floor(rng.next() * scale.length)] + (rng.chance(0.22) ? 12 : 0);
    const motif = Array.from({ length: 16 }, () => (rng.chance(0.52) ? pickup() : null));
    const bass = Array.from({ length: 8 }, (_, index) => {
      const chordTones = [0, 2, 4, 7];
      return scale[chordTones[index % chordTones.length]] - 12 + (index === 6 && rng.chance(0.35) ? -2 : 0);
    });
    const kicks = new Set([0, 8]);
    if (this.musicMode !== "menu" && rng.chance(0.6)) kicks.add(11);
    if (this.musicMode !== "menu" && rng.chance(0.35)) kicks.add(14);
    const snares = this.musicMode === "menu" ? new Set([12]) : new Set([4, 12]);
    if (this.musicMode !== "menu" && rng.chance(0.32)) snares.add(7);
    this._theme = {
      motif,
      bass,
      kicks,
      snares,
      padRoot: scale[Math.floor(rng.next() * 3)] + (this.musicMode === "menu" ? -12 : -24),
      padColors: [0, 3, 5, 7].map((i) => scale[i % scale.length]),
      swing: this.musicMode === "menu" ? 0.02 : 0.035
    };
    if (this._theme) this._musicGeneration += 1;
  }

  #scheduleAhead() {
    if (!this.ctx || !this._theme || !this.settings.music) return;
    if (this.ctx.state === "suspended") return;
    const horizon = this.ctx.currentTime + 0.2;
    while (this.nextNoteTime < horizon) {
      this.#scheduleStep(this.step, this.nextNoteTime);
      const sixteenth = 60 / this.bpm / 4;
      this.nextNoteTime += sixteenth;
      this.step += 1;
      if (this.step >= 32) {
        this.step = 0;
        this._bar += 1;
        this.#buildTheme();
      }
    }
  }

  #scheduleStep(step, time) {
    const theme = this._theme;
    if (!theme) return;
    const sm = step % 16;
    const menu = this.musicMode === "menu";
    const stepDur = 60 / this.bpm / 4;

    if (theme.kicks.has(sm)) this.#kick(time, menu ? 0.2 : 0.32);
    if (theme.snares.has(sm)) this.#snare(time, menu ? 0.045 : 0.075);
    if (!menu && sm % 2 === 0) this.#hat(time, sm % 4 === 0 ? 0.025 : 0.014);
    if (menu && sm % 4 === 2) this.#hat(time, 0.012);

    const bassNote = theme.bass[Math.floor(sm / 2) % theme.bass.length];
    if (sm % 2 === 0 || (menu && sm === 5)) {
      const midi = this._root + bassNote;
      this.#tone({
        freq: NOTE(midi),
        type: menu ? "sine" : "triangle",
        time,
        duration: menu ? stepDur * 3.6 : stepDur * 1.7,
        gain: menu ? 0.11 : 0.15,
        filter: menu ? 420 : 680,
        attack: 0.015,
        release: 0.20,
        send: 0.1
      });
    }

    if (sm % 8 === 0) {
      const chordRoot = this._root + theme.padRoot;
      theme.padColors.slice(0, menu ? 3 : 2).forEach((interval, index) => {
        this.#tone({
          freq: NOTE(chordRoot + interval + 24),
          type: "sine",
          time: time + index * 0.03,
          duration: stepDur * (menu ? 12 : 9),
          gain: menu ? 0.022 : 0.018,
          filter: 1500,
          attack: 0.6,
          release: 1.3,
          send: 0.38,
          detune: index * 4 - 4
        });
      });
    }

    const motifNote = theme.motif[sm];
    if (motifNote !== null && motifNote !== undefined) {
      const octave = menu && Math.random() < 0.5 ? 24 : 12;
      const midi = this._root + motifNote + octave;
      this.#tone({
        freq: NOTE(midi),
        type: menu ? "sine" : this._musicGeneration % 3 === 0 ? "triangle" : "square",
        time: time + (sm % 2 === 1 ? theme.swing : 0),
        duration: stepDur * (menu ? 3.1 : 1.2),
        gain: menu ? 0.027 : 0.021,
        filter: menu ? 2200 : 2800,
        attack: 0.008,
        release: 0.7,
        send: 0.46,
        detune: 2
      });
    }

    if (!menu && sm === 0 && this._bar % 4 === 3) {
      this.#riser(time, 0.22);
    }
  }

  #tone({ freq, type = "sine", time, duration, gain = 0.1, filter = 2000, attack = 0.01, release = 0.2, send = 0.2, detune = 0, pan = 0 }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const biquad = ctx.createBiquadFilter();
    const panner = ctx.createStereoPanner?.() || null;
    osc.type = type;
    osc.frequency.value = Math.max(20, freq);
    osc.detune.value = detune;
    biquad.type = "lowpass";
    biquad.frequency.value = filter;
    biquad.Q.value = 0.7;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + Math.max(0.003, attack));
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);
    osc.connect(biquad).connect(env);
    if (panner) {
      panner.pan.value = pan;
      env.connect(panner).connect(this.musicBus);
    } else {
      env.connect(this.musicBus);
    }
    if (send > 0) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send * 0.3;
      env.connect(sendGain).connect(this.musicBus);
    }
    osc.start(time);
    osc.stop(time + duration + release + 0.05);
    osc.onended = () => {
      try {
        osc.disconnect();
        biquad.disconnect();
        env.disconnect();
        if (panner) panner.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  #noise({ time, duration, gain = 0.1, filterType = "bandpass", frequency = 1200, q = 0.8, send = 0.1 }) {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(env).connect(this.sfxBus);
    source.start(time);
    source.stop(time + duration + 0.03);
    source.onended = () => {
      try {
        source.disconnect();
        filter.disconnect();
        env.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  #kick(time, volume = 0.3) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(125, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.15);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    osc.connect(gain).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  #snare(time, volume = 0.08) {
    this.#noise({
      time,
      duration: 0.17,
      gain: volume,
      filterType: "bandpass",
      frequency: 1850,
      q: 0.5
    });
    // A tiny body tone makes the snare feel less like pure static.
    this.#tone({
      freq: 187,
      type: "triangle",
      time,
      duration: 0.06,
      gain: volume * 0.55,
      filter: 800,
      attack: 0.004,
      release: 0.08,
      send: 0.05
    });
  }

  #hat(time, volume = 0.02) {
    this.#noise({
      time,
      duration: 0.045,
      gain: volume,
      filterType: "highpass",
      frequency: 6400,
      q: 0.4
    });
  }

  #riser(time, volume) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(620, time + 0.8);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, time);
    filter.frequency.exponentialRampToValueAtTime(4500, time + 0.8);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume * 0.18, time + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
    osc.connect(filter).connect(gain).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.95);
  }

  play(name, options = {}) {
    if (!this.ctx || !this.settings.sfx) return;
    const now = this.ctx.currentTime;
    const throttle = options.throttle ?? 0;
    if (throttle > 0) {
      const last = this._lastPlay.get(name) || 0;
      if (now - last < throttle) return;
      this._lastPlay.set(name, now);
    }
    const volume = clamp((options.volume ?? 1) * 0.7, 0, 2);
    const time = now;

    switch (name) {
      case "click":
        this.#sfxTone({ freq: 880, endFreq: 1120, type: "sine", time, duration: 0.05, gain: 0.08 * volume, filter: 5000 });
        break;
      case "back":
        this.#sfxTone({ freq: 520, endFreq: 360, type: "sine", time, duration: 0.08, gain: 0.08 * volume });
        break;
      case "hover":
        this.#sfxTone({ freq: 660, type: "sine", time, duration: 0.03, gain: 0.025 * volume });
        break;
      case "place":
        this.#sfxTone({ freq: 200, endFreq: 72, type: "sine", time, duration: 0.12, gain: 0.19 * volume });
        this.#sfxNoise({ time, duration: 0.05, gain: 0.04 * volume, frequency: 1300, type: "bandpass" });
        break;
      case "explosion": {
        const v = volume * (options.big ? 1.4 : 1);
        this.#sfxNoise({ time, duration: 0.55, gain: 0.36 * v, frequency: 620, type: "lowpass", q: 0.7 });
        this.#sfxNoise({ time: time + 0.015, duration: 0.23, gain: 0.14 * v, frequency: 2400, type: "bandpass", q: 0.5 });
        this.#sfxTone({ freq: 97, endFreq: 32, type: "sine", time, duration: 0.5, gain: 0.45 * v, filter: 420 });
        this.#sfxTone({ freq: 220, endFreq: 58, type: "sawtooth", time, duration: 0.22, gain: 0.11 * v, filter: 800 });
        break;
      }
      case "pickup":
        [660, 880, 1320].forEach((freq, index) =>
          this.#sfxTone({ freq, type: "sine", time: time + index * 0.055, duration: 0.12, gain: 0.1 * volume, filter: 5000 })
        );
        break;
      case "rare":
        [523, 659, 784, 1046, 1318].forEach((freq, index) =>
          this.#sfxTone({ freq, type: "triangle", time: time + index * 0.07, duration: 0.2, gain: 0.09 * volume, filter: 4300 })
        );
        break;
      case "portal":
        [392, 523, 659, 784, 1046].forEach((freq, index) =>
          this.#sfxTone({ freq, type: "sine", time: time + index * 0.09, duration: 0.5, gain: 0.08 * volume, filter: 5200 })
        );
        break;
      case "hurt":
        this.#sfxNoise({ time, duration: 0.18, gain: 0.16 * volume, frequency: 1100, type: "bandpass" });
        this.#sfxTone({ freq: 280, endFreq: 96, type: "sawtooth", time, duration: 0.32, gain: 0.18 * volume, filter: 900 });
        break;
      case "armorHit":
        this.#sfxTone({ freq: 1250, endFreq: 740, type: "triangle", time, duration: 0.16, gain: 0.11 * volume, filter: 5000 });
        this.#sfxNoise({ time, duration: 0.08, gain: 0.08 * volume, frequency: 4300, type: "highpass" });
        break;
      case "enemyDeath":
        this.#sfxTone({ freq: 280, endFreq: 620, type: "square", time, duration: 0.1, gain: 0.07 * volume, filter: 1200 });
        this.#sfxNoise({ time: time + 0.02, duration: 0.12, gain: 0.08 * volume, frequency: 1900, type: "bandpass" });
        break;
      case "kick":
        this.#sfxTone({ freq: 140, endFreq: 210, type: "triangle", time, duration: 0.08, gain: 0.14 * volume });
        break;
      case "throw":
        this.#sfxNoise({ time, duration: 0.24, gain: 0.08 * volume, frequency: 900, type: "bandpass", q: 1.5 });
        this.#sfxTone({ freq: 320, endFreq: 540, type: "sine", time, duration: 0.2, gain: 0.06 * volume });
        break;
      case "detonate":
        this.#sfxTone({ freq: 1200, endFreq: 420, type: "square", time, duration: 0.09, gain: 0.07 * volume });
        this.#sfxTone({ freq: 140, endFreq: 50, type: "sine", time: time + 0.03, duration: 0.14, gain: 0.2 * volume });
        break;
      case "denied":
        this.#sfxTone({ freq: 160, endFreq: 116, type: "square", time, duration: 0.1, gain: 0.05 * volume, filter: 700 });
        break;
      case "mount":
        [392, 523, 659, 784].forEach((freq, index) =>
          this.#sfxTone({ freq, type: "triangle", time: time + index * 0.06, duration: 0.22, gain: 0.1 * volume, filter: 3800 })
        );
        break;
      case "breath":
        this.#sfxNoise({ time, duration: 0.45, gain: 0.13 * volume, frequency: 1500, type: "bandpass", q: 0.7 });
        this.#sfxTone({ freq: 120, endFreq: 80, type: "sawtooth", time, duration: 0.4, gain: 0.1 * volume, filter: 600 });
        break;
      case "turret":
        this.#sfxTone({ freq: 420, endFreq: 820, type: "square", time, duration: 0.12, gain: 0.055 * volume, filter: 1900 });
        break;
      case "projectile":
        this.#sfxTone({ freq: 780, endFreq: 430, type: "sine", time, duration: 0.11, gain: 0.03 * volume });
        break;
      case "burrow":
        this.#sfxNoise({ time, duration: 0.3, gain: 0.09 * volume, frequency: 350, type: "lowpass" });
        break;
      case "trickster":
        this.#sfxTone({ freq: 940, endFreq: 290, type: "triangle", time, duration: 0.18, gain: 0.055 * volume, filter: 2200 });
        break;
      case "touch":
        this.#sfxTone({ freq: 90, endFreq: 42, type: "sine", time, duration: 0.2, gain: 0.2 * volume });
        break;
      case "levelStart":
        [392, 523, 659].forEach((freq, index) =>
          this.#sfxTone({ freq, type: "triangle", time: time + index * 0.11, duration: 0.4, gain: 0.08 * volume, filter: 3000 })
        );
        break;
      case "countdown":
        this.#sfxTone({ freq: 740, type: "sine", time, duration: 0.1, gain: 0.06 * volume });
        break;
      case "levelComplete":
        [523, 659, 784, 1046, 1318, 1568].forEach((freq, index) =>
          this.#sfxTone({ freq, type: "triangle", time: time + index * 0.12, duration: 0.5, gain: 0.1 * volume, filter: 5000 })
        );
        break;
      case "gameOver":
        [392, 330, 262, 196].forEach((freq, index) =>
          this.#sfxTone({ freq, type: "sawtooth", time: time + index * 0.22, duration: 0.55, gain: 0.06 * volume, filter: 700 })
        );
        break;
      case "victory": {
        const notes = [523, 659, 784, 1046, 1318, 1568, 2093];
        notes.forEach((freq, index) => {
          this.#sfxTone({ freq, type: "triangle", time: time + index * 0.13, duration: 0.8, gain: 0.1 * volume, filter: 5500 });
          this.#sfxTone({ freq: freq / 2, type: "sine", time: time + index * 0.13, duration: 0.55, gain: 0.06 * volume, filter: 2400 });
        });
        this.#sfxNoise({ time: time + 0.4, duration: 1.2, gain: 0.05 * volume, frequency: 5000, type: "highpass" });
        break;
      }
      case "scanner":
        this.#sfxTone({ freq: 1000, endFreq: 400, type: "sine", time, duration: 0.16, gain: 0.05 * volume });
        break;
      default:
        break;
    }
  }

  #sfxTone({ freq, endFreq, type = "sine", time, duration, gain = 0.1, filter = 4000 }) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const biquad = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), time);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), time + duration);
    biquad.type = "lowpass";
    biquad.frequency.value = filter;
    biquad.Q.value = 0.8;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(biquad).connect(env).connect(this.sfxBus);
    osc.start(time);
    osc.stop(time + duration + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        biquad.disconnect();
        env.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  #sfxNoise({ time, duration, gain = 0.08, frequency = 1000, type = "bandpass", q = 0.8 }) {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(env).connect(this.sfxBus);
    source.start(time);
    source.stop(time + duration + 0.03);
    source.onended = () => {
      try {
        source.disconnect();
        filter.disconnect();
        env.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  setVisibility(hidden) {
    if (!this.ctx) return;
    if (hidden) {
      this.ctx.suspend?.().catch(() => {});
    } else {
      this.ctx.resume?.().catch(() => {});
    }
  }
}

export const audioEngine = new AudioEngine({
  music: true,
  musicVolume: 0.55,
  sfx: true,
  sfxVolume: 0.72
});
