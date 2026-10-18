# Google·카카오·Apple 로그인 연결 설정

## 현재 상태 — 2026-10-18

웹·캘린더 앱 코드, 개발자 콘솔 등록, 승인된 운영 SQL 및 서버 함수 배포를 완료했다.
Google·카카오·Apple의 실제 계정 연결·웹 재로그인을 같은 Test 계정으로 확인했다.
이메일 인증번호 수신 및 본인 확인 후 계정 관리 진입도 사용자 확인과 화면으로 검증했다.
운영 웹 `assets/social-auth-config.json`은 **true**다. `d82de1e4`를 origin/main에 일반 푸시했고
GitHub Pages 배포 및 실제 운영 파일 일치를 확인했다(SITE_VERSION `20261018-03`).
서버의 테스트 계정 제한을 제거했으며 임시 로컬 Origin/반환 주소는 차단했다.
허용 Origin은 `https://mallin-oi.com`, `capacitor://localhost`, `http://localhost`, `https://localhost`다.
반환 주소는 운영 웹 `account/social-callback.html`과 `mallinoi://auth/callback`만 허용한다.
원본 혼합 작업 폴더의 비활성 설정은 보존했으므로 원본 전체 설정을 운영에 다시 적용하지 않는다.
기존 이메일 로그인은 계속 유지한다.
기존 사용자 UUID와 게시물·피클·프로필·캘린더 외래키는 변경하지 않는다.

이번에 직접 확인한 콘솔 상태:
- Google Cloud: `Mallinoi Account` / `mallinoi-account` 프로젝트를 생성했다. 사용자 확인 후
  ‘말린오이닷컴’ 브랜딩과 사용자 데이터 정책 동의·외부 테스트 모드 설정을 저장한 뒤, 추가 승인 후 프로덕션 게시 상태를 확인했다.
  추가 사용자 승인 후 `Mallinoi Account Web` 웹 클라이언트를 생성했다. Google 콜백 하나만 등록됐음을
  다운로드한 JSON에서 확인했고, 목록에서도 생성을 확인했다. JSON은 저장소 밖 보안 폴더에 0600 권한으로 보관했다.
- 카카오 디벨로퍼스: 앱 `말린오이닷컴`(앱 ID `1612691`)을 사용자 확인 후 생성했다.
  카카오 로그인과 OpenID Connect 모두 ON을 확인했다. 기본 REST 키의 카카오 콜백을 등록했다.
  신규 REST 키의 시크릿은 기본 활성화 상태다. 설정 화면 확인 중 마스킹 누락으로 두 시크릿이
  도구 기록에 노출되어 사용자에게 ‘카카오 로그인’/‘비즈니스 인증’ 코드 재발급을 요청했다.
  사용자가 두 코드를 재발급·저장했다고 확인했고 다시 연 저장 화면에서 확인했다. 새 로그인용 값만
  보안 폴더에 저장해 Supabase Secrets에 등록했다. 비즈니스 인증 시크릿은 보관·사용하지 않는다.
- Apple Developer: 사용자 생성한 `Mallinoi Account Sign In` / `com.mallinoi.signin`을 확인했다.
  별도 사용자 승인에 따라 기존 `com.mallinoi.calendar` App ID에 Sign in with Apple을 활성화하고,
  Services ID를 연결했다. 도메인 `mallin-oi.com`, `tfztkeihdqkfzwpilyky.supabase.co` 및 아래 Apple 콜백의
  저장값을 다시 열어 확인했다. 다음 앱 빌드에는 변경된 capability에 맞춘 프로비저닝 갱신이 필요하다.
- Apple `Mallinoi Sign In` 키를 사용자 승인 후 생성·다운로드했다. Sign in with Apple만 허용하며,
  저장소 밖 `~/.config/mallinoi-social-auth/`에 0600 권한으로 보관하고 키 유효성을 확인했다.
  키 내용은 출력하거나 Git에 추가하지 않았다. ES256 client secret을 생성하고 공개 키로 서명을 검증했다.
  만료는 **2027-04-16 16:52 KST**이며 그 전에 갱신해야 한다. 서버 Secrets 등록을 완료했다.
- Google·Apple 서버 변수와 별도 난수 암호화 키를 같은 보안 폴더의 `server-secrets.env`에 0600 권한으로
  준비했다. 기본 보관본은 비활성이므로 운영 활성화 때 별도 `production-activation.env`를 적용했고 테스트 계정 제한을 제거했다. 기본 보관본 전체를 다시 적용하면 운영 로그인이 비활성화될 수 있다. 카카오 로그인 값을 추가해 서버 Secrets에 등록한 로컬 파일이며,
  저장소·생성 웹·앱 번들에는 포함하지 않는다.

이 구현은 Supabase의 기본 소셜 로그인 버튼을 켜는 방식과 다르다.
Supabase 기본 OAuth는 같은 검증된 이메일의 계정을 자동 연결할 수 있다.
사용자 요구인 **이메일이 같아도 자동 병합하지 않음**을 지키기 위해 `social-auth` 서버가
제공자의 서명된 ID 토큰을 검증하고 `(provider, subject)`를 명시적으로 연결한다.
Supabase의 Google/Kakao/Apple 기본 provider는 꺼둔다. 서버는 `/auth/v1/settings`에서 이를 확인하고,
하나라도 켜져 있거나 확인할 수 없으면 시작·최종 인증을 거부한다.
기존 서비스에서 기본 provider를 이미 사용한다면 임의로 끄지 말고 먼저 이전 계획을 정해야 한다.

## 사용자에게 보이는 흐름

- 신규 회원: 소셜 인증 → 닉네임·약관 확인 → 가입. 제공자가 검증한 이메일만 인증된 것으로 인정한다.
- 이메일 미제공/미검증: 사용할 이메일을 입력하고 인증번호를 확인한다. 임시 가입 UUID를 요청에 고정하며,
  이미 가입한 이메일은 이 경로에서 연결하지 않는다. 카카오 이메일 동의 여부와 무관하게 이 경로를 지원한다.
- 기존 이메일과 일치: 기존 방법으로 로그인 → ‘소셜 계정 연결’ → 비밀번호/이메일 인증번호로 재확인 → 제공자 인증 → 연결 확인.
- 이미 연결한 소셜 계정: 제공자 고유 ID로 기존 UUID를 찾아 로그인한다. 제공자 이메일이 바뀌어도 UUID를 바꾸지 않는다.
- Apple 비공개 이메일: 릴레이 주소를 그대로 사용한다. 일반 이메일과 추측으로 합치지 않는다.
- 제공자별 한 계정, 여러 제공자 연결을 지원한다. 마지막 로그인 수단은 해제할 수 없다.
- 소셜 회원은 이메일 인증번호로 본인 확인 후 이메일 로그인 비밀번호를 추가할 수 있다.
- 2단계 인증(MFA) 등록 계정의 소셜 세션 발급·연결 변경은 별도 MFA 흐름이 마련될 때까지 거부한다.

## 콘솔에서 먼저 확인할 것

스토어에 앱이 등록되어 있어도 로그인용 OAuth 앱/서비스 등록이 끝난 것은 아니다.
비밀값은 채팅·Git·공개 웹 파일에 복사하지 않는다. 서버 Secrets 화면에만 입력한다.

### Google

1. [Google Cloud 사용자 인증 정보](https://console.cloud.google.com/apis/credentials)에서 말린오이용 프로젝트를 선택한다.
2. Google Auth Platform의 브랜딩/대상/데이터 액세스 설정과 OAuth 클라이언트 목록을 확인한다.
3. 없으면 서비스 이름, 운영 도메인, 개인정보처리방침, 지원 연락처를 확인한 후 웹 애플리케이션 클라이언트를 준비한다.
4. 승인된 리디렉션 URI는 아래 `.../callback/google` 하나를 정확히 등록한다.
5. 클라이언트 ID와 Secret을 서버 변수에 등록한다. 테스트 상태이면 허용된 테스트 사용자로 먼저 검증한다.

### 카카오

1. [카카오 디벨로퍼스](https://developers.kakao.com/)의 앱 목록에서 말린오이 앱을 확인한다.
2. 카카오 로그인 사용 설정과 **OpenID Connect**를 활성화한다. 이 구현은 ID 토큰을 필수로 검증한다.
3. REST API 키와 해당 키의 클라이언트 시크릿을 서버에 등록한다. JavaScript 키나 어드민 키를 대신 넣지 않는다.
4. 리디렉트 URI에 아래 `.../callback/kakao`를 등록한다.
5. 이메일 동의항목 사용 가능 여부를 확인한다. 이메일을 받지 못하면 서비스 이메일 인증으로 이어진다.
   현재 요청 범위는 `openid`이며, 추가 동의항목은 콘솔에서 승인된 범위만 사용한다.

### Apple

1. [Apple Developer 계정](https://developer.apple.com/account/resources/identifiers/list)에서 캘린더 App ID
   `com.mallinoi.calendar`와 Sign in with Apple 설정을 확인한다.
2. 웹 인증용 **Services ID**를 만들거나 기존 것을 확인하고 해당 기본 App ID와 연결한다.
3. 웹 인증 도메인에는 콜백을 받는 Supabase 프로젝트 도메인을, Return URL에는 아래 `.../callback/apple`을 등록한다.
4. Sign in with Apple 키와 Team ID/Key ID/Services ID로 ES256 client secret JWT를 발급해 서버에 보관한다.
   개인 키 `.p8`과 JWT는 공개 파일·앱 번들에 넣지 않는다. 이 코드의 CLIENT_ID는 Services ID다.
5. client secret 만료 전에 갱신한다. Apple 이메일 릴레이에 실제 발신 도메인/주소를 등록하고 전달 여부를 검증한다.
6. 웹·Android·iOS 모두 같은 Services ID를 이용한 외부 브라우저 인증을 사용한다.
   현재 iOS의 `mallinoi` URL Scheme을 재사용하며 Bundle ID/서명은 바꾸지 않았다.
   네이티브 Apple 버튼으로 변경한다면 App ID/Services ID 사용자 식별자 그룹 정책을 먼저 검토해야 한다.

## 콜백 주소와 서버 변수

`<PROJECT_REF>`는 대상 Supabase 프로젝트의 실제 reference로 바꾼다. 아래 주소를 그대로 복사한 채 배포하지 않는다.

| 제공자 | 개발자 콘솔에 등록할 Redirect / Return URL |
| --- | --- |
| Google | `https://<PROJECT_REF>.supabase.co/functions/v1/social-auth/callback/google` |
| 카카오 | `https://<PROJECT_REF>.supabase.co/functions/v1/social-auth/callback/kakao` |
| Apple | `https://<PROJECT_REF>.supabase.co/functions/v1/social-auth/callback/apple` |

서버가 인증 완료 후 돌아가는 주소는 제공자 콜백 주소와 다르다.
웹은 `https://mallin-oi.com/account/social-callback.html`, 앱은 `mallinoi://auth/callback`이다.
반환 주소는 완전 일치만 허용하고 토큰은 URL에 넣지 않는다. 요청 ID만 fragment로 보낸다.
앱/브라우저에 남아 있는 난수 verifier가 있어야 서버에서 최종 인증할 수 있다.

변수 예시는 `supabase/functions/social-auth/.env.example`에 있다.

| 변수 | 의미 |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase 함수 런타임 기본값. 사용자 인증 확인에 사용 |
| `MALLINOI_SERVICE_ROLE_KEY` | 서버 전용 관리자 키. 기존 서비스의 같은 이름 사용 |
| `SOCIAL_AUTH_ENABLED` | 서버 활성화. 준비 중에는 `false` |
| `SOCIAL_ALLOWED_ORIGINS` | 쉼표로 구분한 정확한 웹/앱 Origin. 와일드카드 금지 |
| `SOCIAL_RETURN_URIS` | 쉼표로 구분한 정확한 완료 주소. 쿼리/fragment/사용자정보 금지 |
| `SOCIAL_GOOGLE_CLIENT_ID`, `SOCIAL_GOOGLE_CLIENT_SECRET` | Google 웹 OAuth 클라이언트 |
| `SOCIAL_KAKAO_CLIENT_ID`, `SOCIAL_KAKAO_CLIENT_SECRET` | 카카오 REST API 키 및 시크릿 |
| `SOCIAL_APPLE_CLIENT_ID`, `SOCIAL_APPLE_CLIENT_SECRET` | Services ID 및 만료가 있는 client secret JWT |
| `SOCIAL_CREDENTIAL_KEY` | 안전하게 생성한 32바이트 난수의 base64. Apple 해제용 refresh token의 AES-GCM 암호화 키 |

암호화 키를 분실/단순 교체하면 기존 Apple 자격 증명을 해제할 수 없다. 별도 보관하고 교체 시 재암호화 절차를 마련한다.
운영 Origin과 개발 Origin을 무분별하게 섞지 않는다. 개발 서버를 사용할 경우 별도 개발 Supabase 프로젝트에
`http://127.0.0.1:5500` 및 해당 `/account/social-callback.html`을 명시적으로 추가한다.
`www.mallin-oi.com`은 실제 사용/리디렉션 정책을 확인한 뒤 필요할 때만 추가한다.

## 적용 및 확인 상태 — 2026-10-18

- 운영 프로젝트 `tfztkeihdqkfzwpilyky`에 이번 전용 SQL만 적용했다. 기존 회원 데이터는 조회·변경하지 않았다.
- 공개 인증 설정에서 Google/Kakao/Apple OFF, 이메일 로그인 ON, 이메일 인증 필수를 확인했다.
- 프로필의 테이블 단위 UPDATE/TRUNCATE 권한 문제를 확인해 추가 사용자 승인 후
  `20261018-profile-auth-permissions.sql`을 적용했다. 일반 회원의 관리자/잔액 직접 수정 차단,
  닉네임 편집 및 service_role 잔액 수정 권한 유지 여부를 DB 권한 함수로 확인했다.
- 로그인 테이블 5개 RLS 및 클라이언트 직접 접근/RPC 실행 차단을 확인했다.
- `social-auth`, `delete-account` 배포 완료. 기존 운영 delete-account를 백업하고 수정 전 기준본과 동일함을 확인했다.
- 배포 후보 웹 설정은 `enabled=true`다. 서버는 `SOCIAL_AUTH_TEST_EMAILS`로 승인된 테스트 계정만 허용하는 검증 단계다. 승인된 공개 배포 시 테스트 제한과 임시 로컬 Origin/반환 주소를 제거한다.
- 기존 custom SMTP ON 확인. 가입 확인과 Magic link/OTP 템플릿에 인증번호를 추가했고 기존 인증 링크는 유지했다.
  기존 템플릿은 저장소 밖 보안 폴더에 백업했다. 실제 이메일 인증번호 수신 및 계정 관리 진입을 확인했다. Apple 비공개 릴레이 주소로의 실제 전달은 별도 미검증이다.

### 적용 순서와 이후 검증

1. 개발용 Supabase에 이번 SQL만 적용한다:
   `supabase/migrations/20261018000000_social_account_links.sql`.
   SQL Editor용 `supabase-SQLEditor/20261018-social-account-links.sql`과 내용은 같다. 둘을 중복 적용할 필요는 없다.
   다른 작업의 미적용 migration을 함께 실행하는 `db push`는 사용하지 않는다.
2. 기존 `profiles` 트리거·이메일/닉네임 unique 제약·RLS를 개발 DB에서 실제로 확인한다.
   사전 점검에서 확인된 프로필의 관리자/잔액 필드 수정 권한 우려는 운영 정책과 대조하고 해소한 뒤 공개 활성화한다.
3. 서버 Secrets를 입력하고, `social-auth` 및 변경한 `delete-account`만 배포한다.
   `delete-account`도 신규 테이블에 의존하므로 **SQL보다 먼저 배포하지 않는다**.
   `social-auth`는 제공자의 공개 callback을 받아야 하므로 `verify_jwt=false`이고,
   계정 변경 API 내부에서 Bearer 인증·본인 확인·Origin을 별도로 검사한다.
4. Supabase 기본 Google/Kakao/Apple providers는 비활성 상태인지 확인한다.
   이메일 로그인을 유지하며 이메일 인증번호 템플릿에 `{{ .Token }}`을 표시한다.
   신규 가입 확인 메일과 Magic Link 템플릿 모두 점검한다. 실제 SMTP 발송·릴레이 전달 테스트가 필요하다.
5. 개발 환경에서 아래 실제 인증 검증을 마친 뒤 운영 서버와 공개 설정을 활성화한다.
   웹 설정 `assets/social-auth-config.json`과 앱 생성본의 `enabled`를 함께 관리한다.
6. 이번 대화의 별도 배포 승인 범위가 확정된 뒤 커밋/푸시·앱 빌드 및 배포를 진행한다.

## 검증 범위와 남은 실기기·운영 확인

- 세 제공자의 기존 Test 계정 연결·재로그인은 실제 웹에서 통과했다. 신규 회원 생성/이메일 자동 연결 차단은 격리 DB·서명 토큰 테스트로 확인했고 실제 신규 운영 회원은 만들지 않았다.
- 기존 회원의 비밀번호 재확인 후 실제 연결 및 이메일 인증번호로 계정 관리 진입을 확인했다. 다른 사용자에게 연결된 소셜 계정 거부는 격리 DB 테스트로 검증했다.
- 닉네임 중복, 이메일 미제공 카카오 가입·재발송·만료, Apple 릴레이 인증번호 전달.
- 제공자 취소, 잘못된 state/nonce, 5분 만료, 재사용, 여러 탭의 요청 충돌.
- 마지막 로그인 수단 해제 금지, 이메일 비밀번호 추가, Apple 연결 해제 실패 후 재시도와 회원탈퇴 시 grant 해제.
- iPhone/Android 실기기의 외부 브라우저 → 앱 복귀(실행 중/종료 후), 로그인 후 기존 일정·피클·게시물 유지.
- 로그아웃/갱신/회원탈퇴가 기존 앱·사이트 로그인 정책대로 작동하는지 확인.
- 기존 개인정보 안내와 실제 수집 항목/provider subject/보관기간/Apple 암호화 자격 증명이 일치하는지 운영자 확인.
- 추가 승인 후 `20261018-social-provider-events.sql`을 적용했다. Apple·카카오 콘솔의 알림 URL 저장을 확인했다. 카카오 공식 User Unlinked 테스트는 HTTP 202, 약 1.05초로 처리되었다. Apple의 실제 서명 알림은 아직 수신 테스트하지 않았다.
- 제공자 공식 로그인 이미지 세 개를 변경 없이 사용한다. Google의 앱 홈·개인정보처리방침 URL·승인 도메인을 저장했으며 OAuth 대상은 사용자 승인 후 프로덕션 상태로 변경했다.

## 구현상의 운영 주의

- 알려진 state의 만료/재사용 콜백은 원래 허용된 클라이언트 오류 화면으로 돌려보낸다. 이 경로에서는 제공자 코드 교환·세션 발급·유효시간 연장을 하지 않는다.

- 인증 요청 5분, 1회 사용, provider+subject/사용자+provider unique 제약을 둔다.
- DB 함수와 인증 테이블은 service_role 전용이다. 비밀번호 해시나 provider secret을 프론트엔드에 반환하지 않는다.
- 이메일 기반 신규 계정 생성과 소셜 연결은 Auth API와 DB 트랜잭션을 걸치므로 전체가 단일 트랜잭션은 아니다.
  중간 실패 시 계정을 임의 삭제하지 않는다. 이메일 복구로 로그인한 뒤 명시적 연결로 재개한다.
  이메일 미제공 가입에서 메일을 보낸 후 중단하면 미인증 가입이 남을 수 있다. 자동 정리 정책은 별도로 결정한다.
- Apple 해제는 큐에 보관하고 연결 화면을 다시 열 때 재시도한다. 실패한 큐가 있으면 재연결을 막는다.
  회원탈퇴는 Apple 해제가 성공해야 데이터 삭제를 진행한다. 운영에서는 실패 큐 모니터링/재시도 작업을 추가한다.
- 생성된 Supabase 세션은 기존 웹/앱 저장 방식을 따른다. XSS 방어와 기존 CDN·CSP 정책 검토는 계속 필요하다.
- rate limit은 10분 단위 IP/작업 및 사용자·이메일 보조 제한이다. 게이트웨이가 IP 헤더를 신뢰할 수 있게
  처리하는지 배포에서 검증하고, 공개 서비스 전 게이트웨이 제한/봇 방어도 적용한다.
- 인증감사 기록은 연결/해제만 저장하며 이메일·토큰을 저장하지 않는다. 보관기간은 운영 정책으로 정한다.
- 앱 Scheme 가로채기를 막기 위해 verifier를 요구한다. 현재 Universal/App Link는 새로 등록하지 않았다.
  검증된 HTTPS 앱 링크 도입은 개발자 도메인 설정과 앱 서명이 준비된 후 별도로 진행한다.

## 로컬 검증 명령

최신 격리 배포 사본에서 전체 Node 테스트 **365/365**, Android Debug 및 iOS 시뮬레이터 빌드가 통과했다.
초기 앱 빌드는 격리 사본의 누락된 설치/생성 의존성으로 실패했고, lockfile 기준 `npm ci`와 Capacitor 동기화 후 재실행하여 통과했다.
운영 의존성 audit은 취약점 0이며 기존 개발 도구 의존성 경고는 이번 변경에 포함하지 않았다.
전용 PostgreSQL(PGlite)/서명 JWT 검증은 이메일 자동 병합 차단·명시적 연결·동시성·권한 제한·알림 재전송/순서 역전/인증 후 지연 알림 처리를 확인한다.
기존 원본 작업 폴더의 다른 기능 테스트 불일치는 격리 배포 사본에 포함하지 않았고 수정하지 않았다.

실제 브라우저에서 테스트 계정의 이메일 로그인이 성공했고 연결 관리 화면과 362px 가로 넘침 없음도 확인했다.
실제 카카오 공식 서명 웹훅은 202 응답을 받았다. 별도 사용자 승인 후 테스트 계정에 카카오를 연결하고 로그아웃→카카오 로그인→동일 Test 계정 복귀를 확인했다. 인증 반환 후 자동화 브라우저의 빈 화면을 한 번 새로 불러와 진행했으므로 무중단 반환과 네이티브 앱 복귀 검증은 별도로 남는다. 일정·피클은 수정하지 않았다. 이후 Google도 별도 사용자 승인 후 같은 Test 계정에 연결하고 로그아웃→Google 인증→Test 복귀를 확인했다. Google 반환은 새로고침 없이 완료했다. Apple도 이메일 가리기로 명시적 연결 후 로그아웃→Apple 인증→동일 Test 계정 복귀를 확인했다.
Apple에 실제 SMTP 발신 주소 `auth@mallin-oi.com`을 별도 승인 후 등록했다. 등록 목록의 SPF 검사는 미통과다. 도메인의 Resend DKIM 공개 레코드는 존재하고 Apple은 SPF 또는 DKIM 인증을 지원하지만, 실제 릴레이 전달은 아직 검증하지 않았다. DNS는 변경하지 않았다.
브라우저의 인증 공개 설정 캐시가 활성화/롤백을 지연시키지 않도록 서비스 워커를 보완하고 동작 테스트를 추가했다.
별도 iPhone 17 Pro/iOS 26.5 시뮬레이터에서 Google 외부 Safari 인증 → 앱 복귀 → 같은 Test 계정 로그인을 확인했다. 원래 시뮬레이터 데이터는 보존했다. Android 실기기 및 Apple·카카오의 기기별 복귀는 미검증이다.
후속 후보는 Android 1.0.30(34), iOS/위젯 1.0.30(37)이다. 스토어 배포용 서명 AAB/Archive, 원격 Git 푸시와 신규 스토어 제출은 아직 하지 않았다.

## 변경 파일 범위

- 화면 진입: `login.html`, `account/signup.html`, `mypage.html`, `prev-mypage.html`.
- 새 화면/공통 UI: `account/connections.html`, `account/social-callback.html`,
  `assets/css/components/social-auth.css`, `assets/social-auth-config.json`,
  `assets/js/modules/social-auth.js`, `social-auth-page.js`, `social-auth-native.js`.
- 초기화/앱 복귀: `assets/js/main.js`, `assets/js/modules/app-calendar.js`,
  `android/app/src/main/AndroidManifest.xml`, `scripts/prepare-capacitor-web.mjs`.
- 서버: `supabase/functions/social-auth/index.ts`, `policy.mjs`, `providers.mjs`,
  `service.mjs`, `revocation.mjs`, `notifications.mjs`, `.env.example`, `supabase/config.toml`,
  `supabase/functions/delete-account/index.ts`.
- SQL: 전용 SQL, 동일 migration, `supabase-SQLEditor/99_all_backup.sql` 끝에 이번 블록 추가.
- 검증/기록: `tests/social-auth.test.mjs`, `tests/social-auth-integration.mjs`,
  `docs/SOCIAL_AUTH_SETUP.md`, `docs/handoffs/mallinoi-calendar.md`, `file-list.txt`.
- 격리 배포 사본에서는 기존 준비 스크립트와 Capacitor 동기화로 생성했다. 원본 작업 폴더는 이번 인증 파일만 부분 동기화한다.
  네이티브 public의 기존 Git 무시 정책을 유지한다. 사용자 에셋·키·인증서·독립 게임 코드는 수정하지 않았다.

## 검증 재실행

```sh
node --test tests/social-auth.test.mjs
node --test tests/*.test.mjs
# 임시 디렉터리에만 @electric-sql/pglite@0.3.14, jose@6.1.0를 설치한 뒤:
node tests/social-auth-integration.mjs /absolute/temp/node_modules
# Deno가 있는 환경에서 (실행/메일 발송/DB 접근 없이 타입 확인):
deno check --no-config --no-lock supabase/functions/social-auth/index.ts supabase/functions/delete-account/index.ts
```

## 확인한 공식 자료

- [Supabase 계정 연결](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [카카오 로그인 설정](https://developers.kakao.com/docs/ko/kakaologin/prerequisite)
- [카카오 REST 인증](https://developers.kakao.com/docs/ko/kakaologin/rest-api)
- [Apple 웹 로그인 설정](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)
- [Apple 토큰 검증](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens)

## 공식 로그인 버튼 원본 출처

- Google: https://developers.google.com/static/identity/images/signin-assets.zip (공식 light/3x 사전 승인 버튼)
- 카카오: https://developers.kakao.com/tool/images/resource/preview/login-complete-ko.svg
- Apple: https://appleid.cdn-apple.com/appleid/button (한국어 Continue, 검은색 공식 생성 버튼)
