// scripts/prepare-capacitor-web.mjs

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'www');

const filesToCopy = [
  'index.html',
  'app-calendar.html',
  'calendar-study.html',
  'calendar-work.html',
  'calendar-event.html',
  'offline.html',
  'site.webmanifest',
  'sw.js',
];

const dirsToCopy = ['assets', 'images', 'partials'];

function exists(targetPath) {
  return fs.existsSync(path.join(rootDir, targetPath));
}

function copyFile(relativePath) {
  const src = path.join(rootDir, relativePath);
  const dest = path.join(outDir, relativePath);

  if (!fs.existsSync(src)) {
    console.warn(`[prepare-capacitor-web] skip missing file: ${relativePath}`);
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(relativePath) {
  const src = path.join(rootDir, relativePath);
  const dest = path.join(outDir, relativePath);

  if (!fs.existsSync(src)) {
    console.warn(`[prepare-capacitor-web] skip missing dir: ${relativePath}`);
    return;
  }

  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (source) => {
      const name = path.basename(source);
      return name !== '.DS_Store';
    },
  });
}

function assertRequiredFiles() {
  const required = [
    'index.html',
    'app-calendar.html',
    'calendar-study.html',
    'calendar-work.html',
    'calendar-event.html',
    'assets/js/boot.js',
    'assets/js/main.js',
    'assets/js/modules/app-calendar-mode.js',
    'assets/js/modules/app-calendar.js',
    'assets/css/main/app-calendar-main.css',
  ];

  const missing = required.filter((item) => !exists(item));

  if (missing.length > 0) {
    throw new Error(
      `Capacitor 준비에 필요한 파일이 없어: ${missing.join(', ')}`,
    );
  }
}

function cleanOutDir() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

assertRequiredFiles();
cleanOutDir();

filesToCopy.forEach(copyFile);
dirsToCopy.forEach(copyDir);

console.log('[prepare-capacitor-web] www 폴더 준비 완료');
