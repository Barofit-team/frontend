/**
 * 기간별 AI 세트 결과 집계 조회 (Report API — GET /api/v1/reports/daily, GET /api/v1/reports/weekly).
 *
 *  - 날짜는 'YYYY-MM-DD'만 보냅니다. 서버(@DateTimeFormat ISO.DATE)가 400으로 거절할 값은 요청 전에 막습니다.
 *  - 기간 경계(KST 자정)는 서버가 계산합니다. weekly는 startDate부터 7일이며 요일 제한이 없습니다.
 *  - 기간에 결과가 없으면 서버가 모든 값 0으로 200을 줍니다. 이 경우는 오류가 아니라 빈 집계입니다.
 *  - 응답 값은 반올림·단위 변환 없이 그대로 돌려줍니다.
 */
import { getReportDailySummary, getReportWeeklySummary } from '@/services/reportService';
import { ensureAccessToken } from '@/services/workoutRecordService';
import type { ReportPeriodSummary } from '@/types/report';

export type ReportSummaryPeriod = 'daily' | 'weekly';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 실제로 있는 날짜의 'YYYY-MM-DD'인지 (예: 2026-02-30, 2026-13-01, 2026-1-5는 false) */
export function isValidReportDate(date: string): boolean {
  const match = DATE_PATTERN.exec(date);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  // Date.UTC는 0~99년을 1900년대로 바꾸므로 setUTCFullYear로 만듭니다
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

const SUMMARY_KEYS = ['setCount', 'sessionCount', 'totalReps', 'totalHoldSeconds', 'totalObservedSeconds'] as const;

/** 응답이 계약(숫자 5개)과 다르면 화면에 NaN 등이 보이지 않도록 오류로 처리합니다 */
function toReportPeriodSummary(body: unknown): ReportPeriodSummary {
  if (typeof body !== 'object' || body === null) {
    throw new TypeError('Unexpected period summary response');
  }
  const record = body as Record<string, unknown>;
  for (const key of SUMMARY_KEYS) {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`Unexpected period summary response: ${key}`);
    }
  }
  return {
    setCount: record.setCount as number,
    sessionCount: record.sessionCount as number,
    totalReps: record.totalReps as number,
    totalHoldSeconds: record.totalHoldSeconds as number,
    totalObservedSeconds: record.totalObservedSeconds as number,
  };
}

/** 업로드된 세트 결과가 하나도 없는 기간인지 */
export function isEmptyPeriodSummary(summary: ReportPeriodSummary): boolean {
  return summary.setCount === 0;
}

/**
 * 기간 집계 조회. period가 'daily'면 date 하루, 'weekly'면 date부터 7일.
 * 잘못된 날짜면 요청하지 않고 RangeError, 토큰이 없으면 요청하지 않고 ApiError(401)를 던집니다.
 */
export async function fetchReportPeriodSummary(
  period: ReportSummaryPeriod,
  date: string
): Promise<ReportPeriodSummary> {
  if (!isValidReportDate(date)) {
    throw new RangeError(`Invalid report ${period} date: ${date}`);
  }
  await ensureAccessToken();
  const body = period === 'daily' ? await getReportDailySummary(date) : await getReportWeeklySummary(date);
  return toReportPeriodSummary(body);
}
