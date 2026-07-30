# 오이키우기 MVP

## 게임 개요

오이키우기는 여러 텃밭의 오이를 각각 심고, 물주기와 시설의 자동 경험치로
성장시킨 뒤 캐릭터를 직접 눌러 수확하는 모바일 중심 육성형 웹게임이다. 현재
말린오이닷컴 저장소 안에 있지만 기존 사이트, 말린오이캘린더, Android·iOS 앱과
코드를 공유하지 않는 독립 프로젝트 표면으로 구성한다.

## 현재 구현 기능

- 상단 고정 HUD 아래에 이어지는 탑다운 잔디·흙밭 화면과 세로 스크롤
- 텃밭 하나당 2×2로 배치한 독립 작물 슬롯 4개
- 메뉴 → 상점에서 신규 이용자의 첫 텃밭 무료 구매
- 빈 슬롯 직접 터치로 심기, 성장 중 슬롯 터치로 물주기, 성숙 슬롯 터치로 수확
- 슬롯별 작은 전체 성장 XP 막대와 `aria-label`·`progressbar` 접근성 정보
- 슬롯별 물뿌리개·물방울·`1XP` 플로팅 효과
- 슬롯별 심기·2단계 진화·수확 모션과 전환 잠금
- 빈 슬롯의 잔잔한 파동과 수확 가능 슬롯의 빛·바운스 유도 효과
- 새싹(0 XP) → 애기오이(15 XP) → 어른오이(35 XP) → 수확 가능(50 XP)
- 작물 하나 수확당 보유 오이 1개 지급
- 시설이 생산한 전역 XP 총량의 슬롯 라운드로빈 배분
- 최대 8시간 오프라인 XP의 동일 라운드로빈 배분
- 저장 스키마 v2와 기존 v1 단일 작물 저장의 멱등 마이그레이션
- 페이지 숨김·이탈·자동 저장과 재실행 시 저장 복원
- 빠른 포인터/합성 클릭의 중복 실행 방지
- 화면 밖 텃밭 반복 애니메이션 일시정지와 `prefers-reduced-motion` 대응

## 이번 단계에서 열지 않은 기능

- 두 번째 이후 텃밭의 실제 구매
  - 확정 가격이 없어 상점에서 `구매 준비 중`으로 비활성화한다.
  - 상태·렌더링·저장은 여러 텃밭을 지원한다.
- 비닐하우스형 텃밭, 알람, 상세 튜토리얼
- 서버 저장, 계정 로그인, 여러 기기 동기화
- 서버 시간 검증과 치팅 방지
- 퀘스트, 업적, 환생, 광고, 인앱결제
- 독립 Android·iOS 프로젝트와 네이티브 기능

## 로컬 실행

ES Modules를 사용하므로 `file://` 대신 HTTP 서버로 실행한다.

```bash
cd games/cucumber-grow
python3 -m http.server 4173
```

브라우저에서 `http://127.0.0.1:4173/`을 연다.

## 파일 구조

```text
cucumber-grow/
├── index.html
├── README.md
├── package.json
├── css/
│   └── game.css
├── js/
│   ├── main.js
│   ├── game-config.js
│   ├── game-state.js
│   ├── game-engine.js
│   ├── crop-transition.js
│   ├── save-manager.js
│   ├── offline-reward.js
│   ├── number-format.js
│   ├── xp-gain-effect.js
│   └── ui-renderer.js
├── tests/
│   ├── game.test.mjs
│   ├── xp-gain-effect.test.mjs
│   └── crop-transition.test.mjs
└── assets/
    ├── images/
    │   ├── cucumber-baby.png
    │   ├── cucumber-boy.png
    │   ├── cucumber.png
    │   ├── water-gun.png
    │   └── water.png
    └── sounds/
```

## 저장 데이터

호환성을 위해 기존 로컬 저장소 키를 유지한다.

```text
mallinoi_cucumber_grow_save_v1
```

현재 저장 스키마:

```javascript
{
  saveVersion: 2,
  cucumbers: 0,
  totalEarned: 0,
  touchYield: 1,
  harvestCount: 0,
  facilities: {
    "small-garden": 0,
    "greenhouse": 0,
    "watering-system": 0,
    "smart-farm": 0,
    "processing-factory": 0
  },
  perSecond: 0,
  plots: [
    {
      plotId: "garden-1",
      type: "garden",
      slots: [
        {
          slotId: "garden-1-slot-1",
          isPlanted: false,
          xp: 0,
          growthStageId: "sprout"
        }
        // 총 4개
      ]
    }
  ],
  hasClaimedFreeGarden: true,
  nextPlotSequence: 2,
  autoXpCursor: 0,
  automaticXpRemainder: 0,
  lastSavedAt: 0,
  startedAt: 0,
  settings: {}
}
```

신규 이용자는 `plots: []`, `hasClaimedFreeGarden: false`로 시작한다. 상점에서 무료
구매가 성공한 시점에만 첫 텃밭이 생성되며, 저장 상태당 한 번만 가능하다.

### v1 마이그레이션

`growthExperience`, `growthStageId`, `isPlanted`를 사용하는 단일 작물 저장은 첫
로드에서 다음과 같이 변환한다.

- 첫 번째 텃밭을 보유한 상태로 전환
- 기존 작물을 첫 텃밭의 첫 슬롯에 배치
- 기존 빈 밭이면 첫 슬롯도 빈 상태로 유지
- 나머지 세 슬롯은 빈 상태로 생성
- 보유 오이, 누적 재화, 물주기 XP, 시설, 수확 횟수, 저장·시작 시각, 설정 보존
- 무료 텃밭 혜택은 이미 사용한 것으로 표시

변환 결과를 v2로 저장하므로 반복 새로고침해도 텃밭을 다시 만들지 않는다. v2를
불러올 때도 텃밭과 슬롯 ID 중복을 정규화하고, 텃밭마다 슬롯을 정확히 4개로
보완한다. `perSecond`와 슬롯의 `growthStageId`는 시설과 XP에서 다시 계산한다.

## 자동·오프라인 XP 규칙

시설의 기존 전체 생산량을 작물 수만큼 곱하지 않는다.

1. 경과 시간 × 시설 초당 생산량으로 전역 XP 총량을 한 번 계산한다.
2. 1 미만 소수는 `automaticXpRemainder`에 보관한다.
3. 확정된 정수 XP만 텃밭·슬롯의 안정적인 저장 순서로 라운드로빈 배분한다.
4. 비어 있거나 50 XP에 도달한 슬롯은 건너뛴다.
5. 한 슬롯이 성숙하면 남은 XP를 다음 대상 슬롯에 배분한다.
6. 대상 슬롯이 하나면 기존 단일 작물처럼 그 슬롯이 전체 XP를 받는다.
7. 대상이 하나도 없으면 XP를 작물에 지급하거나 다음 심기까지 보관하지 않는다.

오프라인 보상도 같은 배분기를 사용한다. 마지막 저장 시각과 현재 시각의 차이는
완료된 초로 계산하고 최대 8시간까지만 인정한다. 적용 직후 계산 시각을 현재로
전진시켜 같은 구간을 중복 지급하지 않는다.

## 입력과 효과

- `pointerdown`을 기본 포인터 입력으로 사용하고 뒤따르는 `click`은 무시한다.
- 키보드·보조기기의 합성 `click`은 슬롯 버튼에서 별도로 처리한다.
- 심기와 수확 전환 잠금은 슬롯 키 단위이므로 다른 슬롯은 계속 조작할 수 있다.
- 심기 입력은 XP를 주지 않으며, 수확 입력은 같은 이벤트에서 재심기로 이어지지
  않는다.
- XP, 물, 파티클 레이어는 각 슬롯 DOM 안에 생성한다.
- 여러 슬롯의 효과와 정리 타이머는 서로 공유하지 않는다.

## 기존 프로젝트와의 격리

- 게임은 `games/cucumber-grow/` 밖의 HTML, CSS, JavaScript, 이미지, 음원,
  Supabase 코드를 import하거나 참조하지 않는다.
- 기존 루트 HTML과 서비스 메뉴에 게임 링크를 추가하지 않았다.
- 기존 공용 CSS와 `tokens.css`를 불러오지 않는다.
- Supabase 클라이언트, 로그인, 피클, 사이트 상점, 인벤토리를 사용하지 않는다.
- 게임 파일을 `www/`, `android/`, `ios/`에 복사하지 않는다.
- SQL, 테이블, RPC를 만들거나 수정하지 않는다.

기존 Capacitor 설정의 `webDir`은 `www`이고 준비 스크립트는 `games/`를 복사하지
않으므로, 이 게임 변경을 위해 `prepare:capacitor`, `cap sync`, Android·iOS
빌드를 실행하지 않는다.

## 캐시 버전

이번 로컬 구현에서는 `SITE_VERSION`과 `index.html`의 게임 자산 쿼리 버전을
올리지 않는다. 실제 배포 직전에는 다음 두 참조의 쿼리 버전을 함께 갱신한다.

- `css/game.css?v=...`
- `js/main.js?v=...`

`ui-renderer.js`, `crop-transition.js`, `xp-gain-effect.js`의 내부 import 쿼리도
변경된 자산 단위에 맞춰 함께 검토한다.

## 자동 테스트

```bash
cd games/cucumber-grow
npm test
```

테스트는 신규·무료 구매·v1 마이그레이션·다중 텃밭 저장, 슬롯 독립성,
수확당 1개, 자동·오프라인 라운드로빈, XP·물·전환 효과, 제거 UI, 반응형/스크롤
구조를 검증한다.

추가 문법 검사:

```bash
find js tests -type f \( -name '*.js' -o -name '*.mjs' \) \
  -exec node --check {} \;
```

## 수동 확인 항목

- 390×844, 844×390, 1440×900에서 가로 넘침과 안전 영역 겹침이 없는지
- 신규 진입에 텃밭이 없고 메뉴 → 상점에서 무료 구매가 가능한지
- 빠른 연속 구매 입력과 새로고침에도 텃밭이 하나만 생기는지
- 한 텃밭의 네 슬롯이 각각 심기·물주기·진화·수확되는지
- 심기 입력에서 XP가 오르지 않고 다음 입력부터 대상 슬롯만 오르는지
- 각 캐릭터 머리 위의 작은 XP 막대와 슬롯별 물·`1XP` 효과가 맞는지
- 성숙 캐릭터 직접 터치 시 해당 슬롯만 비고 보유 오이가 1개 늘어나는지
- 검증 상태의 여러 텃밭이 세로로 이어지고 고정 HUD가 유지되는지
- 메뉴와 상점 입력이 아래 슬롯에 전달되지 않는지
- 화면 밖 텃밭의 반복 애니메이션이 일시정지되는지
- 개발자 도구 콘솔에 오류, 경고, 누락 자산 요청이 없는지
