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

/**
 * 세션 자세 항목 집계 (ReportRepository.findSessionSummary의 postureItems 항목, LinkedHashMap).
 * 세트별 결과(posture_item_results)를 항목·집계 기준·단위·종목·엔진 버전별로 합산한 값입니다.
 * 수치 컬럼은 DOUBLE PRECISION이라 실수입니다.
 */
export interface ReportSessionPostureItem extends ReportPostureItem {
  /** AI 종목 코드 (예: pushup) */
  exercise: string;
  engineVersion: string;
  unknown: number;
  notApplicable: number;
  evaluated: number;
  /** 100 × compliant / evaluated. evaluated가 0이면 null */
  compliancePct: number | null;
}

/**
 * 세션 자세 집계 (ReportRepository.findSessionSummary, DTO 없는 Map).
 * 업로드된 AI 세트 결과가 없으면 수치는 0, postureItems는 []입니다.
 */
export interface ReportSessionPostureSummary {
  sessionId: string;
  /** Java long */
  setCount: number;
  /** Java long */
  totalReps: number;
  /** Java double */
  totalHoldSeconds: number;
  /** Java double */
  totalObservedSeconds: number;
  postureItems: ReportSessionPostureItem[];
}

/** GET /api/v1/reports/sessions/{sessionId}/result 응답 (ReportViewService.WorkoutResult) */
export interface ReportWorkoutResult {
  sessionId: string;
  routineId: string;
  routineName: string;
  /**
   * Workout 세션 상태. Workout SessionStatus 기준 ACTIVE | PAUSED | COMPLETED | ABANDONED.
   * Report는 Workout 응답 문자열을 그대로 전달하므로 string으로 둡니다.
   */
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
  /** 자세 항목별 집계 원본 (ReportRepository.findSessionSummary) */
  postureSummary: ReportSessionPostureSummary;
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

/**
 * GET /api/v1/reports/daily?date=, GET /api/v1/reports/weekly?startDate= 응답 (ReportRepository.findPeriodSummary).
 *
 * 백엔드는 DTO 없이 Map<String, Object>를 돌려주며, 키 5개가 항상 모두 옵니다(null 없음).
 * 업로드된 AI 세트 결과(exercise_set_results) 중 기간 안의 것만 집계합니다.
 * 기간 기준 시각은 performed_at(없으면 received_at), 경계는 Asia/Seoul 자정입니다.
 *  - daily: date 00:00 ~ 다음 날 00:00 (KST)
 *  - weekly: startDate 00:00 ~ 7일 뒤 00:00 (KST). startDate가 월요일인지는 서버가 확인하지 않습니다
 * 기간에 결과가 없으면 404가 아니라 모든 값이 0인 200입니다.
 */
export interface ReportPeriodSummary {
  /** 업로드된 세트 결과 수 (Java long) */
  setCount: number;
  /** 세트 결과가 1개 이상 있는 세션 수 (Java long) */
  sessionCount: number;
  /** 반복 횟수 합계. 횟수가 없는 세트는 제외 (Java long) */
  totalReps: number;
  /** 유지 시간(초) 합계. 실수 (Java double) */
  totalHoldSeconds: number;
  /** 관측 시간(초) 합계. 실수 (Java double) */
  totalObservedSeconds: number;
}

/**
 * GET /api/v1/reports/sessions/{sessionId}/sets 응답 항목 (ReportRepository.findSessionSets, DTO 없는 Map).
 *
 * 업로드된 AI 세트 결과(exercise_set_results)만 담습니다. AI 결과가 업로드되지 않은 세트는 목록에 없습니다.
 * 순서는 서버 기준(수신 시각 received_at, set_id 오름차순)이며 수행 시각 순서와 다를 수 있습니다.
 * 반복 횟수·시간·수신 시각·routineSetId는 응답에 포함되지 않습니다.
 */
export interface ReportSessionSet {
  /** 결과 업로드용 세트 ID(UUID). 운동 계획의 세트 ID(routineSetId)와 다릅니다 */
  setId: string;
  /** AI 종목 코드 (예: pushup) */
  exercise: string;
  engineVersion: string;
  /**
   * 업로드한 AI set.completed 원문의 JSON 문자열 (DB jsonb를 text로 변환한 값, null 없음).
   * jsonb 저장 과정에서 키 순서·공백이 바뀔 수 있어 업로드한 바이트와 같지 않습니다.
   * 구조가 서버에서 고정되어 있지 않으므로 파싱하지 않고 그대로 보존합니다.
   */
  rawResult: string;
}

/**
 * POST .../sessions/{sessionId}/sets/{setId} 요청 본문 — AI set.completed 2.0 원문.
 *
 * Report 서버(ReportService.saveSet)가 검사하는 필드만 타입으로 적었습니다. AI 결과의 나머지 필드(details 등)는
 * 서버가 해석하지 않고 원문 그대로 저장하므로 unknown으로 보존합니다. AI 팀 스키마 전체를 정의한 타입이 아닙니다.
 */
export interface ReportSetCompletedPayload {
  schemaVersion: '2.0';
  type: 'set.completed';
  /** AI 종목 코드 [a-z][a-z0-9_-]{0,49} (예: pushup) */
  exercise: string;
  engineVersion: string;
  /** 모델 내부 시간(ms, 0 이상). 절대 시각으로 쓰지 않습니다 */
  timestampMs?: number | null;
  /** X-Workout-Performed-At 헤더가 없을 때만 서버가 읽는 수행 시각(ISO 8601 + 오프셋) */
  performedAt?: string | null;
  summary: ReportSetSummary;
  [key: string]: unknown;
}

/** set.completed의 summary. schemaVersion·exercise·engineVersion은 바깥 값과 같아야 합니다 */
export interface ReportSetSummary {
  schemaVersion: '2.0';
  exercise: string;
  engineVersion: string;
  /** 반복 횟수(0 이상 정수) */
  count?: number | null;
  /** 초, 0 이상 */
  holdSeconds?: number | null;
  observedSeconds?: number | null;
  gapSeconds?: number | null;
  /** 자세 항목 ID → 항목 집계. 빈 객체 허용 */
  items: Record<string, ReportSetItemSummary>;
  [key: string]: unknown;
}

/**
 * 자세 항목 집계. aggregationBasis·unit은 repetition·repetitions 또는 time·seconds 쌍.
 * 수치는 0 이상, evaluated = compliant + warning, compliancePct = 100 × compliant / evaluated (±0.1, evaluated 0이면 없음)
 */
export interface ReportSetItemSummary {
  aggregationBasis: 'repetition' | 'time';
  unit: 'repetitions' | 'seconds';
  compliant: number;
  warning: number;
  unknown: number;
  notApplicable: number;
  evaluated: number;
  compliancePct?: number | null;
  [key: string]: unknown;
}

/** 업로드 요청 헤더 값 */
export interface ReportSetUploadOptions {
  /** X-Workout-Performed-At — 실제 수행 시각(ISO 8601 + 오프셋). 없으면 서버 수신 시각으로 집계됩니다 */
  performedAt?: string;
  /** X-Routine-Set-Id — Workout 세션 스냅샷의 계획 세트 ID. 없으면 점수·리포트 집계에 쓰이지 않습니다 */
  routineSetId?: string;
}

/** 업로드 응답 (201). 같은 세트·같은 원문 재전송이면 already_saved */
export interface ReportSetUploadResult {
  setId: string;
  sessionId: string;
  status: 'saved' | 'already_saved';
}
