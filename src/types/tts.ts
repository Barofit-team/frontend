/**
 * 백엔드 웹소켓 코칭 메시지 규격
 */
export interface CoachMessage {
  text: string;        // 발화할 텍스트 (예: "1세트 완료, 무릎 살짝 벌려주세요.")
  eventType?: string;  // 이벤트 구분 (예: 'SET_FEEDBACK', 'EXERCISE_FINISH')
}

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
