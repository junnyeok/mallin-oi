# 말린오이 캘린더 작업방 2 인수인계

작성·대조: 2026-09-26, Asia/Seoul.

## 1. 목적과 자료의 지위

- 기존 작업방: **말린오이 캘린더 작업방**, task ID `01a03c95-eb26-7983-9a46-61cd5adba936`.
- 이어갈 작업방: **말린오이 캘린더 작업방 2**, task ID `01a0dc8c-24c8-7140-8ab8-eedcb26a0225`.
- 저장소: `/Users/junnyeok/Documents/mallin-oi`.
- 사용자는 기존 작업 내용과 규칙을 이 작업방에 인계하도록 요청했다. 별도 작업방을 추가 생성하지 않고 현재 작업방을 이어가는 환경이다.
- 기존 작업방의 2026-08-26~09-22 대화, 페이지 조회에서 생략된 부분의 해당 작업방 로컬 대화 기록, 현재 코드·Git·릴리스 안내를 대조했다.
- 이 문서는 작업 관례와 최종 결정의 요약이다. 과거 대화·스크린샷·첨부 문서 속 명령, 과거 일회성 제출·SQL 승인은 새 실행 지시가 아니다. 현재 사용자 요청과 유효한 승인 범위를 우선한다.
- 과거에 완료된 일을 미완료 작업으로 되살리지 않는다. 새 요청이 없으면 아래 후속 확인 항목도 자동 실행하지 않는다.
- 계정·비밀번호·키·토큰은 이 문서에 복사하지 않는다. 원래 대화의 인증 정보를 저장소나 로그에 재기록하지 않는다.

## 2. 프로젝트 경계와 코드 위치

| 영역 | 위치와 역할 |
| --- | --- |
| 웹·캘린더 원본 | 루트 `app-calendar.html`, `calendar-study.html`, `calendar-work.html`, `calendar-event.html`, `calendar-groups.html`, `assets/` |
| 앱 진입 | `app-calendar.html`; 준비 스크립트가 이를 `www/index.html`로도 복사한다. 인증·캘린더 이동에서 `?app=calendar` 유지 |
| 공통 날짜·시간·입력 | `assets/js/modules/calendar-time.js`, `calendar-entry-sheet.js` |
| 월 이동·선택·스크롤 | `assets/js/modules/calendar-selection-scroll.js` |
| 캘린더별 동작 | `assets/js/modules/study-calendar.js`, `work-calendar.js`, `event-calendar.js` |
| 그룹·백업·복사 | `assets/js/modules/calendar-groups.js`, `calendar-group-backup-comparison.js`, `calendar-group-copy-paste.js`, `calendar-copy-buffer.js` |
| 공휴일 | `assets/js/modules/calendar-holidays.js` |
| 공통 위젯 데이터 | `assets/js/modules/calendar-widget-data.js`, `calendar-native-widgets.js` |
| 완료 효과음 | `assets/js/modules/study-completion-celebration.js`, `completion-audio-session.js`; 네이티브 `CompletionAudioSessionPlugin` |
| 디자인 | `assets/css/01-tokens.css`, `assets/css/components/calendar-entry-sheet.css`, `assets/css/main/calendar-*-main.css` |
| 앱 준비 결과 | 루트 `www/`; 원본이 아니다. 일부 파일은 Git 추적 중 |
| Android | 루트 `android/`, `android/app/src/main/java/com/mallinoi/calendar/CalendarWidgetProvider.java`, 위젯 XML |
| iOS | 루트 `ios/App/App.xcodeproj`, `ios/App/MallinoiCalendarWidgets/MallinoiCalendarWidgets.swift`; Capacitor SPM 사용 |
| 네이티브 웹 생성본 | `android/app/src/main/assets/public/`, `ios/App/App/public/`; 현재 Git 무시 대상 |
| 출시 안내 | 루트 `APP_RELEASE_GUIDE.md`, `package.json`, `capacitor.config.json` |
| SQL | `supabase-SQLEditor/`, `supabase/migrations/`, 누적 `supabase-SQLEditor/99_all_backup.sql` |
| 파일 목록 | `file-list.txt`; `./` 접두어와 사전순을 유지하는 경로 목록 |

`games/cucumber-grow/`, `apps/cucumber-grow-mobile/`, `games/mallin-oi-village/`는 별도 프로젝트다. 캘린더 요청에 게임 전용 설치·빌드·Capacitor 명령이나 게임 인수인계 규칙을 적용하지 않는다. 게임의 패키지·포트·네이티브 프로젝트·앱 식별자를 공유하지 않는다. 공용 에셋이 필요하면 사용하는 프로젝트의 전용 폴더로 복사하는 기존 정책을 따른다.

## 3. 이번 인계에서 직접 확인한 기준 상태

아래는 2026-09-26 로컬 상태다. 이후 작업 시작 시 다시 확인한다.

| 항목 | 확인값 |
| --- | --- |
| 브랜치 | `codex/calendar-completion-polish` |
| HEAD | `9b91a5e944e8aedbec1c29dd402048cb5ab40837` |
| 최근 커밋 | `feat(calendar): add widget holidays and prepare 1.0.27` |
| Android | `com.mallinoi.calendar`, `versionName 1.0.27`, `versionCode 31` |
| Android SDK | min 24, compile/target 36 (`android/variables.gradle`) |
| iOS 앱 | `com.mallinoi.calendar`, marketing `1.0.27`, build `34` |
| iOS 위젯 | `com.mallinoi.calendar.widgets`, marketing `1.0.27`, build `34` |
| Capacitor 설정 | 앱 이름 `말린오이 캘린더`, `webDir: www` |
| 루트·www 사이트 버전 | `20260922-01`; `sw.js`도 동일 |
| 로컬 네이티브 public 사이트 버전 | 양 플랫폼 모두 `20260910-03`; 위 값과 불일치 |
| Node | 이번 검사 런타임 `v24.15.0` |
| 시작 시 변경 상태 | `git status --porcelain=v1` 469개 항목, 스테이징 없음. 디렉터리로 묶인 미추적 항목도 포함하므로 파일 개수와 다름 |
| 원격 추적 참조 | 캐시된 `origin/codex/calendar-completion-polish`와 HEAD `0/0`; HEAD 대 `origin/main`은 `9/8`, 로컬 main 대 origin/main은 `0/8` |

원격 참조 수치는 이번에 fetch하지 않은 **로컬 캐시 기준**이다. 원격 실시간 상태로 표현하지 않는다. 이전 보고의 “main이 갈라졌다”는 문구를 그대로 적용하지 말고 비교 대상 브랜치를 정확히 확인한다.

기존 수정에는 게임·사이트·상점·에셋·SQL·의존성뿐 아니라 다음 공유 파일도 포함돼 있다. 이번 인계에서 만든 변경으로 취급하지 않는다.

- `assets/js/modules/profile.js`, `completion-audio-session.js`와 `www` 대응본.
- `android/app/src/main/java/com/mallinoi/calendar/CompletionAudioSessionPlugin.java`.
- `tests/study-completion-celebration.test.mjs`의 프로필 오디오 관련 추가 검사.
- `scripts/prepare-capacitor-web.mjs`, `package.json`, `package-lock.json`, `node_modules/`.
- `.github/workflows/deploy-pages.yml`, `.gitignore`, `file-list.txt`, 여러 SQL 누적본.
- `AGENTS.md`, `docs/`도 인계 시작 전부터 미추적 상태였다. 기존 오이키우기 안내·문서를 보존한다.

## 4. 유지할 최종 기능·화면 결정

### 날짜·시간·업무 일정

- 자기개발 일정 날짜 변경은 제목·메모·날짜·시간·카테고리를 한 번의 원자적 UPDATE로 저장하도록 수정됐다.
- 업무 캘린더는 하루 한 근무 일정이다. 날짜 이동 대상에 일정이 있으면 앱 전용 `예`·`취소` 확인창을 띄운다. `예`만 덮어쓰기하고, 취소는 서버 데이터를 변경하지 않는다.
- 시작 일시가 종료 일시보다 늦어지면 종료를 시작값에 맞춘다. 자기개발·업무·이벤트에 공통 적용하되 정상적인 익일 야간근무 범위는 유지한다.
- 업무 카테고리를 바꾸면 해당 카테고리의 지정 시간과 익일 설정을 반영한다.
- 업무 상세의 시작·종료 항목은 시간 중심으로 표시한다. 종료 시간 선택 UI에 `다음 날(익일)` 체크가 있고, 명시적 `ends_next_day` 값을 저장한다.
- 익일 종료는 시간 바로 앞에 `익)`을 가깝게 붙인다. 상세 UI에 요청하지 않은 로고를 다시 넣지 않는다.
- 그룹 설정을 열면 팝업만 열린다. 그룹 select를 자동으로 펼치지 않는다. 시간 선택도 오전/오후 select에 자동 포커스를 주지 않는다. 대화상자 포커스·키보드 접근성은 유지한다.

### 버튼과 백업

- `+` 추가 버튼은 달력 상단이 아니라 **선택 날짜·상세 일정 영역 오른쪽**에 둔다. 기존 색상·크기·동작은 유지한다.
- 일정이 없는 날짜도 터치하면 선택 날짜가 바뀌고 상세 일정 영역으로 자동 스크롤한다.
- 최종 버튼 정렬은 **왼쪽**이다. 자기개발·이벤트는 `그룹 설정 → 그룹 목록`, 업무는 `그룹 설정 → 그룹 목록 → 반복근무 설정`이다.
- 2026-09-09의 오른쪽 정렬·역순 요청은 이후 사용자가 취소했다. 이를 다시 적용하지 않는다.
- 백업은 그룹 설정 팝업에서 꺼내 **캘린더 상단 오른쪽**에 둔다. 그룹 연동 중일 때만 보이고 개인 모드에서는 숨긴다.
- 백업 버튼의 radius·크기 등은 그룹 버튼과 맞추되, 백업 필요 상태의 깜빡이는 강조를 유지한다. 그룹 설정·복사·붙여넣기·백업 상태 비교 흐름을 깨뜨리지 않는다.

### 스와이프와 날짜 선택

- 좌우 버튼과 손가락 스와이프 모두 월 전환을 지원한다. 스와이프는 손가락을 따라가며, 기준 미달이면 원위치로 돌아온다.
- 현재·이전·다음 달을 함께 준비하고 세 달이 준비된 뒤 로딩을 끝낸다. 스와이프 중 양쪽 달의 일정도 보이도록 한다.
- 가로 제스처가 확정되면 세로 스크롤을 잠그되 일반 세로 스크롤과 확대는 유지한다. `prefers-reduced-motion`도 유지한다.
- **가로 스와이프 판정 전에** 포인터를 캡처하거나 달력 DOM·transform을 변경하지 않는다. 단순 날짜 터치가 WKWebView에서 취소됐던 회귀 원인이다.
- 스와이프 직후 새 터치는 이전 클릭 차단의 영향을 받지 않아야 한다.
- 화면 확인은 hover 색만 보지 않는다. 선택 테두리, 하단 날짜 변경, 상세 일정과 자동 스크롤을 함께 확인한다. 2026-09-10 마지막 수정 후 사용자도 “잘 반영됐어”라고 확인했다.

### 공휴일·위젯·완료 표시

- 공휴일은 빨간 글씨·테두리 배지로 표시한다. 참고 사진의 위치 표시색을 디자인 색상으로 오인하지 않는다.
- 자기개발·이벤트: **날짜 → 공휴일 → 일정**.
- 업무: **날짜 → 근무 일정 → 메모 → 공휴일**. 예시 `행당 → 일근 → 추석 연휴` 순서.
- 이 순서는 앱 화면과 iOS·Android 위젯 모두에 적용됐다. 첫 위젯 구현 보고는 iOS 중심이었으나 1.0.27 제출 커밋에는 Android도 포함됐다.
- 공통 payload는 `calendar-holidays.js`를 사용한다. 한국 음력 명절·대체공휴일 계산, 일회성 선거일·임시공휴일 목록이 있다. 법령상 최신 공휴일을 보장하는 문서가 아니므로 추후 규칙 변경 작업 때 공식 기준을 다시 대조한다.
- Android의 4일·2주·월간처럼 작은 위젯에서도 근무·메모·공휴일이 잘리지 않도록 유지한다.
- 자기개발 위젯의 완료 일정은 옅은 표시와 취소선을 유지한다. 완료 효과음은 외부 오디오 재생과 충돌하지 않도록 하는 기존 정책을 보존한다.

## 5. 완료 이력과 배포 기록 — 과거 확인값

| 날짜·커밋 | 주요 내용 | 앱 버전 |
| --- | --- | --- |
| 2026-08-27 `e675602a` | 자기개발·업무 날짜 이동, 시간 보정, 업무 익일 지정·표시 | Android 1.0.23(27), iOS 1.0.23(30) |
| 2026-08-29 `64ed3107` | 추가 버튼 위치·빈 날짜 스크롤, 그룹 팝업 자동 선택 방지 | 1.0.24 준비 |
| 2026-09-02 `1e4bd383` | 시간 선택 오전/오후 자동 활성화 방지 | Android 1.0.25(29), iOS 1.0.25(32) |
| 2026-09-10 `c3b639bf` | 백업 버튼, 월 스와이프·3개월 준비, 공휴일, WKWebView 날짜 터치 | Android 1.0.26(30), iOS 1.0.26(33) |
| 2026-09-22 `9b91a5e9` | 양 플랫폼 위젯 공휴일, 표시 순서·공간 보완 | Android 1.0.27(31), iOS 1.0.27(34) |

2026-09-22 마지막 완료 보고:

- Google Play 프로덕션: AAB 업로드 및 심사 제출 완료, 당시 상태 `검토 중인 변경사항`.
- App Store Connect: Archive 업로드·처리 및 심사 제출 완료, 당시 상태 `1.0.27 심사 대기 중`.
- 최종 출시노트: **“달력 위젯에 공휴일 표시를 추가했습니다.”** 이전 프롬프트의 출시노트는 사용자가 명시적으로 정정했다.
- Android AAB: `/Users/junnyeok/Documents/mallin-oi/android/app/release/mallinoi-calendar-1.0.27-31.aab`, 80,822,243 bytes. 이번 인계에서는 존재·크기만 다시 확인했다.
- iOS Archive: `/Users/junnyeok/Library/Developer/Xcode/Archives/2026-09-22/MallinoiCalendar-1.0.27-34.xcarchive`. 이번에는 존재만 다시 확인했다.
- 당시 기록은 전체 Node 221/221, 위젯 6/6, 깨끗한 체크아웃의 Android Release·iOS Release 검사와 서명 검증 통과다. **이번 인계에서 재실행한 결과가 아니다.**
- 당시 Google Play에 비차단 난독화 매핑 파일 권고가 있었다. iOS 수출 규정 질문은 당시 코드 감사·기존 승인 기록·사용자 확인 후 처리됐다. 다음 릴리스의 사실관계를 확인하지 않고 답을 재사용하지 않는다.
- 기능 브랜치 푸시와 앱 스토어 제출이 완료된 기록이다. Pages 워크플로는 `main` push/manual 실행 대상이므로 **기능 브랜치 푸시가 웹 운영 배포 완료를 뜻하지 않는다.**
- 스토어의 현재 승인·공개 여부 및 현재 CI 상태는 이번에 조회하지 않았다.

SQL 이력도 과거 기록이다. 다음 두 마이그레이션은 기존 작업방에서 운영 적용·조회 확인됐고 이후 릴리스에서 재실행하지 않았다.

- `supabase/migrations/20260826000000_fix_study_calendar_date_move.sql` ↔ `supabase-SQLEditor/20260826-fix-study-calendar-date-move.sql`.
- `supabase/migrations/20260827000000_work_calendar_explicit_next_day.sql` ↔ `supabase-SQLEditor/20260827-work-calendar-explicit-next-day.sql`.
- 현재 요청에 SQL 작업이 포함되면 실제 원격 상태부터 확인한다. 인수인계를 이유로 SQL이나 migration repair를 다시 실행하지 않는다.

## 6. 이어갈 때 적용할 작업 관례

### 시작·편집·검증

1. 현재 요청 범위를 판단하고 루트/관련 하위 지침, 코드, Git 추적 상태, 시작 diff와 미추적 항목을 확인한다.
2. 수정·구현 요청은 범위 안의 로컬 편집·비파괴 검증까지 진행한다. 설명·진단만 요청했으면 근거와 결과를 보고한다.
3. 기존 및 작업 도중 생긴 관계없는 변경은 보존한다. 다른 작업 파일을 정리·삭제·복원·포맷하지 않는다. 같은 파일의 변경도 소유 범위를 구분한다.
4. 기존 선언·공통 로직·명명 방식·데이터 구조를 유지하며 최소 범위를 수정한다. 하단 덮어쓰기 누적, 중복 코드·ID, 임시 디버깅 코드를 피한다.
5. CSS 수정 전 실제 토큰 정의를 확인한다. 반응형·다크모드·safe-area·접근성·키보드 포커스·터치 영역·동작 줄이기·이미지 비율을 유지한다. 근거 없는 `!important`나 인라인 스타일을 추가하지 않는다.
6. 사용자 제공·직접 교체 에셋과 고정 문구를 존중한다. 편집 요청이 없는 이미지를 생성물로 대체하거나 재인코딩하지 않는다. 경로·대소문자·확장자·실제 로딩을 확인한다. 필수 원본이 없으면 임의 대체하지 말고 영향을 보고한다.
7. 관련 플랫폼·흐름만 검증한다. 코드 검사·실제 로그인 실행·화면 확인·사용자의 수동 확인을 구분한다. 테스트 계정에서 바뀐 일정·잔액·장착 상태를 보고하고 이를 되돌리려 DB를 임의 삭제하지 않는다.
8. `file-list.txt`는 이번 신규·삭제 경로만 최소 갱신하고 정렬·중복을 확인한다. 다른 작업의 미완성 파일, 임시 검증물, 키·빌드 산출물을 목록에 넣지 않는다.
9. 검사 결과와 종료 diff를 시작 상태와 대조한다. 과거 성공 기록으로 현재 검사 실패를 덮지 않는다. 관련 없는 실패는 구분해 보고한다.

### 원본과 생성본

- 원본을 먼저 수정한다. `www/` 또는 플랫폼 `public/`을 독립 원본처럼 먼저 고치지 않는다.
- `scripts/prepare-capacitor-web.mjs`는 **현재 www를 삭제 후 재생성**한다. 실행 직전에 www의 수정·미추적 파일과 원본의 관계없는 변경이 섞여 복사될 위험을 확인한다.
- 복사 목록·제외 정책을 존중한다. 목록에 없는 루트 페이지의 www 사본을 임의로 만들지 않는다.
- 안전한 경우 프로젝트의 준비·Capacitor 동기화 명령으로 생성한다. 혼합 작업 트리에서 무조건 전체 재생성하지 않는다. 기존 생성 정책에 맞는 범위 동기화가 안전하지 않으면 보류 이유를 보고한다.
- 필요한 대응 파일은 바이트 비교한다. 네이티브 public은 현재 Git 무시 대상이며, www의 추적 여부는 파일별로 확인한다.
- `node_modules`도 다른 작업의 변경이 있을 수 있다. 과거 SPM 오류는 `@capacitor/app`, `@capacitor/app-launcher` 경로 누락이 원인이었다. 현재 lockfile·패키지 상태부터 확인하고 과거 패키지 버전을 무작정 재설치하지 않는다.

### SQL·보안

- SQL 작업이 관련될 때만 함수·테이블·권한·정책·반환값·마이그레이션·누적 SQL을 확인한다.
- 대상 프로젝트와 연결을 확인하고 승인된 정확한 SQL만 적용한다. 다른 미적용 SQL까지 실행하는 일괄 `db push`는 피한다. 적용 이력이 있는 SQL 소스를 커밋한다고 다시 실행하지 않는다.
- 실제 적용 SQL은 기존 정책에 따라 SQL Editor용·마이그레이션·`99_all_backup.sql`을 맞추고 한국 날짜와 목적을 남긴다. 상점 구매 함수라면 전용 함수 기준본도 대조한다.
- 함수 원자성, 권한, 서버 고정 값, 중복 처리와 원장 기록을 관련 범위에서 확인한다. 실행하지 못한 작업을 완료로 보고하지 않는다.
- 운영 데이터 삭제·대량 변경·실제 결제·다른 사용자 데이터 변경·요청 범위 확대는 명시적 승인 범위 밖에서 하지 않는다.
- 키스토어·서명 키·인증서·비밀번호·비밀 환경값·토큰은 출력·스테이징·커밋하지 않는다. 민감 파일은 이미 추적 중이어도 내용을 출력하지 않고 문제를 보고한다.

### 커밋·푸시·버전·출시 — 해당 요청이 있을 때만

- 커밋·푸시 없는 로컬 수정에서는 SITE_VERSION을 올리지 않는다. 문서·테스트·SQL 소스만 달라지면 불필요한 웹 캐시 버전을 올리지 않는다.
- 웹 배포물 변경을 커밋·푸시할 때 공유 사이트 버전 위치를 검색해 맞춘다. 한국 날짜 `YYYYMMDD-NN`; 같은 날짜는 로컬·원격 마지막 번호 다음, 날짜가 바뀌면 `01`이다. 독립 게임·앱 버전과 섞지 않는다.
- `assets/app-version.json`의 latest 값은 공개 스토어 버전의 보조 메타데이터다. 현재 파일에 `1.0.14`가 있어도 로컬 네이티브 버전으로 기계적으로 덮어쓰지 않는다. Android Play API와 iOS 대한민국 Apple Lookup 결과, minimum 값 정책은 `APP_RELEASE_GUIDE.md`를 따른다.
- 커밋·푸시 작업 시작과 스테이징 직전에 fetch하고 대상 브랜치 ahead/behind를 확인한다. 원격이 앞서거나 갈라졌다면 임의 merge/rebase/force push하지 않는다. 사용자가 main 직접 푸시를 지정하면 임의로 다른 브랜치·PR로 바꾸지 않는다.
- 정확한 파일 허용 목록을 만들고 변경 부분만 스테이징한다. 혼합 트리에서 `git add .`, `git add -A`, 디렉터리·광범위 glob 스테이징을 사용하지 않는다. staged diff·민감정보·file-list·의존 파일 포함을 검토한다.
- 더러운 트리의 성공만 믿지 않는다. 커밋 후 푸시 전 임시 worktree에서 해당 커밋만으로 필요한 테스트·빌드·에셋·생성본이 완결되는지 확인한다. 정리할 때 이번에 만든 임시 worktree만 제거한다.
- 필수 검사 실패, 민감정보 포함, 변경 분리 불가, 의존 파일 누락, 필수 화면 확인 누락, 원본·생성본 불일치, 버전 충돌이 있으면 푸시하지 않는다. 문제·위치·재현·실패 명령·필요 수정·재검증을 보고한다.
- 일반 푸시 후 로컬·원격 해시와 CI/Pages를 확인한다. 진행 중·미실행 상태를 완료로 표현하지 않는다.
- 앱 제출 요청에서는 로컬과 각 스토어의 최신 버전·빌드를 대조해 새 번호를 정한다. Android/iOS 사용자 표시 버전은 특별한 이유가 없으면 맞추고 앱·위젯 빌드 번호도 확인한다.
- Android는 기존 Release 서명 정보로 AAB를 만들고 패키지·버전·서명·경로·크기를 검증한다. iOS는 올바른 프로젝트의 배포 Archive를 검증하고 업로드 처리·버전 연결을 확인한다.
- 서명·앱 식별자·가격·국가·출시 방식 등을 임의 변경하지 않는다. 저장된 서명 정보를 우선 사용하고 2FA·비밀번호 입력·확인할 수 없는 법적 사실 때문에 막힐 때 필요한 항목만 요청한다.
- 사용자가 최종 제출까지 요청했고 유효한 승인이 있으면 준비·검증·업로드·심사 제출까지 진행한다. 완료 기준은 양 스토어의 실제 제출 상태이며 빌드 성공만으로 끝내지 않는다. 과거 출시노트 템플릿보다 최신 정정 문구를 우선한다.

완료 보고는 작업 크기에 맞게 반영 내용·파일/이유·검증·실제 화면 확인·미확인/남은 사항·재검증 방법·커밋 범위·SQL 실행 여부를 담는다. 릴리스라면 버전, AAB/Archive, 출시노트, 양 스토어 제출 상태, 커밋/원격/CI와 보존한 변경도 기록한다. 실행하지 않은 검증이나 외부 작업을 완료로 표현하지 않는다.

## 7. 이번 검증과 다음 작업 전 확인할 사항

이번 인계에서 직접 실행:

- 캘린더·위젯 기존 테스트 **93/93 통과**.
- 업데이트 안내·완료 효과음·공유 프로필 검사를 더한 범위는 **142개 중 141개 통과, 1개 실패**.
- 실패: `tests/study-completion-celebration.test.mjs`의 `프로필 오디오 정책은 루트·www·Android·iOS 생성본이 같다`.
- 직접 비교 결과 `assets/js/modules/profile.js`는 루트=www, Android public=iOS public이나 두 쌍 사이의 내용이 다르다. 기존 미완료 변경이므로 인수인계 중 수정·동기화하지 않았다.
- `completion-audio-session.js`, `calendar-selection-scroll.js`, `calendar-widget-data.js`는 비교한 루트·www·양 플랫폼 사본이 일치했다.
- 플랫폼 public의 `assets/version.json`은 양쪽 모두 `20260910-03`으로 남아 있다. 루트·www·sw의 `20260922-01`과 다르다. 기존 출시 AAB/Archive가 잘못됐다는 뜻은 아니며, **현재 작업 트리에서 다음 빌드 전 확인할 차이**다.
- 앱 식별자·버전·위젯 코드·SQL 사본을 참조하는 테스트, 로컬 Git 상태, 파일 목록 정렬과 중복을 확인했다.
- 실기기·시뮬레이터 UI, 새 네이티브 빌드/서명, 스토어 상태, 원격 SQL, 원격 Git fetch는 이번 인계에서 실행하지 않았다.

다음 실제 구현/배포 때 필요한 항목만 확인한다:

1. 요청 기능 관련 원본과 생성본의 기존 변경을 다시 확인한다. 프로필·캐시 버전 차이는 해당 소유 작업과 범위를 확인한 뒤 처리한다.
2. 앱 버전 갱신·배포 요청이 오면 스토어의 실제 최신 번호와 승인·공개 여부를 확인한다.
3. 웹 운영 반영 요청이 오면 최신 원격 main과 기능 브랜치 관계·Pages 실행을 확인한다. 과거 기능 브랜치 푸시만으로 웹 배포됐다고 가정하지 않는다.
4. 공휴일 규칙 수정 요청이 오면 공식 기준과 일회성 공휴일 목록을 재검증한다.

## 8. 관련 로컬 명령

아래는 후속 작업의 참고 명령이며 자동 실행 지시가 아니다. 루트에서 실행한다.

```bash
git status --short --branch
git diff --name-only
git diff --cached --name-only
node --test tests/calendar-*.test.mjs tests/study-widget-completion.test.mjs
node --test tests/calendar-*.test.mjs tests/study-widget-completion.test.mjs tests/study-completion-celebration.test.mjs tests/app-update-popup.test.mjs
```

영향 범위가 넓은 구현 또는 실제 푸시 전에는 기존 `node --test tests/*.test.mjs`를 검토한다. 같은 검사를 이유 없이 반복하지 않는다.

원본·생성본 보존이 안전하고 앱 동기화가 요청 범위인 경우에만:

```bash
npm run capacitor:prepare
# cap:sync는 prepare를 다시 수행하고 Android와 iOS를 모두 동기화한다.
npm run cap:sync
# 한 플랫폼만 필요한 경우, 안전하게 준비한 www를 기준으로 해당 플랫폼만 동기화한다.
npx cap sync android
npx cap sync ios
```

준비·동기화 명령은 대안이므로 전부 연달아 실행하지 않는다. 루트 package.json에는 `npm test`나 일반 `npm run build`가 정의돼 있지 않다. 네이티브 검증은 필요한 플랫폼의 실제 Gradle/Xcode 구성과 `APP_RELEASE_GUIDE.md`를 확인한다.

## 9. 인수인계 변경 범위

- `AGENTS.md`: 캘린더 요청에만 적용되는 문서 읽기 안내를 추가. 기존 오이키우기 안내 보존.
- `docs/handoffs/mallinoi-calendar.md`: 이 문서 신설.
- `file-list.txt`: 이번에 편집·생성한 안내 문서 두 경로만 추가. 다른 작업의 목록은 보존.
- 현재 작업방 제목을 `말린오이 캘린더 작업방 2`로 변경. 이전 작업방은 보존.
- 런타임 코드·사용자 이미지·게임·계정 데이터·SQL·사이트/앱 버전은 변경하지 않았다. 커밋·푸시·스토어 제출도 이번 요청에서는 수행하지 않았다.
- 문서만 바뀌므로 이번 인계 자체에는 SITE_VERSION 갱신이나 앱 빌드가 필요하지 않다.

## 10. 후속 작업: 이벤트 알람 로컬 구현 (2026-09-26)

- 사용자는 메모 아래 알람 행, 1/5/10/15/30분·1시간 전과 시간지정, 제목/날짜 전달을 요청했다.
- iPhone 기본 시계 편집 화면 전달의 제약을 설명한 뒤 사용자가 **앱에서 확인 후 iOS 26 이상 시스템 알람 등록**을 선택했다.
- 해당 선택으로 iOS AlarmKit, Android 날짜 지정 알람/조건부 시계 앱 연결, 웹 ICS 가져오기 흐름을 구현했다.
- 동작 범위·직접 실행한 검증·실기기 미확인 항목은 `docs/calendar-event-alarms.md`에 기록했다.
- Node 100/100, Android 네이티브 instrumentation 1/1, Android Debug/lint·iOS Simulator Debug 빌드 통과.
- iOS 시뮬레이터의 실제 알람 권한·등록·OS 조회·예약 시각 시스템 표시·해제를 확인했다. 테스트 알람을 정리하고 일반 앱 빌드로 복귀했다.
- 이번 요청은 로컬 우선이다. 버전 증가·커밋·푸시·스토어 제출·운영 SQL은 수행하지 않았다.
- 알람은 기기별 별도 등록이며 일정 수정/삭제에 자동 동기화하지 않는다. 새 일정은 저장 후 상세에서 설정한다.

## 11. 후속 수정: 스크롤 메뉴·두 알람·저장 연동 (2026-09-26)

이 절과 최신 `docs/calendar-event-alarms.md`가 10절의 이전 사용 흐름을 대체한다.

- 사용자 요청으로 버튼식 선택을 없음/이벤트 시간/5·10·15·30분/1·2시간/1·2일/1주 전의 스크롤 메뉴로 변경했다.
- 첫 알람 지정 시 두 번째 행을 표시하고 최대 두 개를 지정한다. 첫 알람을 없음으로 바꾸고 둘째가 비어 있으면 둘째 행을 숨긴다.
- 앱의 허용/취소 안내와 OS 권한 요청·앱 설정 이동을 연결했다. iOS 공개 설정 URL은 시뮬레이터에서 설정 첫 화면으로 열렸으며, 실기기의 앱별 화면 도착은 미확인이다.
- 새 일정에도 지정 가능하고 일정 저장 시 예약·교체·해제한다. 이 기기의 상세 화면 일정 삭제도 해제와 연결한다.
- 알람 메시지는 ‘일정제목’ 일정이 5분 남았어요! 형식이다. 기기별 선택이며 서버·다른 기기와 동기화하지 않는다.
- Node 103/103, Android instrumentation 2/2, Android Debug/lint·iOS Simulator Debug 빌드 통과.
- iOS 시뮬레이터에서 실제 두 알람 예약(activeCount 2)과 해제(activeCount 0)를 확인했다.
- 실제 계정 데이터·SQL·버전·커밋·푸시·스토어 제출은 변경/실행하지 않았다.
- 짧은 iOS 예약이 앱 백그라운드에서 실제 알람 배너로 표시됨을 확인했다. 검증 알람 종료·해제 후 일반 로컬 앱으로 복귀했으며 앱 데이터는 유지했다.

## 12. 알람 기능 출시 준비 (2026-09-26)

- 사용자가 이번 작업방의 캘린더 변경 푸시 후 양 스토어 심사 제출까지 요청했다.
- 시작 HEAD는 9b91a5e944e8aedbec1c29dd402048cb5ab40837이며 캘린더 브랜치의 origin 추적 참조와 일치했다.
- main과는 9/8로 갈라져 있으므로 임의 통합하지 않고 기존 캘린더 브랜치를 푸시 대상으로 삼는다. 이 브랜치는 운영 Pages 자동 배포 대상이 아니다.
- 스토어의 최신 업로드/공개 버전 Android 1.0.27(31), iOS 1.0.27(34)를 실제 조회했다.
- 새 버전은 Android 1.0.28(32), iOS 앱·위젯 1.0.28(35), 공유 사이트 버전 20260926-01이다.
- 이전 UI에서만 쓰던 기본 시계 연결·시간 직접 지정 helper와 action 필드 분기를 제거했다.
- 격리된 배포 후보에서 전체 Node 230/230, Android Release/lintRelease, iOS 기기용 Release 무서명 빌드 통과.
- npm ci로 잠금 파일의 의존성을 설치한 뒤 검증했다. 런타임 의존성 audit 결과 취약점 0개다. 기존 개발 도구 의존성은 이번 범위에서 갱신하지 않았다.
- 이번 준비 명령 중 원래 경로에서도 cap:sync가 실행된 것을 발견했다. 직전 검증 앱/APK와 대조하여 그 과정에서 복사된 관계없는 native public의 profile/store-data/emoticons 3개 모듈과 새 에셋 사본 7개를 플랫폼별로 복구/제거했다. 루트 사용자 에셋과 기존 www 변경은 보존했다.
- 최종 스토어 제출 결과는 실제 제출 확인 후 별도 완료 보고로 남긴다. 이 준비 기록은 업로드/심사 제출 완료를 뜻하지 않는다.
