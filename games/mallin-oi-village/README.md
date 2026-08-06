# 말오닷특별시

말린오이닷컴의 서비스들을 세로형 2.5D 카툰 마을에서 탐험하는 독립 모바일 게임 프로젝트입니다.

## 프로젝트 경계

- 작업 폴더: `/Users/junnyeok/Documents/mallin-oi/games/mallin-oi-village`
- npm 패키지: `mallodat-special-city`
- Android application ID: `com.mallinoi.specialcity`
- iOS bundle ID: `com.mallinoi.specialcity`
- 전용 로컬 개발 포트: `4311`
- 빌드 결과물과 네이티브 프로젝트는 모두 이 폴더 안에서만 생성됩니다.

오이키우기와 말린오이닷컴 본체의 패키지, 포트, 앱 식별자, 네이티브 프로젝트를 공유하지 않습니다. 폴더 이름은 기존 작업 경로를 깨지 않기 위해 유지하고, 실제 앱 이름은 `말오닷특별시`를 사용합니다.

## 처음 한 번 준비

```bash
cd /Users/junnyeok/Documents/mallin-oi/games/mallin-oi-village
npm install
npm run native:doctor
npm run native:prepare
```

## Android Studio에서 실행

```bash
npm run android:open
```

Android Studio가 열리면 Gradle 동기화가 끝난 뒤 에뮬레이터 또는 Android 기기를 선택하고 Run 버튼을 누릅니다.

## Xcode에서 실행

```bash
npm run ios:open
```

Xcode가 열리면 `App` 스킴과 iPhone 시뮬레이터를 선택하고 Run 버튼을 누릅니다. 실제 iPhone에서는 Signing & Capabilities에서 개발자 Team을 한 번 선택해야 합니다.

더 자세한 실행·문제 해결 방법은 [NATIVE_RUN_GUIDE.md](./NATIVE_RUN_GUIDE.md)를 참고하세요.

## 자주 쓰는 명령

```bash
npm run dev                  # 브라우저 미리보기: http://localhost:4311
npm run native:icons         # 원본 이미지에서 Android/iOS 앱 아이콘 생성
npm run native:prepare       # 웹 빌드 후 Android/iOS에 동기화
npm run android:open         # Android Studio 열기
npm run ios:open             # Xcode 열기
npm run native:verify        # 웹 + Android + iOS 전체 빌드 검증
```

웹 소스나 캐릭터 에셋을 수정한 뒤에는 반드시 `npm run native:prepare`를 실행해야 Android Studio와 Xcode에 최신 화면이 반영됩니다.

앱 아이콘 원본은 `assets/app-icon/mallodat-special-city-source.png`입니다. 원본을 교체한 뒤 `npm run native:icons`를 실행하면 Android의 밀도별 런처 아이콘과 Xcode의 1024px AppIcon이 함께 갱신됩니다.

## 기술 방향

- React + Three.js 화면을 Capacitor로 iOS/Android 앱에 포함합니다.
- 높은 사선 시점, 얕은 원근감, 셀 셰이딩, 외곽선, 2D 캐릭터를 조합해 애니메이션 같은 2.5D 마을을 표현합니다.
- 강·건물·나무·분수에는 독립 충돌 판정을 적용하며 강은 다리 구간으로만 건널 수 있습니다.
- 캐릭터는 이동 입력에 맞춰 방향 전환, 상하 바운스, 기울기, 그림자 변화를 조합한 달리기 모션을 사용합니다.
- 계정, 캐릭터 장착 상태, 게시물, 상점, 캘린더, 접속 상태는 말린오이닷컴과 같은 API를 사용합니다.
- 서비스 데이터 변경은 공용 API를 통해 빠르게 반영하고, 게임 화면이나 네이티브 설정 변경만 앱 업데이트로 배포합니다.

## 말린오이닷컴 연결 지점

`.env.example`의 Supabase URL과 공개용 publishable key를 설정하면 `public_profiles`에서 프로필 사진, 장착 캐릭터·스킨·효과를 읽습니다. 현재 `말오닷 주인장`은 `기본오이 + 당신의 친절한 오이 + 거미줄 효과`로 동기화되며, 네트워크가 없어도 같은 내장 에셋으로 표시됩니다.

`VITE_MALLINOI_API_URL`에는 추후 게임 공용 API 주소를 지정합니다. `src/services/mallinoi-api.ts`가 연결을 담당하고 API가 없어도 나머지 초안 기능은 샘플 데이터로 동작합니다.

- `GET /v1/game/village` — 이용자, 집, 온라인/수면 상태
- `GET /v1/posts` / `POST /v1/posts` — 전체 게시물과 글쓰기
- `GET /v1/store` / `POST /v1/store/purchases` — 상점과 장착 상태
- `GET /v1/calendar` — 기존 캘린더 일정
- `PATCH /v1/profile/equipment` — 캐릭터·스킨·효과 변경
