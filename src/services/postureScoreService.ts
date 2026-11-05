/**
 * 종목별 자세 점수 이력 조회 (Report API — GET /api/v1/reports/exercises/{exerciseId}/scores).
 *
 * 서버 응답(ReportScoreHistory[], 최신순)을 결과 화면 차트 타입(types/workoutResult.ts의 PostureScorePoint[],
 * 오래된 순)으로 바꿉니다.
 *  - score: 백엔드가 0~100 사이 실수(항목별 준수 비율 평균)를 반올림 없이 줍니다. 기준이 정해지지 않아
 *    여기서는 반올림·범위 보정을 하지 않습니다.
 *  - 서버 응답에 이번 운동 점수가 이미 들어 있을 수 있어, 다른 데이터(Mock 등)와 합치지 않습니다.
 */
import { getExerciseScoreHistory } from '@/services/reportService';
import { ensureAccessToken } from '@/services/workoutRecordService';
import type { ReportScoreHistory } from '@/types/report';
import type { PostureScoreHistory, PostureScorePoint } from '@/types/workoutResult';

/** 기본 조회 개수. 백엔드 기본값(3)과 같고, 결과 화면 차트의 최대 막대 수와도 같습니다 */
export const POSTURE_SCORE_HISTORY_LIMIT = 3;

/** 백엔드 검증 규칙 (ReportViewService.scoreHistory) */
const EXERCISE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,49}$/;
const MIN_LIMIT = 1;
const MAX_LIMIT = 30;

/** 서버가 400으로 거절할 exerciseId·limit인지 요청 전에 확인합니다 */
export function isValidScoreHistoryRequest(exerciseId: string, limit: number): boolean {
  return EXERCISE_ID_PATTERN.test(exerciseId) && Number.isInteger(limit) && limit >= MIN_LIMIT && limit <= MAX_LIMIT;
}

/** 한국은 일광절약시간이 없어 UTC+09:00 고정입니다 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO 8601 Instant (예: 2026-11-02T15:30:00.123456789Z, +09:00 같은 오프셋 포함) */
const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Instant 문자열 → epoch ms. 형식이 다르면 null.
 * Java Instant는 소수점 아래를 9자리까지 보낼 수 있어, 모든 JS 엔진이 읽을 수 있도록 밀리초(3자리)로 자릅니다.
 */
function parseInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = INSTANT_PATTERN.exec(value);
  if (!match) return null;
  const [, base, fraction = '', offset] = match;
  const ms = Date.parse(`${base}.${fraction.slice(0, 3).padEnd(3, '0')}${offset}`);
  return Number.isFinite(ms) ? ms : null;
}

function kstDateOf(ms: number): string {
  const kst = new Date(ms + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${padTwo(kst.getUTCMonth() + 1)}-${padTwo(kst.getUTCDate())}`;
}

/** Instant 문자열 → 한국 시간 기준 'YYYY-MM-DD'. 형식이 다르면 null */
export function toKstDateString(instant: string): string | null {
  const ms = parseInstant(instant);
  return ms === null ? null : kstDateOf(ms);
}

/**
 * 서버 응답 → 차트 점수 목록 (오래된 순, 마지막이 가장 최근).
 * 원본 배열은 바꾸지 않습니다. 날짜를 읽을 수 없거나 점수가 숫자가 아닌 항목은 제외합니다.
 */
export function toPostureScorePoints(items: readonly ReportScoreHistory[]): PostureScorePoint[] {
  return items
    .map((item) => ({ ms: parseInstant(item.completedAt), score: item.score }))
    .filter((item): item is { ms: number; score: number } => item.ms !== null && Number.isFinite(item.score))
    .sort((a, b) => a.ms - b.ms)
    .map(({ ms, score }) => ({ date: kstDateOf(ms), score }));
}

/** 차트 컴포넌트(PostureScoreChart)에 넘길 형태로 묶습니다 */
export function toPostureScoreHistory(
  exerciseId: string,
  exerciseName: string,
  points: readonly PostureScorePoint[]
): PostureScoreHistory {
  return { exerciseId, exerciseName, history: [...points] };
}

/** 종목 점수 이력 조회. 잘못된 exerciseId·limit이면 요청하지 않고 RangeError를 던집니다 */
export async function fetchPostureScorePoints(
  exerciseId: string,
  limit: number = POSTURE_SCORE_HISTORY_LIMIT
): Promise<PostureScorePoint[]> {
  if (!isValidScoreHistoryRequest(exerciseId, limit)) {
    throw new RangeError(`Invalid score history request: exerciseId=${exerciseId}, limit=${limit}`);
  }
  await ensureAccessToken();
  const items = await getExerciseScoreHistory(exerciseId, limit);
  return toPostureScorePoints(items);
}
