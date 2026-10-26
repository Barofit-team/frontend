/**
 * 결과·피드백 화면의 둥근 버튼.
 *  - primary: 검정 주요 CTA (예: 홈으로, 다음, 완료)
 *  - secondary: 연회색 보조 버튼 (예: 나중에 하기, 다시 선택하기)
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { PrepColors } from '@/components/workout-preparation/palette';

type ResultButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** 처리 중이면 로딩 표시 + 비활성화 */
  loading?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function ResultButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
  style,
}: ResultButtonProps) {
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        disabled && (isPrimary ? styles.primaryDisabled : styles.secondaryDisabled),
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={isPrimary ? PrepColors.white : PrepColors.text} />
      ) : (
        <Text
          style={[
            styles.text,
            isPrimary ? styles.primaryText : styles.secondaryText,
            disabled && !isPrimary && styles.secondaryDisabledText,
          ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: PrepColors.black },
  primaryDisabled: { backgroundColor: '#C7C7CC' },
  secondary: { backgroundColor: PrepColors.surface },
  secondaryDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  text: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  primaryText: { color: PrepColors.white },
  secondaryText: { color: PrepColors.text, fontSize: 13 },
  secondaryDisabledText: { color: PrepColors.textSecondary },
});
