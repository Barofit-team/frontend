import { AudioSource } from 'expo-audio';

import { useTtsStore } from '@/stores/useTtsStore';

/**
 * 1. 운동 시작 시 호출: 백엔드 웹소켓 연결 및 리스닝 시작
 * 운동 종료(화면 언마운트) 시 반환된 함수를 호출하면 웹소켓 해제 및 재생이 정지됩니다.
 */
export function startCoachWebSocketListener(customWsUrl?: string): () => void {
  const { connectWebSocket, disconnectWebSocket, stop } = useTtsStore.getState();

  connectWebSocket(customWsUrl);

  return () => {
    disconnectWebSocket();
    stop();
  };
}

/**
 * 2. 브라우저에서 다운로드해 로컬 폴더(frontend/assets/audio/)에 넣은 MP3 파일 즉시 출력
 * 사용 예: playLocalMp3(require('../../assets/audio/sample1.mp3'), '1세트 종료 피드백');
 */
export async function playLocalMp3(
  assetModule: AudioSource,
  text = '로컬 샘플 MP3 출력'
): Promise<void> {
  await useTtsStore.getState().playAudio(assetModule, text, 'LOCAL_MP3');
}
