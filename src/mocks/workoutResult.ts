/**
 * [Mock] 운동 결과 예시 데이터 (Figma 시안 기준).
 *
 * ⚠️ 실제 측정·AI 분석값이 아닙니다.
 *  - 횟수 계산·자세 분석·운동 기록 API가 연결되기 전까지 결과 화면(F01) 퍼블리싱 확인용으로만 사용합니다.
 *  - source: 'mock'으로 표시되며, 개발 빌드에서는 화면에 "Mock 데이터" 라벨이 보입니다.
 */
import { toIsoDateString } from '@/services/weeklyPlanService';
import type { WorkoutSessionResult } from '@/types/workoutResult';

export function createMockWorkoutResult(now: Date = new Date()): WorkoutSessionResult {
  return {
    sessionId: `mock-session-${now.getTime()}`,
    source: 'mock',
    completedSets: 6,
    totalReps: 120,
    exerciseDurationSeconds: 8 * 60,
    restDurationSeconds: 4 * 60,
    totalDurationSeconds: 12 * 60,
    exercises: [
      {
        exerciseId: 'squat',
        exerciseName: '스쿼트',
        completedSets: 3,
        completedReps: 60,
        goodFeedback: '상체를 안정적으로 유지했어요.',
        improvementFeedback: '반복 후반에도 같은 깊이를 유지해 보세요.',
        mainError: '가동 범위 부족',
        errorCount: 4,
      },
      {
        exerciseId: 'push-up',
        exerciseName: '팔굽혀펴기',
        completedSets: 3,
        completedReps: 60,
        goodFeedback: '일정한 속도로 수행했어요.',
        improvementFeedback: '몸통 정렬을 끝까지 유지해 보세요.',
        mainError: '몸통 정렬 이탈',
        errorCount: 3,
      },
    ],
    postureScore: {
      exerciseId: 'squat',
      exerciseName: '스쿼트',
      history: [
        { date: '2026-10-12', score: 78 },
        { date: '2026-10-16', score: 80 },
        { date: toIsoDateString(now), score: 84 },
      ],
    },
    nextFocus: '횟수보다 같은 자세를 끝까지 유지해 보세요.',
  };
}
