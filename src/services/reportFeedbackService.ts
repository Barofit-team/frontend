/**
 * 운동 후 피드백 저장 (Report API — PUT /api/v1/reports/sessions/{sessionId}/feedback).
 *
 * 서버 동작 (ReportViewService.saveFeedback):
 *  - Workout 세션을 먼저 조회합니다. 없거나 본인 세션이 아니면 404입니다.
 *  - 세션 상태가 COMPLETED·ABANDONED가 아니면 409입니다(본문 검증보다 먼저 확인).
 *  - 본문 규칙: difficulty는 EASY·MODERATE·HARD, discomfortAreas는 null이 아닌 배열(빈 배열 허용),
 *    최대 10개, 각 코드 [A-Z_]{1,40}, 중복 불가. 어기면 400입니다.
 *  - 세션당 1건을 저장하고, 다시 보내면 덮어씁니다(upsert). 같은 본문을 다시 보내도 결과가 같습니다.
 *  - 성공하면 200과 함께 보낸 본문을 그대로 돌려줍니다.
 *
 * 화면 값(types/workoutResult.ts의 easy·normal·hard, 'lower-back' 같은 부위 ID)을 서버 코드로 바꾸는 규칙은
 * 정해지지 않아 여기서 변환하지 않습니다. 서버 코드 형식의 값만 받습니다.
 */
import { ApiError } from '@/services/api';
import { saveReportFeedback } from '@/services/reportService';
import { ensureAccessToken } from '@/services/workoutRecordService';
import { DIFFICULTIES, isFeedback, isValidSessionId, mismatch } from '@/services/workoutSessionResultService';
import type { ReportFeedback } from '@/types/report';

/** 백엔드 규칙 (ReportViewService.saveFeedback) */
const DISCOMFORT_AREA_PATTERN = /^[A-Z_]{1,40}$/;
const MAX_DISCOMFORT_AREAS = 10;

/** 서버가 400으로 거절할 본문인지 요청 전에 확인합니다 (서버 규칙과 같은 범위만 검사) */
export function isValidReportFeedback(value: unknown): value is ReportFeedback {
  if (typeof value !== 'object' || value === null) return false;
  const { difficulty, discomfortAreas } = value as Record<string, unknown>;
  return (
    typeof difficulty === 'string' &&
    DIFFICULTIES.has(difficulty) &&
    Array.isArray(discomfortAreas) &&
    discomfortAreas.length <= MAX_DISCOMFORT_AREAS &&
    discomfortAreas.every((area) => typeof area === 'string' && DISCOMFORT_AREA_PATTERN.test(area)) &&
    new Set(discomfortAreas).size === discomfortAreas.length
  );
}

/**
 * 피드백 저장. 잘못된 sessionId·본문이면 요청하지 않고 RangeError,
 * 토큰이 없으면 요청하지 않고 ApiError(401), 응답이 보낸 본문과 다르면 TypeError를 던집니다.
 * 자동 재시도는 하지 않습니다(토큰 만료 시 apiFetch의 refresh 후 1회 재요청만 있음).
 */
export async function submitReportFeedback(sessionId: string, feedback: ReportFeedback): Promise<ReportFeedback> {
  if (!isValidSessionId(sessionId)) {
    throw new RangeError(`Invalid workout session id: ${sessionId}`);
  }
  if (!isValidReportFeedback(feedback)) {
    throw new RangeError('Invalid report feedback');
  }
  // 화면 객체에 다른 속성이 있어도 서버 계약의 두 필드만 보냅니다
  const body: ReportFeedback = { difficulty: feedback.difficulty, discomfortAreas: [...feedback.discomfortAreas] };
  await ensureAccessToken();
  const saved: unknown = await saveReportFeedback(sessionId, body);
  if (!isFeedback(saved)) mismatch('feedback');
  if (
    saved.difficulty !== body.difficulty ||
    saved.discomfortAreas.length !== body.discomfortAreas.length ||
    saved.discomfortAreas.some((area, index) => area !== body.discomfortAreas[index])
  ) {
    mismatch('feedback (saved value differs from request)');
  }
  return saved;
}

export type ReportAction = '피드백 저장' | '리포트 생성' | '세트 결과 저장';

/**
 * 저장·생성 요청 오류 문구 (임시 문구 — 기획 확정 전).
 * 409의 원인(운동 미종료, AI 결과 누락, 수행 세트 없음 등)은 서버가 같은 code(INVALID_INPUT)로 보내
 * 문구로만 구분돼서, 프론트에서는 원인별로 나누지 않습니다.
 */
export function toReportActionErrorMessage(error: unknown, action: ReportAction): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return `로그인 후 ${action}을 할 수 있어요.`;
    if (error.status === 403) return `${action} 권한이 없어요.`;
    if (error.status === 404) return '운동 기록을 찾을 수 없어요.';
    if (error.status === 409) {
      if (action === '피드백 저장') return '운동을 마친 뒤에 피드백을 저장할 수 있어요.';
      if (action === '세트 결과 저장') return '이 세트에는 이미 다른 결과가 저장되어 있어요.';
      return '아직 리포트를 만들 수 없어요. 운동 종료와 자세 분석 결과 저장이 끝났는지 확인해 주세요.';
    }
    if (error.status === 400) return `${action} 요청 값이 올바르지 않아요.`;
    if (error.code === 'NETWORK_ERROR') return `서버에 연결할 수 없어 ${action}을 하지 못했어요.`;
  }
  if (error instanceof RangeError) return `${action} 요청 값이 올바르지 않아요.`;
  return `${action}에 실패했어요.`;
}
