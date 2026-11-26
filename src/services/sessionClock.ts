/**
 * 운동 세션 Controller(@barofit/pose ExerciseSessionController)의 시간축.
 *
 * 네이티브 카메라 timestampMs는 캡처 시점의 wall clock이고 추론·브리지 지연 뒤에 JS로 도착한다.
 * 그 값을 그대로 쓰면서 watchdog을 현재 시각으로 돌리면 "마지막 watchdog보다 과거인 프레임"이 버려진다.
 * Pose 문서(POSE_SESSION_RECOVERY)의 실시간 예제처럼 프레임 콜백 처리 시점과 watchdog 시점을
 * 같은 단조 증가 밀리초 시계 하나로 찍는다. 보정값을 더하거나 빼지 않는다.
 */
export function sessionNow(): number {
  return performance.now();
}

/** Controller tick 주기(Pose 문서: 약 100ms) */
export const SESSION_WATCHDOG_MS = 100;
