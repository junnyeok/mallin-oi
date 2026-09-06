// scripts/prepare-capacitor-web.mjs

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'www');
const calendarLauncherFile = 'app-calendar.html';

const filesToCopy = [
  'login.html',
  'write.html',
  'inventory.html',
  'store.html',
  'store-item.html',
  'post.html',
  'profile.html',
  'notifications.html',
  calendarLauncherFile,
  'prev-mypage.html',
  'mypage.html',
  'calendar-study.html',
  'calendar-work.html',
  'calendar-event.html',
  'calendar-groups.html',
  'privacy.html',
  'assets/version.json',
  'assets/app-version.json',
  'site.webmanifest',
];

const filesToCopyIfExists = [
  'account/signup.html',
  'account/find-password.html',
  'account/reset-password.html',
];

const dirsToCopy = ['assets', 'images', 'partials'];
const nativeCharacterImageFiles = [
  'images/characters/tomato.png',
  'images/characters/brocolli.png',
];
const nativeProfileBackgroundImageFiles = [
  'images/profile-background/refrigerator.png',
  'images/profile-background/refrigerator-mobile.png',
  'images/profile-background/changsin.png',
  'images/profile-background/changsin-mobile.png',
  'images/profile-background/idolstage.webp',
  'images/profile-background/idolstage-mobile.webp',
];
const nativeProfileFrameImageFiles = [
  'images/profile-frame/rainbow.png',
  'images/profile-frame/rainbow-mobile.png',
  'images/profile-frame/mallin-shiny.png',
  'images/profile-frame/mallin-shiny-mobile.png',
];
const nativeSkinImageFiles = [
  'images/skins/ozyo.png',
  'images/skins/spioi.png',
  'images/skins/inomske.png',
  'images/skins/socceroi.png',
  'images/skins/summerboy.png',
];
const nativeCharacterEffectImageFiles = [
  'images/character-effects/cucumber-heart.png',
  'images/character-effects/fire-effect-01.png',
  'images/character-effects/spider-web-effect-01.png',
];
const nativeEmoticonImageFiles = [
  ...Array.from(
    { length: 10 },
    (_, index) =>
      `images/emoticons/emo-cucumberboy-${String(index + 1).padStart(2, '0')}.png`,
  ),
  ...Array.from(
    { length: 10 },
    (_, index) =>
      `images/emoticons/${String(index + 1).padStart(2, '0')}-broccoli-girl.png`,
  ),
];
const nativeCareerAwardImageFiles = [
  'images/reward/reward-career-1st.png',
  'images/reward/reward-career-2nd.png',
  'images/reward/reward-career-3nd.png',
];
const nativeCareerAwardAudioFiles = [
  'assets/mp3/mallinoi-reward.mp3',
];
const requiredAssetDirs = [
  'assets/js/modules',
  'assets/css/components',
  'assets/css/main',
];

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

function copyRequiredAssetDirs() {
  requiredAssetDirs.forEach((relativePath) => {
    const src = path.join(rootDir, relativePath);
    const dest = path.join(outDir, relativePath);

    if (!fs.existsSync(src)) {
      throw new Error(`Capacitor 준비에 필요한 디렉터리가 없어: ${relativePath}`);
    }

    copyDirRecursive(relativePath, src, dest);
  });
}

function listFilesByExtension(relativePath, extension) {
  const dir = path.join(rootDir, relativePath);

  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => `${relativePath}/${entry}`)
    .sort();
}

function getMainModuleImports() {
  const mainPath = path.join(rootDir, 'assets/js/main.js');
  const mainSource = fs.readFileSync(mainPath, 'utf8');
  const imports = new Set();
  const re = /withModuleVersion\('\.\/modules\/([^']+\.js)'\)/g;
  let match;

  while ((match = re.exec(mainSource)) !== null) {
    imports.add(`assets/js/modules/${match[1]}`);
  }

  return [...imports].sort();
}

function assertFilesExist(files, baseDir = rootDir) {
  const missing = files.filter((item) => !fs.existsSync(path.join(baseDir, item)));

  if (missing.length > 0) {
    throw new Error(`Capacitor 준비 파일이 없어: ${missing.join(', ')}`);
  }
}

function assertRequiredFiles() {
  const required = [
    'index.html',
    'app-calendar.html',
    'prev-mypage.html',
    'mypage.html',
    'notifications.html',
    'calendar-study.html',
    'calendar-work.html',
    'calendar-event.html',
    'calendar-groups.html',
    'assets/js/boot.js',
    'assets/js/main.js',
    'assets/js/modules/app-calendar-mode.js',
    'assets/js/modules/app-calendar.js',
    'assets/js/modules/refresh-control.js',
    'assets/js/modules/calendar-widget-data.js',
    'assets/js/modules/calendar-loading.js',
    'assets/css/components/refresh-control.css',
    'assets/css/components/calendar-loading.css',
    'assets/css/main/app-calendar-main.css',
    'images/calendar/dancing-cucumber-sprite-sheet.png',
    ...nativeCharacterImageFiles,
    ...nativeProfileBackgroundImageFiles,
    ...nativeProfileFrameImageFiles,
    ...nativeSkinImageFiles,
    ...nativeCharacterEffectImageFiles,
    ...nativeEmoticonImageFiles,
    ...nativeCareerAwardImageFiles,
    ...nativeCareerAwardAudioFiles,
    ...getMainModuleImports(),
  ];

  assertFilesExist(required);
}

function assertPreparedOutput() {
  const required = [
    'index.html',
    'app-calendar.html',
    'prev-mypage.html',
    'mypage.html',
    'notifications.html',
    'calendar-study.html',
    'calendar-work.html',
    'calendar-event.html',
    'calendar-groups.html',
    'privacy.html',
    'store.html',
    'store-item.html',
    'login.html',
    'write.html',
    'assets/version.json',
    'assets/app-version.json',
    'assets/css/01-tokens.css',
    'assets/css/components/forms.css',
    'assets/css/components/nav.css',
    'assets/css/components/footer.css',
    'assets/css/components/search-btn.css',
    'assets/css/components/scroll-buttons.css',
    'assets/css/components/write-btn.css',
    'assets/css/components/auth-links.css',
    'assets/css/components/update-banner.css',
    'assets/css/components/app-update-popup.css',
    'assets/css/components/refresh-control.css',
    'assets/css/components/calendar-loading.css',
    'assets/css/main/app-calendar-main.css',
    'assets/css/main/calendar-study-main.css',
    'assets/css/main/calendar-work-main.css',
    'assets/css/main/calendar-event-main.css',
    'assets/css/main/calendar-groups-main.css',
    'assets/js/boot.js',
    'assets/js/main.js',
    'assets/js/modules/site-version.js',
    'assets/js/modules/app-update-popup.js',
    'assets/js/modules/mobile-stability.js',
    'assets/js/modules/app-calendar-mode.js',
    'assets/js/modules/app-calendar.js',
    'assets/js/modules/refresh-control.js',
    'assets/js/modules/calendar-widget-data.js',
    'assets/js/modules/calendar-loading.js',
    'assets/js/modules/study-calendar.js',
    'assets/js/modules/work-calendar.js',
    'assets/js/modules/event-calendar.js',
    'assets/js/modules/calendar-groups.js',
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
    'images/calendar-app-icon.png',
    'images/calendar/dancing-cucumber-sprite-sheet.png',
    'images/favicon-16x16.png',
    'images/favicon-32x32.png',
    'images/favicon.ico',
    'site.webmanifest',
    ...nativeCharacterImageFiles,
    ...nativeProfileBackgroundImageFiles,
    ...nativeProfileFrameImageFiles,
    ...nativeSkinImageFiles,
    ...nativeCharacterEffectImageFiles,
    ...nativeEmoticonImageFiles,
    ...nativeCareerAwardImageFiles,
    ...nativeCareerAwardAudioFiles,
    ...listFilesByExtension('assets/js/modules', '.js'),
    ...listFilesByExtension('assets/css/components', '.css'),
    ...listFilesByExtension('assets/css/main', '.css'),
    ...getMainModuleImports(),
  ];

  assertFilesExist(required, outDir);
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
nativeCharacterImageFiles.forEach(copyFile);
nativeProfileBackgroundImageFiles.forEach(copyFile);
nativeProfileFrameImageFiles.forEach(copyFile);
nativeSkinImageFiles.forEach(copyFile);
nativeCharacterEffectImageFiles.forEach(copyFile);
nativeEmoticonImageFiles.forEach(copyFile);
nativeCareerAwardAudioFiles.forEach(copyFile);
copyRequiredAssetDirs();

assertPreparedOutput();

console.log('[prepare-capacitor-web] www 폴더 준비 완료');
