/**
 * 월간 운동기록 조회 서비스.
 *
 * [Mock] 백엔드 API가 연결되기 전까지 mocks/workoutRecords.ts 데이터를 반환합니다.
 * API 연동 시 아래 두 함수의 내부만 apiFetch 호출 + 응답 매핑으로 교체하면 됩니다.
 * (화면·훅은 이 함수들의 반환 타입만 사용합니다)
 */
import { getMockDailyRecords, getMockMonthlyStatus } from '@/mocks/workoutRecords';
import type { DailyWorkoutRecordPage, MonthlyWorkoutStatusMap } from '@/types/workoutRecord';

/** 일일 운동일지 한 번에 불러오는 개수 */
export const DAILY_RECORD_PAGE_SIZE = 4;

/** [Mock] 네트워크 지연 흉내 (로딩 상태 확인용) */
const MOCK_DELAY_MS = 350;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** month: 1~12 */
export async function fetchMonthlyWorkoutStatus(
  year: number,
  month: number
): Promise<MonthlyWorkoutStatusMap> {
  await wait(MOCK_DELAY_MS);
  return getMockMonthlyStatus(year, month);
}

/** date: 'YYYY-MM-DD', page: 0부터 */
export async function fetchDailyWorkoutRecords(
  date: string,
  page: number,
  size: number = DAILY_RECORD_PAGE_SIZE
): Promise<DailyWorkoutRecordPage> {
  await wait(MOCK_DELAY_MS);
  const all = getMockDailyRecords(date);
  const start = page * size;
  return {
    items: all.slice(start, start + size),
    page,
    size,
    hasNext: start + size < all.length,
  };
}
