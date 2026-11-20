/**
 * Adjust Angle 그래픽: 스마트폰 프레임 + 가운데 기준 점선 + 각도 표시 원.
 * indicator 값만 바꾸면 조절 중(위/아래)·정렬 완료 상태를 모두 표현합니다.
 * liveOffset(Animated.Value, -1~1)을 주면 원이 센서값을 따라 움직입니다(리렌더 없이 이동).
 *
 * 1차 디자인(Figma 캡처 Adjust Angle 4·5·6):
 *  - 조절 중: 연한 파란 외곽선 스마트폰 + 점선 + 파란 원
 *  - 정렬 완료: 원 대신 점선 위 파란 체크 원
 */
import { Animated, StyleSheet, View } from 'react-native';

import { DottedLine } from './DottedLine';
import { CheckMark } from './PreparationIcons';
import { F03Colors } from './palette';

export type AngleIndicator = 'above' | 'below' | 'aligned';

type AngleAdjustmentGuideProps = {
  indicator: AngleIndicator;
  /** 프레임 너비(px). 기본은 화면 너비 비율로 부모가 지정 */
  width: number;
  /**
   * 실시간 위치(-1 = 기준선 위 끝, 0 = 기준선, 1 = 아래 끝). 지정하면 indicator의 고정 위치 대신 사용.
   * 체크 표시·색상은 계속 indicator 값으로 결정합니다.
   */
  liveOffset?: Animated.Value;
  /** 측정 준비 중·센서 사용 불가 등 판정값이 없을 때 원을 흐리게 */
  dimmed?: boolean;
};

/** 원 중심의 세로 위치 (프레임 내부 높이 대비 비율) */
const INDICATOR_POSITION: Record<AngleIndicator, number> = {
  above: 0.33,
  below: 0.66,
  aligned: 0.5,
};

const BORDER = 3;
/** liveOffset ±1일 때 이동 거리 (내부 높이 대비) */
const LIVE_RANGE = 0.3;

export function AngleAdjustmentGuide({ indicator, width, liveOffset, dimmed = false }: AngleAdjustmentGuideProps) {
  const height = width * 2.1;
  const innerWidth = width - BORDER * 2;
  const innerHeight = height - BORDER * 2;
  const aligned = indicator === 'aligned';
  const circle = width * (aligned ? 0.29 : 0.31);
  const lineY = innerHeight / 2;
  const translateY = liveOffset
    ? liveOffset.interpolate({
        inputRange: [-1, 1],
        outputRange: [-innerHeight * LIVE_RANGE, innerHeight * LIVE_RANGE],
        extrapolate: 'clamp',
      })
    : innerHeight * (INDICATOR_POSITION[indicator] - 0.5);

  return (
    <View
      style={[styles.frame, { width, height, borderRadius: width * 0.2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <DottedLine
        from={{ x: 4, y: lineY }}
        to={{ x: innerWidth - 4, y: lineY }}
        color={F03Colors.guideLine}
        dotSize={1.5}
        gap={2.5}
      />
      <Animated.View
        style={[
          styles.circle,
          {
            width: circle,
            height: circle,
            borderRadius: circle / 2,
            left: (innerWidth - circle) / 2,
            top: lineY - circle / 2,
            backgroundColor: aligned ? F03Colors.primary : F03Colors.indicator,
            transform: [{ translateY }],
            opacity: dimmed ? 0.3 : 1,
          },
        ]}>
        {aligned && <CheckMark size={circle * 0.4} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: BORDER,
    borderColor: F03Colors.deviceOutline,
    backgroundColor: F03Colors.deviceFill,
    overflow: 'hidden',
  },
  circle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
