# F03 운동 준비 플로우 — 1차 디자인 적용 명세

- 작업: [Barofit frontend Issue #48](https://github.com/Barofit-team/frontend/issues/48)
- 대상 브랜치: `feat/F03_workout_ready`
- 기준 자료: 사용자 제공 **F03 Figma 캡처(2026-11-20 10:46)** 및 **Claude의 프론트엔드 읽기 전용 현황 조사(2026-11-20)**
- 범위: **F03 Step 1 기기 배치 → Step 2 각도 조절 → Step 3 전신 인식 / 완료**. F04 및 AI 판정 엔진 신규 개발은 범위 밖.
- 원칙: **화면은 캡처에 가깝게 변경하되 기존 동작을 보존한다.** 캡처의 설계 주석과 기존 로직이 충돌하는 조건은 임의로 바꾸지 말고 협의사항으로 남긴다.

## 1. 화면별 UI 적용 명세

| 화면 / 상태 | Figma 캡처에서 확인한 UI | 적용 대상(Claude 조사 결과) | 동작/주의사항 |
|---|---|---|---|
| **Step 1 · Place Device** | 흰 배경, 벽·바닥 공간 표현과 파란 테두리 스마트폰 일러스트, 상단 우측 X, 중앙 하단 안내 문구, 맨 아래 파란 **다음** 버튼 | `PreparationStepView` / `DevicePlacementGuide` / `PreparationHeader` | `onPressDone → move(1)` 재사용. 센서 자동 판정 단계가 아님. |
| **Step 2 · Adjust Angle — 조절 중** | 흰 배경, 상단 뒤로가기·닫기, 옅은 파란 스마트폰 외곽선/점선 중심선/움직이는 파란 원, 하단 **원과 점선이 겹치도록 각도를 조절해주세요**, 상태 칩 **기기를 천천히 세워주세요** 또는 **기기를 천천히 눕혀주세요** | `AngleAdjustmentGuide` / `PreparationStepView` | 실시간 `liveOffset`·`DeviceMotion` 연동 유지. 원의 방향과 안내 문구가 실제 센서 판정에 대응해야 함. |
| **Step 2 · Adjust Angle — 정렬 완료** | 연한 파란 그라데이션 배경, 원 대신 중심선의 파란 체크, **완벽해요! 지금 각도를 유지해주세요**, 보조 안내 | 위와 동일 | 센서 안정화 상태를 표시. 기존 자동 진행 흐름 유지, **수치 기준 차이는 아래 2절 확인**. |
| **Step 3 · User Position — 인식 중** | 어두운 전체화면 카메라, 상단 뒤로가기·닫기, **전신이 보이게 뒤로 물러나 주세요**, 신체 위치 가이드 점선 박스 | `UserPositionGuide` / `PreparationBottomPanel` / `UserPositionCamera` / `PreparationStepView` | 기존 카메라 권한·포커스/앱 활성 상태 및 `useCameraReadiness` 유지. 이미지 속 인물은 **실제 카메라 미리보기의 예시**이며 정적 사람 사진을 배경으로 고정하지 않음. |
| **Step 3 · User Position — 인식 완료** | 상단 파란 그러데이션 + 체크 원, **자세 인식 완료!**, 전신 영상 위 밝은 관절·스켈레톤 선, 하단 어두운 배경 | `PreparationStepView` / `PoseSkeletonOverlay` | 현재 `recognized=true` 완료 표현을 시안에 맞춰 변경. **인식 중 → 완료 간 카메라 컴포넌트를 재마운트하지 않도록** 동일 화면 구조 유지. |

### 공통 시각 가이드

- 화면은 세로 스마트폰 비율에 대응. 안전영역 및 iOS 상단 상태바/하단 홈 인디케이터 고려.
- **Step 1·2:** 흰색 중심, 파란 포인트, 둥근 헤더 버튼. **Step 3:** 어두운 카메라 화면 중심, 안내/버튼 대비 확보.
- 정확한 RGB/폰트 크기/여백/그라데이션 수치는 캡처만으로 확정할 수 없으므로 **Figma 원본 속성이 제공되면 우선**; 제공되지 않으면 캡처와 시각적으로 일치하도록 합리적인 근삿값으로 구현하고 핵심 미확정 값은 기록.
- 기존 개발용 단계 이동 pill(`‹ 1/4 ›`)은 캡처에 없으므로 실제 사용자 화면에서는 숨김. 음성 안내 기능은 유지하되 캡처에 없는 조작부 노출은 따로 판단.
- 사진 속 사람, 세부 일러스트 등 **캡처에서 추출된 저해상도 이미지 자체를 UI 에셋으로 사용하지 않음**. 실제 카메라 또는 제공된 원본 에셋/기존 View 일러스트를 활용.

## 2. 설계 주석 ↔ 현재 코드 대조 (결정 필요)

| 구분 | 캡처 설계 주석 | 현재 구현(Claude 조사) | 이번 F03 작업 지침 |
|---|---|---|---|
| Step 1 진행 | 첫 단계만 버튼으로 진행, 이후 조건 만족 시 자동 진행 | `onPressDone → move(1)`; 이후 각도·인식 조건으로 진행 | **일치. 그대로 유지** |
| Step 2 롤팁 변경 | 배경 pill 유지, 기존 텍스트가 사라졌다가 새 문구 표시 | 센서 상태에 따른 안내 칩 존재 | 문구 전환을 UI에서 재현. 센서 로직은 보존 |
| **Step 2 각도 합격 범위** | **기기가 똑바로 서 있는 상태에서 5~10도 뒤로 기울어진 상태** | 목표 **70° ±2°** (`angleConfig.ts` 임시값), 센서 축 부호 실기기 미검증 | **차이 있음. 자동으로 5~10°로 수정 금지**. 어떤 기준좌표의 각도인지 AI/디자인팀 확인 필요 |
| **Step 2 유지 시간** | 목표 각도 **1초 이상** 유지 | **1.5초** 유지 | **차이 있음.** 이번에는 기본적으로 기존 1.5초 로직 유지 후 협의 |
| **Step 2 다음 단계** | 완료 후 자동 전환 **2초** | `onStableAligned`로 다음 단계 자동 전환(별도 2초 지연 확인되지 않음) | **차이 있음.** 디자인 완료 상태를 표시하되 자동전환 딜레이 변경은 협의 후 결정 |
| Step 3 인식 완료 | 전신 감지 후 완료 상태, 체크 표시·스켈레톤 표현 | 실제 MediaPipe와 연결; 가시성/존재 신뢰도 0.5 이상, **1초 연속** 후 완료 | 기존 인식 판정 보존. 완료 시 UI만 새 시안으로 |
| Step 3 관절 색 | 설계 메모: **운동 중에만** 파란 브랜드 컬러를 도입하고, 준비 단계에는 흰색 계열 표시를 선호 | 현재 뼈대 **초록**, 관절 **빨강** | **디자인 차이.** F03 범위에 한해 밝은/흰색 표시를 적용할 수 있는지 확인. 공용 스켈레톤 전체 스타일은 변경하지 않음 |
| Step 3 상단 버튼 | 촬영 중 화면에 따라 가시성 고려 필요 | `PreparationHeader` 존재 | 카메라 배경 위 명도 대비 확보. 버튼 기능 유지 |
| 준비 완료 후 이동 | 시안상 완료 상태 표시 | 완료 1.5초 후 `router.replace('/workout-session')` | 기존 세션 이동 유지; Step 2의 2초와 혼동하지 말 것 |

> **주의:** 캡처의 각도 기준을 현재 `DeviceMotion` 계산식에 바로 대입하면 잘못된 판정이 될 수 있다. 캡처는 기기 물리 각도를 설명하고, 코드는 센서 계산 기준을 사용하므로 좌표계·실기기 검증이 우선이다.

## 3. 구현 파일 및 변경 경계

**화면/UI 변경 우선**

- `src/components/workout-preparation/PreparationStepView.tsx`
- `src/components/workout-preparation/DevicePlacementGuide.tsx`
- `src/components/workout-preparation/AngleAdjustmentGuide.tsx`
- `src/components/workout-preparation/UserPositionGuide.tsx`
- `src/components/workout-preparation/PreparationBottomPanel.tsx`
- `src/components/workout-preparation/PreparationHeader.tsx`
- `src/components/workout-preparation/palette.ts` (F03 관련 색만)
- `src/app/workout-preparation.tsx` (화면 조합/표시 변경이 꼭 필요한 최소 부분만)

**기존 로직 보존 / 태현님 온디바이스 연동과 충돌 주의**

- `modules/barofit-pose-camera/**`, `services/posePipeline.ts`, `hooks/useCameraReadiness.ts`, `hooks/usePoseLandmarks.ts`
- `src/components/workout-preparation/{useDevicePitch,pitch,angleConfig,steps}.ts`
- `UserPositionCamera.tsx` 및 `PoseSkeletonOverlay.tsx`는 F03 표현 변경이 꼭 필요할 때만, **기존 이벤트·좌표·라이프사이클 계약을 유지**하며 국소적으로 수정. 공용 시각 스타일이 F04에 전파되지 않도록 별도 props/variant 우선 검토.
- 기존 `router.replace('/workout-session')`, 카메라 권한/앱 포커스 가드, 인식 완료 상태에서 카메라 유지, TTS 연동은 유지.
- 태현님 작업 브랜치/파일을 직접 수정하거나 병합하지 않음. 충돌 가능 파일은 기록 후 조율.

## 4. 디자인팀·AI팀 협의 기록 (미확정 목록)

작업 중 신규 항목이 생기면 아래 표에 **화면 / 불명확한 점 / 현재 임시 처리 / 확인 대상**을 추가한다. 당장 확인받지 못해도 UI 작업은 가능한 범위에서 진행한다.

| 화면 | 확인할 내용 | 우선 처리 | 대상 |
|---|---|---|---|
| Step 2 | 기기 직립 기준 5~10°와 기존 70° ±2° 사이의 기준좌표 및 최종 목표값 | 기존 센서 조건 유지 | AI팀/디자인팀 |
| Step 2 | 안정 유지 1초 vs 기존 1.5초, 자동 전환 2초 적용 여부 | 기존 단계 진행 유지, 시각적 완료 표현 적용 | 디자인팀/기능 담당 |
| Step 3 | 준비 단계 스켈레톤 선·관절 색상, 인식 중/완료 상태 표시 범위 | F03 범위에서 밝은 색상 우선, 공용 로직 영향 금지 | 디자인팀/AI팀 |
| Step 3 | 사용자 감지 실패·카메라 권한 거부·센서 오류 화면의 상세 시안 | 기존 오류/재시도 UI 보존 | 디자인팀 |
| 공통 | 정확한 컬러·타이포·원본 일러스트 에셋 | 기존 에셋 및 캡처 근사 구현, 원본 입수 시 대체 | 디자인팀 |
| 공통 | 기존 음성 버튼과 개발용 단계 pill 노출 정책 | 음성 기능은 유지, 개발용 pill은 숨김 | 디자인팀 |

## 5. 완료 기준 / 검증

- [ ] Step 1: 안내 일러스트·문구·버튼·상단 닫기 시안 반영, 다음으로 이동
- [ ] Step 2: 위/아래 기울기 안내와 이동하는 원, 정렬 완료 체크·배경·문구 표시, 기존 센서 기준에서 자동 진행
- [ ] Step 3: 전체화면 실카메라·인식 박스·안내·완료 화면 반영, 기존 MediaPipe 판정 연결 유지
- [ ] 실제 카메라가 필요한 화면에 정적 인물 사진을 대체 영상으로 고정하지 않음
- [ ] Step 3 인식 전/후 카메라 불필요 재시작 없음; 권한 거부·재시도 기존 경로 보존
- [ ] UI 수정 전후 타입 검사 및 관련 테스트 비교 (기존 `test-pose-pipeline` 실패 및 `@barofit/pose` 링크 관련 TypeScript 오류는 **기존 조사 상태**로 별도 구분)
- [ ] 태현님 온디바이스 변경과 통합 후 Development Build 실기기 검증 (디자인 확인과 실제 판정 정확도 검증 구분)
- [ ] 협의사항을 위 표에 갱신하고 이슈 #48에 남길 변경·검증 결과 정리

**범위 외:** F04 화면 변경, AI 분석 정확도 개선, 카메라 네이티브 모듈 재구현, 각도/인식 알고리즘의 수치 변경, 백엔드 재배포.
