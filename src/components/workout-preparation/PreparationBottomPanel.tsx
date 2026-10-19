import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FontSize, Spacing } from '@/constants/theme';

import { PrepColors } from './palette';

type PreparationBottomPanelProps = {
  title: string;
  /** 제목 위 아이콘 (예: 완료 체크) */
  icon?: ReactNode;
  /** 하단 Safe Area(Android 내비게이션 바) 높이 */
  bottomInset: number;
};

/** User Position 화면의 하단 흰색 안내 패널 */
export function PreparationBottomPanel({ title, icon, bottomInset }: PreparationBottomPanelProps) {
  return (
    <View style={[styles.panel, { paddingBottom: Spacing.xl + bottomInset }]}>
      {icon}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: PrepColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    minHeight: 168,
  },
  title: {
    fontSize: FontSize.lg,
    lineHeight: 28,
    fontWeight: '700',
    color: PrepColors.text,
    textAlign: 'center',
  },
});
