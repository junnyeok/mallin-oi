# 말린오이 문자·워드마크 후보 정리

조사 기준일은 2026-08-04(KST)이다. 아래 1차·2차 표시는 소유자가 정한 이번 작업 상태일 뿐, 상표 등록 가능성이나 법률상 출원 우선순위의 결론이 아니다. 법률·행정 검토와 상품류·지정상품 논의는 Work Issue #41의 결과를 나중에 입력한다.

## 후보 요약

| 순서 | 후보 | 형태 | 저장소 내 실제 사용 | 대표 사용 경로 | 사용자 화면 노출 | 현재 핵심 브랜드인지 | 보조 표기인지 | 최초 확인 가능한 Git 기록 | 최근 관련 Git 기록 | WORK #41 입력 | 소유자 확인 필요 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `말린오이` | 일반 문자 | PWA 짧은 이름, 캘린더, 상점, 게임, BGM·이모티콘·프로필 아이템과 운영자 표현에서 확인 | `site.webmanifest:3`, `store.html:63`, `games/cucumber-grow/index.html:17`, `mallin-plus.html:57-108` | 예 | 현재 1차 준비 대상이라는 소유자 결정 | `말린오이닷컴`, 앱·게임명 안에도 구성 요소로 사용 | `c6990811d6ae` · 2026-02-12 | `7b03812b5247` · 2026-08-03 | 미입력 · Work #41 | 최초 채택·공개·영업 사용일, 실제 핵심 표기 방식 |
| 2 | `말린오이닷컴` | 일반 문자 | 사이트 제목, PWA 이름, 공유 헤더·푸터, 계정·커뮤니티·상점과 BGM 아티스트 표기에서 확인 | `index.html:6`, `partials/header.html:198-203`, `partials/footer.html:65`, `site.webmanifest:2-4` | 예 | 현재 사이트 식별에 널리 쓰이지만 2차 검토 상태라는 소유자 결정 | `말린오이`의 닷컴 결합 표기 | `c6990811d6ae` · 2026-02-12 | `7b03812b5247` · 2026-08-03 | 미입력 · Work #41 | 핵심 표기인지, 최초 공개·운영일, 병행 사용 계획 |
| 3 | `MallinOi` | 일반 문자 | 정확한 철자는 서비스 코드·화면에서 발견되지 않음. 기존 IP 조사 문서에서 조사 대상 이름으로만 확인 | `docs/ip/README.md`의 Work 조사 대상 목록; 기술 변형은 `capacitor.config.json:2` | 아니오 · 정확한 철자 기준 | 2차 검토 상태라는 소유자 결정; 저장소에는 핵심 브랜드 사용 근거 없음 | 소문자 `mallinoi`가 패키지·scheme·저장 키에 사용 | 정확한 철자: `c4ba278944c7` · 2026-08-04 · 조사 문서 | 정확한 철자: `c4ba278944c7` · 2026-08-04 · 조사 문서 | 미입력 · Work #41 | 외부 홍보·앱스토어·SNS 사용 여부, 의도한 대소문자, 실제 핵심 영문 표기 |
| 4 | `images/logo-word.png` | `말린오이닷컴` 도형화 워드마크 이미지 | 공유 헤더 HTML·JS와 서비스 워커 캐시에 직접 참조됨 | `partials/header.html:202`, `assets/js/modules/layout-includes.js:132`, `sw.js:84` | 예 | 현재 코드의 공통 헤더 워드마크이나 공식 대표 로고 확정은 저장소만으로 불가 | 문자 표장의 시각적 보조 표시 | `c6990811d6ae` · 2026-02-12 | `c6990811d6ae` · 2026-02-12 | 미입력 · Work #41 | 현재 공식 대표 로고인지, 디자인 확정 여부, 비공개 원본 존재 여부 |

`말린오이`와 `말린오이닷컴`의 최근 관련 기록은 `docs/ip/`를 제외한 서비스 코드에서 해당 문자열의 추가·제거를 `git log -S`로 조회한 결과다. 커밋 날짜는 최초 상업적 사용일이나 최초 공개일이 아니다.

## 1. `말린오이` 일반 문자상표 — 현재 1차 대상

- 저장소 내 실제 사용: 있음.
- 대표 사용 경로:
  - PWA: `site.webmanifest:3`
  - 캘린더: `app-calendar.html:9`, `capacitor.config.json:3`
  - 상점: `store.html:63`
  - 게임: `games/cucumber-grow/index.html:17`
  - 자체 디지털 아이템: `assets/js/modules/store-data.js`
- 사용자 화면 노출: 페이지 제목, 화면 헤딩, 설치 앱 이름, 게임 UI와 상품명·설명에서 노출되도록 구현되어 있음.
- 작업 상태: 소유자 지시에 따른 현재 1차 준비 대상.
- 법률적 의미: 판단하지 않음.
- Work #41 법률 조사 결과: `[ ] Work #41 결과 입력 예정`
- 소유자 확인: 최초 채택일, 웹 최초 공개일, 실제 도메인 운영일, 서비스·판매 개시일, 외부 홍보 최초 사용일.

## 2. `말린오이닷컴` 일반 문자상표 — 2차 검토

- 저장소 내 실제 사용: 있음.
- 대표 사용 경로:
  - 홈 제목: `index.html:6`
  - PWA 이름·설명: `site.webmanifest:2-4`
  - 공유 헤더: `partials/header.html:198-203`
  - 공유 푸터: `partials/footer.html:65`
  - 계정·커뮤니티·상점: `login.html:6`, `account/signup.html:6`, `posts-all.html:6`, `store.html:6`
- 사용자 화면 노출: 사이트 페이지 제목, 이미지 alt, 공유 헤더 워드마크와 푸터 저작권 문구에서 노출.
- 작업 상태: 소유자 지시에 따른 2차 검토.
- 법률적 의미: 판단하지 않음.
- Work #41 법률 조사 결과: `[ ] Work #41 결과 입력 예정`
- 소유자 확인: `말린오이`와의 실제 병행 방식, 닷컴 표기를 핵심으로 사용한 기간, 향후 사용 계획.

## 3. `MallinOi` 일반 문자상표 — 2차 검토

- 저장소 내 정확한 철자의 실제 사용: 서비스 코드·화면에서는 없음.
- 정확한 띄어쓰기 변형 `Mallin Oi`: 없음.
- 관련 기술 표기:
  - `com.mallinoi.calendar`: `capacitor.config.json:2`
  - `mallinoi` URL scheme: `android/app/src/main/res/values/strings.xml:6`
  - `@mallinoi/cucumber-grow-mvp`: `games/cucumber-grow/package.json:2`
  - `com.mallinoi.cucumbergrow.dev`: `apps/cucumber-grow-mobile/capacitor.config.json:2`
- 사용자 화면 노출: 위 기술 식별자는 통상 UI 표기가 아니며, 정확한 `MallinOi` 화면 표시는 확인되지 않음.
- 작업 상태: 소유자 지시에 따른 2차 검토.
- 법률적 의미: 기술 식별자의 존재를 영문 문자상표 사용으로 판단하지 않음.
- Work #41 법률 조사 결과: `[ ] Work #41 결과 입력 예정`
- 소유자 확인: 외부 웹·SNS·앱스토어·광고 사용, 의도한 대소문자와 띄어쓰기, 실제 영문 핵심 표기.

## 4. `images/logo-word.png` 로고상표 — 디자인 확정 후 검토

### 파일·Git 증빙

| 항목 | 확인 결과 |
| --- | --- |
| 실제 파일 | 존재 |
| 파일 형식 | PNG, 8-bit RGBA, non-interlaced, alpha 있음 |
| 규격 | 1031×358 px |
| SHA-256 | `5c3a09903a47a507dd03fc770560404aa874be7baf74f84f53441ce517aeea17` |
| 화면상 문자 | `말린오이닷컴` 도형화 워드마크 |
| 최초 Git 등장 | `c6990811d6ae1d922b58e4bd7dc57afbfbfdbbb5` · 2026-02-12T09:58:34+09:00 |
| 최근 파일 변경 | `c6990811d6ae1d922b58e4bd7dc57afbfbfdbbb5` · 2026-02-12T09:58:34+09:00 |
| 현재 HTML 참조 | `partials/header.html:202`, `www/partials/header.html:202` |
| 현재 JavaScript 참조 | `assets/js/modules/layout-includes.js:132`, `www/assets/js/modules/layout-includes.js:132` |
| 서비스 워커 캐시 | `sw.js:84` |
| 화면 적용 범위 | 공유 헤더를 주입하는 루트 HTML 29개와 `www/` HTML 18개에서 사용될 수 있음 |

`partials/header.html`은 `siteLogoWord` 이미지로 이 파일을 지정하고, `layout-includes.js`가 실행 시 같은 경로를 적용한다. 따라서 단순 보관 파일이 아니라 현재 사이트 공통 헤더의 워드마크 자산이다. 다만 저장소의 활발한 참조만으로 소유자가 지정한 공식 대표 로고 또는 출원용 최종 디자인이라고 확정하지 않는다.

### 동일·유사 파일과 파생 관계

| 파일·그룹 | 관계 | 확인 결과 |
| --- | --- | --- |
| `www/images/logo-word.png` | 동일 바이트 배포 복제본 | 1031×358 PNG, SHA-256이 원본과 동일 |
| `images/logo-home.png` | 홈 캐릭터 도형 | 332×459, SHA-256 다름; 문자 워드마크 동일본 아님 |
| `images/logo-study.png` | 공부 서비스 도형 | 1024×1024, SHA-256 다름 |
| `images/logo-work.png` | 업무 서비스 도형 | 568×805, SHA-256 다름 |
| `images/logo-event.png` | 일정 서비스 도형 | 992×1035, SHA-256 다름 |
| `images/logo-career.png` | 커리어 서비스 도형 | 696×822, SHA-256 다름 |
| `apps/cucumber-grow-mobile/assets/splash-art/logo.png` | 게임 모바일 스플래시 도형 | 1024×1024, SHA-256 다름 |

파일명·규격·해시와 현재 참조를 기준으로는 `www/images/logo-word.png`만 동일본으로 확인된다. `logo-word`라는 이름의 PC·모바일·썸네일 전용 파생본은 발견되지 않았다. 다른 로고·앱 아이콘과의 디자인 계보는 저장소만으로 확정하지 않는다.

- 작업 상태: 로고상표 실제 출원 보류, 디자인 확정 후 검토.
- Work #41 법률 조사 결과: `[ ] Work #41 결과 입력 예정`
- 소유자 확인:
  - 현재 공식 대표 로고인지
  - 디자인이 최종 확정됐는지
  - 더 높은 해상도·벡터·레이어 원본이 있는지
  - 최초 공개일과 외부 홍보 사용 자료가 있는지
  - PC·모바일·썸네일용 별도 비공개 파생본이 있는지

## WORK #41 후속 입력란

아래 항목은 Codex가 채우지 않는다.

- [ ] 선행상표 조사 요약
- [ ] 표장 유사 여부 검토
- [ ] 상품류 후보
- [ ] 지정상품·서비스업 문구
- [ ] 행정 절차·제출서류·비용
- [ ] 전문가 상담 필요 쟁점
