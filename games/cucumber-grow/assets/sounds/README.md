# Sounds

오이키우기 전용 로컬 효과음을 이 폴더에 둔다. 앱은 첫 사용자 입력 뒤 오디오를
활성화하고, 설정 음량·음소거와 앱 백그라운드 상태를 존중한다.

- 루트 WAV 5개: 심기, 성장 2종, 수확, 물주기
- `combat/hammer-swing.wav`, `combat/hammer-hit.wav`: 뿅망치 휘두르기·타격
- `combat/*-approach.wav`: 새·다람쥐·멧돼지 접근음(도둑 접근음은 없음)
- `combat/threat-eat.wav`: 공통 갉아먹기
- `combat/*-defeat.wav`: 새·다람쥐·멧돼지·도둑 쓰러짐

`../../scripts/generate-combat-audio.mjs`가 외부 음원 없이 직접 합성한 22.05kHz
모노 16-bit PCM WAV다. 파일이 디코딩되지 않아도 Web Audio 대체음으로 게임은
계속 실행된다.
