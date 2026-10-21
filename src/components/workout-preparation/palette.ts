import { Colors } from '@/constants/theme';

/**
 * 운동 준비 화면 전용 흑백 팔레트 (와이어프레임 기준).
 * 공통 theme.ts는 변경하지 않고, 이 화면들에서만 사용합니다.
 */
export const PrepColors = {
  background: Colors.background,
  text: Colors.text,
  textSecondary: Colors.textSecondary,
  /** 상단 아이콘 버튼 배경(흰 화면) / 칩 배경 */
  surface: Colors.surface,
  /** 카메라 영역 · 완료 상태 화면 배경 */
  cameraBackground: '#D9D9D9',
  /** 스마트폰 그래픽 테두리 · 원형 표시 */
  device: '#4A4A4A',
  /** 스마트폰 그래픽 화면 영역 */
  deviceScreen: '#EFEFEF',
  /** 회색 배경 위 스마트폰 화면 영역 */
  deviceScreenOnGray: '#E4E4E4',
  /** 점선 · 일러스트 선 */
  line: '#9A9A9A',
  /** 사람 머리 실루엣 */
  silhouette: '#BDBDBD',
  /** 각도 조절 완료(정렬) 원 — 와이어프레임 이후 요청으로 초록색 적용 */
  success: '#2E9E5B',
  black: '#111111',
  white: '#FFFFFF',
} as const;
