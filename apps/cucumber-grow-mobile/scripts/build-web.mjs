import { cp, mkdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.resolve(appDirectory, "../../games/cucumber-grow");
const outputDirectory = path.resolve(appDirectory, "dist");
const sourceEntries = ["index.html", "css", "js", "assets"];
const developmentOnlyDirectories = new Set(["generated-sources", "processed-sheets"]);

function shouldCopyToApp(sourcePath) {
  const relativePath = path.relative(sourceDirectory, sourcePath);
  const parts = relativePath.split(path.sep);
  return path.basename(sourcePath) !== ".DS_Store" &&
    !parts.some((part) => developmentOnlyDirectories.has(part));
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of sourceEntries) {
  const source = path.join(sourceDirectory, entry);
  const destination = path.join(outputDirectory, entry);
  const sourceStat = await stat(source);
  await cp(source, destination, {
    recursive: sourceStat.isDirectory(),
    filter: shouldCopyToApp,
  });
}

console.log(`Built mobile game web assets from ${sourceDirectory} to ${outputDirectory}`);
