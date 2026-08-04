# 자산 증빙 보조 로그

## 조사 기준과 방법

- 조사일: 2026-08-04(KST)
- 기준 브랜치: `main`
- 기준 커밋: `236fc1e`
- IP 작업 브랜치 선행 커밋: `c4ba278`
- SHA-256: 파일의 현재 바이트에 `shasum -a 256` 적용
- 최초 Git 등장: `git log --diff-filter=A -- <path>`에서 해당 경로가 추가된 가장 오래된 커밋
- 최근 Git 기록: `git log -1 -- <path>`
- 파일 관계: 동일 SHA-256, 저장소 데이터의 캐릭터·스킨 코드, 실제 참조 경로와 이미지 육안 확인을 함께 사용

Git 커밋의 작성자 날짜는 저장소 기록일이며 실제 창작일·공개일을 뜻하지 않는다. 해시도 현재 파일의 동일성을 비교하는 보조자료일 뿐 창작자나 권리 귀속을 증명하지 않는다.

## 1차 대표 후보 핵심 기록

| 캐릭터 | 경로 | 크기 | SHA-256 | 최초 경로 커밋·날짜 | 최근 경로 커밋·날짜 |
| --- | --- | --- | --- | --- | --- |
| 기본오이 | `images/characters/cucumber.png` | 900×1400 | `458136b776e9d7d022a24bb0eec666c83d4a57e8ead1cf5c55a47cd457e0d735` | `e5f3056` · 2026-04-07 08:04:24 +09:00 | `e5f3056` · 2026-04-07 08:04:24 +09:00 |
| 오이소년 | `images/characters/cucumberboy.png` | 1024×1536 | `929500a1193159a8722c93bce21d08fefc62f2325ac187552504a5c3add0c603` | `8d54b21` · 2026-04-20 20:06:21 +09:00 | `8d54b21` · 2026-04-20 20:06:21 +09:00 |
| 오이소녀 | `images/characters/cucumbergirl.png` | 1024×1536 | `c1f6a618f97a368b5f55fdfc2ce584b52a75ee85500153913094823a5ffd0666` | `18a725e` · 2026-04-13 13:41:24 +09:00 | `18a725e` · 2026-04-13 13:41:24 +09:00 |

오이소녀는 현재 경로가 처음 추가될 때 `images/skins/cucumbergirl.png`에서 100% 이름 변경된 것으로 기록되어 있다. `--follow`로 추적한 이전 경로의 최초 추가는 `6612665`(2026-04-08 21:36:08 +09:00)다. 따라서 `18a725e`는 현재 경로 최초 기록이고, `6612665`는 저장소에서 확인 가능한 동일 파일 계보의 더 이른 기록이다.

## 워드마크 핵심 기록

| 파일 | 크기 | SHA-256 | 최초 경로 커밋·날짜 | 최근 경로 커밋·날짜 |
| --- | --- | --- | --- | --- |
| `images/logo-word.png` | 1031×358 | `5c3a09903a47a507dd03fc770560404aa874be7baf74f84f53441ce517aeea17` | `c699081` · 2026-02-12 09:58:34 +09:00 | `c699081` · 2026-02-12 09:58:34 +09:00 |
| `images/logo-home.png` | 332×459 | `fc0c44cbc1bfa95600c3cd4fd94512e8771452d9cd006cbc73bc6d78d48c310f` | `c699081` · 2026-02-12 09:58:34 +09:00 | `c699081` · 2026-02-12 09:58:34 +09:00 |

## 최초 기록 이후 변경된 조사 자산

52개 조사 자산의 최근 경로 커밋을 다시 확인했다. 아래 4개는 현재 경로의 최초 추가 커밋과 최근 커밋이 다르며, 나머지 48개는 최초 추가 커밋이 최근 경로 커밋과 같다.

| 경로 | 최초 경로 커밋·날짜 | 최근 경로 커밋·날짜 |
| --- | --- | --- |
| `images/characters/eggpotato.png` | `8d54b21` · 2026-04-20 20:06:21 +09:00 | `09171a6` · 2026-04-21 22:23:46 +09:00 |
| `images/characters/fat-avocado.png` | `ca4ee8d` · 2026-04-11 15:49:43 +09:00 | `781a998` · 2026-04-15 20:10:54 +09:00 |
| `images/characters/grilled-egg.png` | `ca4ee8d` · 2026-04-11 15:49:43 +09:00 | `836b664` · 2026-04-14 16:53:04 +09:00 |
| `images/skins/cucumber-owner.png` | `781a998` · 2026-04-15 20:10:54 +09:00 | `cb3df09` · 2026-04-27 23:56:57 +09:00 |

`asset-manifest.csv`의 해시는 최근 커밋 기준 현재 파일 바이트의 값이다. 최초 커밋의 과거 파일 해시를 의미하지 않는다.

## 동일 SHA-256 파일 그룹

동일 해시는 현재 바이트가 완전히 같다는 의미다. 별도의 창작물로 중복 등록하기보다 원본 후보와 배포 복제본 관계를 먼저 확인한다.

### 기본오이 동일본

해시 `458136b776e9d7d022a24bb0eec666c83d4a57e8ead1cf5c55a47cd457e0d735`

- `images/characters/cucumber.png` — 대표 후보
- `games/cucumber-grow/assets/images/cucumber.png` — 게임 내 레거시 복제본

### 홈 캐릭터 도형 동일본

해시 `fc0c44cbc1bfa95600c3cd4fd94512e8771452d9cd006cbc73bc6d78d48c310f`

- `images/logo-home.png` — 대표 경로
- `images/emoticons/free-3.png` — 이모티콘 경로의 동일본
- `www/images/logo-home.png` — 배포 복제본

### 말린오이닷컴 워드마크 동일본

해시 `5c3a09903a47a507dd03fc770560404aa874be7baf74f84f53441ce517aeea17`

- `images/logo-word.png` — 대표 경로
- `www/images/logo-word.png` — 배포 복제본

### 모바일 원본용 이미지 동일본

- 해시 `640c8ec0c4ea3bbb64a1a3f1af576f7a10bdb6f1a14885db7549d06bfa5d4229`
  - `apps/cucumber-grow-mobile/assets/icon-source.png`
  - `apps/cucumber-grow-mobile/assets/splash-source.png`
- 해시 `8eeb9655978ec6a6dadad9367f09640e3a15e17c91d9eb6b92e2910832438c1b`
  - `apps/cucumber-grow-mobile/assets/app-icon/icon-foreground.png`
  - `apps/cucumber-grow-mobile/assets/splash-art/logo.png`

Android·iOS의 해상도별 생성 아이콘과 스플래시는 이 1차 CSV에 모두 나열하지 않았다. 모바일 패키지의 배포 산출물이며, 실제 등록 후보를 정할 때는 위 원본용 이미지와 생성 관계를 우선 확인한다.

## 저장소에서 확인 가능한 서비스 연결

- `char-cucumber` → `images/characters/cucumber.png`, 서비스 기본 지급
- `char-cucumber-boy` → `images/characters/cucumberboy.png`
- `char-cucumber-girl` → `images/characters/cucumbergirl.png`
- `char-cucumber-boy-police` → `images/skins/cucumberboy_police.png`
- `char-cucumber-girl-police` → `images/skins/cucumbergirl-police.png`
- `char-cucumber-soldier` → `images/skins/cucumber-soldier.png`
- `char-cucumber-ozyo` → `images/skins/ozyo.png`
- `char-cucumber-kind` → `images/skins/spioi.png`
- `char-grilled-egg-inomske` → `images/skins/inomske.png`

내부 상품명이나 코드명은 법적·시각적 독립성을 보장하지 않는다. 특히 `spioi.png`는 내부에서 `당신의 친절한 오이`로 표시되지만 파일의 시각 요소와 이슈 #43의 지시에 따라 제3자 IP 연상 자산으로 분리했다.

## 저장소만으로 확인하지 못한 정보

- 실제 창작자와 권리자
- 생성형 AI 도구·모델·프롬프트와 생성 횟수
- 사람이 직접 그리거나 수정한 구체적 부분
- Git 이전의 최초 원본·중간본·레이어 파일
- 실제 창작일과 최초 공개일
- 외주·공동창작자·소재 라이선스와 권리 양도 여부
- 등록에 사용할 더 높은 해상도의 비공개 원본 존재 여부

이 정보는 공개 저장소가 아닌 비공개 증빙 묶음에서 확인한다.
