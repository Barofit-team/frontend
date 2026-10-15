import { useTtsStore } from '@/stores/useTtsStore';

/**
 * 실시간 코칭 웹소켓 리스닝을 시작합니다.
 */
export function startCoachWebSocketListener(wsUrl?: string): () => void {
  useTtsStore.getState().connectWebSocket(wsUrl);

  return () => {
    useTtsStore.getState().disconnectWebSocket();
  };
}

/**
 * 개발/테스트용: 백엔드에서 특정 텍스트가 웹소켓 Push로 수신된 상황을 시뮬레이션합니다.
 */
export function simulatePushMessage(text: string, eventType?: string) {
  useTtsStore.getState().simulateIncomingMessage({
    text,
    eventType,
  });
}
