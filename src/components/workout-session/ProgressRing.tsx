/**
 * 원형 진행 링 (12시 방향에서 시계 방향). SVG 없이 반원 클리핑 View로 그립니다.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type ProgressRingProps = {
  size: number;
  stroke: number;
  /** 0 ~ 1 */
  progress: number;
  color: string;
  trackColor: string;
  children?: ReactNode;
};

export function ProgressRing({ size, stroke, progress, color, trackColor, children }: ProgressRingProps) {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const half = size / 2;
  const arc = {
    position: 'absolute' as const,
    top: 0,
    width: size,
    height: size,
    borderRadius: half,
    borderWidth: stroke,
    borderColor: 'transparent',
    borderTopColor: color,
    borderRightColor: color,
  };
  const rightDeg = Math.min(p, 0.5) * 360 - 135;
  const leftDeg = Math.max(p - 0.5, 0) * 360 + 45;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: half, borderWidth: stroke, borderColor: trackColor },
        ]}
      />
      {p > 0 && (
        <View style={[styles.clip, { left: half, width: half, height: size }]}>
          <View style={[arc, { left: -half, transform: [{ rotate: `${rightDeg}deg` }] }]} />
        </View>
      )}
      {p > 0.5 && (
        <View style={[styles.clip, { left: 0, width: half, height: size }]}>
          <View style={[arc, { left: 0, transform: [{ rotate: `${leftDeg}deg` }] }]} />
        </View>
      )}
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
