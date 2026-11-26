import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WeeklyGoalProgress } from '@/types/routine';

export function WeeklyGoalNotice({ owner, progress }: {
  owner?: string;
  progress: WeeklyGoalProgress | null;
}) {
  const [visible, setVisible] = useState(false);
  const achieved = !!progress && progress.weeklyGoal > 0 && progress.goalProgress >= progress.weeklyGoal;
  const key = owner && progress ? `barofit.weekly-goal-notice.${owner}.${progress.weekStart}.${progress.weeklyGoal}` : null;
  useEffect(() => {
    let active = true;
    setVisible(false);
    if (key && achieved) {
      void AsyncStorage.getItem(key).then((seen) => {
        if (active) setVisible(seen !== 'seen');
      }).catch(() => { if (active) setVisible(true); });
    }
    return () => { active = false; };
  }, [key, achieved]);
  if (!visible || !achieved || !progress || !key) return null;
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <View style={styles.copy}>
        <Text style={styles.title}>이번 주 운동 목표 달성! 🎉</Text>
        <Text style={styles.body}>
          주 {progress.weeklyGoal}회 목표를 달성했어요.
          {progress.streakWeeks != null && progress.streakWeeks > 0
            ? ` ${progress.streakWeeks}주 연속 목표 달성 중이에요!` : ' 꾸준히 잘하고 있어요!'}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="주간 목표 달성 안내 닫기"
        onPress={() => { setVisible(false); void AsyncStorage.setItem(key, 'seen').catch(() => {}); }} style={styles.close}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  notice: { marginTop: 14, backgroundColor: '#EDF4FF', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  copy: { flex: 1, gap: 5 },
  title: { fontSize: 13, fontWeight: '700', color: '#2460E8' },
  body: { fontSize: 12, lineHeight: 18, color: '#365783' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24, color: '#6B82A4' },
});
