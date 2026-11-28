/**
 * 개발 빌드(__DEV__) 전용 로그 유틸.
 * - 태그 규칙: [TTS] 음성 출력, [WS] 코칭 웹소켓, [API] REST 요청/응답, [WorkoutSession] 단계 전환, [Camera] 카메라
 * - base64 오디오·긴 응답 본문은 잘라서 출력해 Metro 로그가 묻히지 않도록 한다.
 */
const MAX_STRING = 300;
const MAX_BODY = 1500;

function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    if (/^data:audio\//.test(value) || (value.length > 200 && /^[A-Za-z0-9+/=]+$/.test(value))) {
      return `<base64 ${value.length} chars>`;
    }
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(${value.length} chars)` : value;
  }
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = /token|password|authorization/i.test(k) ? '***' : sanitize(v, depth + 1);
  }
  return out;
}

function format(data: unknown): string {
  const json = JSON.stringify(sanitize(data));
  if (json === undefined) return '';
  return json.length > MAX_BODY ? `${json.slice(0, MAX_BODY)}…(${json.length} chars)` : json;
}

export function devLog(tag: string, message: string, data?: unknown): void {
  if (!__DEV__) return;
  if (data === undefined) console.log(`[${tag}] ${message}`);
  else console.log(`[${tag}] ${message}`, format(data));
}

export function devWarn(tag: string, message: string, data?: unknown): void {
  if (!__DEV__) return;
  if (data === undefined) console.warn(`[${tag}] ${message}`);
  else console.warn(`[${tag}] ${message}`, data instanceof Error ? data.message : format(data));
}
