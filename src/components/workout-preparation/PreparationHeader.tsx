import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { CloseIcon, SpeakerIcon } from './PreparationIcons';
import { PrepColors } from './palette';

type PreparationHeaderProps = {
  /** 회색(카메라) 배경 위에서는 버튼 배경을 흰색으로 */
  onGray?: boolean;
  onPressVoice?: () => void;
  onPressClose: () => void;
};

/** 상단 음성 안내 버튼 + 닫기 버튼 */
export function PreparationHeader({ onGray = false, onPressVoice, onPressClose }: PreparationHeaderProps) {
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
  pressed: { opacity: 0.6 },
});
