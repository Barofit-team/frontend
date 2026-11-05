/**
 * 저장된 운동 리포트 조회·생성 (Report API — GET·POST /api/v1/reports/sessions/{sessionId}/generated).
 *
 * 서버 동작 (GeneratedReportService):
 *  - GET: Workout 세션을 먼저 조회(없거나 남의 세션이면 404), 저장된 리포트가 없으면 404입니다.
 *    두 404는 code가 같아(NOT_FOUND) 프론트에서 구분하지 않습니다.
 *  - POST: 요청 본문이 없습니다. 이미 저장된 리포트가 있으면 다시 만들지 않고 그대로 돌려줍니다(200).
 *    처음 생성할 때는 세션이 COMPLETED·ABANDONED이고 종료 시각이 있어야 하며, 수행 세트가 1개 이상이고,
 *    수행한 모든 세트에 AI 결과가 있어야 합니다. 어기면 409입니다.
 *  - 리포트는 한 번 저장되면 바뀌지 않습니다. 문장은 서버가 TEMPLATE_V1 규칙으로 만듭니다.
 *
 * 응답은 검증만 하고 값은 바꾸지 않습니다.
 */
import { generateReport, getGeneratedReport } from '@/services/reportService';
import { ensureAccessToken } from '@/services/workoutRecordService';
import {
  expectFields,
  isInt,
  isNumber,
  isObject,
  isString,
  isValidSessionId,
  mismatch,
  orNull,
} from '@/services/workoutSessionResultService';
import type { ReportGenerated, ReportGeneratedExercise, ReportPostureItem } from '@/types/report';
import type { ExerciseResult, WorkoutSessionResult } from '@/types/workoutResult';

/** Map<String, Long> (오류 코드 → 횟수) */
const isCountMap = (value: unknown): boolean => isObject(value) && Object.values(value).every(isInt);

function checkPostureItem(value: unknown, path: string): asserts value is ReportPostureItem {
  if (!isObject(value)) mismatch(path);
  expectFields(value, `${path}.`, {
    itemId: isString,
    aggregationBasis: isString,
    unit: isString,
    compliant: isNumber,
    warning: isNumber,
    compliancePct: orNull(isNumber),
  });
}

function checkExercise(value: unknown, index: number): asserts value is ReportGeneratedExercise {
  const path = `generated.exercises[${index}]`;
  if (!isObject(value)) mismatch(path);
  expectFields(value, `${path}.`, {
    routineExerciseId: isString,
    exerciseId: isString,
    name: isString,
    performedSets: isInt,
    actualReps: isInt,
    actualDurationSeconds: isInt,
    postureScore: orNull(isNumber),
    errorCounts: isCountMap,
    postureItems: Array.isArray,
    strengths: orNull(isString),
    improvements: orNull(isString),
    nextGoal: orNull(isString),
  });
  (value.postureItems as unknown[]).forEach((item, i) => checkPostureItem(item, `${path}.postureItems[${i}]`));
}

/**
 * 응답이 백엔드 record(GeneratedReportService.Generated)와 같은 형태인지 확인합니다.
 * 다르거나 요청한 세션의 리포트가 아니면 TypeError를 던집니다.
 */
export function parseReportGenerated(body: unknown, requestedSessionId: string): ReportGenerated {
  if (!isObject(body)) mismatch('generated');
  expectFields(body, 'generated.', {
    sessionId: isString,
    routineName: isString,
    sessionStatus: isString,
    performedSets: isInt,
    plannedSets: isInt,
    restSeconds: orNull(isInt),
    activeDurationSeconds: isInt,
    elapsedSeconds: orNull(isInt),
    routineScore: orNull(isNumber),
    overallFeedback: isString,
    exercises: Array.isArray,
    generationMethod: isString,
  });
  (body.exercises as unknown[]).forEach(checkExercise);
  if ((body.sessionId as string).toLowerCase() !== requestedSessionId.toLowerCase()) mismatch('generated.sessionId');
  return body as unknown as ReportGenerated;
}

function assertSessionId(sessionId: string): void {
  if (!isValidSessionId(sessionId)) {
    throw new RangeError(`Invalid workout session id: ${sessionId}`);
  }
}

/** GET — 저장된 리포트 조회. 생성 전이면 ApiError(404) */
export async function fetchGeneratedReport(sessionId: string): Promise<ReportGenerated> {
  assertSessionId(sessionId);
  await ensureAccessToken();
  const body: unknown = await getGeneratedReport(sessionId);
  return parseReportGenerated(body, sessionId);
}

/**
 * POST — 리포트 생성(이미 있으면 저장본 반환). 본문 없이 보냅니다.
 * 서버가 같은 세션에 대해 멱등으로 동작하지만, 이 함수는 자동 재시도하지 않습니다.
 */
export async function requestReportGeneration(sessionId: string): Promise<ReportGenerated> {
  assertSessionId(sessionId);
  await ensureAccessToken();
  const body: unknown = await generateReport(sessionId);
  return parseReportGenerated(body, sessionId);
}

/** 결과 화면 요약 중 /generated로 1:1 대응하는 부분 */
export type GeneratedSummaryPart = Pick<WorkoutSessionResult, 'sessionId' | 'source' | 'completedSets'>;

/** 종목 카드 중 /generated로 1:1 대응하는 부분. 서버 값이 null인 문구는 넣지 않습니다(undefined) */
export type GeneratedExercisePart = Pick<
  ExerciseResult,
  'exerciseId' | 'exerciseName' | 'completedSets' | 'completedReps' | 'score'
> &
  Partial<Pick<ExerciseResult, 'goodFeedback' | 'improvementFeedback' | 'nextGoal'>> & {
    /** 루틴 내 종목 ID. 같은 종목이 두 번 있을 때 구분용 */
    routineExerciseId: string;
  };

export interface GeneratedReportScreenParts {
  summary: GeneratedSummaryPart;
  /** 서버 순서(루틴 스냅샷의 종목 순서) 그대로 */
  exercises: GeneratedExercisePart[];
}

/**
 * 리포트 → 결과 화면 모델 중 의미가 1:1로 같은 필드만 옮깁니다.
 *  - strengths → goodFeedback(잘한 점), improvements → improvementFeedback(개선할 점),
 *    nextGoal → nextGoal(종목별 다음 목표). null이면 넣지 않음
 *  - performedSets → completedSets, actualReps → completedReps, postureScore → score(반올림 없음, null → undefined)
 *
 * 옮기지 않은 것 (규칙 미정):
 *  - nextFocus(세션당 하나): nextGoal은 종목별이라 어느 종목 값을 쓸지 정하지 않고 종목 카드에 둡니다
 *  - errorCounts → mainError·errorCount: 오류 코드의 한국어 이름과 "주요 오류" 선정 기준이 없음
 *  - overallFeedback: 대응하는 화면 항목 없음
 *  - 시간 3종: STEP 5와 같은 미정 사항
 */
export function toGeneratedReportScreenParts(report: ReportGenerated): GeneratedReportScreenParts {
  return {
    summary: { sessionId: report.sessionId, source: 'api', completedSets: report.performedSets },
    exercises: report.exercises.map((exercise) => ({
      routineExerciseId: exercise.routineExerciseId,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name,
      completedSets: exercise.performedSets,
      completedReps: exercise.actualReps,
      score: exercise.postureScore ?? undefined,
      ...(exercise.strengths !== null ? { goodFeedback: exercise.strengths } : {}),
      ...(exercise.improvements !== null ? { improvementFeedback: exercise.improvements } : {}),
      ...(exercise.nextGoal !== null ? { nextGoal: exercise.nextGoal } : {}),
    })),
  };
}
