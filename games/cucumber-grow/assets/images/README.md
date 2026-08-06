# Images

오이키우기 전용 이미지 자산을 이 폴더에 둔다.

- `cucumber-baby.png`: 새싹 단계 캐릭터(1254×1254, 투명 PNG)
- `cucumber-boy.png`: 애기오이 단계 캐릭터(1254×1254, 투명 PNG)
- `cucumber-adult.png`: 현재 어른오이 단계 캐릭터(1254×1254, 투명 PNG)
- `cucumber.png`: 이전 어른오이 캐릭터(900×1400, 현재 실행 코드에서는 미사용)
- `water-gun.png`: 대상 작물 위쪽에서 잎·머리 방향으로 물을 주는 물뿌리개(1254×1254, 투명 PNG)
- `water.png`: 물주기 효과 스프라이트(1776×888, 4열×2행, 프레임당 444×444, 행 우선 8프레임, 투명 PNG)
- `tool-hammer.png`: 기본 뿅망치(768×768, 투명 PNG)
- `facility-sprinkler.png`: 주변 8방향 스프링클러(768×768, 투명 PNG)
- `facility-scarecrow.png`: 낮 위협 방어 허수아비(512×768, 투명 PNG)
- `facility-greenhouse.png`: 3열×2행 온실(768×768, 투명 PNG)
- `facility-rain-barrel.png`: 기본 지급 물통으로 재사용하는 장비 이미지(768×768, 투명 PNG)
- `facility-generator.png`: 연료식 시설 에너지 발전기(768×768, 투명 PNG)
- `facilities/generator-v2.png`: 나무 장비 바닥에서 터치 가동하는 연료식 발전기(투명 PNG)
- `enemies/bird-sprite.png`: 새 접근·쪼기·피격·쓰러짐 4프레임(1024×409, 투명 PNG)
- `enemies/squirrel-sprite.png`: 다람쥐 접근·먹기·피격·쓰러짐 4프레임(1024×422, 투명 PNG)
- `enemies/boar-sprite.png`: 멧돼지 접근·먹기·피격·쓰러짐 4프레임(1024×512, 투명 PNG)
- `enemies/thief-sprite.png`: 도둑 잠입·훔치기·피격·쓰러짐 4프레임(1024×512, 투명 PNG)
- `enemies/rabbit-sprite-v2.png`: 낮 토끼 4동작 원본 시트
- `enemies/mouse-sprite-v2.png`: 밤 들쥐 4동작 원본 시트
- `enemies/raccoon-sprite-v2.png`: 밤 너구리 4동작 원본 시트
- `enemies/frames/`: 모든 위협을 동일한 256×256 안전 영역으로 잘라낸 실행 프레임
- `backgrounds/game-start-v2.png`: 세로형 시작 장면 배경
- `backgrounds/farm-day-v2.png`: 장비 배치 행을 포함한 세로형 농장 장면 배경
- `backgrounds/farm-day-v8.png`: 바깥쪽으로 열린 문·마을길과 긴 밭을 포함한 세로형 농장 배경
- `backgrounds/farm-field-texture-v8.png`: 텃밭 확장 높이에 맞춰 배경 아래를 이어 주는 땅 텍스처

신규 도구·시설·위협 이미지는 ImageGen의 평면 마젠타 크로마키 배경으로 생성하고,
로컬 배경 제거 후 알파 채널과 투명 모서리를 확인했다. 실행 시 외부 URL을 쓰지
않는다.
