import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22_050;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, "../assets/sounds/ui");

function envelope(time, duration, attack = 0.004, release = 0.06) {
  const attackGain = Math.min(1, time / Math.max(0.001, attack));
  const releaseGain = Math.min(1, (duration - time) / Math.max(0.001, release));
  return Math.max(0, Math.min(attackGain, releaseGain));
}

function renderSound(duration, sample, gain = 0.5) {
  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  const samples = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    samples[index] = Math.round(
      Math.max(-1, Math.min(1, sample(time, duration))) * gain * 32_767
    );
  }
  return samples;
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
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}

const buttonSound = renderSound(0.145, (time, duration) => {
  const first = envelope(time, 0.085, 0.003, 0.05) * Math.sin(2 * Math.PI * 760 * time);
  const delayedTime = Math.max(0, time - 0.045);
  const second = time >= 0.045
    ? envelope(delayedTime, duration - 0.045, 0.003, 0.055) * Math.sin(2 * Math.PI * 1120 * delayedTime)
    : 0;
  const pop = envelope(time, 0.035, 0.001, 0.025) * Math.sin(2 * Math.PI * 205 * time);
  return first * 0.42 + second * 0.52 + pop * 0.18;
}, 0.44);

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, "button-cucumber-pop-v4.wav"), wavBuffer(buttonSound));
console.log(`Generated cute UI button sound in ${outputDirectory}`);
