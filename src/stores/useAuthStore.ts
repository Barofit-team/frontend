import { router } from 'expo-router';
import { create } from 'zustand';

import { ApiError, apiFetch, setOnAuthFailure } from '@/services/api';
import { cancelInactivityAlarm } from '@/services/inactivityAlarmService';
import { fetchMyAccount, withdrawMyAccount } from '@/services/onboardingService';
import { tokenStorage } from '@/services/tokenStorage';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useTodayRoutineStore } from '@/stores/useTodayRoutineStore';
import { useTtsStore } from '@/stores/useTtsStore';
import { useWeeklyPlanStore } from '@/stores/useWeeklyPlanStore';
import { useWorkoutDraftStore } from '@/stores/useWorkoutDraftStore';
import { useWorkoutFeedbackStore } from '@/stores/useWorkoutFeedbackStore';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';
import type { AuthUser, SocialLoginResponse, SocialProvider } from '@/types/auth';
import type { MeResponse, ProfileResponse } from '@/types/onboarding';

function resetClientStores() {
  useOnboardingStore.getState().resetOnboarding();
  useWeeklyPlanStore.getState().reset();
  useTodayRoutineStore.getState().resetAllSessions();
  useWorkoutDraftStore.getState().clearDraft();
  useWorkoutResultStore.getState().clearResult();
  useWorkoutFeedbackStore.getState().reset();
  useTtsStore.getState().disconnectWebSocket();
  useTtsStore.getState().stop();
}

interface AuthState {
  user: AuthUser | null;
  isOnboarded: boolean;
  profile: ProfileResponse | null;

  /** WebView 로그인으로 받은 인가 코드로 백엔드에 로그인합니다. 처음이면 백엔드가 가입시킵니다 */
  loginWithCode: (params: {
    provider: SocialProvider;
    code: string;
    redirectUri: string;
    nonce: string;
  }) => Promise<SocialLoginResponse>;
  /** GET /api/v1/users/me 로 내 계정과 온보딩 프로필을 동기화합니다 */
  loadMyAccount: () => Promise<MeResponse>;
  /** POST /api/v1/users/me/onboarding 또는 GET /api/v1/users/me 응답을 스토어에 반영합니다 */
  applyMeResponse: (me: MeResponse) => void;
  completeOnboarding: (nickname?: string, profile?: ProfileResponse | null) => void;
  updateUserNickname: (nickname: string) => void;
  updateProfile: (partial: Partial<ProfileResponse>) => void;
  devLogin: (nickname?: string) => void;
  logout: () => Promise<void>;
  /** DELETE /api/v1/users/me 로 계정을 탈퇴하고 기기 내 토큰·알림·스토어를 모두 정리합니다 */
  withdraw: () => Promise<void>;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isOnboarded: false,
  profile: null,

  loginWithCode: async ({ provider, code, redirectUri, nonce }) => {
    const response = await apiFetch<SocialLoginResponse>('/api/v1/auth/social-login/code', {
      method: 'POST',
      body: JSON.stringify({ provider, code, redirectUri, nonce }),
    });
    await tokenStorage.save(response);
    set({
      user: response.user,
      isOnboarded: response.isOnboarded,
      profile: null,
    });
    return response;
  },

  loadMyAccount: async () => {
    const me = await fetchMyAccount();
    set({
      user: {
        id: me.id,
        nickname: me.nickname,
        profileImageUrl: me.profileImageUrl,
        role: me.role,
      },
      isOnboarded: me.isOnboarded,
      profile: me.profile,
    });
    return me;
  },

  applyMeResponse: (me) =>
    set({
      user: {
        id: me.id,
        nickname: me.nickname,
        profileImageUrl: me.profileImageUrl,
        role: me.role,
      },
      isOnboarded: me.isOnboarded,
      profile: me.profile,
    }),

  completeOnboarding: (nickname, profile) =>
    set((state) => {
      const resolvedNickname = nickname?.trim() || state.user?.nickname || '사용자';
      return {
        isOnboarded: true,
        profile: profile ?? state.profile,
        user: state.user
          ? { ...state.user, nickname: resolvedNickname }
          : {
              id: 'dev-user',
              nickname: resolvedNickname,
              profileImageUrl: null,
              role: 'USER',
            },
      };
    }),

  updateUserNickname: (nickname) =>
    set((state) => {
      const trimmed = nickname.trim() || '사용자';
      return {
        user: state.user
          ? { ...state.user, nickname: trimmed }
          : {
              id: 'dev-user',
              nickname: trimmed,
              profileImageUrl: null,
              role: 'USER',
            },
      };
    }),

  updateProfile: (partial) =>
    set((state) => {
      const base: ProfileResponse = state.profile ?? {
        gender: 'MALE',
        age: 29,
        heightCm: 185,
        weightKg: 84,
        goal: 'ENDURANCE',
        experienceLevel: 'BEGINNER',
        weeklyWorkoutDays: 3,
        discomfortAreas: [],
        coachingStyle: 'FRIENDLY',
      };
      return {
        profile: { ...base, ...partial },
      };
    }),

  devLogin: (nickname) =>
    set((state) => ({
      isOnboarded: true,
      user: {
        id: state.user?.id ?? 'dev-user',
        nickname: nickname?.trim() || state.user?.nickname || '사용자',
        profileImageUrl: state.user?.profileImageUrl ?? null,
        role: state.user?.role ?? 'USER',
      },
    })),

  logout: async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    try {
      if (refreshToken) {
        // 서버는 토큰 상태와 관계없이 204를 응답합니다
        await apiFetch<void>('/api/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // 네트워크 오류여도 기기의 토큰은 지웁니다
    } finally {
      await Promise.all([tokenStorage.clear(), cancelInactivityAlarm()]);
      resetClientStores();
      set({ user: null, isOnboarded: false, profile: null });
    }
  },

  withdraw: async () => {
    const accessToken = await tokenStorage.getAccessToken();
    if (accessToken) {
      try {
        await withdrawMyAccount();
      } catch (error) {
        // 이미 탈퇴된 세션(401 AUTH_USER_WITHDRAWN 등)이면 로컬 정리만 마무리하고 종료합니다.
        // 네트워크 오류나 5xx는 호출한 화면에서 재시도 안내를 띄울 수 있도록 그대로 던집니다.
        if (!(error instanceof ApiError && error.status === 401)) {
          throw error;
        }
      }
    }

    await Promise.all([tokenStorage.clear(), cancelInactivityAlarm()]);
    resetClientStores();
    set({ user: null, isOnboarded: false, profile: null });
  },

  reset: () => {
    resetClientStores();
    set({ user: null, isOnboarded: false, profile: null });
  },
}));

// refresh까지 실패하면(세션 만료·폐기·탈퇴) 로그인 화면으로 보냅니다
setOnAuthFailure(() => {
  void cancelInactivityAlarm();
  useAuthStore.getState().reset();
  router.replace('/login');
});
