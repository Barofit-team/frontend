/**
 * 월간 운동기록 화면 전용 색상 (Figma 시안 기준).
 * 공통 theme.ts는 변경하지 않고, 이 화면에서만 사용합니다.
 */
export const RecordColors = {
  background: '#FFFFFF',
  /** 일일 운동일지 영역 배경 */
  section: '#F3F6FC',
  card: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  /** 기록 없는 지난 날짜 */
  dayText: '#374151',
  /** 다가올 날짜 */
  dayTextFuture: '#9CA3AF',
  /** 운동을 진행한 날 (연한 파란색) */
  completed: '#DCE8FF',
  partial: '#DCE8FF',
  completedText: '#2563EB',
  missed: '#F3F4F6',
  missedText: '#9CA3AF',
  plannedBorder: '#D1D5DB',
  /** 사용자가 선택한 날짜 (검은색) */
  selected: '#111827',
  /** 메타 박스 / 보조 배경 */
  control: '#F4F6F9',
  accent: '#2563EB',
  accentSoft: '#EFF5FF',
  white: '#FFFFFF',
} as const;
