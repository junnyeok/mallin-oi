import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const imageDirectory = path.resolve(scriptDirectory, "../assets/images");

async function tightenAlpha(input, size) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const components = [];
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || data[start * channels + 3] <= 12) continue;
    const stack = [start];
    const pixels = [];
    let minX = width, maxX = 0, minY = height, maxY = 0;
    visited[start] = 1;
    while (stack.length) {
      const current = stack.pop();
      pixels.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [nextX, nextY] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (visited[next] || data[next * channels + 3] <= 12) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    components.push({ pixels, minX, maxX, minY, maxY });
  }
  components.forEach((component) => {
    const touchesEdge = component.minX === 0 || component.minY === 0 || component.maxX === width - 1 || component.maxY === height - 1;
    const narrow = component.maxX - component.minX < 14 || component.maxY - component.minY < 14;
    if (!touchesEdge || !narrow) return;
    component.pixels.forEach((pixel) => { data[pixel * channels + 3] = 0; });
  });
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (data[pixel * channels + 3] <= 12) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (minX > maxX || minY > maxY) return sharp(input).resize(size, size, { fit: "contain" }).png().toBuffer();
  const padding = 8;
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(height - 1, maxY + padding);
  return sharp(data, { raw: info })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function splitGrid(source, columns, rows, outputs, size = 256) {
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
      const output = path.join(imageDirectory, outputs[index]);
      await mkdir(path.dirname(output), { recursive: true });
      const cellWidth = Math.max(1, Math.min(right - left, width - left - 1));
      const cellHeight = Math.max(1, Math.min(bottom - top, height - top - 1));
      const cell = await sharp(source)
        .extract({ left, top, width: cellWidth, height: cellHeight })
        .png()
        .toBuffer();
      await sharp(await tightenAlpha(cell, size)).toFile(output);
    }
  }
}

async function buildStrip(source, output, variants) {
  const frames = [];
  for (const variant of variants) {
    const actor = await sharp(source)
      .resize(218, 218, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .rotate(variant.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(Math.round(218 * variant.scale), Math.round(218 * variant.scale), {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const metadata = await sharp(actor).metadata();
    const left = Math.round((256 - (metadata.width ?? 0)) / 2 + variant.x);
    const top = Math.round((256 - (metadata.height ?? 0)) / 2 + variant.y);
    frames.push(await sharp({
      create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: actor, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer());
  }
  const destination = path.join(imageDirectory, output);
  await mkdir(path.dirname(destination), { recursive: true });
  await sharp({
    create: { width: 1024, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(frames.map((input, index) => ({ input, left: index * 256, top: 0 }))).png({ compressionLevel: 9 }).toFile(destination);
}

const solarSheet = process.argv[2];
const resourceSheet = process.argv[3];
const biteSheet = process.argv[4];
if (!solarSheet || !resourceSheet || !biteSheet) {
  throw new Error("Usage: node build-revision-assets.mjs <solar-sheet> <resource-sheet> <bite-sheet>");
}

await splitGrid(solarSheet, 3, 1, [
  "crops/solar/solar-sprout-v2.png",
  "crops/solar/solar-young-v2.png",
  "crops/solar/solar-adult-v2.png",
], 512);

await splitGrid(resourceSheet, 4, 2, [
  "ui/resources/cucumber-v2.png",
  "ui/resources/coin-v2.png",
  "ui/resources/water-v2.png",
  "ui/resources/fuel-v2.png",
  "ui/resources/energy-v2.png",
  "ui/resources/solar-seed-v2.png",
  "ui/resources/water-barrel-v2.png",
  "ui/resources/bounty-v2.png",
]);

await splitGrid(biteSheet, 3, 1, [
  "effects/crop-bite-1-v2.png",
  "effects/crop-bite-2-v2.png",
  "effects/crop-bite-3-v2.png",
]);

const actorIds = ["bird", "squirrel", "rabbit", "boar", "mouse", "raccoon", "thief"];
const speciesVariants = {
  bird: [[-10, 5, -7], [-3, -8, 3], [5, -2, -2], [11, 5, 6]],
  squirrel: [[-8, 3, -5], [-2, -5, 3], [4, 2, -3], [9, -3, 5]],
  rabbit: [[-7, 8, -5], [-2, -13, 1], [4, -4, -2], [8, 8, 5]],
  boar: [[-7, 4, -3], [-2, 0, 1], [4, 4, -1], [8, 0, 3]],
  mouse: [[-12, 4, -8], [8, -2, 5], [-7, 3, -5], [12, -3, 8]],
  raccoon: [[-8, 3, -4], [-2, -5, 2], [4, 2, -2], [9, -3, 4]],
  thief: [[-4, 3, -3], [-1, -2, 2], [2, 2, -2], [5, -1, 3]],
};
const eatingVariants = [
  { x: 0, y: 5, rotate: -3, scale: 0.98 },
  { x: -4, y: -4, rotate: 3, scale: 1.02 },
  { x: 4, y: 3, rotate: -2, scale: 1 },
  { x: 0, y: -6, rotate: 2, scale: 1.03 },
];

for (const actorId of actorIds) {
  const movement = speciesVariants[actorId].map(([x, y, rotate], index) => ({
    x,
    y,
    rotate,
    scale: index % 2 === 0 ? 0.98 : 1.02,
  }));
  await buildStrip(
    path.join(imageDirectory, `enemies/frames/${actorId}-approaching.png`),
    `enemies/animation/${actorId}-approach-strip-v2.png`,
    movement,
  );
  await buildStrip(
    path.join(imageDirectory, `enemies/frames/${actorId}-eating.png`),
    `enemies/animation/${actorId}-eat-strip-v2.png`,
    eatingVariants,
  );
}

console.log("Built solar crop, resource icons, bite overlays, and 14 enemy motion strips.");
