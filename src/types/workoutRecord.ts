/**
 * 월간 운동기록 화면 타입.
 * Report API 응답(types/report.ts)은 services/workoutRecordService.ts 에서 이 타입으로 변환됩니다.
 */

/** 달력 날짜별 상태 */
export type WorkoutDayStatus = 'completed' | 'partial' | 'missed' | 'planned';

/** 운동기록 카드 상태 */
export type WorkoutRecordStatus = 'completed' | 'partial' | 'missed';

/** 'YYYY-MM-DD' → 날짜 상태 (상태가 없는 날짜는 키가 없음) */
export type MonthlyWorkoutStatusMap = Record<string, WorkoutDayStatus>;

export interface DailyWorkoutRecord {
  id: string;
  /** Report API의 운동 세션 ID. 미실행 계획은 null (리포트 상세 연결용) */
  sessionId?: string | null;
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
