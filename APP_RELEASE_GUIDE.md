# 말린오이 캘린더 앱 출시 가이드

이 문서는 말린오이닷컴 전체가 아니라 `app-calendar.html`을 시작점으로 하는 말린오이 캘린더 앱 출시 절차를 정리합니다.

## 공통 준비

1. 앱의 업데이트 안내는 Android에서 Google Play In-App Updates API의
   사용자별 제공 상태를, iOS에서 Apple Lookup API의 대한민국 스토어 공개
   버전을 우선 사용합니다. `assets/app-version.json`의
   `latestVersion`/`latestBuild`는 표시용 보조 메타데이터이며 스토어 조회를
   대신하지 않습니다. 심사 또는 단계적 출시 중인 빌드는 공개가 확인되기
   전에 기록하지 않습니다. 강제 업데이트 하한은
   `minimumVersion`/`minimumBuild`로 별도 관리합니다.
2. 루트에서 웹 자산을 Capacitor용 `www` 폴더로 동기화합니다.

   ```bash
   npm run cap:sync
   ```

3. 앱 시작 화면이 `www/index.html`과 `www/app-calendar.html`에서 말린오이 캘린더 선택 화면으로 열리는지 확인합니다.
4. `calendar-study.html`, `calendar-work.html`, `calendar-event.html` 이동 시 `?app=calendar`가 유지되는지 확인합니다.
5. 로그인, 회원가입, 비밀번호 찾기, 비밀번호 재설정 페이지에서 앱 모드가 유지되는지 확인합니다.

## Android Google Play Store 출시 흐름

1. `npm run cap:sync`
2. Android Studio 열기

   ```bash
   npx cap open android
   ```

3. 앱 아이콘, 앱 이름, 패키지명 확인
   - 앱 이름: 말린오이 캘린더
   - 패키지명/applicationId: `com.mallinoi.calendar`
4. `android/app/build.gradle`에서 `versionName`, `versionCode` 확인 후 새 업로드 전 증가
5. Android Studio에서 `Build > Generate Signed Bundle / APK`
6. `Android App Bundle` 선택 후 `.aab` 생성
7. Google Play Console에서 앱 생성
8. 스토어 등록정보 작성
9. 개인정보처리방침 URL, 앱 접근권한, 데이터 보안, 콘텐츠 등급, 타겟 연령층, 광고 여부 등 필수 항목 작성
10. 내부 테스트 또는 비공개 테스트에 `.aab` 업로드
11. 새 개인 개발자 계정은 비공개 테스트에 최소 12명 테스터가 14일 연속 참여해야 프로덕션 신청이 가능할 수 있음
12. 테스트 후 프로덕션 출시 신청
13. 업데이트 안내의 최종 검증은 Google Play에서 설치한 이전 빌드와 같은
    계정·서명·applicationId를 사용해 내부 또는 비공개 테스트 트랙에서
    수행합니다. 디버그 또는 직접 설치 APK에서는 Play API가
    `APP_NOT_OWNED`/업데이트 확인 불가 상태를 반환할 수 있습니다.

## iOS App Store 출시 흐름

1. `npm run cap:sync`
2. Xcode 열기

   ```bash
   npx cap open ios
   ```

3. Bundle Identifier 확인
   - `com.mallinoi.calendar`
4. Team / Signing 확인
5. Version, Build Number 확인 후 새 업로드 전 증가
6. `Any iOS Device` 또는 `Generic iOS Device` 선택
7. `Product > Archive`
8. Organizer에서 `Distribute App`
9. App Store Connect 업로드
10. App Store Connect에서 앱 생성
11. 스크린샷, 설명, 개인정보처리방침, 앱 개인정보, 연령 등급, 카테고리 등 입력
12. TestFlight 테스트
13. 심사 제출
14. Apple Lookup API가 공개 버전을 반환하는지와 App Store 딥링크가 열리는지
    실제 iPhone에서 확인합니다. 심사 중이거나 TestFlight에만 있는 버전은
    공개 버전으로 판단하지 않습니다.

## 출시 전 체크리스트

- 앱 아이콘이 Android/iOS에서 정상 표시되는지 확인
- 앱 이름이 말린오이 캘린더로 표시되는지 확인
- 스플래시 화면이 필요한지 확인
- 오프라인 상태에서 빈 화면이 아닌 안내 화면 또는 네트워크 오류 상태가 보이는지 확인
- 로그인 필요 화면에서 로그인 페이지로 이동하고 다시 캘린더로 돌아오는지 확인
- Supabase 인증과 DB 접근이 Android/iOS WebView에서 정상 동작하는지 확인
- 모바일 safe-area 대응 확인
- 캘린더 입력창에서 키보드가 올라올 때 레이아웃이 깨지지 않는지 확인
- Android 뒤로가기 동작 확인
- 외부 링크가 있다면 앱 내부 WebView와 외부 브라우저 처리 기준 확인
- 개인정보처리방침 URL 준비
- 앱 심사에서 단순 웹뷰 앱으로 보이지 않도록 캘린더 앱 진입 화면과 자기개발/업무/이벤트 캘린더 기능이 충분히 드러나는지 확인
