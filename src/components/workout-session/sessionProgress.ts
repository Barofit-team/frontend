/**
 * 운동 진행 화면 표시용 순수 계산. 단계 전환 규칙(sessionFlow)은 읽기만 하며 바꾸지 않습니다.
 */
import type { WorkoutSessionSync } from '@/services/workoutSessionService';

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

/**
 * 09: 일시정지 화면 '오늘의 운동 루틴' 수치. 진행 중인 세션의 routineSnapshot과 실제 완료 기록(session.sets)만 쓴다
 * (최신 Routine 응답·화면 위치로 추정하지 않음). 종목 목표는 첫 세트 목표(오늘의 루틴 화면과 같은 기준).
 */
export function routineSummaryOf(
  session: Pick<WorkoutSessionSync, 'routineSnapshot' | 'sets'>,
  currentExerciseIndex: number,
) {
  const done = new Set(session.sets.map(set => set.routineSetId));
  let completedSets = 0;
  let totalSets = 0;
  const exercises = session.routineSnapshot.exercises.map((exercise, index) => {
    const finished = exercise.sets.filter(set => done.has(set.id)).length;
    completedSets += finished;
    totalSets += exercise.sets.length;
    const first = exercise.sets[0];
    const goal = exercise.measurementType === 'DURATION'
      ? `${first?.targetDurationSeconds ?? 0}초` : `${first?.targetReps ?? 0}회`;
    const status = exercise.sets.length > 0 && finished === exercise.sets.length ? ' · 완료'
      : finished > 0 ? ` · ${finished}/${exercise.sets.length}세트 완료` : '';
    return {
      key: `${exercise.id}-${index}`,
      name: exercise.name,
      detail: `${exercise.sets.length}세트 · ${goal}${status}`,
      current: index === currentExerciseIndex,
    };
  });
  return { completedSets, totalSets, exercises };
}

/**
 * 09: 세트 최초 신체 인식 대기 중 안내 문구. 판정은 Controller(recognition.reasonCode)가 하고, 문구는 @barofit/pose
 * CameraReadiness의 사유별 안내(runtime/common/readiness.js)와 같은 뜻으로 둔다(운동별 필요 관절 조건과 모순되지 않도록 사유만 안내).
 * 안정화 확인(STABILIZING)·인식 완료(null)는 짧은 확인 과정이라 안내하지 않는다.
 */
export function recognitionGuideText(reasonCode: string | null | undefined): string | null {
  switch (reasonCode) {
    case null:
    case undefined:
    case 'STABILIZING':
      return null;
    case 'NO_PERSON':
      return '카메라에 전신이 나오도록\n위치해 주세요';
    case 'BODY_OUT_OF_FRAME':
      return '필요한 관절이 화면 안에\n들어오도록 조정해 주세요';
    case 'CAMERA_FRAME_TIMEOUT':
      return '카메라 화면을\n확인하고 있어요';
    default:
      return '가려진 관절이 보이도록\n위치를 조정해 주세요';
  }
}
