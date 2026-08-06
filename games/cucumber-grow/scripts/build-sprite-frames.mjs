import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const imageDirectory = path.resolve(scriptDirectory, "../assets/images/enemies");
const outputDirectory = path.join(imageDirectory, "frames");
const animationDirectory = path.join(imageDirectory, "animation");
const frameNames = ["approaching", "eating", "hit", "defeated"];

const sheets = [
  ["bird", "bird-sprite.png"],
  ["squirrel", "squirrel-sprite.png"],
  ["boar", "boar-sprite.png"],
  ["thief", "thief-sprite.png"],
  ["rabbit", "rabbit-sprite-v2.png"],
  ["mouse", "mouse-sprite-v2.png"],
  ["raccoon", "raccoon-sprite-v2.png"],
];

async function keepLargestCharacter(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const components = [];
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (visited[pixel] || data[pixel * channels + 3] <= 12) continue;
    const stack = [pixel];
    const pixels = [];
    let minimumX = width;
    let maximumX = 0;
    let minimumY = height;
    let maximumY = 0;
    visited[pixel] = 1;
    while (stack.length > 0) {
      const current = stack.pop();
      pixels.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      minimumX = Math.min(minimumX, x);
      maximumX = Math.max(maximumX, x);
      minimumY = Math.min(minimumY, y);
      maximumY = Math.max(maximumY, y);
      for (const [offsetX, offsetY] of neighbors) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (visited[next]) continue;
        if (data[next * channels + 3] <= 12) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    components.push({ pixels, minimumX, maximumX, minimumY, maximumY });
  }

  const largest = components.reduce(
    (winner, component) =>
      component.pixels.length > (winner?.pixels.length ?? 0) ? component : winner,
    null
  );
  components.forEach((component) => {
    if (component === largest) return;
    component.pixels.forEach((pixel) => {
      data[pixel * channels + 3] = 0;
    });
  });
  if (!largest) return sharp(input).png().toBuffer();
  const padding = 4;
  const left = Math.max(0, largest.minimumX - padding);
  const top = Math.max(0, largest.minimumY - padding);
  const right = Math.min(width - 1, largest.maximumX + padding);
  const bottom = Math.min(height - 1, largest.maximumY + padding);
  return sharp(data, { raw: info })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toBuffer();
}

async function placeWithSafeMargin(input, size = 256, artSize = 218) {
  const art = await sharp(input)
    .resize(artSize, artSize, {
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const inset = Math.floor((size - artSize) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: art, left: inset, top: inset }]).png().toBuffer();
}

async function buildStrip(source, output, variants) {
  const frames = [];
  for (const variant of variants) {
    const transformed = await sharp(source)
      .resize(202, 202, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .rotate(variant.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(218, 218, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const metadata = await sharp(transformed).metadata();
    const width = metadata.width ?? 1;
    const height = metadata.height ?? 1;
    const desiredLeft = Math.round((256 - width) / 2 + variant.x);
    const desiredTop = Math.round((256 - height) / 2 + variant.y);
    const left = Math.max(0, Math.min(256 - width, desiredLeft));
    const top = Math.max(0, Math.min(256 - height, desiredTop));
    frames.push(await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite([{ input: transformed, left, top }]).png().toBuffer());
  }
  await sharp({
    create: {
      width: 1024,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(frames.map((input, index) => ({ input, left: index * 256, top: 0 })))
    .png({ compressionLevel: 9 })
    .toFile(output);
}

await mkdir(outputDirectory, { recursive: true });
await mkdir(animationDirectory, { recursive: true });

for (const [actorId, sourceName] of sheets) {
  const sourcePath = path.join(imageDirectory, sourceName);
  const metadata = await sharp(sourcePath).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  if (sourceWidth < 4 || sourceHeight < 1) {
    throw new Error(`Invalid sprite sheet: ${sourcePath}`);
  }

  for (let index = 0; index < frameNames.length; index += 1) {
    const cellWidth = sourceWidth / frameNames.length;
    const overlap = Math.round(cellWidth * 0.18);
    const nominalLeft = Math.floor(cellWidth * index);
    const nominalRight = Math.ceil(cellWidth * (index + 1));
    const left = Math.max(0, nominalLeft - overlap);
    const right = Math.min(sourceWidth, nominalRight + overlap);
    const outputPath = path.join(
      outputDirectory,
      `${actorId}-${frameNames[index]}.png`
    );
    const frameBuffer = await sharp(sourcePath)
      .extract({ left, top: 0, width: right - left, height: sourceHeight })
      .png()
      .toBuffer();
    const isolatedFrame = await keepLargestCharacter(frameBuffer);
    await sharp(await placeWithSafeMargin(isolatedFrame))
      .png({ compressionLevel: 9, palette: false })
      .toFile(outputPath);
  }

  const movement = {
    bird: [[-8, 4, -5], [-2, -7, 3], [5, -1, -2], [8, 4, 5]],
    squirrel: [[-7, 3, -4], [-2, -4, 3], [4, 2, -3], [7, -2, 4]],
    rabbit: [[-6, 7, -4], [-2, -11, 1], [4, -3, -2], [7, 7, 4]],
    boar: [[-6, 3, -3], [-2, 0, 1], [4, 3, -1], [7, 0, 3]],
    mouse: [[-9, 3, -6], [7, -2, 4], [-6, 2, -4], [9, -2, 6]],
    raccoon: [[-7, 3, -4], [-2, -4, 2], [4, 2, -2], [7, -2, 4]],
    thief: [[-4, 3, -3], [-1, -2, 2], [2, 2, -2], [5, -1, 3]],
  }[actorId].map(([x, y, rotate]) => ({ x, y, rotate }));
  const eating = [
    { x: 0, y: 4, rotate: -3 },
    { x: -3, y: -3, rotate: 3 },
    { x: 3, y: 2, rotate: -2 },
    { x: 0, y: -4, rotate: 2 },
  ];
  await buildStrip(
    path.join(outputDirectory, `${actorId}-approaching.png`),
    path.join(animationDirectory, `${actorId}-approach-strip-v2.png`),
    movement,
  );
  await buildStrip(
    path.join(outputDirectory, `${actorId}-eating.png`),
    path.join(animationDirectory, `${actorId}-eat-strip-v2.png`),
    eating,
  );
}

console.log(
  `Built ${sheets.length * frameNames.length} padded enemy frames and ${sheets.length * 2} strips`
);
