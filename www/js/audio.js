// audio.js - all sounds and music are made with the Web Audio API, no audio files.
// The audio context can only start after a click, so init() is called from the menu.

const Sound = {
  ctx: null,
  sfx: null,
  music: null,
  timer: null,
  step: 0,
  theme: "",
  surge: false,

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.connect(this.ctx.destination);
      this.music.connect(this.ctx.destination);
      this.setVolumes();
    } catch (error) {
      this.ctx = null;
    }
  },

  setVolumes() {
    if (!this.ctx) return;
    this.sfx.gain.value = save.settings.sfx;
    this.music.gain.value = save.settings.music * 0.6;
  },

  tone(freq, dur, type, vol, endFreq, dest) {
    const c = this.ctx;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(dest || this.sfx);
    osc.start(t);
    osc.stop(t + dur);
  },

  noise(dur, vol, cutoff) {
    const c = this.ctx;
    const length = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const source = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    const t = c.currentTime;
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    source.start(t);
  },

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case "pistol":    this.noise(0.08, 0.5, 3000); this.tone(300, 0.08, "square", 0.2, 90); break;
      case "rifle":     this.noise(0.06, 0.45, 4000); this.tone(220, 0.06, "sawtooth", 0.2, 80); break;
      case "shotgun":   this.noise(0.25, 0.9, 1800); this.tone(140, 0.2, "square", 0.3, 40); break;
      case "sniper":    this.noise(0.35, 0.9, 5000); this.tone(500, 0.3, "sawtooth", 0.3, 50); break;
      case "enemyShot": this.noise(0.05, 0.2, 2500); break;
      case "reload":
        this.tone(180, 0.05, "square", 0.15);
        setTimeout(() => { if (this.ctx) this.tone(260, 0.06, "square", 0.15); }, 350);
        break;
      case "empty":     this.tone(120, 0.04, "square", 0.1); break;
      case "switch":    this.tone(400, 0.05, "triangle", 0.15); break;
      case "throw":     this.tone(300, 0.1, "triangle", 0.15, 150); break;
      case "hit":       this.tone(160, 0.07, "sawtooth", 0.15, 70); break;
      case "die":       this.noise(0.3, 0.5, 1200); this.tone(200, 0.3, "sawtooth", 0.2, 40); break;
      case "hurt":      this.tone(110, 0.15, "square", 0.3, 60); break;
      case "explosion": this.noise(0.7, 1, 900); this.tone(90, 0.6, "sine", 0.5, 25); break;
      case "surgeUp":
        this.tone(110, 0.6, "sawtooth", 0.32, 900);
        this.tone(220, 0.55, "square", 0.12, 1400);
        this.noise(0.4, 0.5, 6500);
        break;
      case "surgeDown": this.tone(700, 0.5, "triangle", 0.22, 70); break;
      case "tick":      this.tone(950, 0.04, "square", 0.1); break;
      case "ready":
        this.tone(660, 0.09, "sine", 0.25);
        setTimeout(() => { if (this.ctx) this.tone(990, 0.14, "sine", 0.25); }, 90);
        break;
      case "dash":      this.noise(0.12, 0.3, 5200); this.tone(260, 0.1, "triangle", 0.14, 720); break;
      case "shield":    this.tone(720, 0.1, "sine", 0.2, 1100); break;
      case "coin":
        this.tone(1180, 0.05, "square", 0.07);
        setTimeout(() => { if (this.ctx) this.tone(1580, 0.07, "square", 0.07); }, 45);
        break;
      case "core":
        this.tone(440, 0.08, "triangle", 0.22);
        setTimeout(() => { if (this.ctx) this.tone(660, 0.08, "triangle", 0.22); }, 70);
        setTimeout(() => { if (this.ctx) this.tone(880, 0.14, "triangle", 0.22); }, 140);
        break;
      case "achieve":
        this.tone(523, 0.1, "square", 0.12);
        setTimeout(() => { if (this.ctx) this.tone(659, 0.1, "square", 0.12); }, 100);
        setTimeout(() => { if (this.ctx) this.tone(784, 0.1, "square", 0.12); }, 200);
        setTimeout(() => { if (this.ctx) this.tone(1047, 0.25, "square", 0.12); }, 300);
        break;
      case "pickup":
        this.tone(520, 0.08, "sine", 0.2);
        setTimeout(() => { if (this.ctx) this.tone(780, 0.1, "sine", 0.2); }, 70);
        break;
    }
  },

  // Looping music. Themes: "menu" (calm), "combat" (driving bass), "boss" (fast and tense).
  // While a Power Surge is active a bright arpeggio is layered on top.
  startMusic(theme) {
    if (!this.ctx) return;
    theme = theme || this.theme || "combat";
    if (this.timer && this.theme === theme) return;
    this.stopMusic();
    this.theme = theme;
    this.step = 0;
    const speed = { menu: 340, combat: 240, boss: 170 }[theme] || 240;
    this.timer = setInterval(() => this.tick(), speed);
  },

  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
  },

  setSurge(on) { this.surge = !!on; },

  tick() {
    if (!this.ctx) return;
    const s = this.step;
    if (this.theme === "menu") {
      const arp = [110, 164.8, 196, 246.9, 196, 164.8, 130.8, 164.8];
      this.tone(arp[s % 8], 0.3, "triangle", 0.18, null, this.music);
      if (s % 8 === 0) this.tone(55, 0.9, "sine", 0.4, null, this.music);
    } else if (this.theme === "boss") {
      const bass = [55, 58.3, 55, 65.4, 55, 58.3, 49, 61.7];
      const note = bass[s % 8];
      this.tone(note, 0.16, "sawtooth", 0.38, null, this.music);
      if (s % 2 === 0) this.tone(120, 0.14, "sine", 0.5, 40, this.music);
      if (s % 4 === 3) this.tone(note * 6, 0.08, "square", 0.08, null, this.music);
    } else {
      const bass = [55, 55, 65.4, 55, 73.4, 55, 65.4, 49];
      const note = bass[s % 8];
      this.tone(note, 0.22, "sawtooth", 0.35, null, this.music);
      if (s % 4 === 0) this.tone(120, 0.18, "sine", 0.5, 40, this.music);
      if (s % 8 === 4) this.tone(note * 4, 0.1, "square", 0.08, null, this.music);
    }
    if (this.surge && this.theme !== "menu") {
      const arp = [440, 554.4, 659.3, 880, 659.3, 554.4];
      this.tone(arp[s % 6], 0.09, "square", 0.07, null, this.music);
    }
    this.step++;
  }
};
