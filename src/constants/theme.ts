/**
 * 임시 테마입니다. 디자인(PD) 확정 전까지는 최소한의 값만 둡니다.
 * 디자인 시안이 나오면 이 파일의 값만 교체합니다.
 */

export const Colors = {
  primary: '#208AEF',
  background: '#FFFFFF',
  surface: '#F4F5F7',
  text: '#111111',
  textSecondary: '#60646C',
  border: '#E0E1E6',
  danger: '#E5484D',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const FontSize = {
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
} as const;
