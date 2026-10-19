import type { CreateRoutine, Goal, RoutineDetail, UpdateRoutine } from '../types/routine';
export type Draft = Record<string, { sets: string; target: string }>;
export function initialDraft(routine: RoutineDetail): Draft {
  return Object.fromEntries(routine.exercises.map(e => [e.id, {
    sets: String(e.sets.length),
    target: String((e.measurementType === 'REPS' ? e.sets[0]?.targetReps : e.sets[0]?.targetDurationSeconds) ?? ''),
  }]));
}
function integer(value: string, max: number, label: string): number {
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max)
    throw new Error(`${label}: 1~${max} 사이의 정수를 입력해 주세요.`);
  return Number(value);
}
function goals(routine: RoutineDetail, draft: Draft): (Goal & { id: string })[] {
  return routine.exercises.map(e => {
    const row = draft[e.id];
    if (!row) throw new Error('운동 설정을 다시 불러와 주세요.');
    return { id: e.id, setCount: integer(row.sets, 20, `${e.name} 세트 수`),
      [e.measurementType === 'REPS' ? 'targetReps' : 'targetDurationSeconds']:
        integer(row.target, 2147483647, `${e.name} 목표`) };
  });
}
export function createPayload(routine: RoutineDetail, draft: Draft): CreateRoutine {
  return { templateId: routine.id, exercises: goals(routine, draft).map(({ id, ...goal }) => ({ templateExerciseId: id, ...goal })) };
}
export function updatePayload(routine: RoutineDetail, draft: Draft): UpdateRoutine {
  return { exercises: goals(routine, draft).map(({ id, ...goal }) => ({ routineExerciseId: id, ...goal })) };
}
