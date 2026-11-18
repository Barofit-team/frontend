/**
 * User Position 가이드 (카메라 영역 위 오버레이).
 *  - 전신이 들어올 점선 유도 박스 및 상단 인식 상태/진행률 배지만 표시합니다.
 *  - 유도 박스 내부 스켈레톤 모형은 표시하지 않습니다.
 */
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { DottedLine } from './DottedLine';
import { PrepColors } from './palette';

type Point = { x: number; y: number };

const BOX_RATIO = 2.4; // 세로 / 가로
const CORNER_DOT = 7;

type UserPositionGuideProps = {
  recognized: boolean;
  status?: 'no_person' | 'adjust_camera' | 'stabilizing' | 'ready';
  recognizedJointCount?: number;
  requiredJointCount?: number;
  stabilityProgress?: number;
  detailMessage?: string;
};

export function UserPositionGuide({
  recognized,
  status,
  recognizedJointCount = 0,
  requiredJointCount = 6,
  stabilityProgress = 0,
  detailMessage,
}: UserPositionGuideProps) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  };

  const isStabilizing = status === 'stabilizing';
  const isReady = recognized || status === 'ready';

  // 가이드 박스 색상: 준비 완료(초록) / 안정화 중(연초록) / 일부 누락(주황) / 미확보(검정)
  const guideColor = isReady
    ? '#22C55E'
    : isStabilizing
      ? '#4ADE80'
      : status === 'adjust_camera'
        ? '#F59E0B'
        : PrepColors.black;

  // 영역 안에 1:2.4 박스를 최대한 크게 (가로는 최대 46%).
  const heightRatio = 0.78;
  const boxHeight = Math.min(area.height * heightRatio, area.width * 0.46 * BOX_RATIO);
  const boxWidth = boxHeight / BOX_RATIO;
  const left = (area.width - boxWidth) / 2;
  const top = (area.height - boxHeight) / 2 + boxWidth * 0.12;

  const corners: Point[] = [
    { x: left, y: top },
    { x: left + boxWidth, y: top },
    { x: left + boxWidth, y: top + boxHeight },
    { x: left, y: top + boxHeight },
  ];

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {area.width > 0 && (
        <View style={styles.statusBannerWrapper}>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isReady
                    ? '#22C55E'
                    : isStabilizing
                      ? '#4ADE80'
                      : status === 'adjust_camera'
                        ? '#F59E0B'
                        : '#9CA3AF',
                },
              ]}
            />
            <Text style={styles.statusPillText} numberOfLines={1}>
              {detailMessage ??
                `주요 신체 점 ${isReady ? requiredJointCount : recognizedJointCount}/${requiredJointCount} 인식`}
            </Text>
          </View>
          {(isStabilizing || isReady) && (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round((isReady ? 1 : stabilityProgress) * 100)}%`,
                    backgroundColor: '#22C55E',
                  },
                ]}
              />
            </View>
          )}
        </View>
      )}

      {area.width > 0 && (
        <>
          {corners.map((c, i) => (
            <DottedLine
              key={`edge-${i}`}
              from={c}
              to={corners[(i + 1) % 4]}
              dotSize={2}
              gap={4}
              color={guideColor}
            />
          ))}
          {corners.map((c, i) => (
            <View
              key={`corner-${i}`}
              style={[styles.dot, dot(c, CORNER_DOT), { backgroundColor: guideColor }]}
            />
          ))}
        </>
      )}
    </View>
  );
}

function dot(p: Point, size: number) {
  return { left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, borderRadius: size / 2 };
}

const styles = StyleSheet.create({
  container: { flex: 1, alignSelf: 'stretch' },
  dot: { position: 'absolute' },
  statusBannerWrapper: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17, 17, 17, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: '92%',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    width: 160,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
});
