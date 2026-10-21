/**
 * 운동 준비 단계별 화면 (표시 전용).
 * 어떤 단계를 보여줄지는 부모(app/workout-preparation.tsx)가 결정하고,
 * 이 컴포넌트는 전달받은 step을 그리기만 합니다.
 */
import { StyleSheet, Text, View, useWindowDimensions, type Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { FontSize, Spacing } from '@/constants/theme';

import { AngleAdjustmentGuide, type AngleIndicator } from './AngleAdjustmentGuide';
import { DevicePlacementGuide } from './DevicePlacementGuide';
import { PreparationBottomPanel } from './PreparationBottomPanel';
import { PreparationHeader } from './PreparationHeader';
import { CheckCircle } from './PreparationIcons';
import { PrepColors } from './palette';
import type { AngleStatus } from './pitch';
import type { PreparationStep } from './steps';
import type { SensorState } from './useDevicePitch';
import { UserPositionCamera } from './UserPositionCamera';
import { UserPositionGuide } from './UserPositionGuide';

type PreparationStepViewProps = {
  step: PreparationStep;
  /** Place device '완료' 버튼 */
  onPressDone: () => void;
  onPressClose: () => void;
  onPressVoice?: () => void;
  /**
   * 실제 센서 모드일 때 전달. 있으면 Adjust Angle 단계의 표시를 step 대신 센서 상태로 결정합니다.
   * 없으면 기존처럼 step(adjust-angle-1/2/3)으로 고정 화면을 표시합니다(수동 확인 모드).
   */
  liveAngle?: {
    status: AngleStatus;
    sensor: SensorState;
    indicator: Animated.Value;
    onRetry: () => void;
  };
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

/** 센서 상태 → 기존 Adjust Angle 1·2·3 디자인 매핑 */
function liveAngleView(status: AngleStatus, sensor: SensorState): AngleView {
  switch (status) {
    case 'needs-more-upright':
      return { indicator: 'above', kind: 'adjust', hint: '기기를 조금 더 세워주세요' };
    case 'needs-more-reclined':
      return { indicator: 'below', kind: 'adjust', hint: '기기를 조금 더 눕혀주세요' };
    case 'aligned':
      return { indicator: 'aligned', kind: 'aligned', hint: '' };
    case 'no-target':
      return {
        indicator: 'above',
        kind: 'adjust',
        hint: __DEV__ ? '목표 각도 미설정 · 개발 패널에서 지정해주세요' : '목표 각도를 준비하고 있어요',
        dimmed: true,
      };
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

const ANGLE_STEPS: Partial<Record<PreparationStep, { indicator: AngleIndicator; hint: string }>> = {
  'adjust-angle-1': { indicator: 'above', hint: '기기를 조금 더 세워주세요' },
  'adjust-angle-2': { indicator: 'below', hint: '기기를 조금 더 눕혀주세요' },
};

/** 회색(카메라/완료) 배경을 쓰는 단계 */
export function isGrayStep(step: PreparationStep) {
  return step === 'adjust-angle-3' || step === 'user-position' || step === 'user-position-complete';
}

export function PreparationStepView({
  step,
  onPressDone,
  onPressClose,
  onPressVoice,
  liveAngle,
}: PreparationStepViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isAdjust = step === 'adjust-angle-1' || step === 'adjust-angle-2' || step === 'adjust-angle-3';
  const live = isAdjust && liveAngle ? liveAngleView(liveAngle.status, liveAngle.sensor) : null;
  const onGray = live ? live.kind === 'aligned' : isGrayStep(step);
  const header = (
    <PreparationHeader onGray={onGray} onPressClose={onPressClose} onPressVoice={onPressVoice} />
  );

  if (step === 'place-device') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {header}
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
          <Button title="완료" onPress={onPressDone} style={styles.doneButton} />
        </View>
      </View>
    );
  }

  if (isAdjust) {
    const fixed = ANGLE_STEPS[step];
    const view: AngleView =
      live ??
      (fixed
        ? { indicator: fixed.indicator, kind: 'adjust', hint: fixed.hint }
        : { indicator: 'aligned', kind: 'aligned', hint: '' });
    const frameWidth = Math.min(width * 0.44, 190);
    return (
      <View
        style={[
          styles.screen,
          onGray && styles.grayScreen,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}>
        {header}
        <View style={styles.angleCenter}>
          <AngleAdjustmentGuide
            indicator={view.indicator}
            onGray={onGray}
            width={frameWidth}
            liveOffset={liveAngle?.indicator}
            dimmed={view.dimmed}
          />
        </View>
        <View style={[styles.textBlock, styles.angleText]} accessibilityLiveRegion="polite">
          {view.kind === 'unavailable' ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {'기기 기울기를\n확인할 수 없어요'}
              </Text>
              <Text style={styles.description}>{view.hint}</Text>
              <Button
                title="다시 시도"
                variant="outline"
                onPress={liveAngle?.onRetry}
                style={styles.retryButton}
              />
            </>
          ) : view.kind === 'adjust' ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {'원과 점선이 겹치도록\n각도를 조절해주세요'}
              </Text>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{view.hint}</Text>
              </View>
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

  // user-position / user-position-complete
  // ⚠️ 'user-position-complete'(자세 인식 완료)는 UI 시연용 수동 상태입니다.
  //    카메라 영상을 분석하지 않으며, 스켈레톤은 고정 그림입니다. 자동으로 이 상태가 되지 않습니다.
  const recognized = step === 'user-position-complete';
  return (
    <View style={[styles.screen, styles.grayScreen]}>
      <View style={styles.cameraArea}>
        {/* 대기·완료 두 상태에서 같은 위치에 렌더 → CameraView 인스턴스 유지(재시작 없음) */}
        <UserPositionCamera>
          <View style={[styles.cameraOverlay, { paddingTop: insets.top }]} pointerEvents="box-none">
            {header}
            <UserPositionGuide recognized={recognized} />
            {__DEV__ && recognized && (
              <View pointerEvents="none" style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>DEV · UI 시연용 수동 상태 (실제 인식 아님)</Text>
              </View>
            )}
          </View>
        </UserPositionCamera>
      </View>
      <PreparationBottomPanel
        bottomInset={insets.bottom}
        title={recognized ? '자세 인식 완료!' : '전신이 보이게\n영역 안에 서주세요'}
        icon={recognized ? <CheckCircle size={40} /> : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PrepColors.background },
  grayScreen: { backgroundColor: PrepColors.cameraBackground },
  placeIllustration: { flex: 1.15, minHeight: 180 },
  textBlock: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  title: {
    fontSize: FontSize.lg,
    lineHeight: 28,
    fontWeight: '700',
    color: PrepColors.text,
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    color: PrepColors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    flex: 0.55,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  doneButton: {
    backgroundColor: PrepColors.black,
    borderRadius: 999,
    paddingVertical: 14,
  },
  angleCenter: {
    flex: 1.35,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.lg,
  },
  angleText: { flex: 1, justifyContent: 'flex-start', paddingTop: Spacing.lg },
  chip: {
    backgroundColor: PrepColors.surface,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chipText: { fontSize: 13, color: PrepColors.textSecondary, textAlign: 'center' },
  retryButton: { borderRadius: 999, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl },
  cameraArea: { flex: 1, overflow: 'hidden' },
  cameraOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  demoBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    alignSelf: 'center',
    backgroundColor: 'rgba(17,17,17,0.6)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  demoBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
});
