/**
 * 운동 준비(Workout Flow) 단계 정의.
 * Place device → Adjust Angle → User Position (→ Exercise는 별도 구현 예정)
 *
 * 현재는 UI 확인용으로 단계를 수동 전환합니다.
 * 각도 센서 / 카메라 / 자세 인식 연결 시에는 화면 컴포넌트는 그대로 두고
 * 단계를 결정하는 쪽(app/workout-preparation.tsx의 step 상태)만 교체하면 됩니다.
 */

export type PreparationStep =
  | 'place-device'
  | 'adjust-angle-1'
  | 'adjust-angle-2'
  | 'adjust-angle-3'
  | 'user-position'
  | 'user-position-complete';

export const PREPARATION_STEPS: readonly PreparationStep[] = [
  'place-device',
  'adjust-angle-1',
  'adjust-angle-2',
  'adjust-angle-3',
  'user-position',
  'user-position-complete',
];

/** 개발용 단계 표시 이름 */
export const PREPARATION_STEP_LABELS: Record<PreparationStep, string> = {
  'place-device': 'Place device',
  'adjust-angle-1': 'Adjust Angle 1',
  'adjust-angle-2': 'Adjust Angle 2',
  'adjust-angle-3': 'Adjust Angle 3',
  'user-position': 'User Position',
  'user-position-complete': 'User Position 완료',
};

export function isPreparationStep(value: unknown): value is PreparationStep {
  return typeof value === 'string' && (PREPARATION_STEPS as readonly string[]).includes(value);
}

/**
 * 화면 확인 모드
 *  - sensor : 실제 기울기 센서로 Adjust Angle 상태가 바뀜 (Adjust Angle 1~3은 하나의 단계)
 *  - manual : [개발용] 센서 없이 6개 화면을 순서대로 확인
 */
export type PreparationMode = 'sensor' | 'manual';

/** 센서 모드의 단계 순서. Adjust Angle은 'adjust-angle-1' 하나로 진입하고 상태는 센서가 결정 */
export const SENSOR_MODE_STEPS: readonly PreparationStep[] = [
  'place-device',
  'adjust-angle-1',
  'user-position',
  'user-position-complete',
];

export function isAdjustAngleStep(step: PreparationStep) {
  return step === 'adjust-angle-1' || step === 'adjust-angle-2' || step === 'adjust-angle-3';
}

export function stepsForMode(mode: PreparationMode): readonly PreparationStep[] {
  return mode === 'sensor' ? SENSOR_MODE_STEPS : PREPARATION_STEPS;
}

/** 모드별 순서에서의 위치. 센서 모드에서 adjust-angle-2·3은 adjust-angle-1과 같은 단계로 취급 */
export function stepIndex(step: PreparationStep, mode: PreparationMode = 'manual') {
  const normalized = mode === 'sensor' && isAdjustAngleStep(step) ? 'adjust-angle-1' : step;
  return stepsForMode(mode).indexOf(normalized);
}

export function getAdjacentStep(
  step: PreparationStep,
  offset: 1 | -1,
  mode: PreparationMode = 'manual'
): PreparationStep | null {
  const steps = stepsForMode(mode);
  return steps[stepIndex(step, mode) + offset] ?? null;
}
