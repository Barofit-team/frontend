import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'outline';
};

export function Button({ title, variant = 'primary', style, ...rest }: ButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      style={(state) => [
        styles.base,
        isPrimary ? styles.primary : styles.outline,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <Text style={[styles.text, !isPrimary && styles.outlineText]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  primary: { backgroundColor: Colors.primary },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
  pressed: { opacity: 0.7 },
  text: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: '600' },
  outlineText: { color: Colors.text },
});
