/** 초 → "8분 00초" */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}분 ${String(seconds).padStart(2, '0')}초`;
}

/** "2026-10-12" → "10/12" (시간대 영향을 받지 않도록 문자열로 처리) */
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  if (!month || !day) return isoDate;
  return `${Number(month)}/${Number(day)}`;
}

/**
 * 자세 점수 표시값 (정수 반올림). 서버 점수는 0~100 실수이며 원본 값은 바꾸지 않고 화면 출력에만 씁니다.
 * 예) 66.66666666666667 → "67", 84 → "84"
 */
export function formatScore(score: number): string {
  return String(Math.round(score));
}
