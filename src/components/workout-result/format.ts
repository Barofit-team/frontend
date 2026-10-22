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
