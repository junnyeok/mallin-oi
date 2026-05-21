// scripts/prepare-capacitor-web.mjs

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'www');
const calendarLauncherFile = 'app-calendar.html';

const filesToCopy = [
  'login.html',
  calendarLauncherFile,
  'calendar-study.html',
  'calendar-work.html',
  'calendar-event.html',
  'site.webmanifest',
];

const filesToCopyIfExists = [
  'account/signup.html',
  'account/find-id.html',
  'account/find-password.html',
  'account/reset-password.html',
];

const dirsToCopy = ['assets', 'images', 'partials'];

const excludedAssetDirs = new Set(['mp3']);
const excludedImageDirs = new Set([
  'BGM',
  'character-effects',
  'characters',
  'emoticons',
  'profile-background',
  'profile-frame',
  'skins',
]);

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

function copyCalendarLauncherAsIndex() {
  const src = path.join(rootDir, calendarLauncherFile);
  const dest = path.join(outDir, 'index.html');

  fs.copyFileSync(src, dest);
}

function getFirstDir(relativePath, source) {
  const relative = path.relative(path.join(rootDir, relativePath), source);
  return relative.split(path.sep).filter(Boolean)[0] || '';
}

function shouldCopyDirEntry(relativePath, source) {
  const name = path.basename(source);
  if (name === '.DS_Store') return false;

  const firstDir = getFirstDir(relativePath, source);

  if (relativePath === 'assets' && excludedAssetDirs.has(firstDir)) {
    return false;
  }

  if (relativePath === 'images' && excludedImageDirs.has(firstDir)) {
    return false;
  }

  return true;
}

function copyDirRecursive(relativePath, src, dest) {
  if (!shouldCopyDirEntry(relativePath, src)) return;

  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });

    fs.readdirSync(src).forEach((entry) => {
      copyDirRecursive(
        relativePath,
        path.join(src, entry),
        path.join(dest, entry),
      );
    });

    return;
  }

  if (!stat.isFile()) return;

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
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

function assertPreparedOutput() {
  const required = [
    'index.html',
    'app-calendar.html',
    'calendar-study.html',
    'calendar-work.html',
    'calendar-event.html',
    'login.html',
    'assets/version.json',
    'assets/css/01-tokens.css',
    'assets/css/components/forms.css',
    'assets/css/components/nav.css',
    'assets/css/components/footer.css',
    'assets/css/components/search-btn.css',
    'assets/css/components/scroll-buttons.css',
    'assets/css/components/write-btn.css',
    'assets/css/components/auth-links.css',
    'assets/css/components/update-banner.css',
    'assets/css/main/app-calendar-main.css',
    'assets/css/main/calendar-study-main.css',
    'assets/css/main/calendar-work-main.css',
    'assets/css/main/calendar-event-main.css',
    'assets/js/boot.js',
    'assets/js/main.js',
    'assets/js/modules/site-version.js',
    'assets/js/modules/mobile-stability.js',
    'assets/js/modules/app-calendar-mode.js',
    'assets/js/modules/app-calendar.js',
    'assets/js/modules/study-calendar.js',
    'assets/js/modules/work-calendar.js',
    'assets/js/modules/event-calendar.js',
    'assets/js/modules/supabase-client.js',
    'assets/js/modules/auth-store.js',
    'assets/js/modules/layout-includes.js',
    'images/logo-study.png',
    'images/logo-work.png',
    'images/logo-event.png',
    'images/logo-home.png',
    'images/android-chrome-192x192.png',
    'images/android-chrome-512x512.png',
    'images/apple-touch-icon.png',
    'images/favicon-16x16.png',
    'images/favicon-32x32.png',
    'images/favicon.ico',
    'site.webmanifest',
  ];

  const missing = required.filter(
    (item) => !fs.existsSync(path.join(outDir, item)),
  );

  if (missing.length > 0) {
    throw new Error(`www 준비 결과에 파일이 없어: ${missing.join(', ')}`);
  }
}

function cleanOutDir() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

assertRequiredFiles();
cleanOutDir();

filesToCopy.forEach(copyFile);
copyCalendarLauncherAsIndex();
filesToCopyIfExists.forEach(copyFile);
dirsToCopy.forEach((relativePath) => {
  const src = path.join(rootDir, relativePath);
  const dest = path.join(outDir, relativePath);

  if (!fs.existsSync(src)) {
    console.warn(`[prepare-capacitor-web] skip missing dir: ${relativePath}`);
    return;
  }

  copyDirRecursive(relativePath, src, dest);
});

assertPreparedOutput();

console.log('[prepare-capacitor-web] www 폴더 준비 완료');
