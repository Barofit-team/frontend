/**
 * 운동 준비 단계별 화면 (표시 전용).
 * 어떤 단계를 보여줄지는 부모(app/workout-preparation.tsx)가 결정하고,
 * 이 컴포넌트는 전달받은 step을 그리기만 합니다.
 *
 * 1차 디자인(Figma 캡처 2026-11-20, docs/F03-design-spec.md) 적용.
 * 시안과 다르게 남겨 둔 부분은 docs/F03-design-discussion.md 참고.
 */
import type { PoseFrame } from '@barofit/pose';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Spacing } from '@/constants/theme';

import { AngleAdjustmentGuide, type AngleIndicator } from './AngleAdjustmentGuide';
import { DevicePlacementGuide } from './DevicePlacementGuide';
import { GradientFill } from './GradientFill';
import { PreparationHeader } from './PreparationHeader';
import { F03Colors } from './palette';
import type { AngleStatus } from './pitch';
import type { PreparationStep } from './steps';
import type { SensorState } from './useDevicePitch';
import { UserPositionCamera } from './UserPositionCamera';
import { UserPositionGuide } from './UserPositionGuide';

type PreparationStepViewProps = {
  step: PreparationStep;
  /** Place device '다음' 버튼 */
  onPressDone: () => void;
  onPressClose: () => void;
  /** 상단 뒤로가기(이전 단계). Step 2·3에서 표시 */
  onPressBack?: () => void;
  /**
   * 음성 안내 재생. 1차 시안 헤더에 음성 버튼이 없어 현재 화면에 노출하지 않습니다.
   * (기능은 부모에 유지, 노출 여부는 docs/F03-design-discussion.md 협의 항목)
   */
  onPressVoice?: () => void;
  /** 개발용 단계 이동 컨트롤. 전달될 때만 헤더 중앙에 표시 */
  stepNav?: {
    current: number;
    total: number;
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
  /** 실제 기울기 센서 상태 */
  liveAngle: {
    status: AngleStatus;
    sensor: SensorState;
    indicator: Animated.Value;
    onRetry: () => void;
  };
  /** 실시간 관절 준비 상태 */
  readiness?: {
    status: 'no_person' | 'adjust_camera' | 'stabilizing' | 'ready';
    message: string;
    detailMessage?: string;
    isReady: boolean;
    selectedSide?: 'left' | 'right' | 'both' | null;
    recognizedJointCount?: number;
    requiredJointCount?: number;
    stabilityProgress?: number;
  };
  onCameraReady?: () => void;
  onPoseFrame?: (frame: PoseFrame) => void;
};

type AngleView = {
  indicator: AngleIndicator;
  kind: 'adjust' | 'aligned' | 'unavailable';
  hint: string;
  dimmed?: boolean;
};

const UNAVAILABLE_REASON: Partial<Record<SensorState, string>> = {
  'not-available': '이 기기에서는 기울기 센서를 사용할 수 없어요',
  'permission-denied':
    '동작 및 피트니스 접근이 허용되지 않았어요.\n설정에서 권한을 허용한 뒤 다시 시도해주세요',
  'no-data': '센서 값이 들어오지 않아요.\n잠시 후 다시 시도해주세요',
  error: '기울기 센서를 시작하지 못했어요.\n다시 시도해주세요',
};

/** 센서 판정 → 화면 표현. 판정 로직(useDevicePitch)은 그대로이고 문구만 시안 기준입니다 */
function liveAngleView(status: AngleStatus, sensor: SensorState): AngleView {
  switch (status) {
    case 'needs-more-upright':
      return { indicator: 'above', kind: 'adjust', hint: '기기를 천천히 세워주세요' };
    case 'needs-more-reclined':
      return { indicator: 'below', kind: 'adjust', hint: '기기를 천천히 눕혀주세요' };
    case 'aligned':
      return { indicator: 'aligned', kind: 'aligned', hint: '' };
    case 'no-target':
      return { indicator: 'above', kind: 'adjust', hint: '목표 각도를 준비하고 있어요', dimmed: true };
    case 'unavailable':
      return {
        indicator: 'above',
        kind: 'unavailable',
        hint: UNAVAILABLE_REASON[sensor] ?? '기울기 센서를 확인할 수 없어요.\n다시 시도해주세요',
        dimmed: true,
      };
    default:
      return { indicator: 'above', kind: 'adjust', hint: '기울기를 확인하고 있어요', dimmed: true };
  }
}

/** 카메라(어두운) 화면을 쓰는 단계 */
export function isGrayStep(step: PreparationStep) {
  return step === 'user-position' || step === 'user-position-complete';
}

const CHIP_FADE_OUT_MS = 120;
const CHIP_FADE_IN_MS = 180;
const ALIGNED_FADE_MS = 250;

/**
 * 안내 칩: 배경 pill은 유지하고, 문구가 바뀌면 기존 문구가 완전히 사라진 뒤 새 문구가 나타납니다.
 * (캡처 설계 주석 '툴팁 출력 변경 시')
 */
function HintChip({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (text === shown) {
      // 사라지는 도중 원래 문구로 돌아온 경우 다시 보이게
      const back = Animated.timing(opacity, { toValue: 1, duration: CHIP_FADE_IN_MS, useNativeDriver: true });
      back.start();
      return () => back.stop();
    }
    const out = Animated.timing(opacity, { toValue: 0, duration: CHIP_FADE_OUT_MS, useNativeDriver: true });
    out.start(({ finished }) => {
      if (!finished) return;
      setShown(text);
      Animated.timing(opacity, { toValue: 1, duration: CHIP_FADE_IN_MS, useNativeDriver: true }).start();
    });
    return () => out.stop();
  }, [text, shown, opacity]);

  return (
    <View style={styles.chip} accessibilityLiveRegion="polite" accessibilityLabel={text}>
      <Animated.Text style={[styles.chipText, { opacity }]}>{shown}</Animated.Text>
    </View>
  );
}

/** 정렬 완료 시 연한 파란 그라데이션 배경이 서서히 나타남 */
function AlignedBackdrop({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: ALIGNED_FADE_MS,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, opacity]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      <GradientFill from={F03Colors.alignedGradientTop} to={F03Colors.alignedGradientBottom} />
    </Animated.View>
  );
}

export function PreparationStepView({
  step,
  onPressDone,
  onPressClose,
  onPressBack,
  stepNav,
  liveAngle,
  readiness,
  onCameraReady,
  onPoseFrame,
}: PreparationStepViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isAdjust = step === 'adjust-angle-1';
  const live = isAdjust ? liveAngleView(liveAngle.status, liveAngle.sensor) : null;

  // Step 1 · Place Device
  if (step === 'place-device') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <PreparationHeader variant="f03" onPressClose={onPressClose} stepNav={stepNav} />
        <View style={styles.placeIllustration}>
          <DevicePlacementGuide />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title} accessibilityRole="header">
            {'기기를 비스듬하게\n벽에 세워주세요'}
          </Text>
          <Text style={styles.description}>
            {'여러 운동 자세의 코칭을 위해\n바닥과 가까운 높이에 두는 것을 권장해요'}
          </Text>
        </View>
        <View style={styles.footer}>
          <Button title="다음" onPress={onPressDone} style={styles.primaryButton} />
        </View>
      </View>
    );
  }

  // Step 2 · Adjust Angle (조절 중 / 정렬 완료 / 센서 사용 불가)
  if (isAdjust && live) {
    const frameWidth = Math.min(width * 0.46, 200);
    const aligned = live.kind === 'aligned';
    return (
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <AlignedBackdrop visible={aligned} />
        <PreparationHeader variant="f03" onPressBack={onPressBack} onPressClose={onPressClose} stepNav={stepNav} />
        <View style={styles.angleCenter}>
          <AngleAdjustmentGuide
            indicator={live.indicator}
            width={frameWidth}
            liveOffset={liveAngle.indicator}
            dimmed={live.dimmed}
          />
        </View>
        <View style={[styles.textBlock, styles.angleText]} accessibilityLiveRegion="polite">
          {live.kind === 'unavailable' ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {'기기 기울기를\n확인할 수 없어요'}
              </Text>
              <Text style={styles.description}>{live.hint}</Text>
              <Button
                title="다시 시도"
                variant="outline"
                onPress={liveAngle.onRetry}
                style={styles.retryButton}
              />
            </>
          ) : live.kind === 'adjust' ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {'원과 점선이 겹치도록\n각도를 조절해주세요'}
              </Text>
              <HintChip text={live.hint} />
            </>
          ) : (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {'완벽해요!\n지금 각도를 유지해주세요'}
              </Text>
              <Text style={styles.description}>{'잠시 후 카메라를 켠 뒤\n전신이 보이는지 확인할게요'}</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  // Step 3 · User Position (인식 중 / 인식 완료)
  const recognized = Boolean(step === 'user-position-complete' || readiness?.isReady);
  return (
    <View style={[styles.screen, styles.cameraScreen]}>
      {/* 대기·완료 두 상태에서 같은 위치에 렌더 → 카메라 인스턴스 유지(재시작 없음) */}
      <UserPositionCamera
        onCameraReady={onCameraReady}
        onPoseFrame={onPoseFrame}
        selectedSide="both"
        skeletonColors={{ bone: F03Colors.skeletonBone, joint: F03Colors.skeletonJoint }}>
        <View style={styles.topScrim} pointerEvents="none">
          <GradientFill
            from={recognized ? F03Colors.completeGradientTop : F03Colors.cameraScrimTop}
            to="rgba(0,0,0,0)"
          />
        </View>
        <View style={styles.bottomScrim} pointerEvents="none">
          <GradientFill from="rgba(0,0,0,0)" to={F03Colors.cameraScrimBottom} />
        </View>
        <View style={[styles.cameraOverlay, { paddingTop: insets.top }]} pointerEvents="box-none">
          {!recognized && (
            <PreparationHeader
              variant="f03"
              onCamera
              onPressBack={onPressBack}
              onPressClose={onPressClose}
              stepNav={stepNav}
            />
          )}
          <UserPositionGuide
            recognized={recognized}
            status={readiness?.status}
            recognizedJointCount={readiness?.recognizedJointCount}
            requiredJointCount={readiness?.requiredJointCount}
            stabilityProgress={readiness?.stabilityProgress}
            detailMessage={readiness?.detailMessage}
          />
        </View>
      </UserPositionCamera>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: F03Colors.background },
  cameraScreen: { backgroundColor: F03Colors.cameraBackground },
  placeIllustration: { flex: 1.2, minHeight: 200, marginTop: Spacing.md },
  textBlock: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.lg,
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    color: F03Colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: F03Colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    flex: 0.6,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  primaryButton: {
    backgroundColor: F03Colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
  },
  angleCenter: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.md,
  },
  angleText: { flex: 1, justifyContent: 'flex-start', paddingTop: Spacing.xl },
  chip: {
    backgroundColor: F03Colors.chipBackground,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 30,
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: F03Colors.chipText, textAlign: 'center' },
  retryButton: { borderRadius: 999, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: '42%' },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '22%' },
  cameraOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
