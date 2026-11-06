/** 모델 연결 전 안내 화면의 기본 시간과 카메라 설정입니다. */

/** 한 세트의 운동 진행 시간(초) */
export const EXERCISE_DURATION_SECONDS = 60;

/** 세트 시작 전 카운트다운(초) */
export const START_COUNTDOWN_SECONDS = 10;

/** 일시 정지 후 운동을 이어할 때의 카운트다운(초) */
export const RESUME_COUNTDOWN_SECONDS = 5;

/** 세트 종료 후 휴식(초) */
export const REST_DURATION_SECONDS = 30;

/** 카메라 촬영 방향: 정면(스쿼트) / 측면(푸쉬업) */
export type CameraView = 'front' | 'side';

export type ExerciseId = string;

export type ExerciseConfig = {
  id: ExerciseId;
  /** 화면에 표시할 운동명 */
  name: string;
  /** 목표 횟수 (디자인 기준 20회) */
  targetReps: number;
  cameraView: CameraView;
};

export const EXERCISES: Record<ExerciseId, ExerciseConfig> = {
  squat: { id: 'squat', name: '스쿼트', targetReps: 20, cameraView: 'front' },
  'push-up': { id: 'push-up', name: '푸쉬업', targetReps: 20, cameraView: 'side' },
};

export const DEFAULT_EXERCISE_ID: ExerciseId = 'squat';

export function isExerciseId(value: unknown): value is ExerciseId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EXERCISES, value);
}

export type RoutineItem = {
  exerciseId: ExerciseId;
  /** 세트 수 */
  sets: number;
  targets?: { targetDurationSeconds: number | null; restSeconds: number }[];
};

/** [Mock] 운동 루틴. 운동 루틴(백엔드) 연동 전 임시값: 스쿼트 2세트 → 푸쉬업 2세트 */
export const MOCK_ROUTINE: readonly RoutineItem[] = [
  { exerciseId: 'squat', sets: 2 },
  { exerciseId: 'push-up', sets: 2 },
];
