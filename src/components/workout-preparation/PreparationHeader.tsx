import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { CloseIcon, SpeakerIcon } from './PreparationIcons';
import { PrepColors } from './palette';

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
};

/** 상단 음성 안내 버튼 + 중앙 소형 단계 이동 버튼 + 닫기 버튼 */
export function PreparationHeader({
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

      {stepNav && (
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
            style={({ pressed }) => [
              styles.navButton,
              !stepNav.canPrev && styles.disabled,
              pressed && styles.pressed,
            ]}>
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
            style={({ pressed }) => [
              styles.navButton,
              !stepNav.canNext && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
        </View>
      )}

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
  disabled: { opacity: 0.28 },
  pressed: { opacity: 0.6 },
});
