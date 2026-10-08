import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button } from '@/components/ui/Button';

export default function SignupScreen() {
  return (
    <PlaceholderScreen title="회원가입" description="회원가입 화면 (구현 예정)">
      <Button title="다음 (온보딩)" onPress={() => router.push('/onboarding')} />
    </PlaceholderScreen>
  );
}
