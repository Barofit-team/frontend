/**
 * 운동 중 세트 수정(횟수·시간·휴식)의 순수 로직. 화면·저장과 분리되어 단위 테스트합니다.
 *
 * 규칙
 *  - 수정은 초안(draft)에서만 하고, 저장 시 applyEditToRoutine으로 새 루틴을 만듭니다(원본 불변).
 *  - 이미 끝난 세트와 진행 중인 세트는 잠금(locked) → 값이 바뀌지 않습니다.
 *  - 휴식 시간은 잠기지 않은 세트에만 적용합니다.
 *  - 모든 값은 EDIT_LIMITS 범위로 보정합니다.
 */
import { EXERCISE_DURATION_SECONDS, REST_DURATION_SECONDS, type RoutineItem } from './sessionConfig';
import type { ActivePhase } from './sessionFlow';

export const EDIT_LIMITS = {
  repsMin: 1,
  repsMax: 100,
  repsStep: 1,
  repsBigStep: 5,
  secondsMin: 10,
  secondsMax: 600,
  secondsStep: 10,
  restMin: 5,
  restMax: 300,
  restStep: 10,
} as const;

export type MeasurementType = 'REPS' | 'DURATION';
export type EditField = 'reps' | 'seconds';

export type EditableSet = {
  /** 횟수 운동의 목표 횟수. 시간 운동은 null */
  reps: number | null;
  /** 세트 운동 시간(초) */
  seconds: number;
  locked: boolean;
};

export type ExerciseEditDraft = {
  exerciseIndex: number;
  measurementType: MeasurementType;
  sets: EditableSet[];
  restSeconds: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampReps(value: number) {
  return clamp(value, EDIT_LIMITS.repsMin, EDIT_LIMITS.repsMax);
}
export function clampSeconds(value: number) {
  return clamp(value, EDIT_LIMITS.secondsMin, EDIT_LIMITS.secondsMax);
}
export function clampRest(value: number) {
  return clamp(value, EDIT_LIMITS.restMin, EDIT_LIMITS.restMax);
}

/**
 * 해당 종목에서 수정할 수 없는 세트 수(앞에서부터).
 *  - 지난 종목: 전부 / 다음 종목: 0
 *  - 현재 종목: 시작 전 카운트다운 = 끝난 세트만, 운동 중 = 진행 중 세트까지, 휴식 = 끝난 세트까지
 */
export function lockedSetCount(phase: ActivePhase, exerciseIndex: number, totalSets: number) {
  if (exerciseIndex < phase.exerciseIndex) return totalSets;
  if (exerciseIndex > phase.exerciseIndex) return 0;
  const locked = phase.kind === 'countdown' ? phase.set - 1 : phase.kind === 'exercising' ? phase.set : phase.completedSet;
  return Math.min(totalSets, Math.max(0, locked));
}

export function createEditDraft(
  item: RoutineItem,
  exerciseIndex: number,
  measurementType: MeasurementType,
  locked: number,
  fallbackReps: number,
): ExerciseEditDraft {
  const sets: EditableSet[] = Array.from({ length: Math.max(0, item.sets) }, (_, i) => {
    const target = item.targets?.[i];
    return {
      reps: measurementType === 'REPS' ? clampReps(target?.targetReps ?? fallbackReps) : null,
      seconds: clampSeconds(target?.timeLimitSeconds ?? target?.targetDurationSeconds ?? EXERCISE_DURATION_SECONDS),
      locked: i < locked,
    };
  });
  const firstOpen = Math.min(Math.max(0, locked), Math.max(0, sets.length - 1));
  const rest = item.targets?.[firstOpen]?.restSeconds ?? item.targets?.at(-1)?.restSeconds ?? REST_DURATION_SECONDS;
  return { exerciseIndex, measurementType, sets, restSeconds: clampRest(rest) };
}

function updateSet(draft: ExerciseEditDraft, index: number, change: (set: EditableSet) => EditableSet) {
  const set = draft.sets[index];
  if (!set || set.locked) return draft;
  const sets = draft.sets.slice();
  sets[index] = change(set);
  return { ...draft, sets };
}

/** 세트 값 직접 지정 (범위 보정). 잠긴 세트·시간 운동의 횟수는 무시 */
export function setSetValue(draft: ExerciseEditDraft, index: number, field: EditField, value: number) {
  if (field === 'reps' && draft.measurementType !== 'REPS') return draft;
  return updateSet(draft, index, set =>
    field === 'reps' ? { ...set, reps: clampReps(value) } : { ...set, seconds: clampSeconds(value) },
  );
}

/** 세트 값 증감 */
export function adjustSet(draft: ExerciseEditDraft, index: number, field: EditField, delta: number) {
  const set = draft.sets[index];
  if (!set) return draft;
  const current = field === 'reps' ? (set.reps ?? EDIT_LIMITS.repsMin) : set.seconds;
  return setSetValue(draft, index, field, current + delta);
}

export function adjustRest(draft: ExerciseEditDraft, delta: number) {
  if (draft.sets.length > 0 && draft.sets.every(set => set.locked)) return draft;
  return { ...draft, restSeconds: clampRest(draft.restSeconds + delta) };
}

/** 키패드 입력 버퍼 → 값. 'seconds'는 마지막 두 자리를 초로 읽음(예: '130' → 90초) */
export function bufferToValue(buffer: string, field: EditField) {
  const digits = buffer.replace(/\D/g, '');
  if (!digits) return null;
  if (field === 'reps') return Number(digits);
  const seconds = Number(digits.slice(-2));
  const minutes = digits.length > 2 ? Number(digits.slice(0, -2)) : 0;
  return minutes * 60 + seconds;
}

/** 키패드 한 번 입력. 너무 긴 입력은 막습니다(횟수 3자리, 시간 4자리) */
export function pressKey(buffer: string, key: string, field: EditField) {
  if (key === 'back') return buffer.slice(0, -1);
  if (!/^\d$/.test(key)) return buffer;
  const max = field === 'reps' ? 3 : 4;
  const next = (buffer === '0' ? '' : buffer) + key;
  return next.length > max ? buffer : next;
}

export function isDraftChanged(original: ExerciseEditDraft, draft: ExerciseEditDraft) {
  return (
    original.restSeconds !== draft.restSeconds ||
    original.sets.some((set, i) => set.reps !== draft.sets[i]?.reps || set.seconds !== draft.sets[i]?.seconds)
  );
}

/** 저장: 잠기지 않은 세트의 목표·시간·휴식만 바꾼 새 루틴을 돌려줍니다 */
export function applyEditToRoutine(routine: readonly RoutineItem[], draft: ExerciseEditDraft): RoutineItem[] {
  return routine.map((item, index) => {
    if (index !== draft.exerciseIndex) return item;
    const targets = Array.from({ length: Math.max(0, item.sets) }, (_, i) => {
      const prev = item.targets?.[i];
      const set = draft.sets[i];
      const base = {
        targetDurationSeconds: prev?.targetDurationSeconds ?? null,
        restSeconds: prev?.restSeconds ?? REST_DURATION_SECONDS,
        targetReps: prev?.targetReps ?? null,
        ...(prev?.timeLimitSeconds != null ? { timeLimitSeconds: prev.timeLimitSeconds } : {}),
      };
      if (!set || set.locked) return base;
      return {
        ...base,
        ...(draft.measurementType === 'REPS' && prev?.timeLimitSeconds != null
          ? { timeLimitSeconds: set.seconds }
          : { targetDurationSeconds: set.seconds }),
        restSeconds: draft.restSeconds,
        targetReps: draft.measurementType === 'REPS' ? set.reps : base.targetReps,
      };
    });
    return { ...item, targets };
  });
}

/** 종목 목록 표시용: '3세트 · 20개' (세트별 값이 다르면 '18~20개') */
export function describeTargets(item: RoutineItem, measurementType: MeasurementType, fallback: number) {
  const values = Array.from({ length: Math.max(0, item.sets) }, (_, i) => {
    const target = item.targets?.[i];
    return measurementType === 'REPS' ? (target?.targetReps ?? fallback) : (target?.targetDurationSeconds ?? fallback);
  });
  const min = values.length ? Math.min(...values) : fallback;
  const max = values.length ? Math.max(...values) : fallback;
  const unit = measurementType === 'REPS' ? '개' : '초';
  return `${item.sets}세트 · ${min === max ? min : `${min}~${max}`}${unit}`;
}
