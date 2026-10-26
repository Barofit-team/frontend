/**
 * 월간 운동기록 달력 계산 (month는 1~12).
 */
import { toIsoDateString } from '@/services/weeklyPlanService';

export interface YearMonth {
  year: number;
  month: number;
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function yearMonthOf(date: Date): YearMonth {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  return yearMonthOf(new Date(year, month - 1 + delta, 1));
}

export function isSameYearMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${year}년 ${month}월`;
}

export function toDateKey({ year, month }: YearMonth, day: number): string {
  return toIsoDateString(new Date(year, month - 1, day));
}

/** 'YYYY-MM-DD' → '10월 20일' */
export function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${month}월 ${day}일`;
}

/**
 * 일요일 시작 주 단위 달력. 해당 월이 아닌 칸은 null.
 * 예) 2026년 10월 → 1일이 목요일이므로 첫 주는 [null, null, null, null, 1, 2, 3]
 */
export function buildMonthGrid({ year, month }: YearMonth): (number | null)[][] {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 월 변경 시 선택 날짜: 오늘이 있는 달이면 오늘, 아니면 1일 */
export function defaultSelectedDateOf(yearMonth: YearMonth, today: Date): string {
  return isSameYearMonth(yearMonth, yearMonthOf(today))
    ? toIsoDateString(today)
    : toDateKey(yearMonth, 1);
}

/** 연도·월 선택 목록 (기준 월 앞뒤로) */
export function buildMonthOptions(center: YearMonth, before = 36, after = 24): YearMonth[] {
  return Array.from({ length: before + after + 1 }, (_, i) => addMonths(center, i - before));
}
