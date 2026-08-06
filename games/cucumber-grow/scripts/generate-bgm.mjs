import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22_050;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, "../assets/sounds/bgm");

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function triangle(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

function seededNoise(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return (value / 0xffff_ffff) * 2 - 1;
  };
}

function noteEnvelope(local, length, attack = 0.012, release = 0.16) {
  return Math.max(
    0,
    Math.min(1, local / attack, (length - local) / release)
  );
}

function wavBuffer(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }
  return buffer;
}

function renderTrack({
  bpm,
  root,
  scale,
  melody,
  bass,
  chordDegrees,
  bars = 8,
  energy = 1,
  night = false,
  relaxed = false,
}) {
  const stepDuration = 60 / bpm / 2;
  const stepsPerBar = 8;
  const totalSteps = bars * stepsPerBar;
  const duration = totalSteps * stepDuration;
  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  const pcm = new Int16Array(sampleCount);
  const noise = seededNoise(root * 97 + bpm);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const stepIndex = Math.floor(time / stepDuration) % totalSteps;
    const local = time % stepDuration;
    const bar = Math.floor(stepIndex / stepsPerBar);
    const beatStep = stepIndex % stepsPerBar;
    const melodyDegree = melody[stepIndex % melody.length];
    const bassDegree = bass[Math.floor(stepIndex / 2) % bass.length];
    let sample = 0;

    if (melodyDegree !== null) {
      const note = root + scale[melodyDegree % scale.length] +
        Math.floor(melodyDegree / scale.length) * 12 + 12;
      const frequency = midiFrequency(note);
      const env = noteEnvelope(local, stepDuration * 0.96, 0.009, relaxed ? 0.22 : 0.12);
      sample += triangle(2 * Math.PI * frequency * time) * env * 0.24 * energy;
      sample += Math.sin(2 * Math.PI * frequency * 2 * time) * env * 0.045;
    }

    const bassNote = root - 12 + scale[bassDegree % scale.length];
    const bassFrequency = midiFrequency(bassNote);
    const bassLocal = time % (stepDuration * 2);
    const bassEnv = noteEnvelope(bassLocal, stepDuration * 1.85, 0.015, 0.24);
    sample += Math.sin(2 * Math.PI * bassFrequency * time) * bassEnv * 0.16;

    const chordDegree = chordDegrees[bar % chordDegrees.length];
    const chordRoot = root + scale[chordDegree];
    const chordLocal = time % (stepDuration * stepsPerBar);
    const chordEnv = Math.min(1, chordLocal / 0.2) *
      Math.min(1, (stepDuration * stepsPerBar - chordLocal) / 0.35);
    [0, 2, 4].forEach((offset, chordIndex) => {
      const note = chordRoot + scale[offset] + (night && chordIndex === 2 ? -12 : 0);
      sample += Math.sin(2 * Math.PI * midiFrequency(note) * time) *
        chordEnv * (night ? 0.026 : 0.035);
    });

    if (!relaxed && beatStep % 2 === 0) {
      const drumLocal = local;
      const kick = Math.sin(2 * Math.PI * (95 - drumLocal * 90) * drumLocal) *
        Math.max(0, 1 - drumLocal / 0.1);
      sample += kick * 0.12 * energy;
    }
    if (beatStep % 2 === 1) {
      sample += noise() * Math.max(0, 1 - local / 0.035) *
        (night ? 0.035 : relaxed ? 0.018 : 0.045);
    }

    if (night) {
      sample += Math.sin(2 * Math.PI * 1.2 * time) * 0.012;
    }
    const edgeFade = Math.min(1, time / 0.025, (duration - time) / 0.025);
    pcm[index] = Math.round(Math.max(-1, Math.min(1, sample * edgeFade)) * 28_500);
  }
  return pcm;
}

const major = [0, 2, 4, 5, 7, 9, 11];
const minor = [0, 2, 3, 5, 7, 8, 10];
const tracks = {
  "01-launch-fanfare.wav": renderTrack({
    bpm: 136,
    root: 60,
    scale: major,
    melody: [0, 2, 4, 7, 4, 5, 4, 2, 1, 3, 5, 8, 7, 5, 4, 2],
    bass: [0, 0, 3, 4],
    chordDegrees: [0, 3, 4, 0],
    bars: 6,
    energy: 1.08,
  }),
  "02-preparation-workshop.wav": renderTrack({
    bpm: 92,
    root: 60,
    scale: major,
    melody: [0, null, 2, 3, 4, null, 2, 1, 0, 1, 2, null, 4, 3, 2, null],
    bass: [0, 3, 4, 3],
    chordDegrees: [0, 3, 4, 3],
    bars: 6,
    energy: 0.78,
    relaxed: true,
  }),
  "03-daytime-rush.wav": renderTrack({
    bpm: 148,
    root: 62,
    scale: major,
    melody: [0, 2, 4, 5, 4, 2, 1, 2, 3, 5, 7, 5, 4, 3, 2, 1],
    bass: [0, 4, 3, 4],
    chordDegrees: [0, 4, 3, 4],
    bars: 8,
    energy: 1.12,
  }),
  "04-nighttime-sneak.wav": renderTrack({
    bpm: 110,
    root: 57,
    scale: minor,
    melody: [0, null, 2, 1, 3, null, 2, 0, 4, 3, 2, null, 1, 2, 0, null],
    bass: [0, 5, 3, 4],
    chordDegrees: [0, 5, 3, 4],
    bars: 8,
    energy: 0.83,
    night: true,
  }),
};

await mkdir(outputDirectory, { recursive: true });
for (const [fileName, samples] of Object.entries(tracks)) {
  await writeFile(path.join(outputDirectory, fileName), wavBuffer(samples));
}

console.log(`Generated ${Object.keys(tracks).length} original loopable PCM WAV themes in ${outputDirectory}`);
