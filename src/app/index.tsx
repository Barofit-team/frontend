import { Redirect } from 'expo-router';

// 앱 시작 시 로그인 화면으로 이동합니다. (인증 상태 연동 시 여기서 분기)
export default function Index() {
  return <Redirect href="/login" />;
}
