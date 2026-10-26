/**
 * [Mock] 월간 운동기록 예시 데이터.
 *
 * ⚠️ 실제 운동 기록이 아닙니다. 백엔드 API 연결 전 화면 퍼블리싱·무한 스크롤 확인용입니다.
 *  - 2026년 10월: Figma 시안의 달력 상태를 그대로 따르고, 날짜별 기록 개수로 페이지 로딩을 검증합니다.
 *      · 0개: 2, 22, 26일 등  · 4개 미만: 20일(1개)  · 정확히 4개: 18일
 *      · 4개 초과: 8일(5개), 10일(8개), 15일(10개 → 4 + 4 + 2, 마지막 페이지)
 *  - 그 외 월: 날짜로 계산한 고정 패턴 (같은 날짜는 항상 같은 결과)
 */
import { toIsoDateString } from '@/services/weeklyPlanService';
import type {
  DailyWorkoutRecord,
  MonthlyWorkoutStatusMap,
  WorkoutDayStatus,
  WorkoutRecordStatus,
} from '@/types/workoutRecord';

interface MockDay {
  status: WorkoutDayStatus;
  recordCount: number;
  /** 첫 번째 기록의 루틴명 (시안 문구) */
  firstRoutineName?: string;
}

const OCTOBER_2026: Record<number, MockDay> = {
  1: { status: 'completed', recordCount: 2 },
  3: { status: 'completed', recordCount: 3 },
  4: { status: 'completed', recordCount: 1 },
  6: { status: 'partial', recordCount: 1 },
  8: { status: 'completed', recordCount: 5 },
  10: { status: 'completed', recordCount: 8 },
  11: { status: 'missed', recordCount: 1 },
  13: { status: 'completed', recordCount: 2 },
  15: { status: 'completed', recordCount: 10 },
  17: { status: 'completed', recordCount: 1 },
  18: { status: 'completed', recordCount: 4 },
  20: { status: 'completed', recordCount: 1, firstRoutineName: '가볍게 시작할 수 있는 기초 루틴' },
  22: { status: 'planned', recordCount: 0 },
  24: { status: 'planned', recordCount: 0 },
};

const ROUTINE_NAMES = [
  '운동 루틴',
  '푸시업 기초 루틴',
  '전신 근력 루틴',
  '코어 강화 루틴',
  '하체 집중 루틴',
] as const;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 날짜로 0~99 고정값 계산 (Mock 패턴용) */
function seedOf(year: number, month: number, day: number): number {
  return (Math.imul(year * 372 + month * 31 + day, 2654435761) >>> 0) % 100;
}

function mockDayOf(year: number, month: number, day: number): MockDay | null {
  if (year === 2026 && month === 10) return OCTOBER_2026[day] ?? null;

  const seed = seedOf(year, month, day);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date > today) return seed < 20 ? { status: 'planned', recordCount: 0 } : null;
  if (seed < 45) return { status: 'completed', recordCount: 1 + (seed % 3) };
  if (seed < 52) return { status: 'partial', recordCount: 1 };
  if (seed < 62) return { status: 'missed', recordCount: 1 };
  return null;
}

function recordStatusOf(dayStatus: WorkoutDayStatus, index: number): WorkoutRecordStatus {
  if (dayStatus === 'missed') return 'missed';
  if (dayStatus === 'partial') return index === 0 ? 'partial' : 'completed';
  return 'completed';
}

export function getMockMonthlyStatus(year: number, month: number): MonthlyWorkoutStatusMap {
  const statuses: MonthlyWorkoutStatusMap = {};
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    const mock = mockDayOf(year, month, day);
    if (mock) statuses[toIsoDateString(new Date(year, month - 1, day))] = mock.status;
  }
  return statuses;
}

/** date: 'YYYY-MM-DD' */
export function getMockDailyRecords(date: string): DailyWorkoutRecord[] {
  const [year, month, day] = date.split('-').map(Number);
  const mock = mockDayOf(year, month, day);
  if (!mock) return [];

  return Array.from({ length: mock.recordCount }, (_, index) => ({
    id: `mock-record-${date}-${index + 1}`,
    date,
    routineName:
      index === 0 && mock.firstRoutineName
        ? mock.firstRoutineName
        : ROUTINE_NAMES[(day + index) % ROUTINE_NAMES.length],
    status: recordStatusOf(mock.status, index),
    thumbnailUrl: null,
  }));
}
