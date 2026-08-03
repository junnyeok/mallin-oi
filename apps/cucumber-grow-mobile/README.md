# 말린오이: 오이키우기 모바일 앱

오이키우기를 iOS와 Android에 별도 설치하는 세로형 Capacitor 게임 앱이다. 저장소
루트의 캘린더 앱과 앱 식별자·네이티브 프로젝트·아이콘·버전·서명을 공유하지 않는다.

## 프로젝트 경계

- 게임 웹 원본: `games/cucumber-grow/`
- 모바일 빌드 설정과 독립 네이티브 프로젝트: `apps/cucumber-grow-mobile/`
- `dist/`: `npm run build:web`으로 생성되는 임시 웹 번들
- `android/app/src/main/assets/public/`, `ios/App/App/public/`: `cap sync` 생성 결과
- 저장소 루트 `android/`, `ios/`, `www/`: 기존 말린오이 캘린더 앱이며 수정 대상이 아님

HTML·CSS·JavaScript·게임 이미지·사운드는 `games/cucumber-grow/`에서만 수정한다.
`dist/`나 플랫폼 `public/`을 직접 수정하지 않는다. 웹 빌드는 서비스 워커나 원격
사이트 파일을 포함하지 않으며 게임 핵심 자산을 설치 번들에 넣는다.

## 개발용 앱 정보

- 작업명: `말린오이: 오이키우기`
- 임시 Android applicationId / iOS Bundle ID: `com.mallinoi.cucumbergrow.dev`
- 개발 버전: `0.1.0` / 빌드 `1`
- 방향: 휴대전화 세로 고정
- 태블릿: 세로 실행은 가능하지만 게임 캔버스를 최대 540 CSS px로 중앙 정렬

앱 이름, 운영 Bundle ID, Android `versionCode`·`versionName`, iOS Marketing
Version·Build Number는 출시 전에 확정해야 한다. 기존 캘린더 서명이나
`keys/mallinoi-calendar-release`를 사용하지 않는다.

## 실행과 검증

```bash
cd apps/cucumber-grow-mobile
npm install
npm run check
npm test
npm run cap:sync
```

Android 디버그 APK:

```bash
npm run build:android
```

iOS 시뮬레이터 빌드:

```bash
npm run build:ios:sim
```

IDE로 열기:

```bash
npm run cap:open:android
npm run cap:open:ios
```

## 앱 아이콘과 스플래시

- ImageGen 생성 원본: `assets/icon-source.png`, `assets/splash-source.png`
- 실제 아이콘 입력: `assets/app-icon/`
- 실제 스플래시 입력: `assets/splash-art/`
- Android/iOS 규격별 결과: 각 네이티브 프로젝트의 리소스·Asset Catalog

원본 그림은 기존 오이 캐릭터를 참조해 만든 게임 전용 자산이다. 기존 캘린더 앱
아이콘은 읽거나 덮어쓰지 않는다. 입력 자산을 바꾼 뒤 아래 명령으로 파생 리소스를
재생성하며, 생성된 플랫폼 파일을 손으로 편집하지 않는다.

```bash
npm run assets:generate
```

## 네이티브 연결

앱 생명주기와 Android 뒤로가기(`App`), 체크섬 이중 슬롯 저장(`Preferences`),
네트워크 상태(`Network`), 상태 표시줄, 스플래시, 세로 방향, 햅틱, 백업 파일 공유,
허용된 HTTPS 지원 URL의 시스템 브라우저 열기를 연결한다. 카메라·사진·위치·연락처·
광고·분석·추적 SDK와 관련 권한은 사용하지 않는다.

iOS 앱 타깃의 `PrivacyInfo.xcprivacy`는 앱 전용 진행 설정을 위한 UserDefaults
(`CA92.1`)와 앱 컨테이너 백업 파일 처리를 위한 파일 타임스탬프(`C617.1`) 사용을
선언한다. 수집 데이터와 추적 도메인은 없다. 원격 SDK나 데이터 흐름을 추가하면 이
선언과 App Store Connect 개인정보 답변을 함께 다시 검토한다.

## 저장과 오프라인

설치 앱은 Capacitor Preferences에 리비전·체크섬을 포함한 두 저장 슬롯을 번갈아
쓴다. 쓰기 도중 종료되면 직전 정상 슬롯을 복구한다. 같은 WebView에 남아 있는
`mallinoi_cucumber_grow_save_v1` localStorage 저장은 처음 실행할 때 v4 슬롯으로
한 번 옮긴다. 웹사이트와 설치 앱의 WebView 저장소는 자동 공유되지 않으므로 다른
기기나 웹 사용자 이전에는 설정의 JSON 백업 내보내기·가져오기를 사용한다.

클라우드 계정 동기화는 이 독립 게임에 로그인 클라이언트가 없으므로 포함하지
않았다. 로컬 진행은 네트워크 없이 동작하며 앱 삭제 시 함께 삭제될 수 있다.
