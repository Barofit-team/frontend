/**
 * [개발 전용] F04 운동 코칭 화면 미리보기 라우트. 딥링크: barofit://dev-f04-session
 * 운영 빌드(__DEV__ === false)에서는 아무것도 렌더하지 않고 시작 화면으로 돌려보냅니다.
 * 저장·API·WebSocket을 사용하지 않습니다(DevSessionPreview 참고).
 */
import { Redirect } from 'expo-router';

import { DevSessionPreview } from '@/components/workout-session/DevSessionPreview';

export default function DevF04SessionRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <DevSessionPreview />;
}
