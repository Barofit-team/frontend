import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button } from '@/components/ui/Button';
import { Spacing } from '@/constants/theme';
import { triggerManualInactivityAlarm } from '@/services/inactivityAlarmService';
import { useOnboardingStore } from '@/stores/useOnboardingStore';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  // dangerouslySingular: 버튼을 연달아 눌러도 운동 준비 화면이 스택에 중복으로 쌓이지 않게 함
  const openWorkout = () => router.push('/workout-preparation', { dangerouslySingular: true });

  const handleOpenOnboarding = () => {
    useOnboardingStore.getState().resetOnboarding();
    router.push('/onboarding');
  };

  return (
    <View style={styles.container}>
      <PlaceholderScreen title="홈" description="홈 화면 (구현 예정)">
        <Button title="알람 수동 발송" onPress={triggerManualInactivityAlarm} />
        {__DEV__ && (
          <Button
            title="[DEV] 온보딩 다시 보기"
            variant="outline"
            onPress={handleOpenOnboarding}
          />
        )}
      </PlaceholderScreen>
      {/* 상단 Workout 진입 버튼 (기존 PlaceholderScreen은 변경하지 않고 위에 배치) */}
      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + Spacing.sm }]}>
        <Button title="Workout" onPress={openWorkout} style={styles.workoutButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: 'flex-end',
  },
  workoutButton: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
});
