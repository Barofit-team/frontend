import { apiFetch } from '@/services/api';
import type { RoutineDetail, WorkoutPlanDay } from '@/types/routine';

export function getWorkoutPlanDate(date: string) {
  return apiFetch<WorkoutPlanDay>(
    `/api/v1/workout-plans/${encodeURIComponent(date)}`,
    { auth: true },
  );
}
/** 선택한 날짜용 복사본을 저장한다. 원본·다른 날짜는 보존한다. */
export function saveDailyRoutine(
  date: string,
  source: RoutineDetail,
  draft: RoutineDetail,
  expectedRoutineId: string | null,
) {
  return apiFetch<WorkoutPlanDay>(
    `/api/v1/workout-plans/${encodeURIComponent(date)}/customization`,
    {
      method: 'PUT',
      auth: true,
      body: JSON.stringify({
        sourceRoutineId: source.id,
        sourceUpdatedAt: source.updatedAt,
        expectedRoutineId,
        interExerciseRestSeconds: draft.interExerciseRestSeconds ?? 60,
        exercises: draft.exercises.map((e) => ({
          sourceRoutineExerciseId: e.id,
          sets: e.sets.map((s) => ({
            targetReps: e.measurementType === 'REPS' ? s.targetReps : null,
            targetDurationSeconds:
              e.measurementType === 'DURATION' ? s.targetDurationSeconds : null,
            timeLimitSeconds:
              e.measurementType === 'REPS' ? (s.timeLimitSeconds ?? 60) : null,
            weightKg: s.weightKg,
            restSeconds: s.restSeconds,
          })),
        })),
      }),
    },
  );
}
