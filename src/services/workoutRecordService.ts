/**
 * 월간 운동기록 조회 서비스 (Report API 연동).
 *
 *  - 달력 상태: GET /api/v1/reports/calendar
 *  - 일일 운동일지: GET /api/v1/reports/dates/{date}
 * 백엔드 응답(types/report.ts)을 화면 타입(types/workoutRecord.ts)으로 변환해 반환합니다.
 * (화면·훅은 이 함수들의 반환 타입만 사용합니다)
 *
 * 인증: Report API는 로그인 토큰이 필요합니다. 다른 서비스(weeklyPlanService 등)처럼 호출 전에 토큰을 확인하고,
 * 토큰이 없으면(dev 로그인 등) 요청하지 않고 인증 오류(AUTH_TOKEN_MISSING)를 던집니다. 빈 기록으로 처리하지 않습니다.
 */
import { ApiError } from '@/services/api';
import { getReportCalendar, getReportDateRecords } from '@/services/reportService';
import { tokenStorage } from '@/services/tokenStorage';
import type { ReportDayStatus, ReportRecordCard, ReportRecordStatus } from '@/types/report';
import type {
  DailyWorkoutRecord,
  DailyWorkoutRecordPage,
  MonthlyWorkoutStatusMap,
  WorkoutDayStatus,
  WorkoutRecordStatus,
} from '@/types/workoutRecord';

/** 일일 운동일지 한 번에 불러오는 개수 */
export const DAILY_RECORD_PAGE_SIZE = 4;

/** 앱에서 붙이는 오류 코드: 저장된 토큰이 없어 요청을 보내지 않음 (서버 응답 코드가 아님) */
export const AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING';

/**
 * 토큰 없이 요청하면 서버가 401(AUTH_INVALID_TOKEN)을 주고, apiFetch가 세션을 정리하며 로그인 화면으로 보냅니다.
 * dev 로그인(토큰 없음) 상태에서 기록 탭을 열 때 그렇게 튕기지 않도록 요청 전에 막습니다.
 */
async function ensureAccessToken(): Promise<void> {
  const accessToken = await tokenStorage.getAccessToken();
  if (!accessToken) {
    throw new ApiError(401, AUTH_TOKEN_MISSING, '로그인이 필요합니다.');
  }
}

/**
 * 기록 탭 오류 문구. 인증(401)·권한(403)·네트워크 오류를 일반 오류와 구분합니다.
 * (정상적인 빈 기록은 오류가 아니라 빈 목록·빈 달력으로 옵니다)
 */
export function toWorkoutRecordErrorMessage(error: unknown, subject: '운동 달력' | '운동기록'): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return `로그인 후 ${subject}을 볼 수 있어요.`;
    if (error.status === 403) return `${subject}을 볼 권한이 없어요.`;
    if (error.code === 'NETWORK_ERROR') return `서버에 연결할 수 없어 ${subject}을 불러오지 못했어요.`;
  }
  return `${subject}을 불러오지 못했어요.`;
}

/** 백엔드 달력 상태 → 화면 상태. NONE(계획·수행 없음)은 표시하지 않습니다 */
const DAY_STATUS_MAP: Record<ReportDayStatus, WorkoutDayStatus | null> = {
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  MISSED: 'missed',
  PLANNED: 'planned',
  NONE: null,
};

const RECORD_STATUS_MAP: Record<ReportRecordStatus, WorkoutRecordStatus> = {
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  MISSED: 'missed',
};

/** month: 1~12 */
export async function fetchMonthlyWorkoutStatus(
  year: number,
  month: number
): Promise<MonthlyWorkoutStatusMap> {
  await ensureAccessToken();
  const calendar = await getReportCalendar(year, month);
  const statuses: MonthlyWorkoutStatusMap = {};
  for (const day of calendar.days) {
    const status = DAY_STATUS_MAP[day.status] ?? null;
    if (status) statuses[day.date] = status;
  }
  return statuses;
}

export function toDailyWorkoutRecord(card: ReportRecordCard, index: number): DailyWorkoutRecord | null {
  const status = RECORD_STATUS_MAP[card.status];
  if (!status) return null;
  return {
    // 미실행 계획은 sessionId가 없어 날짜·루틴·순번으로 고유 키를 만듭니다
    id: card.sessionId ?? `missed-${card.date}-${card.routineId}-${index}`,
    sessionId: card.sessionId,
    date: card.date,
    routineName: card.routineName,
    status,
    // Report API는 썸네일을 제공하지 않습니다 (카드에 회색 이미지 영역 표시)
    thumbnailUrl: null,
  };
}

/**
 * GET /dates/{date}는 그날 기록 전체를 한 번에 돌려줍니다.
 * 화면의 4개씩 추가 로딩을 유지하려고 첫 페이지 요청 때 받은 목록을 보관해 두고 이후 페이지는 잘라서 반환합니다.
 */
const dailyRecordCache = new Map<string, DailyWorkoutRecord[]>();

/** date: 'YYYY-MM-DD', page: 0부터. page 0이면 항상 서버에서 새로 받습니다 */
export async function fetchDailyWorkoutRecords(
  date: string,
  page: number,
  size: number = DAILY_RECORD_PAGE_SIZE
): Promise<DailyWorkoutRecordPage> {
  await ensureAccessToken();
  let all = page === 0 ? undefined : dailyRecordCache.get(date);
  if (!all) {
    const cards = await getReportDateRecords(date);
    all = cards
      .map(toDailyWorkoutRecord)
      .filter((record): record is DailyWorkoutRecord => record !== null);
    dailyRecordCache.set(date, all);
  }
  const start = page * size;
  return {
    items: all.slice(start, start + size),
    page,
    size,
    hasNext: start + size < all.length,
  };
}
