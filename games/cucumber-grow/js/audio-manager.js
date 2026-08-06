const SOUND_FILES = Object.freeze({
  button: "./assets/sounds/ui/button-cucumber-pop-v4.wav",
  plant: "./assets/sounds/01-plant-sprout.wav",
  grow: "./assets/sounds/02-evolve-baby-cucumber.wav",
  evolve: "./assets/sounds/03-evolve-adult-cucumber.wav",
  harvest: "./assets/sounds/04-harvest-cucumber.wav",
  water: "./assets/sounds/cucumber-watering-can.wav",
  hammerSwing: "./assets/sounds/combat/hammer-swing.wav",
  hammerHit: "./assets/sounds/combat/hammer-hit.wav",
  birdApproach: "./assets/sounds/combat/bird-approach.wav",
  squirrelApproach: "./assets/sounds/combat/squirrel-approach.wav",
  rabbitApproach: "./assets/sounds/combat/rabbit-approach.wav",
  boarApproach: "./assets/sounds/combat/boar-approach.wav",
  mouseApproach: "./assets/sounds/combat/mouse-approach.wav",
  raccoonApproach: "./assets/sounds/combat/raccoon-approach.wav",
  threatEat: "./assets/sounds/combat/threat-eat.wav",
  birdDefeat: "./assets/sounds/combat/bird-defeat.wav",
  squirrelDefeat: "./assets/sounds/combat/squirrel-defeat.wav",
  rabbitDefeat: "./assets/sounds/combat/rabbit-defeat.wav",
  boarDefeat: "./assets/sounds/combat/boar-defeat.wav",
  mouseDefeat: "./assets/sounds/combat/mouse-defeat.wav",
  raccoonDefeat: "./assets/sounds/combat/raccoon-defeat.wav",
  thiefDefeat: "./assets/sounds/combat/thief-defeat.wav",
});

const BGM_FILES = Object.freeze({
  launch: "./assets/sounds/bgm/01-launch-fanfare.wav",
  preparation: "./assets/sounds/bgm/02-preparation-workshop.wav",
  day: "./assets/sounds/bgm/03-daytime-rush.wav",
  night: "./assets/sounds/bgm/04-nighttime-sneak.wav",
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
  rabbitApproach: [[720, 0.045, "triangle"], [980, 0.055, "triangle"]],
  boarApproach: [[120, 0.13, "sawtooth"]],
  mouseApproach: [[1_320, 0.035, "square"], [1_620, 0.04, "square"]],
  raccoonApproach: [[310, 0.05, "triangle"], [420, 0.06, "triangle"]],
  threatEat: [[260, 0.05, "square"], [190, 0.06, "square"]],
  birdDefeat: [[1_150, 0.07, "sine"], [520, 0.12, "sine"]],
  squirrelDefeat: [[880, 0.07, "triangle"], [330, 0.13, "triangle"]],
  rabbitDefeat: [[760, 0.07, "sine"], [260, 0.14, "triangle"]],
  boarDefeat: [[180, 0.11, "sawtooth"], [82, 0.17, "sine"]],
  mouseDefeat: [[1_020, 0.05, "square"], [240, 0.14, "sine"]],
  raccoonDefeat: [[520, 0.08, "triangle"], [160, 0.16, "sine"]],
  thiefDefeat: [[620, 0.08, "triangle"], [170, 0.15, "sine"]],
  damage: [[145, 0.12, "sawtooth"], [95, 0.16, "sawtooth"]],
  day: [[392, 0.08, "sine"], [523, 0.13, "sine"]],
  night: [[330, 0.11, "sine"], [247, 0.17, "sine"]],
  install: [[350, 0.055, "square"], [520, 0.1, "triangle"]],
  reload: [[260, 0.05, "sine"], [390, 0.07, "sine"], [520, 0.1, "triangle"]],
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
    this.bgmAudio = null;
    this.bgmMode = "launch";
    this.filePools = new Map();
    this.activeFileAudio = new Set();
    this.lastPlayedAt = new Map();
  }

  setSettings(settings) {
    this.settings = settings;
    this.activeFileAudio.forEach((audio) => {
      audio.volume = Math.min(1, Math.max(0, settings.sfxVolume ?? 0.72));
    });
    if (this.bgmAudio) {
      this.bgmAudio.volume = Math.min(1, Math.max(0, settings.bgmVolume ?? 0.45));
    }
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

  setBgmMode(mode) {
    if (!BGM_FILES[mode]) return false;
    if (this.bgmMode === mode && this.bgmAudio) return true;
    this.stopBgm();
    this.bgmMode = mode;
    if (this.unlocked && this.active && this.settings.bgmEnabled !== false) {
      this.startBgm();
    }
    return true;
  }

  startBgm() {
    if (
      this.bgmAudio !== null ||
      !this.unlocked ||
      !this.active ||
      this.settings.bgmEnabled === false ||
      typeof Audio !== "function"
    ) {
      return;
    }
    const audio = new Audio(BGM_FILES[this.bgmMode]);
    audio.preload = "auto";
    audio.playsInline = true;
    audio.loop = true;
    audio.volume = Math.min(1, Math.max(0, this.settings.bgmVolume ?? 0.45));
    this.bgmAudio = audio;
    void audio.play().catch(() => {
      if (this.bgmAudio === audio) this.bgmAudio = null;
    });
  }

  stopBgm() {
    if (!this.bgmAudio) return;
    try {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    } catch {
      // 중단 실패는 게임 진행과 무관하다.
    }
    this.bgmAudio = null;
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
