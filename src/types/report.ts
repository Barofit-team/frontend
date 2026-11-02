/**
 * Report 서비스(/api/v1/reports) 응답·요청 타입.
 *
 * backend_baro services/report 의 Java record 정의를 그대로 옮겼습니다.
 * (ReportViewService, GeneratedReportService — Jackson 기본 직렬화라 필드명은 record 컴포넌트명과 같은 camelCase)
 *  - LocalDate → 'YYYY-MM-DD' 문자열, Instant → ISO 8601 문자열, UUID → 문자열
 *  - Java Integer/Long/Double(박싱 타입)은 null이 올 수 있어 `| null`로 표기합니다
 *  - 응답 래퍼 없이 본문이 곧 데이터입니다. 오류는 RFC 9457 Problem Details 입니다(services/api.ts의 ApiError)
 *
 * 화면용 타입으로의 변환은 services/reportService.ts 에서 합니다.
 */

/** 달력 날짜 상태 (Asia/Seoul 기준) */
export type ReportDayStatus = 'COMPLETED' | 'PARTIAL' | 'MISSED' | 'PLANNED' | 'NONE';

/** ReportViewService.Day */
export interface ReportCalendarDay {
  /** 'YYYY-MM-DD' */
  date: string;
  status: ReportDayStatus;
  planId: string | null;
  routineId: string | null;
  routineName: string | null;
  sessionCount: number;
}

/** GET /api/v1/reports/calendar 응답 (ReportViewService.Month) */
export interface ReportCalendarResponse {
  year: number;
  month: number;
  /** 해당 월의 1일~말일 전체 */
  days: ReportCalendarDay[];
  completedDays: number;
  partialDays: number;
  missedDays: number;
  /** 현재 연속 운동 일수 */
  streakDays: number;
}

/** 운동 일지 카드 상태 */
export type ReportRecordStatus = 'COMPLETED' | 'PARTIAL' | 'MISSED';

/** ReportViewService.RecordCard */
export interface ReportRecordCard {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 미실행 계획(MISSED)은 null */
  sessionId: string | null;
  routineId: string;
  routineName: string;
  status: ReportRecordStatus;
  completedSets: number;
  plannedSets: number;
  durationSeconds: number;
}

/** GET /api/v1/reports/history 응답 (ReportViewService.RecordPage, page는 0부터) */
export interface ReportRecordPage {
  content: ReportRecordCard[];
  page: number;
  size: number;
  hasNext: boolean;
}

/** 운동 후 주관적 난이도 */
export type ReportDifficulty = 'EASY' | 'MODERATE' | 'HARD';

/**
 * ReportViewService.Feedback — PUT .../feedback 요청·응답 본문.
 * discomfortAreas는 [A-Z_] 코드 배열(최대 10개, 중복 불가). 불편함이 없으면 [].
 */
export interface ReportFeedback {
  difficulty: ReportDifficulty;
  discomfortAreas: string[];
}

/** ReportViewService.ExerciseResult */
export interface ReportExerciseResult {
  exerciseId: string;
  name: string;
  plannedSets: number;
  completedSets: number;
  actualReps: number;
  actualDurationSeconds: number;
  feedbackCodes: string[];
  deviceFeedback: string[];
  /** 0~100, 평가 불가·미수행이면 null */
  postureScore: number | null;
}

/** GET /api/v1/reports/sessions/{sessionId}/result 응답 (ReportViewService.WorkoutResult) */
export interface ReportWorkoutResult {
  sessionId: string;
  routineId: string;
  routineName: string;
  /** Workout 세션 상태 (예: COMPLETED, ABANDONED) */
  status: string;
  plannedSets: number;
  completedSets: number;
  totalReps: number;
  activeDurationSeconds: number;
  /** 종료 전이면 null */
  elapsedSeconds: number | null;
  /** 실제 휴식 시간. 측정하지 않았으면 null */
  restSeconds: number | null;
  exercises: ReportExerciseResult[];
  /** 모든 계획 종목에 점수가 있을 때만 값이 있음 */
  routineScore: number | null;
  scoredExercises: number;
  plannedExercises: number;
  /** 자세 항목별 집계 원본 (ReportRepository.findSessionSummary, Map<String,Object>) */
  postureSummary: Record<string, unknown>;
  /** 사용자가 아직 피드백을 남기지 않았으면 null */
  feedback: ReportFeedback | null;
}

/** GET /api/v1/reports/exercises/{exerciseId}/scores 응답 항목 (ReportViewService.ScoreHistory, 최신순) */
export interface ReportScoreHistory {
  sessionId: string;
  score: number;
  /** ISO 8601 */
  completedAt: string;
}

/** GeneratedReportService.Item */
export interface ReportPostureItem {
  itemId: string;
  aggregationBasis: string;
  unit: string;
  compliant: number;
  warning: number;
  compliancePct: number | null;
}

/** GeneratedReportService.Exercise */
export interface ReportGeneratedExercise {
  routineExerciseId: string;
  exerciseId: string;
  name: string;
  performedSets: number;
  actualReps: number;
  actualDurationSeconds: number;
  postureScore: number | null;
  /** 오류 코드 → 발생 횟수 */
  errorCounts: Record<string, number>;
  postureItems: ReportPostureItem[];
  /** 잘한 점 (미수행이면 null) */
  strengths: string | null;
  /** 개선점 (미수행·평가 불가면 null) */
  improvements: string | null;
  /** 다음 운동 목표 (미수행이면 null) */
  nextGoal: string | null;
}

/** GET·POST /api/v1/reports/sessions/{sessionId}/generated 응답 (GeneratedReportService.Generated) */
export interface ReportGenerated {
  sessionId: string;
  routineName: string;
  sessionStatus: string;
  performedSets: number;
  plannedSets: number;
  restSeconds: number | null;
  activeDurationSeconds: number;
  elapsedSeconds: number | null;
  routineScore: number | null;
  overallFeedback: string;
  exercises: ReportGeneratedExercise[];
  /** 현재는 'TEMPLATE_V1' */
  generationMethod: string;
}
