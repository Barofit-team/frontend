# 온보딩 백엔드 API 연동

- 작성일: 2026-10-26
- 이슈: #28
- 브랜치: `feat/onboarding-api-conn`
- 백엔드 명세: backend_baro `docs/onboarding-api.md`, `docs/identity-service.md`

## 1. 연동 현황

온보딩 화면(`src/app/(auth)/onboarding.tsx`)은 이미 실제 API를 호출하도록 구현되어 있었고, 이번 작업에서 로컬 백엔드와 실기기로 연동을 확인하고 빈틈을 보완했다.

| 단계 | API | 비고 |
|---|---|---|
| 로그인 | `POST /api/v1/auth/social-login/code` | `isOnboarded`로 홈/온보딩 분기 |
| 1. 닉네임 | `GET /api/v1/users/nicknames/random` | 진입 시 기본값 |
| 1. 닉네임 | `GET /api/v1/users/nicknames/availability?nickname=` | 300ms 디바운스 |
| 2~7 | 없음 | 앱 상태(`useOnboardingStore`)에만 보관 |
| 저장 | `POST /api/v1/users/me/onboarding` | 7단계 값을 한 번에 전송 |
| 앱 시작 | `GET /api/v1/users/me` | 이번에 추가(아래 2.3) |

- 온보딩은 **회원별로 한 번만 완료**할 수 있다. 완료 후 다시 제출하면 서버가 409 `PROFILE_ALREADY_ONBOARDED`로 거부한다. 온보딩 이후 수정 API는 아직 없다.
- 키·몸무게는 **정수만** 보낸다. 앱은 원래 정수만 입력받고, 백엔드도 이번에 소수점 표기(`163.5`, `163.0`)를 400으로 거부하도록 바뀌었다.

## 2. 변경 사항

### 2.1 이미 온보딩한 경우 서버 값으로 동기화 (`onboarding.tsx`)

- 상황: 마지막 "다음"의 응답이 늦거나 유실되어 다시 누른 경우, 또는 이미 완료한 회원이 다시 제출한 경우 409 `PROFILE_ALREADY_ONBOARDED`가 온다.
- 이전: 방금 입력한 닉네임으로만 로컬 상태를 채우고 프로필은 비워 둔 채 홈으로 이동 → 서버와 앱의 값이 다를 수 있었다.
- 변경: `loadMyAccount()`(`GET /me`)로 서버 값을 다시 받은 뒤 홈으로 이동한다. 조회에 실패하면 이전 동작으로 처리한다.

### 2.2 입력 오류 시 해당 단계로 이동 (`onboarding.tsx`, `services/api.ts`)

- 상황: 서버가 400 `INVALID_INPUT`과 `errors[{field, message}]`를 돌려주는 경우(앱과 서버 검증 규칙이 어긋날 때).
- 이전: "온보딩 저장 실패" 알림만 표시.
- 변경: `errors[].field`를 단계로 바꿔(`FIELD_TO_STEP`) 가장 앞 단계로 이동하고 "입력 확인" 알림을 띄운다.

| field | 단계 |
|---|---|
| `nickname` | 1 |
| `gender`, `age`, `heightCm`, `weightKg` | 2 |
| `goal` | 3 |
| `weeklyWorkoutDays` | 4 |
| `experienceLevel` | 5 |
| `discomfortAreas` | 6 |
| `coachingStyle` | 7 |

- `ApiError`에 `errors: ApiFieldError[]`를 추가했다(기본값 `[]`, 기존 호출부 영향 없음).

### 2.3 앱 시작 시 세션 복원 (`src/app/index.tsx`)

- 이전: 저장된 토큰이 있어도 항상 `/login`으로 이동 → 앱을 켤 때마다 다시 로그인해야 했고 서버에 세션이 계속 쌓였다.
- 변경:

```
토큰 없음 → /login
토큰 있음 → GET /api/v1/users/me
   ├─ isOnboarded = true  → /home
   ├─ isOnboarded = false → 온보딩 스토어 초기화 후 /onboarding
   └─ 실패(401 세션 만료·탈퇴, 네트워크 오류) → /login
```

- Access Token이 만료됐으면 `apiFetch`가 refresh 후 재시도한다. 확인하는 동안 로딩 표시를 보여준다.
- 확인 방법: 새로고침(`r`)이 아니라 Expo Go를 **완전히 종료했다가 다시 실행**한다.

### 2.4 그대로 둔 것

- 개발용 우회 경로(프론트 팀원이 화면 확인용으로 둔 코드)는 수정하지 않았다.
  - `onboarding.tsx` 토큰 없을 때 서버 저장 없이 완료 처리
  - `login.tsx` "dev 로그인", "dev 온보딩" 버튼
  - `(tabs)/profile.tsx` 온보딩 다시 열기
- 이 경로로 들어가면 서버에 저장되지 않으니 연동 테스트는 카카오·구글 로그인으로 한다.

## 3. 로컬 실기기 테스트 환경

```
휴대폰(Expo Go) ──같은 Wi-Fi──▶ Mac {Wi-Fi IP}:3002 (nginx 게이트웨이, docker compose)
                                   ├─ /api/v1/auth/**, /api/v1/users/** → identity-service
                                   └─ 그 외                              → routine-service
```

1. 백엔드: `backend_baro`에서 `docker compose up -d` (코드 변경 시 `--build`)
2. 프론트 `.env`: `EXPO_PUBLIC_API_URL=http://{Mac Wi-Fi IP}:3002` (`ipconfig getifaddr en0`로 확인. localhost 불가)
3. `npm install` → `npx expo start -c` (`.env` 변경 시 `-c` 필수)
4. 휴대폰을 Mac과 같은 Wi-Fi에 연결하고 QR 스캔
5. 연결 확인: 휴대폰 브라우저에서 `http://{Mac IP}:3002/health` → `{"status":"UP"}`

## 4. 검증

| 항목 | 결과 |
|---|---|
| 실기기(카카오) | 로그인 → 랜덤 닉네임 → 닉네임 중복 확인 → 온보딩 저장(201) → 홈. DB에 닉네임·프로필(키·몸무게 정수) 저장 확인 |
| 앱 재시작 | `GET /me` 호출 후 홈 이동 확인(게이트웨이 로그) |
| 타입 체크 | `npx tsc --noEmit` 오류 수가 `dev`와 동일(25개, 미설치 모듈·typed routes 등 기존 오류). 변경 파일에서 새 오류 없음 |

## 5. 참고

- `package-lock.json`의 `@types/react`(19.2.18)가 `package.json`(`~19.3.0`)과 맞지 않아 `npm install` 때마다 lock 파일이 바뀐다. 이번 PR에는 포함하지 않았다.
- 백엔드에는 있지만 앱 UI가 없는 API
  - `PUT /api/v1/users/me/profile-image`: 프로필 사진 변경(multipart `file`, JPEG·PNG·WebP, 5MB 이하). S3 연동 전에는 열리지 않는 임시 URL을 돌려준다. 연동 시 `expo-image-picker`로 선택 → JPEG 변환(HEIC 불가) → `FormData`로 전송하며, `apiFetch`가 multipart를 보낼 수 있도록 `Content-Type` 처리를 바꿔야 한다.
  - `GET /api/v1/users/nicknames/random` 다시 뽑기 버튼 없음(진입 시 한 번만 호출)
  - `GET /api/v1/users/me`의 `profile`, `profileImageUrl` 화면 표시 없음
  - `DELETE /api/v1/users/me`(탈퇴) 버튼 없음
