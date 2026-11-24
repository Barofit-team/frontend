/**
 * AI 모듈 출력 → 자동 일시정지용 추적 신호 변환 (F04 자동 일시정지 1단계)
 *
 * 세 가지 축을 분리한다.
 * - user: 사용자 추적 상태 (present / lost / unknown)
 * - camera: 카메라 프레임 가용성 (available / no_frames)
 * - analyzer: 이 운동의 AI 분석기 지원 여부 (supported / unsupported)
 *
 * 프레임이 없다는 사실, 분석기가 없다는 사실만으로 user를 lost로 만들지 않는다.
 * 화면·타이머·React Native에 의존하지 않는다.
 */

export type UserTracking = 'present' | 'lost' | 'unknown';
export type CameraAvailability = 'available' | 'no_frames';
export type AnalyzerSupport = 'supported' | 'unsupported';

export interface TrackingSignal {
  user: UserTracking;
  camera: CameraAvailability;
  analyzer: AnalyzerSupport;
}

/** AI 프레임 결과에서 사용자 추적 상태를 읽는 함수. AI팀 계약이 확정되면 이 함수만 교체한다. */
export type UserTrackingInterpreter = (frameResult: unknown) => UserTracking;

/**
 * 기본 해석기: 항상 'unknown'.
 *
 * TODO(AI팀 계약): 운동 중 이탈/재인식 전용 신호가 barofit-pose에 추가되면 여기서 읽는다.
 * 현재 barofit-pose main(019d9e9)의 realtime v2 `tracking` 필드
 * ('tracking' | 'selecting_side' | 'tracking_unavailable')는 이탈 판정용 계약이 아니다
 * (docs/realtime-contract-v2.md: "정상 자세나 전 항목 평가 가능을 뜻하지 않음").
 * 따라서 이 값을 lost/present로 간주하지 않는다.
 */
export const unconfirmedUserTracking: UserTrackingInterpreter = () => 'unknown';

/**
 * 자동 일시정지 중 프레임에서 사용자 추적 상태를 읽는 함수.
 * 일시정지 중에는 운동 분석기(횟수·유지시간 누적)를 돌리지 않으므로 분석기 결과가 아닌 원본 프레임을 받는다.
 *
 * TODO(AI팀 계약): 일시정지 중 재인식을 무엇으로 판단할지(별도 존재 감지 API, CameraReadiness 계열 등) 미확정.
 * 확정 전 기본값은 'unknown' — 실제 앱에서는 자동 복귀가 일어나지 않는다.
 */
export type PausedFrameInterpreter = (frame: unknown) => UserTracking;
export const unconfirmedPausedFrameTracking: PausedFrameInterpreter = () => 'unknown';

export interface TrackingSignalAdapter {
  /** 분석기가 결과 프레임을 냈을 때 */
  fromFrameResult(frameResult: unknown): TrackingSignal;
  /** 자동 일시정지 중 원본 프레임 (분석기 미실행) */
  fromPausedFrame(frame: unknown): TrackingSignal;
  /** 일정 시간 카메라 프레임이 들어오지 않았을 때 (판단 시간 기준은 호출 측 책임) */
  noFrames(): TrackingSignal;
}

export function createTrackingSignalAdapter(options: {
  analyzerSupported: boolean;
  interpretUser?: UserTrackingInterpreter;
  interpretPausedFrame?: PausedFrameInterpreter;
}): TrackingSignalAdapter {
  const analyzer: AnalyzerSupport = options.analyzerSupported ? 'supported' : 'unsupported';
  const interpret = options.interpretUser ?? unconfirmedUserTracking;
  const interpretPaused = options.interpretPausedFrame ?? unconfirmedPausedFrameTracking;
  return {
    fromFrameResult(frameResult) {
      // 분석기가 없으면 사용자 상태를 해석하지 않는다.
      const user: UserTracking = analyzer === 'supported' ? interpret(frameResult) : 'unknown';
      return { user, camera: 'available', analyzer };
    },
    fromPausedFrame(frame) {
      const user: UserTracking = analyzer === 'supported' ? interpretPaused(frame) : 'unknown';
      return { user, camera: 'available', analyzer };
    },
    noFrames() {
      return { user: 'unknown', camera: 'no_frames', analyzer };
    },
  };
}
