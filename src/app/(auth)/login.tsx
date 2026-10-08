import { router } from 'expo-router';

import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button } from '@/components/ui/Button';

export default function LoginScreen() {
  return (
    <PlaceholderScreen title="로그인" description="로그인 화면 (구현 예정)">
      <Button title="임시 로그인" onPress={() => router.replace('/home')} />
      <Button title="회원가입" variant="outline" onPress={() => router.push('/signup')} />
    </PlaceholderScreen>
  );
}
