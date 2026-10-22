/**
 * 운동 후 피드백 저장.
 *
 * ⚠️ [Mock] 백엔드 피드백 API가 아직 없어 서버에 저장하지 않습니다.
 *  - 지금은 호출한 쪽(useWorkoutFeedbackStore)이 앱 메모리에만 보관하며, 앱을 종료하면 사라집니다.
 *  - API가 정해지면 이 함수 안에서 apiFetch로 전송하고 savedTo를 'api'로 바꿉니다.
 */
import type { SavedWorkoutFeedback, WorkoutDifficulty, WorkoutFeedback } from '@/types/workoutResult';

type CompleteFeedback = WorkoutFeedback & { difficulty: WorkoutDifficulty; hasDiscomfort: boolean };

export async function saveWorkoutFeedback(feedback: CompleteFeedback): Promise<SavedWorkoutFeedback> {
  return {
    ...feedback,
    // 불편 부위 '없음'이면 부위 목록은 비웁니다
    discomfortAreas: feedback.hasDiscomfort ? [...feedback.discomfortAreas] : [],
    savedAt: new Date().toISOString(),
    savedTo: 'mock',
  };
}
