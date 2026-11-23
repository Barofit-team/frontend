/**
 * 운동 진행 화면 표시용 순수 계산. 단계 전환 규칙(sessionFlow)은 읽기만 하며 바꾸지 않습니다.
 */
import type { RoutineItem } from './sessionConfig';
import { nextPhase, phaseDurationSeconds, type ActivePhase } from './sessionFlow';

/** 60 → "01:00", 57 → "00:57" */
export function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 전체 세트 수와 지금까지 끝낸 세트 수 */
export function countSets(phase: ActivePhase, routine: readonly RoutineItem[]) {
  const total = routine.reduce((sum, item) => sum + Math.max(0, item.sets), 0);
  const before = routine.slice(0, phase.exerciseIndex).reduce((sum, item) => sum + Math.max(0, item.sets), 0);
  const inExercise = phase.kind === 'resting' ? phase.completedSet : phase.set - 1;
  return { completed: Math.min(total, before + Math.max(0, inExercise)), total };
}

/** 현재 단계의 남은 시간 + 이후 단계들의 계획 시간(초). 실제 운동 시간과 다를 수 있는 추정치입니다 */
export function estimateRemainingSeconds(
  phase: ActivePhase,
  remainingSeconds: number,
  routine: readonly RoutineItem[],
) {
  let total = Math.max(0, remainingSeconds);
  let next = nextPhase(phase, routine);
  for (let guard = 0; next.kind !== 'completed' && guard < 1000; guard++) {
    total += phaseDurationSeconds(next, routine) ?? 0;
    next = nextPhase(next, routine);
  }
  return total;
}
