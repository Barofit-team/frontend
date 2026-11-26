/**
 * 앱을 나갔다가(중도 종료·앱 재실행) 같은 세션을 이어할 때의 진행 위치. 화면과 무관한 순수 로직이다.
 *
 * 기준: 세션에 저장된 완료 세트(session.sets)가 진실이다. 운동 흐름은 세트를 순서대로 완료하므로
 * 아직 기록이 없는 첫 계획 세트가 이어할 세트다.
 *  - 그 세트를 운동하던 중이었으면 세트를 처음부터: 타이머 전체 시간, 측정값 없음(새 Controller·분석기는 화면이 만든다)
 *  - 그 세트 직전 휴식·시작 카운트다운 중이었으면 남은 시간을 그대로 이어간다(측정 없는 단계)
 *  - 저장 위치가 완료 기록과 맞지 않으면(예: 세트 결과 저장 직후 다음 단계 checkpoint 전에 종료) 이어할 세트의 시작 카운트다운부터
 * 화면 안의 수동·자동 일시정지와 재개는 이 함수를 쓰지 않는다(Controller 진행량 유지).
 */
import type { WorkoutDraft } from '@/stores/useWorkoutDraftStore';
import type { WorkoutSessionSync } from '@/services/workoutSessionService';

import type { RoutineItem } from './sessionConfig';
import { phaseDurationSeconds, type SessionPhase } from './sessionFlow';

/** 세션 snapshot → 운동 흐름(sessionFlow)이 쓰는 종목 목록. 화면의 activeRoutine과 같은 구성 */
export function routineItemsOf(snapshot: WorkoutSessionSync['routineSnapshot']): RoutineItem[] {
  return snapshot.exercises.map(exercise => ({
    exerciseId: exercise.exerciseId,
    sets: exercise.sets.length,
    interExerciseRestSeconds: snapshot.interExerciseRestSeconds,
    targets: exercise.sets,
  }));
}

/** 완료 기록이 없는 첫 계획 세트. 모두 완료했으면 null */
export function firstUnfinishedSet(session: WorkoutSessionSync): { exerciseIndex: number; set: number } | null {
  const done = new Set(session.sets.map(set => set.routineSetId));
  for (let exerciseIndex = 0; exerciseIndex < session.routineSnapshot.exercises.length; exerciseIndex++) {
    const sets = session.routineSnapshot.exercises[exerciseIndex].sets;
    for (let index = 0; index < sets.length; index++) {
      if (!done.has(sets[index].id)) return { exerciseIndex, set: index + 1 };
    }
  }
  return null;
}

/** 이어하기 위치. 모두 완료한 세션이거나 계산할 수 없으면 저장 위치를 그대로 돌려준다 */
export function restoredPosition(draft: WorkoutDraft, session: WorkoutSessionSync): WorkoutDraft {
  const next = firstUnfinishedSet(session);
  if (!next) return draft;
  const exercise = session.routineSnapshot.exercises[next.exerciseIndex];
  const routine = routineItemsOf(session.routineSnapshot);
  const full = (phase: SessionPhase) => phaseDurationSeconds(phase, routine) ?? 0;
  const keep = (phase: SessionPhase) => Math.max(0, Math.min(draft.remainingSeconds, full(phase)));
  const sameExercise = draft.exerciseIndex === next.exerciseIndex;

  let phase: WorkoutDraft['phase'];
  let set: number;
  let remainingSeconds: number;
  if (draft.phase === 'resting' && sameExercise && draft.set === next.set - 1) {
    phase = 'resting'; set = draft.set;
    remainingSeconds = keep({ id: 0, kind: 'resting', exerciseIndex: next.exerciseIndex, completedSet: draft.set });
  } else if (draft.phase === 'countdown' && sameExercise && draft.set === next.set) {
    phase = 'countdown'; set = next.set;
    remainingSeconds = keep({ id: 0, kind: 'countdown', exerciseIndex: next.exerciseIndex, set: next.set });
  } else if (draft.phase === 'exercising' && sameExercise && draft.set === next.set) {
    phase = 'exercising'; set = next.set;
    remainingSeconds = full({ id: 0, kind: 'exercising', exerciseIndex: next.exerciseIndex, set: next.set });
  } else {
    phase = 'countdown'; set = next.set;
    remainingSeconds = full({ id: 0, kind: 'countdown', exerciseIndex: next.exerciseIndex, set: next.set });
  }
  const targetSet = exercise.sets[(phase === 'resting' ? set + 1 : set) - 1];
  return {
    ...draft,
    exerciseIndex: next.exerciseIndex,
    totalExercises: session.routineSnapshot.exercises.length,
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.name,
    phase,
    set,
    totalSets: exercise.sets.length,
    reps: null,
    targetReps: targetSet?.targetReps ?? 0,
    remainingSeconds,
  };
}
