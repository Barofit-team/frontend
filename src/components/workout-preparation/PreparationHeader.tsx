import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { BackArrowIcon, CloseIcon, SpeakerIcon } from './PreparationIcons';
import { F03Colors, PrepColors } from './palette';

type PreparationHeaderProps = {
  /** 회색(카메라) 배경 위에서는 버튼 배경을 흰색으로 */
  onGray?: boolean;
  onPressVoice?: () => void;
  onPressClose: () => void;
  /** 전후 과정 이동 버튼 (헤더 중앙에 작게 배치하여 다른 안내 패널과 겹치지 않음) */
  stepNav?: {
    current: number;
    total: number;
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
  /**
   * 'f03': 운동 준비 1차 디자인 헤더(왼쪽 뒤로가기 · 오른쪽 닫기). 음성 버튼은 그리지 않습니다.
   * 기본값 'legacy'는 기존 모양 그대로이며 운동 진행(F04) 화면들이 사용합니다.
   */
  variant?: 'legacy' | 'f03';
  /** variant 'f03'에서 왼쪽 뒤로가기 버튼. 없으면 자리만 비워 둡니다 */
  onPressBack?: () => void;
  /** variant 'f03'에서 카메라(어두운) 화면 위인지 */
  onCamera?: boolean;
};

/** 상단 음성 안내 버튼 + 중앙 소형 단계 이동 버튼 + 닫기 버튼 */
export function PreparationHeader(props: PreparationHeaderProps) {
  if (props.variant === 'f03') return <F03Header {...props} />;
  return <LegacyHeader {...props} />;
}

function StepNavPill({ stepNav, onGray }: { stepNav: NonNullable<PreparationHeaderProps['stepNav']>; onGray: boolean }) {
  return (
    <View
      style={[
        styles.stepNavPill,
        { backgroundColor: onGray ? 'rgba(255,255,255,0.88)' : PrepColors.surface },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="이전 과정"
        disabled={!stepNav.canPrev}
        hitSlop={8}
        onPress={stepNav.onPrev}
        style={({ pressed }) => [styles.navButton, !stepNav.canPrev && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.navArrow}>‹</Text>
      </Pressable>
      <Text style={styles.navLabel}>
        {stepNav.current}/{stepNav.total}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다음 과정"
        disabled={!stepNav.canNext}
        hitSlop={8}
        onPress={stepNav.onNext}
        style={({ pressed }) => [styles.navButton, !stepNav.canNext && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.navArrow}>›</Text>
      </Pressable>
    </View>
  );
}

/** F03 1차 디자인: [← 뒤로] ··· [✕ 닫기] (원형 40pt) */
function F03Header({ onPressBack, onPressClose, onCamera = false, stepNav }: PreparationHeaderProps) {
  const circle = [
    styles.f03Button,
    { backgroundColor: onCamera ? F03Colors.headerButtonOnCamera : F03Colors.headerButton },
  ];
  return (
    <View style={styles.f03Container}>
      {onPressBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 단계"
          hitSlop={8}
          onPress={onPressBack}
          style={({ pressed }) => [circle, pressed && styles.pressed]}>
          <BackArrowIcon size={16} color={F03Colors.text} />
        </Pressable>
      ) : (
        <View style={styles.f03Spacer} />
      )}

      {stepNav && <StepNavPill stepNav={stepNav} onGray={onCamera} />}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="닫기"
        hitSlop={8}
        onPress={onPressClose}
        style={({ pressed }) => [circle, pressed && styles.pressed]}>
        <CloseIcon size={12} color={F03Colors.text} />
      </Pressable>
    </View>
  );
}

function LegacyHeader({
  onGray = false,
  onPressVoice,
  onPressClose,
  stepNav,
}: PreparationHeaderProps) {
  const circle = [styles.iconButton, { backgroundColor: onGray ? PrepColors.white : PrepColors.surface }];
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="음성 안내"
        hitSlop={8}
        onPress={onPressVoice}
        style={({ pressed }) => [circle, pressed && styles.pressed]}>
        <SpeakerIcon size={16} />
      </Pressable>

      {stepNav && <StepNavPill stepNav={stepNav} onGray={onGray} />}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="닫기"
        hitSlop={8}
        onPress={onPressClose}
        style={({ pressed }) => [circle, pressed && styles.pressed]}>
        <CloseIcon size={12} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNavPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 6,
    height: 28,
    gap: 4,
  },
  navButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '700',
    color: PrepColors.text,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: PrepColors.textSecondary,
    minWidth: 24,
    textAlign: 'center',
  },
  f03Container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  f03Button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  f03Spacer: { width: 40, height: 40 },
  disabled: { opacity: 0.28 },
  pressed: { opacity: 0.6 },
});
