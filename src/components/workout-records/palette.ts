/**
 * 월간 운동기록 화면 전용 색상 (Figma 시안 기준).
 * 공통 theme.ts는 변경하지 않고, 이 화면에서만 사용합니다.
 */
export const RecordColors = {
  background: '#FFFFFF',
  /** 일일 운동일지 영역 배경 */
  section: '#E9E9E9',
  card: '#FFFFFF',
  text: '#111111',
  textSecondary: '#6B6B6B',
  /** 기록 없는 지난 날짜 */
  dayText: '#8E8E8E',
  /** 다가올 날짜 */
  dayTextFuture: '#C6C6C6',
  completed: '#6E9E72',
  partial: '#A8D08D',
  missed: '#E2E2E2',
  missedText: '#B4B4B4',
  plannedBorder: '#9A9A9A',
  selected: '#111111',
  /** 이전/다음 달 버튼, 이미지 영역, 리포트 버튼 */
  control: '#EDEDED',
  white: '#FFFFFF',
} as const;
