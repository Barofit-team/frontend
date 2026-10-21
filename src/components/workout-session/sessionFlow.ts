/**
 * 운동 진행 단계(Phase) 정의와 전환 규칙. 화면과 무관한 순수 로직입니다.
 *
 *   [종목 1] 시작 카운트다운(10초) → 운동(60초) → 휴식(30초) → 시작 카운트다운(10초) → 운동 → …
 *   [종목 2] 다음 종목 안내 카운트다운(30초, 디자인 "세션 2 / 푸쉬업 / 30") → 운동 → 휴식 → …
 *   마지막 종목의 마지막 세트 운동이 끝나면 completed (결과 화면은 이후 단계)
 *
 * 모든 Phase는 고유 id를 가집니다. 타이머 완료 시 "어느 Phase가 끝났는지"를 id로 전달하고,
 * 현재 Phase와 id가 다르면 무시해 중복 완료·지난 타이머의 늦은 호출을 막습니다.
 */
import {
  EXERCISE_DURATION_SECONDS,
  REST_DURATION_SECONDS,
  START_COUNTDOWN_SECONDS,
  type RoutineItem,
} from './sessionConfig';

/** exerciseIndex: 루틴 안의 종목 순서(0부터), set: 종목 안의 세트 번호(1부터) */
export type SessionPhase =
  | { id: number; kind: 'countdown'; exerciseIndex: number; set: number }
  | { id: number; kind: 'exercising'; exerciseIndex: number; set: number }
  | { id: number; kind: 'resting'; exerciseIndex: number; completedSet: number }
  | { id: number; kind: 'completed' };

export type ActivePhase = Exclude<SessionPhase, { kind: 'completed' }>;

export const INITIAL_PHASE: SessionPhase = { id: 0, kind: 'countdown', exerciseIndex: 0, set: 1 };

/** 두 번째 종목부터의 첫 세트 시작 카운트다운 = 종목 간 휴식 겸 안내 */
function isNextExerciseIntro(phase: ActivePhase) {
  return phase.kind === 'countdown' && phase.set === 1 && phase.exerciseIndex > 0;
}

/** 타이머가 있는 Phase의 진행 시간(초). completed는 타이머 없음 */
export function phaseDurationSeconds(phase: SessionPhase): number | null {
  switch (phase.kind) {
    case 'countdown':
      return isNextExerciseIntro(phase) ? REST_DURATION_SECONDS : START_COUNTDOWN_SECONDS;
    case 'exercising':
      return EXERCISE_DURATION_SECONDS;
    case 'resting':
      return REST_DURATION_SECONDS;
    case 'completed':
      return null;
  }
}

/** 현재 Phase가 끝났을 때의 다음 Phase */
export function nextPhase(phase: SessionPhase, routine: readonly RoutineItem[]): SessionPhase {
  const id = phase.id + 1;
  switch (phase.kind) {
    case 'countdown':
      return { id, kind: 'exercising', exerciseIndex: phase.exerciseIndex, set: phase.set };
    case 'exercising': {
      const totalSets = routine[phase.exerciseIndex]?.sets ?? 0;
      if (phase.set < totalSets) {
        return { id, kind: 'resting', exerciseIndex: phase.exerciseIndex, completedSet: phase.set };
      }
      if (phase.exerciseIndex < routine.length - 1) {
        return { id, kind: 'countdown', exerciseIndex: phase.exerciseIndex + 1, set: 1 };
      }
      return { id, kind: 'completed' };
    }
    case 'resting':
      return { id, kind: 'countdown', exerciseIndex: phase.exerciseIndex, set: phase.completedSet + 1 };
    case 'completed':
      return phase;
  }
}
