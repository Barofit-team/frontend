import { router } from 'expo-router';
import { create } from 'zustand';

import { apiFetch, setOnAuthFailure } from '@/services/api';
import { fetchMyAccount } from '@/services/onboardingService';
import { tokenStorage } from '@/services/tokenStorage';
import type { AuthUser, SocialLoginResponse, SocialProvider } from '@/types/auth';
import type { MeResponse, ProfileResponse } from '@/types/onboarding';

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
  devLogin: (nickname?: string) => void;
  logout: () => Promise<void>;
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
      await tokenStorage.clear();
      set({ user: null, isOnboarded: false, profile: null });
    }
  },

  reset: () => set({ user: null, isOnboarded: false, profile: null }),
}));

// refresh까지 실패하면(세션 만료·폐기·탈퇴) 로그인 화면으로 보냅니다
setOnAuthFailure(() => {
  useAuthStore.getState().reset();
  router.replace('/login');
});
