/**
 * F04 운동 코칭 1차 디자인(Figma 캡처 2026-11-20) 색상.
 * 공통 값은 F03 토큰(F03Colors)을 재사용하고, F04에만 필요한 값만 둡니다. 캡처 근삿값입니다.
 */
import { F03Colors } from '@/components/workout-preparation/palette';

export const SessionColors = {
  primary: F03Colors.primary,
  primaryText: '#4C82FF',
  onCamera: F03Colors.onCamera,
  /** 상단·하단 어두운 영역 */
  base: '#1E1E1E',
  baseTransparent: 'rgba(30,30,30,0)',
  /** 강조 상태(운동 시작·복귀·세트 완료) 상단 네이비 */
  accentTop: '#1F3A8A',
  /** 타이머 숫자 */
  timer: '#E4E4E7',
  /** 원형 링·진행 바 트랙 */
  track: '#3F4148',
  /** 하단 pill */
  pill: 'rgba(232,232,234,0.82)',
  pillText: '#1A1A1A',
  pillSubText: '#55575D',
  pillButton: '#FFFFFF',
  /** 일시정지 화면 */
  dim: 'rgba(18,18,20,0.86)',
  card: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.1)',
  textMuted: 'rgba(255,255,255,0.55)',
  /** 바텀시트 */
  sheet: '#FFFFFF',
  sheetText: '#111111',
  sheetSubText: '#6B6F76',
  skeletonBone: F03Colors.skeletonBone,
  skeletonJoint: F03Colors.skeletonJoint,
} as const;
