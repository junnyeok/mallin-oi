import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const imageDirectory = path.resolve(scriptDirectory, "../assets/images");

const [solarSheet, happySheet, gateSource, villageSource] = process.argv.slice(2);
if (!solarSheet || !happySheet || !gateSource || !villageSource) {
  throw new Error(
    "Usage: node build-village-revision-assets.mjs <solar-sheet> <happy-sheet> <gate> <village>"
  );
}

async function ensureParent(output) {
  await mkdir(path.dirname(output), { recursive: true });
}

async function copyIfDifferent(input, output) {
  if (path.resolve(input) === path.resolve(output)) return;
  await copyFile(input, output);
}

async function removeMagenta(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const chroma = Math.min(red, blue) - green;
    if (red < 145 || blue < 125 || chroma < 48) continue;
    const coverage = Math.max(0, Math.min(1, (122 - chroma) / 74));
    data[offset + 3] = Math.round(data[offset + 3] * coverage);
    if (coverage > 0) {
      data[offset] = Math.round(red * coverage + Math.min(red, 210) * (1 - coverage));
      data[offset + 2] = Math.round(blue * coverage + Math.min(blue, 210) * (1 - coverage));
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function splitGridPreservingScale(source, columns, rows, outputs, outputSize) {
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (!outputs[index]) continue;
      const left = Math.floor((width * column) / columns);
      const right = Math.floor((width * (column + 1)) / columns);
      const top = Math.floor((height * row) / rows);
      const bottom = Math.floor((height * (row + 1)) / rows);
      const cell = await sharp(source)
        .extract({ left, top, width: right - left, height: bottom - top })
        .png()
        .toBuffer();
      const output = path.join(imageDirectory, outputs[index]);
      await ensureParent(output);
      await sharp(await removeMagenta(cell))
        .resize(outputSize, outputSize, {
          fit: "contain",
          position: "centre",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toFile(output);
    }
  }
}

async function normalizeCropStage(input, targetHeight) {
  const source = await sharp(input)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .png()
    .toBuffer();
  const resized = await sharp(source)
    .resize({ height: targetHeight, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(resized).metadata();
  const width = metadata.width ?? targetHeight;
  const height = metadata.height ?? targetHeight;
  const canvasSize = 512;
  const left = Math.round((canvasSize - width) / 2);
  const top = Math.max(0, 482 - height);
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(input);
}

async function createDamagedCrop(input, output, severity) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    if (data[pixel * info.channels + 3] < 36) continue;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const objectWidth = Math.max(1, maxX - minX);
  const objectHeight = Math.max(1, maxY - minY);
  const radiusScale = [0.19, 0.22, 0.25][Math.max(0, Math.min(2, severity - 1))];
  const radius = Math.max(26, Math.round(Math.min(objectWidth, objectHeight) * radiusScale));
  const biteRows = [[], [0.4], [0.31, 0.61], [0.25, 0.49, 0.73]][severity] ?? [0.4];
  biteRows.forEach((fraction, biteIndex) => {
    const centerY = minY + objectHeight * fraction;
    const centerX = minX + objectWidth * (0.84 - biteIndex * 0.035);
    for (let y = Math.max(0, Math.floor(centerY - radius)); y <= Math.min(info.height - 1, Math.ceil(centerY + radius)); y += 1) {
      for (let x = Math.max(0, Math.floor(centerX - radius)); x <= Math.min(info.width - 1, Math.ceil(centerX + radius)); x += 1) {
        if (Math.hypot(x - centerX, y - centerY) <= radius * (biteIndex % 2 ? 0.88 : 1)) {
          data[(y * info.width + x) * info.channels + 3] = 0;
        }
      }
    }
  });
  await ensureParent(output);
  await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(output);
}

const sourceDirectory = path.join(imageDirectory, "generated-sources");
await mkdir(sourceDirectory, { recursive: true });
await Promise.all([
  copyIfDifferent(solarSheet, path.join(sourceDirectory, "solar-cucumber-stages-v4.png")),
  copyIfDifferent(happySheet, path.join(sourceDirectory, "threat-happy-grid-v4.png")),
  copyIfDifferent(gateSource, path.join(sourceDirectory, "farm-gate-v4.png")),
  copyIfDifferent(villageSource, path.join(sourceDirectory, "village-square-v4.png")),
]);

await splitGridPreservingScale(solarSheet, 3, 1, [
  "crops/solar/solar-sprout-v4.png",
  "crops/solar/solar-young-v4.png",
  "crops/solar/solar-adult-v4.png",
], 512);

await Promise.all([
  normalizeCropStage(path.join(imageDirectory, "crops/solar/solar-sprout-v4.png"), 296),
  normalizeCropStage(path.join(imageDirectory, "crops/solar/solar-young-v4.png"), 370),
  normalizeCropStage(path.join(imageDirectory, "crops/solar/solar-adult-v4.png"), 376),
]);

await splitGridPreservingScale(happySheet, 4, 2, [
  "enemies/frames/bird-happy-v4.png",
  "enemies/frames/squirrel-happy-v4.png",
  "enemies/frames/rabbit-happy-v4.png",
  "enemies/frames/boar-happy-v4.png",
  "enemies/frames/mouse-happy-v4.png",
  "enemies/frames/raccoon-happy-v4.png",
  "enemies/frames/thief-happy-v4.png",
], 256);

const gateOutput = path.join(imageDirectory, "backgrounds/farm-gate-v4.png");
await ensureParent(gateOutput);
const transparentGate = await removeMagenta(gateSource);
const trimmedGate = await sharp(transparentGate)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
  .png()
  .toBuffer();
await sharp(trimmedGate)
  .resize(1024, 640, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(gateOutput);

const villageOutput = path.join(imageDirectory, "backgrounds/village-square-v4.png");
await ensureParent(villageOutput);
await sharp(villageSource)
  .resize(1024, 1536, { fit: "cover", position: "centre" })
  .png({ compressionLevel: 9 })
  .toFile(villageOutput);

for (const stage of ["sprout", "young", "adult"]) {
  for (let severity = 1; severity <= 3; severity += 1) {
    await createDamagedCrop(
      path.join(imageDirectory, `crops/solar/solar-${stage}-v4.png`),
      path.join(imageDirectory, `crops/damaged/solar-${stage}-bite-${severity}-v4.png`),
      severity,
    );
  }
}

const basicStageSources = {
  sprout: "cucumber-baby.png",
  young: "cucumber-boy.png",
  adult: "cucumber-adult.png",
};
for (const [stage, source] of Object.entries(basicStageSources)) {
  for (let severity = 1; severity <= 3; severity += 1) {
    await createDamagedCrop(
      path.join(imageDirectory, source),
      path.join(imageDirectory, `crops/damaged/basic-${stage}-bite-${severity}-v3.png`),
      severity,
    );
  }
}

console.log("Built centered solar stages, seven happy threats, farm gate, village scene, and strongly damaged crop stages.");
