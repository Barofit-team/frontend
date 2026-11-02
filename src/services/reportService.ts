/**
 * Report 서비스 API (/api/v1/reports).
 *
 * - 서버 주소·토큰 첨부·만료 시 refresh·오류 변환은 services/api.ts 의 apiFetch가 처리합니다.
 * - 모든 API는 바로핏 Bearer JWT가 필요합니다(auth: true).
 * - 엔드포인트·DTO 기준: backend_baro services/report (ReportViewController, ReportViewService, GeneratedReportService)
 *
 * 세트 원문 업로드(POST .../sets/{setId})와 자세 집계 원본(.../sets, .../summary, /daily, /weekly)은
 * 온디바이스 AI·운동 세션 흐름에서 쓰는 API라 여기 포함하지 않았습니다.
 */
import { apiFetch } from '@/services/api';
import type {
  ReportCalendarResponse,
  ReportFeedback,
  ReportGenerated,
  ReportRecordCard,
  ReportRecordPage,
  ReportScoreHistory,
  ReportWorkoutResult,
} from '@/types/report';

const BASE_PATH = '/api/v1/reports';

/** GET /calendar — 월별 날짜 상태와 완료/부분/미실행 일수, 현재 연속 운동 일수. month: 1~12 */
export function getReportCalendar(year: number, month: number): Promise<ReportCalendarResponse> {
  return apiFetch<ReportCalendarResponse>(`${BASE_PATH}/calendar?year=${year}&month=${month}`, { auth: true });
}

/** GET /history — 월간 운동 일지(최신 날짜순). page는 0부터, size는 1~100 */
export function getReportHistory(
  year: number,
  month: number,
  page = 0,
  size = 10
): Promise<ReportRecordPage> {
  return apiFetch<ReportRecordPage>(
    `${BASE_PATH}/history?year=${year}&month=${month}&page=${page}&size=${size}`,
    { auth: true }
  );
}

/** GET /dates/{date} — 선택 날짜의 운동 일지(미실행 계획 포함). date: 'YYYY-MM-DD' */
export function getReportDateRecords(date: string): Promise<ReportRecordCard[]> {
  return apiFetch<ReportRecordCard[]>(`${BASE_PATH}/dates/${encodeURIComponent(date)}`, { auth: true });
}

/** GET /sessions/{sessionId}/result — 운동별 수행 결과·점수·자세 집계·사용자 피드백 */
export function getReportWorkoutResult(sessionId: string): Promise<ReportWorkoutResult> {
  return apiFetch<ReportWorkoutResult>(`${BASE_PATH}/sessions/${encodeURIComponent(sessionId)}/result`, {
    auth: true,
  });
}

/** GET /sessions/{sessionId}/generated — 저장된 운동 리포트. 생성 전이면 404(ApiError.status) */
export function getGeneratedReport(sessionId: string): Promise<ReportGenerated> {
  return apiFetch<ReportGenerated>(`${BASE_PATH}/sessions/${encodeURIComponent(sessionId)}/generated`, {
    auth: true,
  });
}

/**
 * POST /sessions/{sessionId}/generated — 종료된 세션의 리포트를 한 번 생성·저장합니다(재요청 시 저장본 반환).
 * 수행 세트가 없거나 AI 결과가 누락되면 409입니다. 운동 종료 흐름에서 호출합니다.
 */
export function generateReport(sessionId: string): Promise<ReportGenerated> {
  return apiFetch<ReportGenerated>(`${BASE_PATH}/sessions/${encodeURIComponent(sessionId)}/generated`, {
    method: 'POST',
    auth: true,
  });
}

/** PUT /sessions/{sessionId}/feedback — 주관적 난이도·불편 부위 저장/수정. 종료된 본인 세션만 가능(아니면 409) */
export function saveReportFeedback(sessionId: string, feedback: ReportFeedback): Promise<ReportFeedback> {
  return apiFetch<ReportFeedback>(`${BASE_PATH}/sessions/${encodeURIComponent(sessionId)}/feedback`, {
    method: 'PUT',
    body: JSON.stringify(feedback),
    auth: true,
  });
}

/** GET /exercises/{exerciseId}/scores — 본인 종목 자세 점수 이력(최신순). limit: 1~30 */
export function getExerciseScoreHistory(exerciseId: string, limit = 3): Promise<ReportScoreHistory[]> {
  return apiFetch<ReportScoreHistory[]>(
    `${BASE_PATH}/exercises/${encodeURIComponent(exerciseId)}/scores?limit=${limit}`,
    { auth: true }
  );
}
