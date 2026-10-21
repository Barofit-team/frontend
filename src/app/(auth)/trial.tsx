import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button } from '@/components/ui/Button';

export default function TrialScreen() {
  const handleBackToLogin = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/login');
    }
  };

  return (
    <PlaceholderScreen
      title="체험 페이지"
      description="체험 페이지 [미구현]">
      <Button
        title="로그인으로 돌아가기"
        variant="outline"
        onPress={handleBackToLogin}
      />
    </PlaceholderScreen>
  );
}
