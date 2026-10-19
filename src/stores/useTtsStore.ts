import {
  AudioPlayer,
  AudioSource,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';
import { create } from 'zustand';

import {
  BackendCoachingPayload,
  CoachMessage,
  SocketConnectionStatus,
} from '@/types/tts';

let wsInstance: WebSocket | null = null;
let activePlayer: AudioPlayer | null = null;
let audioModeReady = false;

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
    });
    audioModeReady = true;
  } catch {
    // 오디오 모드 설정 실패 시 기본 모드로 동작
  }
}

function releaseActivePlayer(): void {
  if (!activePlayer) return;
  const player = activePlayer;
  activePlayer = null;
  try {
    player.pause();
    player.remove();
  } catch {
    // 이미 해제된 경우 무시
  }
}

const getDefaultWsUrl = () => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3002';
  const wsBase = apiUrl.replace(/^http/, 'ws');
  return `${wsBase}/ws/coaching`;
};

interface TtsState {
  socketStatus: SocketConnectionStatus;
  wsUrl: string;
  isPlaying: boolean;
  currentText: string;
  lastMessage: CoachMessage | null;

  connectWebSocket: (customUrl?: string) => void;
  disconnectWebSocket: () => void;
  playAudio: (source: AudioSource, text?: string, type?: string) => Promise<void>;
  stop: () => void;
}

export const useTtsStore = create<TtsState>((set, get) => ({
  socketStatus: 'disconnected',
  wsUrl: getDefaultWsUrl(),
  isPlaying: false,
  currentText: '',
  lastMessage: null,

  // 1. 운동 시작 시 웹소켓 연결 및 백엔드 오디오 수신 리스닝
  connectWebSocket: (customUrl?: string) => {
    const targetUrl = customUrl || get().wsUrl;

    if (wsInstance) {
      wsInstance.onclose = null;
      wsInstance.close();
      wsInstance = null;
    }

    set({ socketStatus: 'connecting', wsUrl: targetUrl });

    try {
      const ws = new WebSocket(targetUrl);
      wsInstance = ws;

      ws.onopen = () => {
        set({ socketStatus: 'connected' });
      };

      ws.onmessage = (event) => {
        const raw = String(event.data ?? '').trim();
        if (!raw) return;

        try {
          const payload = JSON.parse(raw) as BackendCoachingPayload;
          const label = payload.text || '백엔드 코칭 음성';
          const type = payload.type || 'BACKEND_PUSH';

          if (payload.audioUrl) {
            get().playAudio({ uri: payload.audioUrl }, label, type);
          } else if (payload.audioBase64) {
            const cleanBase64 = payload.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
            get().playAudio({ uri: `data:audio/mp3;base64,${cleanBase64}` }, label, type);
          }
        } catch {
          // 유효하지 않은 JSON 형식 무시
        }
      };

      ws.onerror = () => {
        set({ socketStatus: 'error' });
      };

      ws.onclose = () => {
        set({ socketStatus: 'disconnected' });
        wsInstance = null;
      };
    } catch {
      set({ socketStatus: 'error' });
    }
  },

  disconnectWebSocket: () => {
    if (wsInstance) {
      wsInstance.onclose = null;
      wsInstance.close();
      wsInstance = null;
    }
    set({ socketStatus: 'disconnected' });
  },

  // 2. MP3 오디오 출력 (백엔드 수신 오디오 및 로컬 assets/audio/*.mp3 공용)
  playAudio: async (source: AudioSource, text = '코칭 음성 출력', type = 'AUDIO') => {
    get().stop();
    await ensureAudioMode();

    const msg: CoachMessage = {
      id: `${Date.now()}`,
      text,
      type,
      timestamp: new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };

    set({
      isPlaying: true,
      currentText: text,
      lastMessage: msg,
    });

    try {
      const player = createAudioPlayer(source);
      activePlayer = player;

      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          set({ isPlaying: false, currentText: '' });
          if (activePlayer === player) {
            releaseActivePlayer();
          } else {
            try {
              player.remove();
            } catch {
              // 무시
            }
          }
        }
      });

      player.play();
    } catch {
      set({ isPlaying: false, currentText: '' });
    }
  },

  stop: () => {
    releaseActivePlayer();
    set({ isPlaying: false, currentText: '' });
  },
}));
