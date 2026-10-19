/**
 * Adjust Angle 기울기 판정 설정값.
 *
 * ⚠️ 아래 값은 모두 "기술 검증용 임시값"입니다. 실제 운동 촬영에 적합한 설치 각도와
 *    허용 오차는 아직 확정되지 않았습니다(AI팀·실기기 촬영 테스트로 결정 필요).
 *    서비스 기준으로 사용하지 마세요.
 */
export const ANGLE_CONFIG = {
  /**
   * 목표 설치 각도(°). 0 = 바닥에 화면이 위로 눕힌 상태, 90 = 세로로 똑바로 세운 상태.
   * null = 미확정. 개발 모드에서 "현재 각도를 목표로"로 임시 지정합니다.
   */
  defaultTargetDeg: null as number | null,
  /** 완료로 판정하는 허용 오차(±°) — 임시 */
  toleranceDeg: 2,
  /** 완료 상태 해제 시 추가 여유(°). 경계에서 깜빡임 방지 (해제 기준 = tolerance + hysteresis) */
  hysteresisDeg: 1,
  /** 완료 상태가 이 시간(ms) 동안 유지되면 다음 단계로 이동 가능 */
  holdMs: 1500,
  /** 인디케이터가 최대로 이동하는 오차(°). 이 이상은 끝에 고정 */
  maxIndicatorErrorDeg: 15,
  /** 센서 업데이트 간격(ms). 약 16Hz — 카메라 프리뷰가 없어 60Hz 불필요 */
  updateIntervalMs: 60,
  /** 각도 스무딩 시간상수(ms). 클수록 부드럽지만 반응이 늦음 */
  smoothingTauMs: 150,
  /** 중력 벡터 크기 유효 범위(×g). 벗어나면 흔들림 중으로 보고 해당 샘플 무시 */
  gravityValidMin: 0.7,
  gravityValidMax: 1.3,
  /** 구독 후 이 시간(ms) 동안 데이터가 없으면 센서 사용 불가로 처리 */
  noDataTimeoutMs: 2000,
} as const;
