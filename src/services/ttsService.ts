import { AudioSource } from 'expo-audio';

import { useTtsStore } from '@/stores/useTtsStore';
import { tokenStorage } from '@/services/tokenStorage';

/**
 * 브라우저에서 다운로드해 로컬 폴더(frontend/assets/audio/)에 넣은 MP3 파일 즉시 출력
 * 사용 예: playLocalMp3(require('../../assets/audio/sample1.mp3'), '1세트 종료 피드백');
 */
export async function playLocalMp3(
  assetModule: AudioSource,
  text = '로컬 샘플 MP3 출력'
): Promise<void> {
  await useTtsStore.getState().playAudio(assetModule, text, 'LOCAL_MP3');
}

/** Workout 세션 저장 성공 후 호출합니다. 인증 응답을 받은 뒤에만 이벤트를 보낼 수 있습니다. */
export async function connectSessionCoach(sessionId: string, customWsUrl?: string): Promise<() => void> {
  const accessToken = await tokenStorage.getAccessToken();
  if (!accessToken) throw new Error('로그인이 필요합니다.');
  const { connectWebSocket, disconnectWebSocket, stop } = useTtsStore.getState();
  connectWebSocket(customWsUrl, { accessToken, sessionId });
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      if (error) reject(error); else resolve();
    };
    const unsubscribe = useTtsStore.subscribe((state) => {
      if (state.socketStatus === 'connected') finish();
      else if (state.socketStatus === 'error' || state.socketStatus === 'disconnected')
        finish(new Error('운동 코칭 연결에 실패했습니다.'));
    });
    const timer = setTimeout(() => finish(new Error('운동 코칭 연결 시간이 초과됐습니다.')), 10000);
    if (useTtsStore.getState().socketStatus === 'connected') finish();
    else if (useTtsStore.getState().socketStatus === 'error') finish(new Error('운동 코칭 연결에 실패했습니다.'));
  }).catch((error: unknown) => {
    disconnectWebSocket();
    throw error;
  });
  return () => { disconnectWebSocket(); stop(); };
}
