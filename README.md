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
