# 말린오이닷컴 앱

시작 화면에서 `https://mallin-oi.com/` 홈을 열 수 있다. iOS는 Safari 보기, Android는 Custom Tabs를 사용한다. 페이지 이동, 로그인, 첨부파일 선택은 사이트의 웹 흐름을 따른다. Android 기기에 Custom Tabs를 지원하는 브라우저가 없으면 기본 브라우저로 연결된다.

공개 게시글의 제목과 본문 텍스트를 기기에 저장할 수 있다. iOS는 공개 글의 공유 메뉴, Android는 웹 화면의 점 세 개 메뉴에서 ‘오프라인에 저장’을 선택한다. ‘저장된 글’에서 인터넷 연결 없이 읽거나 삭제할 수 있다.

사이트 콘텐츠는 운영 서버에서 읽는다. 상품 데이터는 사이트와 함께 갱신되고, HTML·CSS·JavaScript·이미지는 기존 웹 배포와 캐시 갱신 절차를 따른다. 열린 화면에서 변경 사항을 확인하려면 새로고침한다. 네이티브 코드나 앱 아이콘을 바꿀 때는 앱을 새로 빌드한다.

## 로컬 실행

- iOS 16 이상. `ios/MallinoiSite.xcodeproj`를 Xcode에서 열고 `MallinoiSite`를 실행한다. 실제 iPhone에서는 Signing & Capabilities에서 이 앱의 개발 팀을 선택한다.
- Android 7.0 이상. Android Studio에서 `android/`를 열고 실행한다. 터미널에서는 JDK 17 이상과 Android SDK 36을 준비하고 `android/`에서 `./gradlew :app:assembleDebug`를 실행한다.
- 두 플랫폼의 앱 식별자는 `com.mallinoi.site`다. 개발용 iOS 설치 파일은 서명에 사용한 프로파일에 등록된 기기에서 사용할 수 있다.
