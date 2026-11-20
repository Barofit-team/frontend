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

/**
 * F03 운동 준비 플로우 1차 디자인(Figma 캡처 2026-11-20) 색상.
 * Figma 원본 속성을 받기 전까지 캡처에서 읽은 근삿값입니다(docs/F03-design-discussion.md).
 * F04·결과 화면이 쓰는 PrepColors와 분리해 다른 화면에 영향이 없도록 합니다.
 */
export const F03Colors = {
  background: '#FFFFFF',
  text: '#111111',
  textSecondary: '#8B8F97',
  /** 브랜드 파랑: '다음' 버튼, 체크 원, 일러스트 테두리 */
  primary: '#2563EB',
  primaryPressed: '#1D4ED8',
  /** 각도 인디케이터 원 */
  indicator: '#5B8DEF',
  /** 각도 가이드 스마트폰 외곽선 / 화면 */
  deviceOutline: '#D6E2FA',
  deviceFill: '#EEF3FD',
  /** 각도 가이드 중심 점선 */
  guideLine: '#8FA9DE',
  /** 배치 일러스트 스마트폰 */
  illustrationDevice: '#2F5BD0',
  illustrationDeviceFill: '#EEF3FF',
  /** 배치 일러스트 벽·바닥 선 */
  illustrationLine: '#DADDE3',
  /** 안내 칩 */
  chipBackground: '#EEF2F8',
  chipText: '#2B3F6B',
  /** 상단 원형 버튼 (흰 화면) */
  headerButton: '#F2F3F5',
  /** 상단 원형 버튼 (카메라 화면) */
  headerButtonOnCamera: 'rgba(255,255,255,0.72)',
  /** 각도 정렬 완료 배경 그라데이션 (위 → 아래) */
  alignedGradientTop: '#BCD3FF',
  alignedGradientBottom: '#F7F9FF',
  /** 카메라 화면 */
  cameraBackground: '#1B1C1F',
  onCamera: '#FFFFFF',
  cameraScrimTop: 'rgba(0,0,0,0.55)',
  cameraScrimBottom: 'rgba(0,0,0,0.6)',
  /** 인식 완료 상단 그라데이션 */
  completeGradientTop: 'rgba(30,79,216,0.92)',
  /** 준비 단계 스켈레톤(밝은 계열) */
  skeletonBone: 'rgba(255,255,255,0.92)',
  skeletonJoint: '#FFFFFF',
} as const;
