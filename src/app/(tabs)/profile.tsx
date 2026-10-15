import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/useAuthStore';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <PlaceholderScreen
      title="프로필"
      description={user ? `${user.nickname ?? '이름 없음'} 님으로 로그인됨` : '로그인하지 않은 상태입니다.'}>
      {user ? <Button title="로그아웃" variant="outline" onPress={handleLogout} /> : null}
    </PlaceholderScreen>
  );
}
