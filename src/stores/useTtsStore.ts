import * as Speech from 'expo-speech';
import { create } from 'zustand';

import { CoachMessage, WebSocketStatus } from '@/types/tts';

interface TtsState {
  isSpeaking: boolean;
  currentText: string;
  socketStatus: WebSocketStatus;
  lastReceivedMessage: CoachMessage | null;
  socket: WebSocket | null;

  speak: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  connectWebSocket: (customUrl?: string) => void;
  disconnectWebSocket: () => void;
  simulateIncomingMessage: (message: CoachMessage) => Promise<void>;
}

let activeUtteranceId = 0;

export const useTtsStore = create<TtsState>((set, get) => ({
  isSpeaking: false,
  currentText: '',
  socketStatus: 'disconnected',
  lastReceivedMessage: null,
  socket: null,

  stop: async () => {
    activeUtteranceId++;
    try {
      await Speech.stop();
    } catch {
      // 무시
    } finally {
      set({ isSpeaking: false, currentText: '' });
    }
  },

  // 텍스트를 단순 음성 출력
  speak: async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const myUtteranceId = ++activeUtteranceId;
    set({ isSpeaking: true, currentText: trimmed });

    return new Promise<void>((resolve) => {
      Speech.speak(trimmed, {
        language: 'ko-KR',
        rate: 1.0,
        pitch: 1.0,
        onStart: () => {
          if (activeUtteranceId === myUtteranceId) {
            set({ isSpeaking: true, currentText: trimmed });
          }
        },
        onDone: () => {
          if (activeUtteranceId === myUtteranceId) {
            set({ isSpeaking: false, currentText: '' });
          }
          resolve();
        },
        onStopped: () => {
          if (activeUtteranceId === myUtteranceId) {
            set({ isSpeaking: false, currentText: '' });
          }
          resolve();
        },
        onError: () => {
          if (activeUtteranceId === myUtteranceId) {
            set({ isSpeaking: false, currentText: '' });
          }
          resolve();
        },
      });
    });
  },

  // 백엔드 웹소켓 연결
  connectWebSocket: (customUrl?: string) => {
    const { socket, disconnectWebSocket, speak } = get();
    if (socket) {
      disconnectWebSocket();
    }

    const wsUrl =
      customUrl ||
      process.env.EXPO_PUBLIC_WS_URL ||
      'wss://api.barofit.com/ws/coach';

    set({ socketStatus: 'connecting' });

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        set({ socketStatus: 'connected', socket: ws });
      };

      // 백엔드가 보낸 텍스트를 수신하여 음성 출력
      ws.onmessage = (event) => {
        try {
          const message: CoachMessage = JSON.parse(event.data);
          set({ lastReceivedMessage: message });
          speak(message.text);
        } catch {
          if (typeof event.data === 'string') {
            const message: CoachMessage = { text: event.data };
            set({ lastReceivedMessage: message });
            speak(message.text);
          }
        }
      };

      ws.onclose = () => {
        set({ socketStatus: 'disconnected', socket: null });
      };

      ws.onerror = () => {
        set({ socketStatus: 'error', socket: null });
      };

      set({ socket: ws });
    } catch {
      set({ socketStatus: 'error', socket: null });
    }
  },

  disconnectWebSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
    }
    set({ socketStatus: 'disconnected', socket: null });
  },

  simulateIncomingMessage: async (message: CoachMessage) => {
    set({ lastReceivedMessage: message });
    await get().speak(message.text);
  },
}));
