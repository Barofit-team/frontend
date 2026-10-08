import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, FontSize, Spacing } from '@/constants/theme';

type PlaceholderScreenProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

/** 화면이 구현되기 전까지 사용하는 임시 화면입니다. 실제 화면 구현 시 제거합니다. */
export function PlaceholderScreen({ title, description, children }: PlaceholderScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, padding: Spacing.lg, gap: Spacing.md, justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  description: { fontSize: FontSize.md, color: Colors.textSecondary },
});
