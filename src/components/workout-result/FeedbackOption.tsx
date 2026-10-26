/**
 * F02 선택지 버튼.
 *  - variant="pill": 가로 꽉 찬 둥근 버튼 (난이도, 없음/있음)
 *  - variant="chip": 내용 너비 칩 (불편 부위, 복수 선택)
 * 선택되면 검정 배경 + 흰 글자로 구분합니다.
 * onGray: 회색 카드 위에 놓일 때 미선택 배경을 흰색으로.
 */
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { PrepColors } from '@/components/workout-preparation/palette';

type FeedbackOptionProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  variant?: 'pill' | 'chip';
  /** single: 단일 선택(radio) / multiple: 복수 선택(checkbox) */
  selection?: 'single' | 'multiple';
  onGray?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function FeedbackOption({
  label,
  selected,
  onPress,
  variant = 'pill',
  selection = 'single',
  onGray = false,
  style,
}: FeedbackOptionProps) {
  const isMultiple = selection === 'multiple';

  return (
    <Pressable
      accessibilityRole={isMultiple ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      // aria-checked: 네이티브·웹 모두 선택 상태를 스크린리더에 전달 (radio·checkbox 공통)
      aria-checked={selected}
      hitSlop={variant === 'chip' ? 4 : 0}
      onPress={onPress}
      style={({ pressed }) => [
        variant === 'pill' ? styles.pill : styles.chip,
        { backgroundColor: onGray ? PrepColors.white : PrepColors.surface },
        selected && styles.selected,
        pressed && styles.pressed,
        style,
      ]}>
      <Text style={[styles.text, variant === 'chip' && styles.chipText, selected && styles.selectedText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  chip: {
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  selected: { backgroundColor: PrepColors.black },
  pressed: { opacity: 0.7 },
  text: { fontSize: 13, fontWeight: '700', color: PrepColors.text, letterSpacing: -0.2 },
  chipText: { fontWeight: '600' },
  selectedText: { color: PrepColors.white },
});
