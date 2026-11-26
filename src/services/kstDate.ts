/**
 * 한국 시간(Asia/Seoul) 날짜 계산. 한국은 일광절약시간이 없어 UTC+09:00 고정이다.
 * Routine 당일 계획·Workout/Report 종료일 집계와 같은 기준이며 기기 시간대와 무관하다.
 * (postureScoreService.toKstDateString과 같은 계산. 운동 저장 모듈이 Report API 의존성을 가져오지 않도록 분리)
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** epoch ms → 한국 시간 'YYYY-MM-DD'. 유한한 숫자가 아니면 null */
export function kstDateOf(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO 시각 문자열 → 한국 시간 'YYYY-MM-DD'. 읽을 수 없으면 null */
export function kstDateOfIso(value: unknown): string | null {
  return typeof value === 'string' ? kstDateOf(Date.parse(value)) : null;
}
