import type { PoseFrame } from '@barofit/pose';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

const LEFT_JOINTS = [11, 13, 15, 23, 25, 27, 29, 31] as const;
const RIGHT_JOINTS = [12, 14, 16, 24, 26, 28, 30, 32] as const;
const BOTH_JOINTS = [...LEFT_JOINTS, ...RIGHT_JOINTS] as const;

const LEFT_BONES: readonly [number, number][] = [
  [11, 13],
  [13, 15],
  [11, 23],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
];

const RIGHT_BONES: readonly [number, number][] = [
  [12, 14],
  [14, 16],
  [12, 24],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
];

const BOTH_BONES: readonly [number, number][] = [
  [11, 12],
  [23, 24],
  ...LEFT_BONES,
  ...RIGHT_BONES,
];

export interface PoseSkeletonOverlayProps {
  frame: PoseFrame | null;
  selectedSide?: 'left' | 'right' | 'both' | null;
  /** 스켈레톤 표시 여부 (기본 true) */
  visible?: boolean;
  /** 전면 카메라 거울 반전 여부 (기본 true) */
  mirrorX?: boolean;
  minVisibility?: number;
}

/**
 * 추출된 33개 관절 좌표(PoseFrame)를 받아 카메라 프리뷰 위에 스켈레톤을 렌더링하는
 * 순수 React Native(크로스 플랫폼) 오버레이 컴포넌트.
 */
export function PoseSkeletonOverlay({
  frame,
  selectedSide = 'both',
  visible = true,
  mirrorX = true,
  minVisibility = 0.5,
}: PoseSkeletonOverlayProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  if (!visible || !frame || frame.landmarks.length < 33) {
    return <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout} />;
  }

  const effectiveSide: 'left' | 'right' | 'both' =
    selectedSide === 'left' || selectedSide === 'right' ? selectedSide : 'both';

  const vw = size.width;
  const vh = size.height;
  if (vw <= 0 || vh <= 0) {
    return <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout} />;
  }

  const imgW = Math.max(1, frame.width);
  const imgH = Math.max(1, frame.height);
  const scale = Math.max(vw / imgW, vh / imgH);
  const scaledW = imgW * scale;
  const scaledH = imgH * scale;
  const offsetX = (vw - scaledW) / 2;
  const offsetY = (vh - scaledH) / 2;

  const mx = (v: number) => {
    const norm = mirrorX ? 1 - v : v;
    return offsetX + norm * scaledW;
  };
  const my = (v: number) => offsetY + v * scaledH;

  const activeBones =
    effectiveSide === 'both' ? BOTH_BONES : effectiveSide === 'left' ? LEFT_BONES : RIGHT_BONES;
  const activeJoints =
    effectiveSide === 'both' ? BOTH_JOINTS : effectiveSide === 'left' ? LEFT_JOINTS : RIGHT_JOINTS;

  const pts = frame.landmarks;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {activeBones.map(([a, b]) => {
        const pa = pts[a];
        const pb = pts[b];
        if (
          !pa ||
          !pb ||
          pa[0] === null ||
          pa[1] === null ||
          pb[0] === null ||
          pb[1] === null ||
          (pa[3] ?? 0) < minVisibility ||
          (pb[3] ?? 0) < minVisibility
        ) {
          return null;
        }
        const x1 = mx(pa[0]);
        const y1 = my(pa[1]);
        const x2 = mx(pb[0]);
        const y2 = my(pb[1]);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        if (length < 1) return null;
        const angleRad = Math.atan2(dy, dx);
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;

        return (
          <View
            key={`bone-${a}-${b}`}
            style={[
              styles.bone,
              {
                width: length,
                left: cx - length / 2,
                top: cy - 1.5,
                transform: [{ rotateZ: `${angleRad}rad` }],
              },
            ]}
          />
        );
      })}
      {activeJoints.map((idx) => {
        const pt = pts[idx];
        if (!pt || pt[0] === null || pt[1] === null || (pt[3] ?? 0) < minVisibility) {
          return null;
        }
        const x = mx(pt[0]);
        const y = my(pt[1]);
        return (
          <View
            key={`joint-${idx}`}
            style={[
              styles.joint,
              {
                left: x - 5,
                top: y - 5,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bone: {
    position: 'absolute',
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0, 230, 118, 0.82)',
  },
  joint: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 23, 68, 0.9)',
  },
});
