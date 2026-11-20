/**
 * User Position 가이드 (전체화면 카메라 위 오버레이). 표시 전용입니다.
 *
 * 1차 디자인(Figma 캡처 User Position 3·4):
 *  - 인식 중: 상단 흰 안내 문구 + 신체 위치 점선 박스
 *  - 인식 완료: 파란 체크 원 + '자세 인식 완료!' (점선 박스 숨김, 스켈레톤은 카메라 레이어가 그림)
 *
 * 시안에 없지만 기존 기능이라 유지한 것: 인식 상태 pill(주요 신체 점 n/m, 안정화 진행 바).
 * → docs/F03-design-discussion.md
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { DottedLine } from './DottedLine';
import { CheckCircle } from './PreparationIcons';
import { F03Colors } from './palette';

type Point = { x: number; y: number };

/** 점선 박스: 가로 = 영역 너비 42%, 세로/가로 2.3, 영역 31% 지점에서 시작 (캡처 근삿값) */
const BOX_WIDTH_RATIO = 0.42;
const BOX_ASPECT = 2.3;
const BOX_TOP_RATIO = 0.31;
const BOX_MAX_HEIGHT_RATIO = 0.55;
const CORNER_DOT = 6;
const COMPLETE_FADE_MS = 250;

export const USER_POSITION_HEADLINE = '전신이 보이게\n뒤로 물러나 주세요';
export const USER_POSITION_COMPLETE_HEADLINE = '자세 인식 완료!';

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

  const isReady = recognized || status === 'ready';
  const isStabilizing = status === 'stabilizing';

  // 완료 표현 페이드인 (대기로 돌아가면 즉시 숨김)
  const completeOpacity = useRef(new Animated.Value(isReady ? 1 : 0)).current;
  useEffect(() => {
    if (!isReady) {
      completeOpacity.setValue(0);
      return;
    }
    const animation = Animated.timing(completeOpacity, {
      toValue: 1,
      duration: COMPLETE_FADE_MS,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [isReady, completeOpacity]);

  const boxWidth = area.width * BOX_WIDTH_RATIO;
  const boxHeight = Math.min(boxWidth * BOX_ASPECT, area.height * BOX_MAX_HEIGHT_RATIO);
  const left = (area.width - boxWidth) / 2;
  const top = area.height * BOX_TOP_RATIO;
  const corners: Point[] = [
    { x: left, y: top },
    { x: left + boxWidth, y: top },
    { x: left + boxWidth, y: top + boxHeight },
    { x: left, y: top + boxHeight },
  ];

  const dotColor = isReady
    ? '#22C55E'
    : isStabilizing
      ? '#4ADE80'
      : status === 'adjust_camera'
        ? '#F59E0B'
        : '#9CA3AF';

  return (
    <View style={styles.container} pointerEvents="none" onLayout={onLayout}>
      {isReady ? (
        <Animated.View style={[styles.headlineBlock, { opacity: completeOpacity }]}>
          <CheckCircle size={36} background={F03Colors.primary} />
          <Text style={styles.headline} accessibilityRole="header" accessibilityLiveRegion="polite">
            {USER_POSITION_COMPLETE_HEADLINE}
          </Text>
        </Animated.View>
      ) : (
        <View style={styles.headlineBlock}>
          <Text style={styles.headline} accessibilityRole="header">
            {USER_POSITION_HEADLINE}
          </Text>
          <View style={styles.statusPill} accessibilityLiveRegion="polite">
            <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
            <Text style={styles.statusPillText} numberOfLines={1}>
              {detailMessage ?? `주요 신체 점 ${recognizedJointCount}/${requiredJointCount} 인식`}
            </Text>
          </View>
          {isStabilizing && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(stabilityProgress * 100)}%` }]} />
            </View>
          )}
        </View>
      )}

      {area.width > 0 && !isReady && (
        <View
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {corners.map((c, i) => (
            <DottedLine
              key={`edge-${i}`}
              from={c}
              to={corners[(i + 1) % 4]}
              dotSize={2}
              gap={4}
              color={F03Colors.onCamera}
            />
          ))}
          {corners.map((c, i) => (
            <View key={`corner-${i}`} style={[styles.dot, dot(c, CORNER_DOT)]} />
          ))}
        </View>
      )}
    </View>
  );
}

function dot(p: Point, size: number) {
  return { left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, borderRadius: size / 2 };
}

const styles = StyleSheet.create({
  container: { flex: 1, alignSelf: 'stretch' },
  dot: { position: 'absolute', backgroundColor: F03Colors.onCamera },
  headlineBlock: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  headline: {
    fontSize: 24,
    lineHeight: 34,
    fontWeight: '700',
    color: F03Colors.onCamera,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: '92%',
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusPillText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  progressTrack: {
    width: 140,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: F03Colors.onCamera },
});
