const SOUND_FILES = Object.freeze({
  plant: "./assets/sounds/01-plant-sprout.wav",
  grow: "./assets/sounds/02-evolve-baby-cucumber.wav",
  evolve: "./assets/sounds/03-evolve-adult-cucumber.wav",
  harvest: "./assets/sounds/04-harvest-cucumber.wav",
  water: "./assets/sounds/cucumber-watering-can.wav",
  hammerSwing: "./assets/sounds/combat/hammer-swing.wav",
  hammerHit: "./assets/sounds/combat/hammer-hit.wav",
  birdApproach: "./assets/sounds/combat/bird-approach.wav",
  squirrelApproach: "./assets/sounds/combat/squirrel-approach.wav",
  boarApproach: "./assets/sounds/combat/boar-approach.wav",
  threatEat: "./assets/sounds/combat/threat-eat.wav",
  birdDefeat: "./assets/sounds/combat/bird-defeat.wav",
  squirrelDefeat: "./assets/sounds/combat/squirrel-defeat.wav",
  boarDefeat: "./assets/sounds/combat/boar-defeat.wav",
  thiefDefeat: "./assets/sounds/combat/thief-defeat.wav",
});

const FILE_POOL_LIMITS = Object.freeze({
  water: 4,
  hammerSwing: 4,
  hammerHit: 4,
  threatEat: 3,
});

const TONE_PATTERNS = Object.freeze({
  button: [[520, 0.045, "sine"]],
  coin: [[660, 0.06, "triangle"], [880, 0.09, "triangle"]],
  purchase: [[440, 0.06, "triangle"], [660, 0.08, "triangle"]],
  failure: [[170, 0.12, "square"], [130, 0.15, "square"]],
  levelUp: [[523, 0.09, "triangle"], [659, 0.09, "triangle"], [784, 0.16, "triangle"]],
  threat: [[220, 0.08, "sawtooth"], [330, 0.08, "sawtooth"]],
  repel: [[310, 0.045, "square"], [620, 0.09, "triangle"]],
  hammerSwing: [[940, 0.04, "sine"], [360, 0.08, "triangle"]],
  hammerHit: [[180, 0.08, "square"], [430, 0.05, "triangle"]],
  birdApproach: [[1_200, 0.06, "sine"], [1_850, 0.07, "sine"]],
  squirrelApproach: [[920, 0.04, "square"], [1_260, 0.04, "square"]],
  boarApproach: [[120, 0.13, "sawtooth"]],
  threatEat: [[260, 0.05, "square"], [190, 0.06, "square"]],
  birdDefeat: [[1_150, 0.07, "sine"], [520, 0.12, "sine"]],
  squirrelDefeat: [[880, 0.07, "triangle"], [330, 0.13, "triangle"]],
  boarDefeat: [[180, 0.11, "sawtooth"], [82, 0.17, "sine"]],
  thiefDefeat: [[620, 0.08, "triangle"], [170, 0.15, "sine"]],
  damage: [[145, 0.12, "sawtooth"], [95, 0.16, "sawtooth"]],
  day: [[392, 0.08, "sine"], [523, 0.13, "sine"]],
  night: [[330, 0.11, "sine"], [247, 0.17, "sine"]],
  install: [[350, 0.055, "square"], [520, 0.1, "triangle"]],
});

function createAudioContext() {
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  try {
    return AudioContext ? new AudioContext() : null;
  } catch {
    return null;
  }
}

export class GameAudioManager {
  constructor(settings = {}) {
    this.context = null;
    this.settings = settings;
    this.unlocked = false;
    this.active = true;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.filePools = new Map();
    this.activeFileAudio = new Set();
    this.lastPlayedAt = new Map();
  }

  setSettings(settings) {
    this.settings = settings;
    this.activeFileAudio.forEach((audio) => {
      audio.volume = Math.min(1, Math.max(0, settings.sfxVolume ?? 0.72));
    });
    if (!settings.bgmEnabled) this.stopBgm();
    else if (this.unlocked && this.active) this.startBgm();
  }

  async unlock() {
    if (!this.context) this.context = createAudioContext();
    try {
      await this.context?.resume?.();
    } catch {
      // 소리를 지원하지 않는 기기에서도 게임은 계속된다.
    }
    this.unlocked = true;
    if (this.settings.bgmEnabled !== false && this.active) this.startBgm();
    return this.context?.state === "running" || !this.context;
  }

  setActive(isActive) {
    this.active = isActive;
    if (!isActive) {
      this.stopBgm();
      this.stopFileSounds();
      void this.context?.suspend?.().catch?.(() => {});
      return;
    }
    if (this.unlocked) {
      void this.context?.resume?.().catch?.(() => {});
      if (this.settings.bgmEnabled !== false) this.startBgm();
    }
  }

  preload() {
    if (typeof Audio !== "function") return;
    Object.entries(SOUND_FILES).forEach(([name, url]) => {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.playsInline = true;
      this.filePools.set(name, [audio]);
    });
  }

  play(name, { minimumGapMs = 55 } = {}) {
    if (!this.unlocked || !this.active || this.settings.sfxEnabled === false) return false;
    const now = performance.now?.() ?? Date.now();
    if (now - (this.lastPlayedAt.get(name) ?? -Infinity) < minimumGapMs) return false;
    this.lastPlayedAt.set(name, now);

    if (SOUND_FILES[name] && this.playFile(name)) return true;
    return this.playTonePattern(TONE_PATTERNS[name] ?? TONE_PATTERNS.button);
  }

  playFile(name) {
    const pool = this.filePools.get(name);
    if (!pool?.length) return false;
    let audio = pool.find((candidate) => candidate.paused || candidate.ended);
    const maximumPoolSize = FILE_POOL_LIMITS[name] ?? 2;
    if (!audio && pool.length < maximumPoolSize) {
      audio = pool[0].cloneNode(true);
      pool.push(audio);
    }
    if (!audio) return false;
    try {
      audio.currentTime = 0;
      audio.volume = Math.min(1, Math.max(0, this.settings.sfxVolume ?? 0.72));
      this.activeFileAudio.add(audio);
      const cleanup = () => this.activeFileAudio.delete(audio);
      audio.addEventListener("ended", cleanup, { once: true });
      audio.addEventListener("error", cleanup, { once: true });
      void audio.play().catch(() => {
        cleanup();
        this.playTonePattern(TONE_PATTERNS.button);
      });
      return true;
    } catch {
      return false;
    }
  }

  playTonePattern(pattern) {
    if (!this.context || this.context.state !== "running") return false;
    const start = this.context.currentTime;
    let cursor = start;
    pattern.forEach(([frequency, duration, type]) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, cursor);
      const volume = 0.09 * Math.min(1, Math.max(0, this.settings.sfxVolume ?? 0.72));
      gain.gain.setValueAtTime(0.0001, cursor);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), cursor + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(cursor);
      oscillator.stop(cursor + duration + 0.02);
      cursor += duration * 0.72;
    });
    return true;
  }

  startBgm() {
    if (
      this.bgmTimer !== null ||
      !this.unlocked ||
      !this.active ||
      this.settings.bgmEnabled === false ||
      !this.context
    ) {
      return;
    }
    const melody = [392, 440, 523, 440, 349, 392, 440, 330];
    const playStep = () => {
      if (!this.active || this.settings.bgmEnabled === false || this.context?.state !== "running") return;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const now = this.context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(melody[this.bgmStep % melody.length], now);
      const volume = 0.026 * Math.min(1, Math.max(0, this.settings.bgmVolume ?? 0.45));
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.74);
      this.bgmStep += 1;
    };
    playStep();
    this.bgmTimer = globalThis.setInterval(playStep, 840);
  }

  stopBgm() {
    if (this.bgmTimer === null) return;
    globalThis.clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  stopFileSounds() {
    this.activeFileAudio.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // 중단 실패는 게임 상태에 영향을 주지 않는다.
      }
    });
    this.activeFileAudio.clear();
  }

  destroy() {
    this.stopBgm();
    this.stopFileSounds();
    this.filePools.clear();
    void this.context?.close?.().catch?.(() => {});
    this.context = null;
  }
}
