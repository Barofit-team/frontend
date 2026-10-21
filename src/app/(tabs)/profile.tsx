import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button } from '@/components/ui/Button';
import { triggerManualInactivityAlarm } from '@/services/inactivityAlarmService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';

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
      {user ? <Button title="로그아웃" variant="outline" onPress={handleLogout} /> : null}
    </PlaceholderScreen>
  );
}
