/**
 * 운동 진행 화면 하단: 어두운 하단 그라데이션 + 회색 반투명 pill(운동명 · 세트 상태 · 메뉴 버튼).
 * 메뉴 버튼은 기존 수동 일시정지(상단 X와 같은 동작)를 엽니다.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientFill } from '@/components/workout-preparation/GradientFill';

import { SessionColors } from './sessionPalette';

type SessionStatusPillProps = {
  exerciseName: string;
  /** 예: '세트 1 진행 중', '세트 간 휴식 시간' */
  subtitle: string;
  onPressMenu: () => void;
};

function MenuIcon({ color = SessionColors.pillText }: { color?: string }) {
  return (
    <View style={styles.menuIcon}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.menuBar, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

export function SessionStatusPill({ exerciseName, subtitle, onPressMenu }: SessionStatusPillProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <GradientFill from={SessionColors.baseTransparent} to={SessionColors.base} />
      </View>
      <View style={styles.pill}>
        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={1}>
            {exerciseName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="운동 메뉴 (일시정지)"
          hitSlop={8}
          onPress={onPressMenu}
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
          <MenuIcon />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 72,
    paddingHorizontal: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    borderRadius: 30,
    paddingLeft: 22,
    paddingRight: 10,
    backgroundColor: SessionColors.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  texts: { flex: 1, gap: 2 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: SessionColors.pillText },
  subtitle: { fontSize: 12, lineHeight: 16, color: SessionColors.pillSubText },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SessionColors.pillButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: { width: 16, height: 12, justifyContent: 'space-between' },
  menuBar: { height: 2, borderRadius: 1 },
  pressed: { opacity: 0.7 },
});
