# Barofit Frontend

React Native + Expo 기반 Barofit 모바일 애플리케이션입니다.

## Tech Stack

- React Native
- Expo SDK 57
- TypeScript
- Expo Router
- Node.js LTS
- npm

## Getting Started

```bash
git clone https://github.com/Barofit-team/frontend.git
cd frontend
npm install
cp .env.example .env
npx expo start
```

- 실행 후 터미널에 나온 QR 코드를 iPhone 카메라로 스캔하여 Expo Go 앱에서 확인합니다.
- Mac과 iPhone은 같은 Wi-Fi에 연결되어 있어야 합니다.

## 소셜 로그인 (백엔드 연동)

카카오·구글 로그인 페이지를 앱 안의 WebView로 열고, 받은 인가 코드(`code`)를 백엔드에 보내 바로핏 토큰을 받습니다.
client secret이 필요한 코드 교환은 백엔드가 하므로 앱에는 공개 키만 둡니다.

```
WebView 로그인 → redirect_uri(http://localhost:8081)로 이동하려는 순간 code 가로채기
→ POST /api/v1/auth/social-login/code { provider, code, redirectUri, nonce }
→ isOnboarded가 false면 온보딩, true면 홈
```

`.env` 설정 (`.env.example` 참고)

| 변수 | 값 |
|---|---|
| `EXPO_PUBLIC_API_URL` | 백엔드 주소. 휴대폰에서 접속하므로 `localhost`가 아니라 **PC의 Wi-Fi IP** (예: `http://192.168.0.7:3002`) |
| `EXPO_PUBLIC_KAKAO_REST_API_KEY` | 카카오 REST API 키 (백엔드와 같은 콘솔) |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | 구글 **웹** 클라이언트 ID (백엔드와 같은 콘솔) |
| `EXPO_PUBLIC_OAUTH_REDIRECT_URI` | 기본 `http://localhost:8081`. 콘솔과 백엔드에 등록된 값과 같아야 합니다 |

- 토큰은 `expo-secure-store`(Keychain/Keystore)에 저장하고, API 호출 시 `apiFetch(path, { auth: true })`로 자동 첨부합니다. Access Token이 만료되면 refresh를 한 번만 보내고 원래 요청을 재시도합니다.
- 구글 계정은 Google Cloud Console의 **테스트 사용자**로 등록된 계정만 로그인할 수 있습니다(앱 게시 전).

## Project Structure

```
src/
├── app/            # 화면 (Expo Router, 파일 = 화면)
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── (auth)/     # 로그인, 회원가입, 온보딩
│   └── (tabs)/     # 홈, 운동, 프로필
├── components/     # 공통 컴포넌트
│   └── ui/         # Button, Input, Card
├── constants/      # theme 등 상수
├── hooks/
├── services/       # API 호출
└── types/
```

- 화면이 아닌 코드(컴포넌트, 훅 등)는 `src/app/` 밖에 둡니다.
- import 경로는 `@/` 별칭을 사용합니다. (`@/` = `src/`)

## Branch Convention

```
main
feature/<feature-name>

예:
feature/login
feature/signup
feature/home
feature/workout
```

- `main` 브랜치에 직접 기능 개발하지 않고, feature 브랜치에서 작업한 뒤 Pull Request로 합칩니다.

## Commit Convention

```
feat: 기능 추가
fix: 버그 수정
refactor: 코드 리팩터링
style: UI/스타일 수정
chore: 환경 설정 및 기타 작업
docs: 문서 수정
```

## Environment Variables

- `.env` 파일은 Git에 커밋하지 않습니다.
- `.env.example`을 복사하여 사용합니다.

```
EXPO_PUBLIC_API_URL=
```

- `EXPO_PUBLIC_` 접두사가 붙은 값은 앱에 포함되므로 비밀 키는 넣지 않습니다.

## Development Rules

- 패키지 매니저는 npm으로 통일합니다.
- `package-lock.json`을 커밋합니다.
- Expo 관련 라이브러리는 가능하면 `npx expo install`로 설치합니다.
- SDK 버전은 팀 협의 없이 임의로 변경하지 않습니다.
- `main` 브랜치에 직접 기능 개발하지 않습니다.

## 루틴 화면 연동

루틴 탭에서 전신·하체·코어와 초급·중급·고급을 선택한 뒤 세트 수·횟수·시간만 조절합니다. 저장·조회·수정·삭제는 로그인한 사용자 JWT로 요청합니다. 생성 시 `templateExerciseId`, 수정 시 저장된 루틴의 `routineExerciseId`를 사용합니다.

- 백엔드 실행 후 `.env`의 `EXPO_PUBLIC_API_URL` 설정. 로컬 웹 예: `http://localhost:3003`.
- 휴대폰 테스트에서는 localhost 대신 개발 PC의 LAN IP를 입력하고 같은 Wi-Fi에 연결합니다.
- 웹에서는 백엔드 `CORS_ALLOWED_ORIGINS=http://localhost:8081` 설정이 필요합니다.
- 공개 OAuth client ID와 redirect URI만 Expo 환경변수에 넣습니다. Client secret은 백엔드에만 둡니다.
- 기존 로그인은 네이티브 WebView 방식이므로 실제 소셜 로그인은 기기에서 확인합니다. 웹에서는 둘러보기로 공개 템플릿을 확인할 수 있습니다.
- `npm run typecheck`, `npm run lint`, `npm run test:routine`, `npx expo export --platform web`로 검사합니다. Node는 Expo SDK 의존성 요구사항에 맞게 22.13 이상인 22.x 버전을 사용하세요.

실기기 확인: 로그인 → 루틴 탭 → 전신/초급 → 푸시업 3세트·12회/플랭크 2세트·40초 → 저장 → 내 루틴 수정에서 재조회 → 45초로 수정 → 재조회 → 안내 미리 듣기/중지 → 삭제 확인. 다른 계정에서 이전 계정의 루틴이 보이지 않는지도 확인하세요.

안내 미리 듣기는 서버 `introTtsText`를 Expo Speech로 읽습니다. 실제 운동 시작·세트 종료·다음 종목 이벤트에 따른 자동 안내 및 이어하기는 운동 실행 화면의 후속 작업입니다.
