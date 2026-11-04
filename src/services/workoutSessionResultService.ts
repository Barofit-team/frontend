/**
 * 운동 결과 상세 조회 (Report API — GET /api/v1/reports/sessions/{sessionId}/result).
 *
 * 서버 동작 (ReportViewService.result):
 *  - 결과를 미리 만들어 두지 않고, 요청 시 Workout 세션 + 업로드된 AI 세트 결과로 계산합니다.
 *    그래서 "결과 미생성" 상태가 따로 없습니다.
 *  - 세션이 없거나 본인 세션이 아니면 Workout 404 → 404입니다.
 *  - 수행 세트가 없어도 200입니다(수치 0, 점수 null). 이 경우를 어떻게 보여줄지는 화면에서 정할 일이라
 *    여기서 "빈 결과" 규칙을 만들지 않습니다.
 *
 * 응답은 검증만 하고 값은 바꾸지 않습니다(반올림·단위 변환·null 대체 없음).
 */
import { getReportWorkoutResult } from '@/services/reportService';
import { ensureAccessToken } from '@/services/workoutRecordService';
import type {
  ReportExerciseResult,
  ReportFeedback,
  ReportSessionPostureItem,
  ReportSessionPostureSummary,
  ReportWorkoutResult,
} from '@/types/report';
import type { ExerciseResult, WorkoutSessionResult } from '@/types/workoutResult';

/**
 * 표준 UUID 문자열(8-4-4-4-12, 16진수, 대소문자 무관).
 * 서버(UUID.fromString)는 '1-1-1-1-1' 같은 짧은 형태도 받지만, 앱이 다루는 세션 ID만 보내도록 표준 형식으로 제한합니다.
 * Mock 결과의 'mock-session-…'은 여기서 걸러져 서버로 가지 않습니다.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(sessionId: string): boolean {
  return UUID_PATTERN.test(sessionId);
}

type Json = Record<string, unknown>;

// ── 응답 검증 도우미 (generatedReportService·reportFeedbackService에서도 사용) ──
export const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isString = (value: unknown): value is string => typeof value === 'string';
/** Java int/long */
export const isInt = (value: unknown): value is number => Number.isInteger(value);
/** Java double */
export const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
export const orNull =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    value === null || check(value);

/** 응답 형식이 계약과 다를 때. path 예: 'exercises[0].name', 'generated.exercises[0].strengths' */
export function mismatch(field: string): never {
  throw new TypeError(`Unexpected report response: ${field}`);
}

export function expectFields(value: Json, path: string, fields: Record<string, (value: unknown) => boolean>): void {
  for (const [key, check] of Object.entries(fields)) {
    if (!check(value[key])) mismatch(`${path}${key}`);
  }
}

/** 백엔드 허용 난이도 (ReportViewService.saveFeedback, workout_feedback CHECK) */
export const DIFFICULTIES: ReadonlySet<string> = new Set(['EASY', 'MODERATE', 'HARD']);

export function isFeedback(value: unknown): value is ReportFeedback {
  return (
    isObject(value) &&
    isString(value.difficulty) &&
    DIFFICULTIES.has(value.difficulty) &&
    isStringArray(value.discomfortAreas)
  );
}

function checkExercise(value: unknown, index: number): asserts value is ReportExerciseResult {
  if (!isObject(value)) mismatch(`exercises[${index}]`);
  expectFields(value, `exercises[${index}].`, {
    exerciseId: isString,
    name: isString,
    plannedSets: isInt,
    completedSets: isInt,
    actualReps: isInt,
    actualDurationSeconds: isInt,
    feedbackCodes: isStringArray,
    deviceFeedback: isStringArray,
    postureScore: orNull(isNumber),
  });
}

function checkPostureItem(value: unknown, index: number): asserts value is ReportSessionPostureItem {
  if (!isObject(value)) mismatch(`postureSummary.postureItems[${index}]`);
  expectFields(value, `postureSummary.postureItems[${index}].`, {
    itemId: isString,
    exercise: isString,
    engineVersion: isString,
    aggregationBasis: isString,
    unit: isString,
    compliant: isNumber,
    warning: isNumber,
    unknown: isNumber,
    notApplicable: isNumber,
    evaluated: isNumber,
    compliancePct: orNull(isNumber),
  });
}

/** /result의 postureSummary와 /summary 응답(같은 Repository 메서드)의 형식 검사 */
export function checkPostureSummary(value: unknown): asserts value is ReportSessionPostureSummary {
  if (!isObject(value)) mismatch('postureSummary');
  expectFields(value, 'postureSummary.', {
    sessionId: isString,
    setCount: isInt,
    totalReps: isInt,
    totalHoldSeconds: isNumber,
    totalObservedSeconds: isNumber,
    postureItems: Array.isArray,
  });
  (value.postureItems as unknown[]).forEach(checkPostureItem);
}

/**
 * 응답 본문이 백엔드 record(ReportViewService.WorkoutResult)와 같은 형태인지 확인합니다.
 * 다르면 TypeError를 던져, 잘못된 값이 화면에 표시되거나 빈 결과로 오인되지 않게 합니다.
 * 응답의 sessionId가 요청한 세션과 다를 때도 오류입니다(서버는 UUID를 소문자로 돌려줍니다).
 */
export function parseReportWorkoutResult(body: unknown, requestedSessionId: string): ReportWorkoutResult {
  if (!isObject(body)) mismatch('body');
  expectFields(body, '', {
    sessionId: isString,
    routineId: isString,
    routineName: isString,
    status: isString,
    plannedSets: isInt,
    completedSets: isInt,
    totalReps: isInt,
    activeDurationSeconds: isInt,
    elapsedSeconds: orNull(isInt),
    restSeconds: orNull(isInt),
    exercises: Array.isArray,
    routineScore: orNull(isNumber),
    scoredExercises: isInt,
    plannedExercises: isInt,
    feedback: orNull(isFeedback),
  });
  (body.exercises as unknown[]).forEach(checkExercise);
  checkPostureSummary(body.postureSummary);
  if ((body.sessionId as string).toLowerCase() !== requestedSessionId.toLowerCase()) mismatch('sessionId');
  return body as unknown as ReportWorkoutResult;
}

/**
 * 운동 결과 조회. sessionId가 표준 UUID가 아니면 요청하지 않고 RangeError,
 * 토큰이 없으면 요청하지 않고 ApiError(401), 응답 형식이 다르면 TypeError를 던집니다.
 */
export async function fetchReportWorkoutResult(sessionId: string): Promise<ReportWorkoutResult> {
  if (!isValidSessionId(sessionId)) {
    throw new RangeError(`Invalid workout session id: ${sessionId}`);
  }
  await ensureAccessToken();
  const body: unknown = await getReportWorkoutResult(sessionId);
  return parseReportWorkoutResult(body, sessionId);
}

/** 결과 화면 요약 카드 중 /result 값으로 바로 채울 수 있는 부분 */
export type WorkoutResultSummaryPart = Pick<WorkoutSessionResult, 'sessionId' | 'source' | 'completedSets' | 'totalReps'>;

/** 종목 카드 중 /result 값으로 바로 채울 수 있는 부분 */
export type ExerciseResultPart = Pick<
  ExerciseResult,
  'exerciseId' | 'exerciseName' | 'completedSets' | 'completedReps' | 'score'
>;

export interface WorkoutResultScreenParts {
  summary: WorkoutResultSummaryPart;
  /** 서버 순서(루틴 스냅샷의 종목 순서) 그대로 */
  exercises: ExerciseResultPart[];
}

/**
 * API 응답 → 결과 화면 모델(types/workoutResult.ts) 중 의미가 1:1로 같은 필드만 옮깁니다.
 *
 * 옮기지 않은 화면 필드 (근거가 없거나 규칙이 정해지지 않아 만들지 않음):
 *  - exerciseDurationSeconds·restDurationSeconds·totalDurationSeconds: activeDurationSeconds·restSeconds(null 가능)·
 *    elapsedSeconds(null 가능) 중 무엇을 어떻게 쓸지 미정
 *  - goodFeedback·improvementFeedback·nextFocus: /result에 없음 (/generated의 strengths·improvements·nextGoal)
 *  - mainError·errorCount: /result에는 feedbackCodes(횟수 없음)만 있음 (/generated의 errorCounts)
 *  - postureScore(점수 추이 차트): /scores API (postureScoreService)
 * score는 반올림하지 않고, 점수가 없으면(null) 화면 타입 규칙대로 비워 둡니다(undefined).
 */
export function toWorkoutResultScreenParts(result: ReportWorkoutResult): WorkoutResultScreenParts {
  return {
    summary: {
      sessionId: result.sessionId,
      source: 'api',
      completedSets: result.completedSets,
      totalReps: result.totalReps,
    },
    exercises: result.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name,
      completedSets: exercise.completedSets,
      completedReps: exercise.actualReps,
      score: exercise.postureScore ?? undefined,
    })),
  };
}
