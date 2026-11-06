import {
  AudioPlayer,
  AudioSource,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';
import { create } from 'zustand';
import * as Speech from 'expo-speech';

import {
  BackendCoachingPayload,
  CoachingAuthentication,
  CoachingEvent,
  CoachMessage,
  SocketConnectionStatus,
} from '@/types/tts';

let wsInstance: WebSocket | null = null;
let activePlayer: AudioPlayer | null = null;
let audioModeReady = false;
let speechGeneration = 0;

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

  connectWebSocket: (customUrl?: string, auth?: CoachingAuthentication) => void;
  sendCoachEvent: (event: CoachingEvent) => boolean;
  disconnectWebSocket: () => void;
  playAudio: (source: AudioSource, text?: string, type?: string) => Promise<void>;
  playSpeech: (text: string, type?: string) => void;
  stop: () => void;
}

export const useTtsStore = create<TtsState>((set, get) => ({
  socketStatus: 'disconnected',
  wsUrl: getDefaultWsUrl(),
  isPlaying: false,
  currentText: '',
  lastMessage: null,

  // 1. 운동 시작 시 웹소켓 연결 및 백엔드 오디오 수신 리스닝
  connectWebSocket: (customUrl?: string, auth?: CoachingAuthentication) => {
    const targetUrl = customUrl || get().wsUrl;

    if (wsInstance) {
      wsInstance.onclose = null;
      wsInstance.close();
      wsInstance = null;
    }

    if (!auth?.accessToken || !auth.sessionId) {
      set({ socketStatus: 'error', wsUrl: targetUrl });
      return;
    }
    set({ socketStatus: 'connecting', wsUrl: targetUrl });

    try {
      const ws = new WebSocket(targetUrl);
      wsInstance = ws;

      ws.onopen = () => {
        if (wsInstance !== ws) return;
        ws.send(JSON.stringify({ type: 'AUTH', accessToken: auth.accessToken, sessionId: auth.sessionId }));
      };

      ws.onmessage = (event) => {
        if (wsInstance !== ws) return;
        const raw = String(event.data ?? '').trim();
        if (!raw) return;

        try {
          const payload = JSON.parse(raw) as BackendCoachingPayload;
          if (payload.type === 'AUTH_OK') {
            if (wsInstance === ws) set({ socketStatus: 'connected' });
            return;
          }
          if (!payload.text) return;
          const label = payload.text || '백엔드 코칭 음성';
          const type = payload.type || 'BACKEND_PUSH';

          if (payload.audioUrl) {
            get().playAudio({ uri: payload.audioUrl }, label, type);
          } else if (payload.audioBase64) {
            const cleanBase64 = payload.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
            get().playAudio({ uri: `data:audio/mp3;base64,${cleanBase64}` }, label, type);
          } else {
            get().playSpeech(label, type);
          }
        } catch {
          // 유효하지 않은 JSON 형식 무시
        }
      };

      ws.onerror = () => {
        if (wsInstance === ws) set({ socketStatus: 'error' });
      };

      ws.onclose = () => {
        if (wsInstance !== ws) return;
        set({ socketStatus: get().socketStatus === 'connecting' ? 'error' : 'disconnected' });
        wsInstance = null;
      };
    } catch {
      set({ socketStatus: 'error' });
    }
  },

  sendCoachEvent: (event) => {
    if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN || get().socketStatus !== 'connected') return false;
    try { wsInstance.send(JSON.stringify({ type: 'COACH_EVENT', ...event })); return true; }
    catch { return false; }
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
      if (text) get().playSpeech(text, type);
      else set({ isPlaying: false, currentText: '' });
    }
  },

  playSpeech: (text, type = 'LOCAL_SPEECH') => {
    if (!text.trim()) return;
    releaseActivePlayer();
    const generation = ++speechGeneration;
    const msg: CoachMessage = { id: `${Date.now()}`, text, type,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
    set({ isPlaying: true, currentText: text, lastMessage: msg });
    void Speech.stop().then(() => {
      if (speechGeneration !== generation) return;
      Speech.speak(text, { language: 'ko-KR',
        onDone: () => { if (speechGeneration === generation) set({ isPlaying: false, currentText: '' }); },
        onStopped: () => { if (speechGeneration === generation) set({ isPlaying: false, currentText: '' }); },
        onError: () => { if (speechGeneration === generation) set({ isPlaying: false }); },
      });
    }).catch(() => { if (speechGeneration === generation) set({ isPlaying: false }); });
  },

  stop: () => {
    speechGeneration++;
    void Speech.stop().catch(() => {});
    releaseActivePlayer();
    set({ isPlaying: false, currentText: '' });
  },
}));
