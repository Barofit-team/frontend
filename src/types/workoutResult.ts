/**
 * 운동 결과(F01)와 운동 후 피드백(F02·F03) 타입.
 *
 * 두 데이터는 역할이 다릅니다.
 *  - WorkoutSessionResult: 운동 세션이 끝난 뒤의 기록·분석 결과 (현재는 Mock, 추후 백엔드·AI 연동)
 *  - WorkoutFeedback: 사용자가 직접 남기는 난이도·불편 부위 응답
 * 피드백은 sessionId로 결과와 연결되며, 세션이 다르면 섞이지 않습니다.
 */
import type { DiscomfortAreaId } from '@/constants/workoutFeedback';

/** 결과 데이터의 출처. 'mock'이면 실제 측정·분석값이 아닙니다 */
export type WorkoutResultSource = 'mock' | 'api';

export interface ExerciseResult {
  exerciseId: string;
  exerciseName: string;
  completedSets: number;
  completedReps: number;
  /** 잘한 점 */
  goodFeedback: string;
  /** 개선할 점 */
  improvementFeedback: string;
  /** 주요 자세 오류 (없으면 표시하지 않음) */
  mainError?: string;
  /** 주요 자세 오류 발생 횟수 */
  errorCount?: number;
  score?: number;
}

export interface PostureScorePoint {
  /** ISO 날짜 (YYYY-MM-DD) */
  date: string;
  score: number;
}

/** 같은 종목의 최근 자세 점수 기록. 마지막 항목이 이번(오늘) 운동입니다 */
export interface PostureScoreHistory {
  exerciseId: string;
  exerciseName: string;
  history: PostureScorePoint[];
}

export interface WorkoutSessionResult {
  sessionId: string;
  source: WorkoutResultSource;
  completedSets: number;
  totalReps: number;
  exerciseDurationSeconds: number;
  restDurationSeconds: number;
  totalDurationSeconds: number;
  exercises: ExerciseResult[];
  /** 실제 점수가 없으면 비워 둡니다 (임의 점수를 표시하지 않음) */
  postureScore?: PostureScoreHistory;
  /** 다음 운동에서 집중할 한 가지 */
  nextFocus?: string;
}

export type WorkoutDifficulty = 'easy' | 'normal' | 'hard';

export interface WorkoutFeedback {
  sessionId: string;
  difficulty: WorkoutDifficulty | null;
  /** null: 아직 선택 안 함 / false: 없음 / true: 있음 */
  hasDiscomfort: boolean | null;
  /** hasDiscomfort가 true일 때만 사용. 선택한 순서대로 보관 */
  discomfortAreas: DiscomfortAreaId[];
}

/** 저장(확정)된 피드백 */
export interface SavedWorkoutFeedback extends WorkoutFeedback {
  difficulty: WorkoutDifficulty;
  hasDiscomfort: boolean;
  /** ISO 시각 */
  savedAt: string;
  /** 'mock'이면 서버가 아닌 앱 메모리에만 저장된 상태 */
  savedTo: 'mock' | 'api';
}
