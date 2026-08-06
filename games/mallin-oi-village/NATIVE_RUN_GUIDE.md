# 말오닷특별시 네이티브 실행 가이드

이 프로젝트는 웹 화면을 앱 안에 포함하는 Capacitor 구조입니다. React/Three.js 소스는 한 번만 관리하고, `android/`와 `ios/`는 각각 Android Studio와 Xcode가 여는 독립 네이티브 프로젝트입니다.

## 1. 개발환경 점검

터미널의 현재 위치가 반드시 아래 폴더인지 확인합니다.

```bash
cd /Users/junnyeok/Documents/mallin-oi/games/mallin-oi-village
npm run native:doctor
```

점검 항목은 Node.js, Java, Android SDK, Android Studio, Xcode, 네이티브 프로젝트입니다. `node_modules`가 없다고 나오면 먼저 `npm install`을 실행합니다.

## 2. 최신 게임 화면 반영

```bash
npm run native:prepare
```

이 명령은 다음 작업을 순서대로 처리합니다.

1. TypeScript 검사와 프로덕션 웹 빌드
2. 결과물을 Android 앱에 복사
3. 결과물을 iOS 앱에 복사
4. Capacitor 네이티브 설정과 플러그인 동기화

화면, 캐릭터, CSS, 음원, API 코드를 수정했을 때마다 이 명령을 다시 실행합니다.

## 3. Android Studio

```bash
npm run android:open
```

직접 열려면 Android Studio에서 다음 폴더를 선택합니다.

```text
/Users/junnyeok/Documents/mallin-oi/games/mallin-oi-village/android
```

실행 순서:

1. Android Studio 하단의 Gradle Sync가 끝날 때까지 기다립니다.
2. Device Manager에서 세로형 휴대폰 에뮬레이터를 실행하거나 USB 기기를 연결합니다.
3. 상단 실행 대상이 `app`인지 확인합니다.
4. Run 버튼을 누릅니다.

터미널에서 설치용 APK만 만들려면 다음 명령을 사용합니다.

```bash
npm run native:prepare
npm run android:assemble
```

APK 위치:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 4. Xcode

```bash
npm run ios:open
```

직접 열려면 다음 프로젝트를 선택합니다.

```text
/Users/junnyeok/Documents/mallin-oi/games/mallin-oi-village/ios/App/App.xcodeproj
```

실행 순서:

1. 상단 스킴에서 `App`을 선택합니다.
2. iPhone 시뮬레이터 또는 연결된 iPhone을 선택합니다.
3. Run 버튼을 누릅니다.
4. 실제 iPhone을 처음 연결했다면 App 타깃의 Signing & Capabilities에서 본인의 Team을 선택합니다.

서명 없이 iOS 시뮬레이터용 빌드만 확인하려면 다음 명령을 사용합니다.

```bash
npm run native:prepare
npm run ios:simulator:build
```

## 5. 전체 검증

```bash
npm run native:verify
```

웹 빌드, Android debug APK, iOS Simulator 빌드를 한 번에 확인합니다. 앱 배포 전이나 네이티브 설정을 수정한 뒤 사용하는 명령입니다.

## 6. 오이키우기 작업과 충돌하지 않는 이유

| 구분 | 말오닷특별시 |
| --- | --- |
| 프로젝트 폴더 | `games/mallin-oi-village` |
| npm 패키지 | `mallodat-special-city` |
| 개발 포트 | `4311` |
| Android ID | `com.mallinoi.specialcity` |
| iOS Bundle ID | `com.mallinoi.specialcity` |
| Android 프로젝트 | `games/mallin-oi-village/android` |
| Xcode 프로젝트 | `games/mallin-oi-village/ios/App` |

명령은 항상 말오닷특별시 폴더 안에서 실행합니다. 말린오이 최상위 폴더에서 `npm install`, `cap sync`, Gradle 또는 Xcode 빌드를 실행하지 않습니다.

## 7. 자주 발생하는 문제

### 수정한 화면이 앱에 보이지 않을 때

`npm run native:prepare`를 다시 실행하고 Android Studio 또는 Xcode에서 앱을 재실행합니다.

### Android SDK를 찾지 못할 때

Android Studio의 Settings > Android SDK에서 SDK를 설치한 뒤 프로젝트를 다시 엽니다. 이 Mac의 일반적인 SDK 위치는 `~/Library/Android/sdk`입니다.

### Xcode 실제 기기 서명 오류

App 타깃 > Signing & Capabilities에서 Team을 선택하고, Bundle Identifier가 `com.mallinoi.specialcity`인지 확인합니다.

### 포트가 이미 사용 중일 때

말오닷특별시는 `4311`만 사용하고 포트가 점유되어 있으면 자동으로 다른 포트를 선택하지 않고 중단합니다. 점유 중인 말오닷특별시 개발 서버를 종료한 뒤 다시 `npm run dev`를 실행합니다.
