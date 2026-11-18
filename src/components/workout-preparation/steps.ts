/**
 * 운동 준비(Workout Flow) 단계 정의.
 * Place device → Adjust Angle → User Position → User Position Complete (→ Exercise)
 */

export type PreparationStep =
  | 'place-device'
  | 'adjust-angle-1'
  | 'user-position'
  | 'user-position-complete';

export const PREPARATION_STEPS: readonly PreparationStep[] = [
  'place-device',
  'adjust-angle-1',
  'user-position',
  'user-position-complete',
];

export function isPreparationStep(value: unknown): value is PreparationStep {
  return typeof value === 'string' && (PREPARATION_STEPS as readonly string[]).includes(value);
}

export function isAdjustAngleStep(step: PreparationStep) {
  return step === 'adjust-angle-1';
}

export function stepIndex(step: PreparationStep) {
  return PREPARATION_STEPS.indexOf(step);
}

export function getAdjacentStep(step: PreparationStep, offset: 1 | -1): PreparationStep | null {
  return PREPARATION_STEPS[stepIndex(step) + offset] ?? null;
}
