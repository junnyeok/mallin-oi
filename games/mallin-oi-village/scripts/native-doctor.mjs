import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function addCheck(label, ok, detail, required = true) {
  checks.push({ label, ok, detail, required });
}

function run(command, args = []) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
  });
}

function firstLine(value) {
  return value.trim().split(/\r?\n/)[0] || "확인되지 않음";
}

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
const supportedNode = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 13);
addCheck("Node.js 22.13+", supportedNode, `현재 ${process.versions.node}`);

addCheck(
  "프로젝트 의존성",
  existsSync(join(projectRoot, "node_modules", "@capacitor", "cli")),
  "node_modules/@capacitor/cli",
);
addCheck("Android 네이티브 프로젝트", existsSync(join(projectRoot, "android", "settings.gradle")), "android/");
addCheck("iOS 네이티브 프로젝트", existsSync(join(projectRoot, "ios", "App", "App.xcodeproj")), "ios/App/App.xcodeproj");

const java = run("java", ["-version"]);
addCheck("Java", java.status === 0, firstLine(java.stderr || java.stdout));

const localPropertiesPath = join(projectRoot, "android", "local.properties");
let localAndroidSdk = "";
if (existsSync(localPropertiesPath)) {
  const match = readFileSync(localPropertiesPath, "utf8").match(/^sdk\.dir=(.+)$/m);
  localAndroidSdk = match?.[1]?.replaceAll("\\\\", "\\") ?? "";
}

const androidSdkCandidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  localAndroidSdk,
  join(homedir(), "Library", "Android", "sdk"),
].filter(Boolean);
const androidSdk = androidSdkCandidates.find((candidate) => existsSync(candidate));
addCheck("Android SDK", Boolean(androidSdk), androidSdk || "Android Studio에서 SDK를 설치하세요");
addCheck(
  "Android Studio",
  existsSync("/Applications/Android Studio.app"),
  "/Applications/Android Studio.app",
);

if (platform() === "darwin") {
  const xcodeSelect = run("xcode-select", ["-p"]);
  const xcodebuild = run("xcodebuild", ["-version"]);
  addCheck("Xcode Command Line Tools", xcodeSelect.status === 0, firstLine(xcodeSelect.stdout || xcodeSelect.stderr));
  addCheck("Xcode", xcodebuild.status === 0, firstLine(xcodebuild.stdout || xcodebuild.stderr));
} else {
  addCheck("Xcode", false, "iOS 빌드는 macOS에서만 가능합니다");
}

console.log("\n말오닷특별시 네이티브 개발환경 점검");
console.log(`프로젝트: ${projectRoot}`);
console.log("전용 개발 서버 포트: 4311\n");

for (const check of checks) {
  const mark = check.ok ? "✓" : check.required ? "✗" : "!";
  console.log(`${mark} ${check.label} — ${check.detail}`);
}

const failures = checks.filter((check) => check.required && !check.ok);
if (failures.length > 0) {
  console.error(`\n필수 항목 ${failures.length}개를 준비한 뒤 다시 npm run native:doctor를 실행하세요.`);
  process.exitCode = 1;
} else {
  console.log("\n모든 필수 항목이 준비되었습니다.");
  console.log("Android Studio: npm run android:open");
  console.log("Xcode:          npm run ios:open");
}
