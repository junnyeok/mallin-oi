# 캐릭터·로고 등록 후보 레지스트리

조사 기준일은 2026-08-04(KST)이며, 저장소 `main`의 `236fc1e`와 IP 작업 브랜치의 선행 커밋 `c4ba278`을 기준으로 확인했다.

이 문서는 저장소에서 확인되는 파일 관계를 정리한 것이다. `대표 파일 후보`는 출원·등록 대상을 확정한다는 뜻이 아니며, 실제 창작자·창작일·AI 사용·인간의 창작적 기여는 소유자 자료와 공식기관 안내를 별도로 대조해야 한다.

## 1차 저작권 등록 후보

| 캐릭터 | 대표 파일 후보 | 저장소 식별자 | 확인된 관계 | 현재 판단 |
| --- | --- | --- | --- | --- |
| 기본오이 | `images/characters/cucumber.png` | `char-cucumber` | 프로필 기본 지급 이미지. `games/cucumber-grow/assets/images/cucumber.png`와 SHA-256이 같은 레거시 게임 복제본이 있음 | 1차 후보 |
| 오이소년 | `images/characters/cucumberboy.png` | `char-cucumber-boy` | 기본 스킨 코드 `char-cucumber-boy-basic`; 경찰 스킨 `images/skins/cucumberboy_police.png` | 1차 후보 |
| 오이소녀 | `images/characters/cucumbergirl.png` | `char-cucumber-girl` | 기본 스킨 코드 `char-cucumber-girl-basic`; 경찰 스킨, 이모티콘 10종, 앨범 아트 파생본이 있음 | 1차 후보 |

### 기본오이 관계

- 대표 후보: `images/characters/cucumber.png` (900×1400)
- 저장소 서비스 기본 캐릭터 코드: `char-cucumber`
- 동일 바이트 복제본: `games/cucumber-grow/assets/images/cucumber.png`
- 오이키우기 성장 단계 파생 후보:
  - `games/cucumber-grow/assets/images/cucumber-baby.png` — 새싹 단계
  - `games/cucumber-grow/assets/images/cucumber-boy.png` — 애기오이 단계
  - `games/cucumber-grow/assets/images/cucumber-adult.png` — 어른오이 단계
- 도형·서비스 파생본:
  - `images/logo-home.png`
  - `images/logo-study.png`
  - `images/logo-work.png`
  - `images/logo-event.png`
  - `images/logo-career.png`
- 모바일 앱 파생본:
  - `apps/cucumber-grow-mobile/assets/icon-source.png`
  - `apps/cucumber-grow-mobile/assets/app-icon/icon-foreground.png`
  - `apps/cucumber-grow-mobile/assets/app-icon/icon-only.png`
  - `apps/cucumber-grow-mobile/assets/splash-art/logo.png`
- 저장소상 별도 스킨: `cucumber-owner.png`, `cucumber-soldier.png`, `ozyo.png`, `spioi.png`

오이키우기의 새싹·애기·어른 이미지는 기본오이와 시각적 계보가 있어 보이는 별도 그림이다. 실제로 기본오이의 수정·파생 제작물인지, 독립 생성물인지 저장소만으로 확정할 수 없으므로 소유자 확인이 필요하다.

### 오이소년 관계

- 대표 후보: `images/characters/cucumberboy.png` (1024×1536)
- 저장소 서비스 코드: `char-cucumber-boy`
- 기본 스킨 코드: `char-cucumber-boy-basic`
- 직접 연결된 스킨: `images/skins/cucumberboy_police.png`

오이키우기의 `cucumber-boy.png`는 이름에 `boy`가 포함되지만 사람형 오이소년 캐릭터와는 다른 성장 단계 그림이다. 두 파일을 동일 저작물의 단순 크기 변형으로 취급하지 않는다.

### 오이소녀 관계

- 대표 후보: `images/characters/cucumbergirl.png` (1024×1536)
- 저장소 서비스 코드: `char-cucumber-girl`
- 기본 스킨 코드: `char-cucumber-girl-basic`
- 직접 연결된 스킨: `images/skins/cucumbergirl-police.png`
- 이모티콘 파생 후보: `images/emoticons/emo_cucumbergirl_1.png`부터 `emo_cucumbergirl_10.png`까지
- 앨범 아트 파생 후보: `images/BGM/cucumbergirl-debuet.png`
- Git 경로 이력: 현재 경로는 2026-04-13 커밋 `18a725e`에서 `images/skins/cucumbergirl.png`로부터 이름이 변경됨. 이전 경로의 최초 추가는 2026-04-08 커밋 `6612665`임

이모티콘·앨범 아트는 대표 캐릭터와 구분되는 표정·구도·배경을 가질 수 있으므로 대표본과 별도 파일로 보관하되, 1차 등록에 함께 제출할지 후속 관리할지는 공식 안내 및 소유자의 제작 기록 확인 뒤 결정한다.

## 로고·워드마크 후보

| 용도 | 파일 | 관계 | 현재 판단 |
| --- | --- | --- | --- |
| `말린오이닷컴` 워드마크 | `images/logo-word.png` | 한글 문자 도형화 이미지 | 로고상표 후속 검토 핵심 후보 |
| 홈 캐릭터 도형 | `images/logo-home.png` | 걷는 기본오이 형태. `www/images/logo-home.png`, `images/emoticons/free-3.png`와 동일 바이트 | 도형상표·저작권 후속 검토 |
| 공부 서비스 도형 | `images/logo-study.png` | 헤드셋·노트북을 사용한 오이 | 후속 검토 |
| 업무 서비스 도형 | `images/logo-work.png` | 경찰 복장 오이 | 후속 검토 |
| 일정 서비스 도형 | `images/logo-event.png` | 오이 2종과 하트 | 후속 검토 |
| 커리어 서비스 도형 | `images/logo-career.png` | 트로피·메달을 든 오이 | 후속 검토 |

`images/logo-word.png`는 현재 저장소에서 `말린오이닷컴` 문자를 도형화한 대표 파일이다. 문자상표 `말린오이닷컴`의 출원과 이 로고 이미지의 도형·결합상표 출원은 별도 판단 항목으로 관리한다.

## 후속 검토 캐릭터

| 캐릭터 | 파일 | 현재 판단 |
| --- | --- | --- |
| 브로콜리 | `images/characters/brocolli.png` | 후속 검토 |
| 계란감자 | `images/characters/eggpotato.png` | 후속 검토 |
| 아보카도 | `images/characters/fat-avocado.png` | 후속 검토 |
| 구운계란 | `images/characters/grilled-egg.png` | 후속 검토 |
| 테토당근 | `images/characters/teto-carrot.png` | 후속 검토 |
| 토마토 | `images/characters/tomato.png` | 후속 검토 |

`images/skins/inomske.png`는 구운계란 캐릭터 스킨으로 저장소 데이터에 연결되어 있지만 제3자 IP 연상 자산으로 분리했다.

## 등록 전 소유자 확인 필수 항목

각 1차 후보마다 다음 사실을 비공개 자료로 확인해야 한다.

1. 실제 최초 제작일과 최초 공개일
2. 최초 원본·중간본·레이어 파일·수정본 보유 여부
3. 사용한 생성형 AI 도구, 모델과 사용 시점
4. 프롬프트만 사용했는지, 직접 그리기·합성·리터칭·구도 변경을 했는지
5. 사람이 구체적으로 결정하거나 수정한 표정, 비율, 색상, 의상, 소품, 선과 배경
6. 외주·공동창작자·제3자 소재 사용 여부와 권리 귀속 문서
7. 대표 파일을 등록본으로 선택할지, 더 높은 해상도의 비공개 원본이 있는지
8. 최초 공개 URL·게시물·배포본을 보관하고 있는지

공개 저장소에는 원본 프롬프트, 개인정보, 계약서나 미공개 고해상도 원본을 올리지 않는다. 작성용 틀은 `templates/owner-creation-evidence-questionnaire.md`를 사용한다.
