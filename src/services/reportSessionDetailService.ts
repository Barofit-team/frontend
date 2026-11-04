/**
 * 세션 자세 집계·세트별 원문 조회 (Report API — GET .../sessions/{sessionId}/summary, .../sets).
 *
 * 서버 동작 (ReportController → ReportService → ReportRepository):
 *  - 두 API 모두 Workout 서비스를 조회하지 않고, 로그인 사용자의 업로드된 AI 세트 결과만 읽습니다.
 *    그래서 세션이 없거나 남의 세션이어도 404가 아니라 빈 결과(집계 0, [])로 200입니다.
 *  - /summary는 /result의 postureSummary와 같은 메서드(findSessionSummary)라 형태가 같습니다.
 *  - /sets는 업로드 순서(received_at, set_id)대로 오며, rawResult는 JSON 문자열입니다.
 *
 * 응답은 검증만 하고 값·순서는 바꾸지 않습니다. rawResult는 파싱하지 않습니다.
 */
import { getReportSessionSets, getReportSessionSummary } from '@/services/reportService';
import { ensureAccessToken } from '@/services/workoutRecordService';
import {
  checkPostureSummary,
  expectFields,
  isObject,
  isString,
  isValidSessionId,
  mismatch,
} from '@/services/workoutSessionResultService';
import type { ReportSessionPostureSummary, ReportSessionSet } from '@/types/report';

function assertSessionId(sessionId: string): void {
  if (!isValidSessionId(sessionId)) {
    throw new RangeError(`Invalid workout session id: ${sessionId}`);
  }
}

/** /summary 응답 검증. 형식이 다르거나 요청한 세션의 집계가 아니면 TypeError */
export function parseReportSessionSummary(body: unknown, requestedSessionId: string): ReportSessionPostureSummary {
  checkPostureSummary(body);
  if (body.sessionId.toLowerCase() !== requestedSessionId.toLowerCase()) mismatch('summary.sessionId');
  return body;
}

/** /sets 응답 검증. 배열이 아니거나 항목 형식이 다르면 TypeError. 순서·rawResult는 그대로 둡니다 */
export function parseReportSessionSets(body: unknown): ReportSessionSet[] {
  if (!Array.isArray(body)) mismatch('sets');
  body.forEach((item: unknown, index) => {
    const path = `sets[${index}]`;
    if (!isObject(item)) mismatch(path);
    expectFields(item, `${path}.`, {
      setId: isString,
      exercise: isString,
      engineVersion: isString,
      rawResult: isString,
    });
  });
  return body as ReportSessionSet[];
}

/** 세션 자세 집계 조회. 잘못된 sessionId면 요청하지 않고 RangeError, 토큰이 없으면 ApiError(401) */
export async function fetchReportSessionSummary(sessionId: string): Promise<ReportSessionPostureSummary> {
  assertSessionId(sessionId);
  await ensureAccessToken();
  const body: unknown = await getReportSessionSummary(sessionId);
  return parseReportSessionSummary(body, sessionId);
}

/** 세트별 AI 결과 원문 조회. 잘못된 sessionId면 요청하지 않고 RangeError, 토큰이 없으면 ApiError(401) */
export async function fetchReportSessionSets(sessionId: string): Promise<ReportSessionSet[]> {
  assertSessionId(sessionId);
  await ensureAccessToken();
  const body: unknown = await getReportSessionSets(sessionId);
  return parseReportSessionSets(body);
}
