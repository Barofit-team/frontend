/**
 * 월간 운동기록 타입.
 * 백엔드 API 계약이 정해지기 전까지 화면에 필요한 최소 형태만 정의합니다.
 * (API 연동 시 응답 → 이 타입으로 변환하는 매핑만 추가하면 됩니다)
 */

/** 달력 날짜별 상태 */
export type WorkoutDayStatus = 'completed' | 'partial' | 'missed' | 'planned';

/** 운동기록 카드 상태 */
export type WorkoutRecordStatus = 'completed' | 'partial' | 'missed';

/** 'YYYY-MM-DD' → 날짜 상태 (상태가 없는 날짜는 키가 없음) */
export type MonthlyWorkoutStatusMap = Record<string, WorkoutDayStatus>;

export interface DailyWorkoutRecord {
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  routineName: string;
  status: WorkoutRecordStatus;
  /** 썸네일 이미지 (없으면 회색 이미지 영역 표시) */
  thumbnailUrl: string | null;
}

/** 선택 날짜의 운동기록 한 페이지 (page는 0부터) */
export interface DailyWorkoutRecordPage {
  items: DailyWorkoutRecord[];
  page: number;
  size: number;
  hasNext: boolean;
}
