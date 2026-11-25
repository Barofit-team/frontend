import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'barofit.appSettings.v1';

export type AppThemeMode = 'light' | 'dark';

interface PersistedAppSettings {
  pushEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  themeMode: AppThemeMode;
}

interface AppSettingsState extends PersistedAppSettings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPushEnabled: (enabled: boolean) => Promise<void>;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  setVibrationEnabled: (enabled: boolean) => Promise<void>;
  setThemeMode: (mode: AppThemeMode) => Promise<void>;
}

const DEFAULT_SETTINGS: PersistedAppSettings = {
  pushEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  themeMode: 'light',
};

async function persistSettings(settings: PersistedAppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedAppSettings>;
        set({
          pushEnabled: typeof parsed.pushEnabled === 'boolean' ? parsed.pushEnabled : DEFAULT_SETTINGS.pushEnabled,
          soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
          vibrationEnabled:
            typeof parsed.vibrationEnabled === 'boolean' ? parsed.vibrationEnabled : DEFAULT_SETTINGS.vibrationEnabled,
          themeMode: parsed.themeMode === 'dark' ? 'dark' : 'light',
          hydrated: true,
        });
        return;
      }
    } catch {
      // 손상된 로컬 설정은 기본값으로 복구합니다.
    }
    set({ hydrated: true });
  },

  setPushEnabled: async (pushEnabled) => {
    set({ pushEnabled });
    const { soundEnabled, vibrationEnabled, themeMode } = get();
    await persistSettings({ pushEnabled, soundEnabled, vibrationEnabled, themeMode });
  },

  setSoundEnabled: async (soundEnabled) => {
    set({ soundEnabled });
    const { pushEnabled, vibrationEnabled, themeMode } = get();
    await persistSettings({ pushEnabled, soundEnabled, vibrationEnabled, themeMode });
  },

  setVibrationEnabled: async (vibrationEnabled) => {
    set({ vibrationEnabled });
    const { pushEnabled, soundEnabled, themeMode } = get();
    await persistSettings({ pushEnabled, soundEnabled, vibrationEnabled, themeMode });
  },

  setThemeMode: async (themeMode) => {
    set({ themeMode });
    const { pushEnabled, soundEnabled, vibrationEnabled } = get();
    await persistSettings({ pushEnabled, soundEnabled, vibrationEnabled, themeMode });
  },
}));
