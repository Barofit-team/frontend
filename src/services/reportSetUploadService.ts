/**
 * AI 세트 결과 업로드 (Report API — POST /api/v1/reports/sessions/{sessionId}/sets/{setId}).
 *
 * 서버 동작 (ReportController.saveSet → ReportService.saveSet):
 *  - 본문 JSON 파싱(실패 400) → Workout 소유 확인(없으면 404, Workout 401·403은 401, 그 밖은 503)
 *    → X-Routine-Set-Id가 있으면 Workout 스냅샷에서 계획 세트·종목 일치 확인(불일치 400) → 원문 검사(400) → 저장.
 *  - 세션 상태(진행 중·종료)는 확인하지 않습니다.
 *  - 같은 setId로 다시 보내면: 같은 사용자·세션·원문·수행 시각이면 다시 저장하지 않고 201 already_saved,
 *    하나라도 다르면 409. 계획 세트 ID 없이 저장된 결과에 나중에 같은 원문 + X-Routine-Set-Id를 보내면 연결됩니다.
 *  - 항목 하나라도 잘못되면 세트 전체가 저장되지 않습니다(트랜잭션 롤백).
 *
 * 이 모듈은 서버가 400(또는 DB 제약으로 500)을 낼 값을 요청 전에 막고, 원문은 바꾸지 않고 그대로 보냅니다.
 * 자동 재시도·큐는 두지 않습니다. 재전송 정책은 호출하는 운동 세션·AI 흐름이 정합니다.
 */
import { uploadReportSet } from '@/services/reportService';
import { ensureAccessToken } from '@/services/workoutRecordService';
import { expectFields, isObject, isString, isValidSessionId, mismatch } from '@/services/workoutSessionResultService';
import type { ReportSetCompletedPayload, ReportSetUploadOptions, ReportSetUploadResult } from '@/types/report';

/** Java String.isBlank 기준 공백 (Character.isWhitespace — 줄바꿈 없는 공백 U+00A0 등은 공백 아님) */
const JAVA_BLANK = /^[\t\n\u000B\f\r\u001C-\u001F \u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]*$/;
const EXERCISE_PATTERN = /^[a-z][a-z0-9_-]{0,49}$/;
const MAX_INT = 2147483647;
/** 서버: payload.toString().length() > 1,000,000 이면 400 (JSON 직렬화 길이 기준, 근사치) */
const MAX_PAYLOAD_LENGTH = 1_000_000;
/** DB 컬럼 길이 (engine_version, item_id VARCHAR(100)). 넘으면 서버 500 */
const MAX_DB_TEXT = 100;
/** OffsetDateTime.parse(ISO_OFFSET_DATE_TIME, 대소문자 무시). 연도는 4자리만 지원합니다 */
const OFFSET_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:[Zz]|([+-])(\d{2}):(\d{2})(?::(\d{2}))?)$/;

const isAbsent = (value: unknown) => value === undefined || value === null;
const isText = (value: unknown): value is string => typeof value === 'string' && !JAVA_BLANK.test(value);
const isNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isOptionalNonNegative = (value: unknown) => isAbsent(value) || isNonNegative(value);
const codePoints = (value: string) => [...value].length;

export function isValidOffsetDateTime(value: string): boolean {
  const m = OFFSET_DATE_TIME.exec(value);
  if (!m) return false;
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (m[7]) {
    const [oh, om, os] = [Number(m[8]), Number(m[9]), m[10] === undefined ? 0 : Number(m[10])];
    if (om > 59 || os > 59 || oh * 3600 + om * 60 + os > 18 * 3600) return false;
  }
  return true;
}

/**
 * JSON.stringify가 값을 바꾸지 않고 그대로 직렬화할 수 있는지.
 * NaN·Infinity(→ null), 배열 안 undefined(→ null), Date 등(toJSON 변환), 순환 참조는 원문이 바뀌거나 실패하므로 막습니다.
 * 객체의 undefined 속성은 빠지는데, 서버도 없는 값과 null을 같게 처리하므로 허용합니다.
 * 문자열의 U+0000은 DB(jsonb)가 거절해 서버 500이 되므로 막습니다.
 */
function findSerializationProblem(value: unknown, path: string, ancestors: Set<object>): string | null {
  if (value === null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path}: non-finite number`;
  if (typeof value === 'string') return value.includes('\u0000') ? `${path}: U+0000` : null;
  if (typeof value !== 'object') return `${path}: unsupported ${typeof value}`;
  if (ancestors.has(value)) return `${path}: circular`;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (value[i] === undefined) return `${path}[${i}]: undefined`;
        const problem = findSerializationProblem(value[i], `${path}[${i}]`, ancestors);
        if (problem) return problem;
      }
      return null;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return `${path}: not a plain object`;
    for (const [key, child] of Object.entries(value)) {
      if (key.includes('\u0000')) return `${path}: key with U+0000`;
      if (child === undefined) continue;
      const problem = findSerializationProblem(child, `${path}.${key}`, ancestors);
      if (problem) return problem;
    }
    return null;
  } finally {
    ancestors.delete(value);
  }
}

function findItemProblem(id: string, item: unknown): string | null {
  const at = `summary.items.${id}`;
  if (codePoints(id) > MAX_DB_TEXT) return `${at}: item id longer than ${MAX_DB_TEXT}`;
  if (!isObject(item)) return `${at}: not an object`;
  const { aggregationBasis: basis, unit } = item;
  if (!isText(basis) || !isText(unit)) return `${at}: aggregationBasis/unit`;
  if (!((basis === 'repetition' && unit === 'repetitions') || (basis === 'time' && unit === 'seconds'))) {
    return `${at}: invalid aggregation`;
  }
  for (const key of ['compliant', 'warning', 'unknown', 'notApplicable', 'evaluated'] as const) {
    if (!isNonNegative(item[key])) return `${at}.${key}`;
  }
  const compliant = item.compliant as number;
  const warning = item.warning as number;
  const evaluated = item.evaluated as number;
  if (Math.abs(evaluated - compliant - warning) > 0.000001) return `${at}: evaluated != compliant + warning`;
  const pct = item.compliancePct;
  if (!isOptionalNonNegative(pct) || (isNonNegative(pct) && pct > 100)) return `${at}.compliancePct`;
  const expected = evaluated === 0 ? null : (100 * compliant) / evaluated;
  if ((expected === null && !isAbsent(pct)) || (expected !== null && (isAbsent(pct) || Math.abs(expected - (pct as number)) > 0.1))) {
    return `${at}: compliancePct mismatch`;
  }
  return null;
}

/**
 * 서버(ReportService.saveSet)가 거절할 본문·헤더인지 확인합니다. 문제가 없으면 null, 있으면 위치 설명을 돌려줍니다.
 * 서버 규칙과 같은 범위만 확인합니다(예외: OffsetDateTime의 4자리 외 연도, 표준 형식이 아닌 UUID는 막음).
 * 계획 세트·종목이 Workout 스냅샷과 맞는지는 서버만 알 수 있어 확인하지 않습니다.
 */
export function findSetUploadProblem(payload: unknown, options: ReportSetUploadOptions = {}): string | null {
  if (!isObject(payload) || Object.getPrototypeOf(payload) !== Object.prototype) return 'payload: not an object';
  const { schemaVersion, type, exercise, engineVersion, summary } = payload;
  if (!isText(schemaVersion) || !isText(type) || !isText(exercise) || !isText(engineVersion)) {
    return 'payload: schemaVersion/type/exercise/engineVersion';
  }
  if (schemaVersion !== '2.0' || type !== 'set.completed' || !EXERCISE_PATTERN.test(exercise)) {
    return 'payload: unsupported Pose contract';
  }
  if (codePoints(engineVersion) > MAX_DB_TEXT) return `payload.engineVersion: longer than ${MAX_DB_TEXT}`;
  if (!isObject(summary)) return 'payload.summary: not an object';
  if (!isText(summary.schemaVersion) || !isText(summary.exercise) || !isText(summary.engineVersion)) {
    return 'payload.summary: schemaVersion/exercise/engineVersion';
  }
  if (summary.schemaVersion !== schemaVersion || summary.exercise !== exercise || summary.engineVersion !== engineVersion) {
    return 'payload.summary: contract mismatch';
  }
  const count = summary.count;
  if (!isAbsent(count) && !(Number.isInteger(count) && (count as number) >= 0 && (count as number) <= MAX_INT)) {
    return 'payload.summary.count';
  }
  for (const key of ['holdSeconds', 'observedSeconds', 'gapSeconds'] as const) {
    if (!isOptionalNonNegative(summary[key])) return `payload.summary.${key}`;
  }
  if (!isOptionalNonNegative(payload.timestampMs)) return 'payload.timestampMs';

  // 수행 시각: 헤더가 있으면 헤더만, 없으면 본문 performedAt(null 아님)을 서버가 읽습니다
  const header = options.performedAt;
  if (header !== undefined && !isString(header)) return 'options.performedAt';
  if (header !== undefined && !JAVA_BLANK.test(header)) {
    if (!isValidOffsetDateTime(header)) return 'options.performedAt: invalid';
  } else if (!isAbsent(payload.performedAt)) {
    if (!isText(payload.performedAt) || !isValidOffsetDateTime(payload.performedAt)) return 'payload.performedAt: invalid';
  }
  const routineSetId = options.routineSetId;
  if (routineSetId !== undefined && (!isString(routineSetId) || (!JAVA_BLANK.test(routineSetId) && !isValidSessionId(routineSetId)))) {
    return 'options.routineSetId: invalid';
  }

  if (!isObject(summary.items)) return 'payload.summary.items: not an object';
  for (const [id, item] of Object.entries(summary.items)) {
    const problem = findItemProblem(id, item);
    if (problem) return problem;
  }
  const serialization = findSerializationProblem(payload, 'payload', new Set());
  if (serialization) return serialization;
  if (JSON.stringify(payload).length > MAX_PAYLOAD_LENGTH) return 'payload: too large';
  return null;
}

const UPLOAD_STATUSES = new Set(['saved', 'already_saved']);

/** 응답 검증. 형식이 다르거나 요청한 세션·세트의 응답이 아니면 TypeError */
export function parseReportSetUploadResult(body: unknown, sessionId: string, setId: string): ReportSetUploadResult {
  if (!isObject(body)) mismatch('setUpload');
  expectFields(body, 'setUpload.', {
    setId: isString,
    sessionId: isString,
    status: (value) => isString(value) && UPLOAD_STATUSES.has(value),
  });
  if ((body.setId as string).toLowerCase() !== setId.toLowerCase()) mismatch('setUpload.setId');
  if ((body.sessionId as string).toLowerCase() !== sessionId.toLowerCase()) mismatch('setUpload.sessionId');
  return body as unknown as ReportSetUploadResult;
}

/**
 * AI 세트 결과 업로드. 순서: 식별자 → 본문·헤더 → 토큰 → 요청 → 응답 검증.
 * 잘못된 값이면 요청하지 않고 RangeError, 토큰이 없으면 ApiError(401), 응답이 다르면 TypeError를 던집니다.
 * 공백뿐인 헤더 값은 서버처럼 없는 값으로 보고 보내지 않습니다.
 */
export async function uploadReportSetResult(
  sessionId: string,
  setId: string,
  payload: ReportSetCompletedPayload,
  options: ReportSetUploadOptions = {}
): Promise<ReportSetUploadResult> {
  if (!isValidSessionId(sessionId)) throw new RangeError(`Invalid workout session id: ${sessionId}`);
  if (!isValidSessionId(setId)) throw new RangeError(`Invalid set id: ${setId}`);
  const problem = findSetUploadProblem(payload, options);
  if (problem) throw new RangeError(`Invalid set upload: ${problem}`);
  const headers: ReportSetUploadOptions = {};
  if (options.performedAt && !JAVA_BLANK.test(options.performedAt)) headers.performedAt = options.performedAt;
  if (options.routineSetId && !JAVA_BLANK.test(options.routineSetId)) headers.routineSetId = options.routineSetId;
  await ensureAccessToken();
  const body: unknown = await uploadReportSet(sessionId, setId, payload, headers);
  return parseReportSetUploadResult(body, sessionId, setId);
}
