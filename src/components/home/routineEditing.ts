import type {
  RoutineDetail,
  RoutineExerciseDetail,
  RoutineSetDetail,
} from '@/types/routine';

export const MAX_PREVIEW_SETS = 5;
export const CATEGORY_LABELS: Record<string, string> = {
  FULL_BODY: '전신',
  UPPER_BODY: '상체',
  LOWER_BODY: '하체',
  CORE: '코어',
  BACK: '등',
  CARDIO: '유산소',
};
export function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function parseDuration(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return null;
  const [m, s] = text.split(':').map(Number);
  const total = m * 60 + s;
  return s < 60 && total >= 10 && total <= 3600 ? total : null;
}
export function editableRoutine(source: RoutineDetail): RoutineDetail {
  return {
    ...source,
    interExerciseRestSeconds: source.interExerciseRestSeconds ?? 60,
    exercises: source.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => ({
        ...s,
        timeLimitSeconds:
          e.measurementType === 'REPS' ? (s.timeLimitSeconds ?? 60) : null,
      })),
    })),
  };
}
export function moveExercise(
  routine: RoutineDetail,
  id: string,
  direction: number,
): RoutineDetail {
  const from = routine.exercises.findIndex((e) => e.id === id),
    to = from + direction;
  if (from < 0 || to < 0 || to >= routine.exercises.length) return routine;
  const exercises = [...routine.exercises];
  const [item] = exercises.splice(from, 1);
  exercises.splice(to, 0, item);
  return {
    ...routine,
    exercises: exercises.map((e, i) => ({ ...e, order: i + 1 })),
  };
}
export function withoutExercise(
  routine: RoutineDetail,
  id: string,
): RoutineDetail {
  if (routine.exercises.length <= 1) return routine;
  return {
    ...routine,
    exercises: routine.exercises
      .filter((e) => e.id !== id)
      .map((e, i) => ({ ...e, order: i + 1 })),
  };
}
export function summarizeExercise(e: RoutineExerciseDetail) {
  const values = e.sets.map((s) =>
    e.measurementType === 'REPS'
      ? (s.targetReps ?? 0)
      : (s.targetDurationSeconds ?? 0),
  );
  const min = Math.min(...values),
    max = Math.max(...values);
  return `${e.sets.length}세트 · ${min === max ? min : `${min}~${max}`}${e.measurementType === 'REPS' ? '회' : '초'}`;
}
export function cloneSet(
  last: RoutineSetDetail,
  index: number,
): RoutineSetDetail {
  return { ...last, id: `draft-${index}-${Date.now()}`, order: index + 1 };
}
/**
 * "종목 간 휴식" 스테퍼는 종목 사이 휴식(interExerciseRestSeconds)만 바꾸고 세트 사이 휴식
 * (각 세트의 restSeconds)은 그대로 둬서, 사용자가 이 하나의 컨트롤만 조정했을 때 실제 운동 중
 * 세트 사이 휴식은 기존 기본값(60초)으로 남아 설정한 값과 달라 보이는 문제가 있었다.
 * 이 스테퍼로 값을 바꿀 때는 모든 세트의 restSeconds도 같은 값으로 맞춰, 사용자가 본 하나의
 * 휴식시간 설정이 세션 전체(종목 간 + 세트 간)에 일관되게 반영되게 한다. 개별 종목의 세트 간
 * 휴식은 이후 ExerciseSetSheet에서 다시 따로 조정할 수 있다.
 */
export function withInterExerciseRestSeconds(
  routine: RoutineDetail,
  seconds: number,
): RoutineDetail {
  return {
    ...routine,
    interExerciseRestSeconds: seconds,
    exercises: routine.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => ({ ...s, restSeconds: seconds })),
    })),
  };
}
