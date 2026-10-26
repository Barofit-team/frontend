import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button } from '@/components/ui/Button';
import { createMockWorkoutResult } from '@/mocks/workoutResult';
import { triggerManualInactivityAlarm } from '@/services/inactivityAlarmService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const handleOpenOnboarding = () => {
    useOnboardingStore.getState().resetOnboarding();
    router.push('/onboarding');
  };

  /** [DEV] 운동을 끝내지 않고 F01(오늘의 결과)로 이동. 운동 완료 흐름과 같은 Mock 결과를 넣습니다 */
  const handleOpenWorkoutResult = () => {
    useWorkoutResultStore.getState().setResult(createMockWorkoutResult());
    router.push('/workout-result', { dangerouslySingular: true });
  };

  return (
    <PlaceholderScreen
      title="프로필"
      description={user ? `${user.nickname ?? '사용자'} 님으로 로그인됨` : '로그인하지 않은 상태입니다.'}>
      <Button title="알람 수동 발송" onPress={triggerManualInactivityAlarm} />
      {__DEV__ && (
        <Button
          title="[DEV] 온보딩 다시 보기"
          variant="outline"
          onPress={handleOpenOnboarding}
        />
      )}
      {__DEV__ && (
        <Button
          title="[DEV] 오늘의 결과 바로가기"
          variant="outline"
          onPress={handleOpenWorkoutResult}
        />
      )}
      {user ? <Button title="로그아웃" variant="outline" onPress={handleLogout} /> : null}
    </PlaceholderScreen>
  );
}
