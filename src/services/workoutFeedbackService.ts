/**
 * 운동 후 피드백 저장.
 *
 *  - target 'mock' (Mock 운동 결과): 서버에 보내지 않습니다. 호출한 쪽(useWorkoutFeedbackStore)이 앱 메모리에만 보관합니다.
 *  - target 'api' (실제 Workout 세션): Report API PUT /api/v1/reports/sessions/{sessionId}/feedback으로 저장합니다
 *    (reportFeedbackService.submitReportFeedback 재사용 — 요청 전 검증, 토큰 확인, 응답 일치 확인, 자동 재시도 없음).
 *
 * 화면 값 → API 값
 *  - 난이도: easy·normal·hard(쉬웠어요·적당했어요·어려웠어요) → EASY·MODERATE·HARD
 *  - 불편 부위: '없음'만 [](빈 배열)로 보냅니다. 화면의 부위 선택지(constants/workoutFeedback.ts)에 대응하는
 *    Report API 코드가 정해지지 않아, '있음'이면 요청하지 않고 UnsupportedDiscomfortError를 던집니다.
 *    (Mock으로 대신 저장하지 않습니다)
 */
import { submitReportFeedback } from '@/services/reportFeedbackService';
import type { ReportDifficulty, ReportFeedback } from '@/types/report';
import type { SavedWorkoutFeedback, WorkoutDifficulty, WorkoutFeedback } from '@/types/workoutResult';

type CompleteFeedback = WorkoutFeedback & { difficulty: WorkoutDifficulty; hasDiscomfort: boolean };

/** 저장 위치: Mock 결과면 앱 메모리, 실제 Workout 세션이면 Report API */
export type FeedbackSaveTarget = SavedWorkoutFeedback['savedTo'];

const REPORT_DIFFICULTY: Record<WorkoutDifficulty, ReportDifficulty> = {
  easy: 'EASY',
  normal: 'MODERATE',
  hard: 'HARD',
};

/** 불편 부위 '있음'은 현재 Report API 계약으로 저장할 수 없음 (부위 코드 미정) */
export class UnsupportedDiscomfortError extends Error {
  constructor() {
    super('Discomfort areas are not supported by the Report feedback API yet');
    this.name = 'UnsupportedDiscomfortError';
  }
}

/** 실제 세션에서 저장 가능한 응답인지 (불편 부위 '없음'만 가능) */
export function canSaveToReport(feedback: Pick<WorkoutFeedback, 'hasDiscomfort'>): boolean {
  return feedback.hasDiscomfort === false;
}

/** 화면 피드백 → PUT /feedback 본문. 지원하지 않는 응답이면 UnsupportedDiscomfortError */
export function toReportFeedback(feedback: CompleteFeedback): ReportFeedback {
  if (!canSaveToReport(feedback)) throw new UnsupportedDiscomfortError();
  return { difficulty: REPORT_DIFFICULTY[feedback.difficulty], discomfortAreas: [] };
}

export async function saveWorkoutFeedback(
  feedback: CompleteFeedback,
  target: FeedbackSaveTarget = 'mock'
): Promise<SavedWorkoutFeedback> {
  if (target === 'api') {
    // 서버가 저장하고 보낸 값과 같다고 확인된 경우에만 성공으로 돌려줍니다
    await submitReportFeedback(feedback.sessionId, toReportFeedback(feedback));
    return { ...feedback, discomfortAreas: [], savedAt: new Date().toISOString(), savedTo: 'api' };
  }
  return {
    ...feedback,
    // 불편 부위 '없음'이면 부위 목록은 비웁니다
    discomfortAreas: feedback.hasDiscomfort ? [...feedback.discomfortAreas] : [],
    savedAt: new Date().toISOString(),
    savedTo: 'mock',
  };
}
