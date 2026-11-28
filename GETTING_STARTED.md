# Mac + Android 실기기 개발·빌드 가이드

## 1. Mac 기본 도구 & GitHub 인증

터미널(`Terminal.app` 또는 `iTerm2`)에서 아래 명령어를 순서대로 실행합니다.

```bash
# 1) Xcode Command Line Tools 설치
xcode-select --install

# 2) Homebrew 설치 (Apple Silicon Mac 기준 PATH 등록 포함)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc

# 3) Git, Node.js(LTS), Watchman, GitHub CLI 설치
brew install git node watchman gh

# 4) GitHub 로그인 (@barofit/pose 의존성 설치 시 필요)
gh auth login
```

---

## 2. JDK 17 설치

Gradle `9.4.1` 및 Android 빌드를 위해 **JDK 17**을 설치합니다.

```bash
brew install --cask temurin@17

cat << 'EOF' >> ~/.zshrc
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"
EOF
source ~/.zshrc

java -version  # openjdk version "17.x.x" 확인
```

---

## 3. Android SDK 설치 (CLI 전용, Android Studio 불필요)

```bash
# 1) Command-line Tools 설치
brew install --cask android-commandlinetools

# 2) 환경변수 등록 (Apple Silicon Mac 기준)
cat << 'EOF' >> ~/.zshrc
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
EOF
source ~/.zshrc

# 3) 라이선스 동의 및 필수 SDK 패키지 일괄 설치
yes | sdkmanager --licenses
sdkmanager \
  "platform-tools" \
  "platforms;android-37.0" \
  "build-tools;36.0.0" \
  "build-tools;37.0.0" \
  "ndk;27.1.12297006"
```

---

## 4. Android 실기기 연결 (최초 1회 USB 디버깅)

1. 휴대폰 **설정 → 휴대전화 정보 → 소프트웨어 정보 → 빌드 번호** 7회 연속 탭 *(개발자 옵션 활성화)*
2. **설정 → 개발자 옵션 → USB 디버깅** 활성화
3. Mac과 USB 케이블 연결 후 휴대폰 팝업에서 **"이 컴퓨터 항상 허용"** 선택
4. Mac 터미널에서 연결 확인:
   ```bash
   adb devices
   # 예시 출력: R3CT10XXXXX    device
   ```

---

## 5. 프로젝트 클론 및 `.env` 설정

```bash
git clone https://github.com/Barofit-team/frontend.git
cd frontend
npm install
cp .env.example .env
```

`.env.example`을 참고해 `.env` 값을 채웁니다.
- `EXPO_PUBLIC_API_URL`:
  - AWS 서버 연결 : `https://api.barofit.cloud`
- `EXPO_PUBLIC_KAKAO_REST_API_KEY`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID`: DM 으로 전달 

---

## 6. 실기기에서 개발 실행 (최초 1회 빌드 → 이후 무선 개발)

`.gitignore`에 `/android`가 제외되어 있으므로, 최초 1회 실행 시 네이티브 프로젝트를 자동 생성하며 빌드합니다.

### 6-1. 최초 1회: USB 연결 상태에서 앱 설치
```bash
npx expo run:android
```

### 6-2. 이후 일상 개발: USB 선 없이 Wi-Fi로 실행
앱이 한 번 설치된 후에는 **USB 케이블을 뽑고** 개발할 수 있습니다. (Mac과 휴대폰이 **같은 Wi-Fi** 연결 필요)
```bash
npx expo start --dev-client
```
- 폰에 설치된 **Barofit** 앱을 열고, 화면에 표시되는 Mac의 Metro 서버(예: `http://192.168.0.x:8081`)를 선택하면 코드 수정 시 즉시 반영됩니다.
- *(공용 Wi-Fi 등에서 기기 간 통신이 막혀 있을 때만 USB 연결 후 `adb reverse tcp:8081 tcp:8081` 실행)*

### 6-3. 다시 재빌드(`npx expo run:android`)가 필요한 경우
JS/TS 화면·로직 수정은 재빌드가 필요 없지만, 아래 작업 시에는 네이티브 앱을 다시 빌드·설치해야 합니다.
- `modules/barofit-pose-camera` 등 네이티브 코드 수정 시
- `package.json`에 새로운 네이티브 라이브러리 추가 시
- `app.json`의 권한·플러그인·아이콘/스플래시 변경 시

### 6-4. (선택) 재빌드·설치까지 무선으로 하기 (Android 11+)
USB 선 없이 Wi-Fi로 `npx expo run:android`나 `adb install`까지 하려면 휴대폰 **개발자 옵션 → 무선 디버깅**을 켭니다.
```bash
# 1) 최초 1회 페어링 ('페어링 코드로 기기 페어링' 화면의 IP:포트와 코드 입력)
adb pair <휴대폰_IP>:<페어링_포트>

# 2) 연결 ('무선 디버깅' 메인 화면의 IP:포트 입력)
adb connect <휴대폰_IP>:<연결_포트>

# 3) 연결 확인 후 일반 빌드 실행
adb devices
npx expo run:android
```

---

## 7. 실기기 공유용 APK 빌드 (기본 설정 기준)

```bash
# android 폴더가 없다면 먼저 생성
npx expo prebuild --platform android

# Release APK 빌드
cd android
./gradlew assembleRelease
```

- **기본 생성 경로**: `frontend/android/app/build/outputs/apk/release/app-release.apk`

---

## 8. 실기기 작업 시 빠른 트러블슈팅

| 증상 | 해결 방법 |
| :--- | :--- |
| **`SDK location not found`** | `echo "sdk.dir=/opt/homebrew/share/android-commandlinetools" > frontend/android/local.properties` |
| **`adb devices`에 기기가 안 뜨거나 `unauthorized`** | 데이터 전송용 USB 케이블 확인 및 휴대폰 화면의 USB 디버깅 허용 팝업 재확인 |
| **앱 실행 후 Metro 서버 연결 실패** | 같은 Wi-Fi인지 확인하거나, USB 연결 후 `adb reverse tcp:8081 tcp:8081` 실행 |
| **네이티브 설정 꼬임 / 빌드 오류** | `npx expo prebuild --platform android --clean && npx expo run:android` |
| **JS 번들 캐시 오류** | `npx expo start --dev-client -c` |
