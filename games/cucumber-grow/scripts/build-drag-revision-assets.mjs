import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const imageDirectory = path.resolve(scriptDirectory, "../assets/images");

async function ensureParent(output) {
  await mkdir(path.dirname(output), { recursive: true });
}

async function trimToSquare(input, output, size = 256, padding = 14) {
  await ensureParent(output);
  const trimmed = await sharp(input).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 }).png().toBuffer();
  await sharp(trimmed)
    .resize(size, size, {
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function splitGrid(source, columns, rows, names, size = 256) {
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (!names[index]) continue;
      const left = Math.floor((width * column) / columns);
      const right = Math.floor((width * (column + 1)) / columns);
      const top = Math.floor((height * row) / rows);
      const bottom = Math.floor((height * (row + 1)) / rows);
      const cell = await sharp(source)
        .extract({ left, top, width: right - left, height: bottom - top })
        .png()
        .toBuffer();
      const output = path.join(imageDirectory, names[index]);
      await trimToSquare(cell, output, size, 12);
      cells.push(output);
    }
  }
  return cells;
}

async function buildExactStrip(cells, output) {
  const frameSize = 256;
  await ensureParent(output);
  await sharp({
    create: {
      width: frameSize * cells.length,
      height: frameSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(cells.map((input, index) => ({ input, left: frameSize * index, top: 0 })))
    .png({ compressionLevel: 9 })
    .toFile(output);
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
  const radius = Math.max(16, Math.round(Math.min(objectWidth, objectHeight) * (0.085 + severity * 0.013)));
  const biteRows = [0.34, 0.53, 0.71].slice(0, severity);
  const bites = biteRows.map((fraction) => {
    const centerY = minY + objectHeight * fraction;
    let rowRight = minX;
    for (let y = Math.max(minY, Math.floor(centerY - radius * 0.8)); y <= Math.min(maxY, Math.ceil(centerY + radius * 0.8)); y += 1) {
      for (let x = maxX; x >= minX; x -= 1) {
        if (data[(y * info.width + x) * info.channels + 3] >= 48) {
          rowRight = Math.max(rowRight, x);
          break;
        }
      }
    }
    return [rowRight - radius * 0.22, centerY];
  });
  bites.forEach(([centerX, centerY], biteIndex) => {
    for (let y = Math.max(0, Math.floor(centerY - radius)); y <= Math.min(info.height - 1, Math.ceil(centerY + radius)); y += 1) {
      for (let x = Math.max(0, Math.floor(centerX - radius)); x <= Math.min(info.width - 1, Math.ceil(centerX + radius)); x += 1) {
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance <= radius * (biteIndex % 2 ? 0.9 : 1)) data[(y * info.width + x) * info.channels + 3] = 0;
      }
    }
  });

  await ensureParent(output);
  await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(output);
}

const policeSheet = path.join(imageDirectory, "processed-sheets/police-station-v3-transparent.png");
const menuSheet = path.join(imageDirectory, "processed-sheets/menu-icons-v3-transparent.png");
const starSheet = path.join(imageDirectory, "processed-sheets/knockout-stars-v3-transparent.png");

await trimToSquare(policeSheet, path.join(imageDirectory, "facilities/police-station-v3.png"), 512, 20);

await splitGrid(menuSheet, 4, 2, [
  "ui/menu/settings-v3.png",
  "ui/menu/farm-v3.png",
  "ui/menu/facilities-v3.png",
  "ui/menu/inventory-v3.png",
  "ui/menu/codex-v3.png",
  "ui/menu/shop-v3.png",
  "ui/menu/report-v3.png",
  "ui/menu/exit-v3.png",
]);

const starCells = await splitGrid(starSheet, 4, 1, [
  "effects/ko-stars-frame-1-v3.png",
  "effects/ko-stars-frame-2-v3.png",
  "effects/ko-stars-frame-3-v3.png",
  "effects/ko-stars-frame-4-v3.png",
]);
await buildExactStrip(starCells, path.join(imageDirectory, "effects/knockout-stars-strip-v3.png"));

const crops = [
  ["basic", "sprout", "cucumber-baby.png"],
  ["basic", "young", "cucumber-boy.png"],
  ["basic", "adult", "cucumber-adult.png"],
  ["solar", "sprout", "crops/solar/solar-sprout-v2.png"],
  ["solar", "young", "crops/solar/solar-young-v2.png"],
  ["solar", "adult", "crops/solar/solar-adult-v2.png"],
];
for (const [variety, stage, source] of crops) {
  for (let severity = 1; severity <= 3; severity += 1) {
    await createDamagedCrop(
      path.join(imageDirectory, source),
      path.join(imageDirectory, `crops/damaged/${variety}-${stage}-bite-${severity}-v3.png`),
      severity,
    );
  }
}

console.log("Built police station, eight menu icons, a four-frame KO effect, and 18 stage-specific damaged crops.");
