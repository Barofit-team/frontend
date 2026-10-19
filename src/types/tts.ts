export type CoachingEventType =
  | 'WORKOUT_START'
  | 'REP_FEEDBACK'
  | 'SET_FEEDBACK'
  | 'WORKOUT_FINISH';

/**
 * 백엔드 -> 프런트엔드 WebSocket 전송 JSON 명세
 * 백엔드에서 TTS API를 호출해 생성한 MP3 오디오(URL 또는 Base64)와 자막 텍스트를 전달합니다.
 */
export interface BackendCoachingPayload {
  type?: CoachingEventType | string;
  text: string;
  audioUrl?: string;
  audioBase64?: string;
  timestamp?: string;
}

export interface CoachMessage {
  id: string;
  text: string;
  type?: string;
  timestamp: string;
}

export type SocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
