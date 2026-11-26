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
