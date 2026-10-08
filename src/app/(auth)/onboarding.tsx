import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button } from '@/components/ui/Button';

export default function OnboardingScreen() {
  return (
    <PlaceholderScreen title="온보딩" description="온보딩 화면 (구현 예정)">
      <Button title="시작하기" onPress={() => router.replace('/home')} />
    </PlaceholderScreen>
  );
}
