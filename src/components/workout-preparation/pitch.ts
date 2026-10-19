/**
 * 앞뒤 설치 각도(Pitch) 계산 · 상태 판정 (순수 함수, UI/센서와 분리).
 *
 * 근거 (expo-sensors 57.0.3 네이티브 소스):
 *  - iOS  DeviceMotionModule.swift: accelerationIncludingGravity = (userAcceleration + CMDeviceMotion.gravity) × 9.80665
 *    → 기기 좌표계(X 오른쪽, Y 화면 위쪽, Z 화면 앞쪽)에서 "땅 방향"을 가리키는 벡터.
 *      바닥에 화면 위로 눕히면 z ≈ -9.8, 세로로 세우면 y ≈ -9.8.
 *  - Android DeviceMotionModule.kt: accelerometer - 2×gravity → iOS와 같은 부호 규약으로 맞춰 전달.
 *  - rotation.beta: iOS = CMAttitude.pitch(라디안, -π/2~π/2), Android = -getOrientation()[1](라디안).
 *    세로 직립(90°) 근처에서 오일러각 특성상 불안정해 진단용 참고값으로만 표시.
 *
 * 설치 각도 = 기기 Y-Z 평면에서 본 중력 방향 = atan2(-gy, -gz)
 *   0° 화면 위로 눕힘 / 90° 세로 직립 / 90° 초과 = 위쪽이 앞으로 넘어감 / 180° 화면 아래로 눕힘
 * X 성분(좌우 Roll)은 사용하지 않으므로 좌우 기울기와 분리됩니다.
 *
 * ⚠️ 위 부호 규약은 소스 코드 기준이며, 실제 iPhone에서 진단값으로 확인해야 합니다.
 */
import { ANGLE_CONFIG } from './angleConfig';

export type Vector3 = { x: number; y: number; z: number };

export type AngleStatus =
  'initializing' | 'needs-more-upright' | 'needs-more-reclined' | 'aligned' | 'no-target' | 'unavailable';

export type PitchSample = {
  /** 설치 각도(°). valid=false면 NaN */
  pitchDeg: number;
  /** 중력 벡터 크기(×g) */
  magnitudeG: number;
  valid: boolean;
};

const G = 9.80665;
const RAD_TO_DEG = 180 / Math.PI;

export function pitchFromGravity(v: Vector3 | null | undefined, cfg = ANGLE_CONFIG): PitchSample {
  if (!v || ![v.x, v.y, v.z].every(Number.isFinite)) return { pitchDeg: NaN, magnitudeG: NaN, valid: false };
  const magnitudeG = Math.hypot(v.x, v.y, v.z) / G;
  const valid = magnitudeG >= cfg.gravityValidMin && magnitudeG <= cfg.gravityValidMax;
  return { pitchDeg: valid ? Math.atan2(-v.y, -v.z) * RAD_TO_DEG : NaN, magnitudeG, valid };
}

export function radToDeg(rad: number) {
  return rad * RAD_TO_DEG;
}

/** 시간 간격을 반영한 지수 스무딩 */
export function smoothAngle(
  prev: number | null,
  next: number,
  dtMs: number,
  tauMs = ANGLE_CONFIG.smoothingTauMs
) {
  if (prev === null || !Number.isFinite(prev)) return next;
  const a = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  return prev + a * (next - prev);
}

/**
 * 오차(현재 - 목표)로 상태 판정. 완료 상태에서는 tolerance + hysteresis를 넘어야 해제.
 * 현재 < 목표 → 더 눕혀진 상태 → "더 세워주세요"
 * 현재 > 목표 → 더 세워진 상태 → "더 눕혀주세요"
 */
export function nextAngleStatus(prev: AngleStatus, errorDeg: number, cfg = ANGLE_CONFIG): AngleStatus {
  if (!Number.isFinite(errorDeg)) return prev;
  const limit = prev === 'aligned' ? cfg.toleranceDeg + cfg.hysteresisDeg : cfg.toleranceDeg;
  if (Math.abs(errorDeg) <= limit) return 'aligned';
  return errorDeg < 0 ? 'needs-more-upright' : 'needs-more-reclined';
}

/**
 * 인디케이터 세로 위치(-1 ~ 1). 음수 = 기준선 위(더 세워야 함), 양수 = 아래(더 눕혀야 함).
 * 와이어프레임: "세워주세요" 상태에서 원이 점선 위, "눕혀주세요" 상태에서 아래.
 */
export function indicatorRatio(errorDeg: number, cfg = ANGLE_CONFIG) {
  if (!Number.isFinite(errorDeg)) return 0;
  return Math.max(-1, Math.min(1, errorDeg / cfg.maxIndicatorErrorDeg));
}
