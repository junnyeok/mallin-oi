import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22_050;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(
  scriptDirectory,
  "../assets/sounds/combat"
);

function seededNoise(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return (value / 0xffff_ffff) * 2 - 1;
  };
}

function envelope(time, duration, attack = 0.012, release = 0.12) {
  const attackGain = Math.min(1, time / Math.max(0.001, attack));
  const releaseGain = Math.min(1, (duration - time) / Math.max(0.001, release));
  return Math.max(0, Math.min(attackGain, releaseGain));
}

function renderSound(duration, sample, { gain = 0.72 } = {}) {
  const sampleCount = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  const pcm = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const normalized = Math.max(-1, Math.min(1, sample(time, duration)));
    pcm[index] = Math.round(normalized * gain * 32_767);
  }
  return pcm;
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

function chirp(time, startFrequency, endFrequency, duration, phase = 0) {
  const slope = (endFrequency - startFrequency) / Math.max(0.001, duration);
  return Math.sin(
    2 * Math.PI * (startFrequency * time + 0.5 * slope * time * time) + phase
  );
}

function pulse(time, frequency) {
  return Math.sin(2 * Math.PI * frequency * time) >= 0 ? 1 : -1;
}

const sounds = {
  "hammer-swing.wav": renderSound(0.19, (time, duration) => {
    const noise = seededNoise(11 + Math.floor(time * SAMPLE_RATE))();
    return envelope(time, duration, 0.006, 0.08) *
      (chirp(time, 1_600, 270, duration) * 0.55 + noise * 0.18);
  }, { gain: 0.46 }),
  "hammer-hit.wav": renderSound(0.16, (time, duration) => {
    const noise = seededNoise(37 + Math.floor(time * SAMPLE_RATE))();
    return envelope(time, duration, 0.002, 0.12) *
      (Math.sin(2 * Math.PI * 190 * time) * 0.54 +
        Math.sin(2 * Math.PI * 430 * time) * 0.22 + noise * 0.25);
  }, { gain: 0.58 }),
  "bird-approach.wav": renderSound(0.42, (time, duration) => {
    const local = time % 0.14;
    return envelope(time, duration, 0.01, 0.09) *
      envelope(local, 0.12, 0.008, 0.05) *
      chirp(local, 1_850, 2_850, 0.12);
  }, { gain: 0.34 }),
  "squirrel-approach.wav": renderSound(0.35, (time, duration) => {
    const local = time % 0.09;
    return envelope(time, duration, 0.008, 0.08) *
      envelope(local, 0.075, 0.004, 0.035) *
      (chirp(local, 1_150, 1_650, 0.075) * 0.72 + pulse(local, 2_300) * 0.08);
  }, { gain: 0.28 }),
  "boar-approach.wav": renderSound(0.46, (time, duration) => {
    const wobble = 94 + Math.sin(time * Math.PI * 9) * 18;
    return envelope(time, duration, 0.018, 0.14) *
      (Math.sin(2 * Math.PI * wobble * time) * 0.64 +
        Math.sin(2 * Math.PI * wobble * 2.1 * time) * 0.18);
  }, { gain: 0.4 }),
  "threat-eat.wav": renderSound(0.3, (time, duration) => {
    const noise = seededNoise(83 + Math.floor(time * SAMPLE_RATE / 2))();
    const crunch = Math.sin(2 * Math.PI * (140 + time * 170) * time);
    return envelope(time, duration, 0.003, 0.1) * (noise * 0.34 + crunch * 0.2);
  }, { gain: 0.34 }),
  "bird-defeat.wav": renderSound(0.36, (time, duration) =>
    envelope(time, duration, 0.008, 0.13) * chirp(time, 1_650, 520, duration),
  { gain: 0.28 }),
  "squirrel-defeat.wav": renderSound(0.4, (time, duration) =>
    envelope(time, duration, 0.008, 0.14) *
      (chirp(time, 1_050, 320, duration) * 0.72 + Math.sin(2 * Math.PI * 180 * time) * 0.16),
  { gain: 0.3 }),
  "boar-defeat.wav": renderSound(0.5, (time, duration) =>
    envelope(time, duration, 0.012, 0.19) *
      (chirp(time, 190, 72, duration) * 0.68 + Math.sin(2 * Math.PI * 310 * time) * 0.11),
  { gain: 0.38 }),
  "thief-defeat.wav": renderSound(0.48, (time, duration) =>
    envelope(time, duration, 0.008, 0.17) *
      (chirp(time, 720, 150, duration) * 0.46 +
        Math.sin(2 * Math.PI * (960 - time * 900) * time) * 0.22),
  { gain: 0.3 }),
};

await mkdir(outputDirectory, { recursive: true });
for (const [fileName, samples] of Object.entries(sounds)) {
  await writeFile(path.join(outputDirectory, fileName), wavBuffer(samples));
}

console.log(`Generated ${Object.keys(sounds).length} original PCM WAV effects in ${outputDirectory}`);
