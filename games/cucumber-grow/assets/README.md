# 게임 자산 교체 위치

현재 성체 캐릭터는 `images/cucumber-adult.png`를 사용하고, 배경은
`css/game.css`의 CSS 도형으로 구성한다. 게임 폴더 밖의 자산은 참조하지 않는다.

추가 자산은 다음 하위 경로를 사용한다.

- `assets/images/`: 단계별 캐릭터, 시설, 배경, 앱 내부 일러스트
- `assets/images/enemies/`: 4상태 위협 캐릭터 스프라이트 시트
- `assets/sounds/`: 터치, 구매, 성장, 배경음

단계별 캐릭터와 시설 자산 경로는 `js/game-config.js`의
`crops.growthStages[]`와 `facilities[]`에서 관리한다. 자산을 추가할 때도
게임 폴더 밖의 상대 경로나 기존 사이트 공용 자산을 참조하지 않는다.
