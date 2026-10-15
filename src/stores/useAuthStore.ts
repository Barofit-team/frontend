import { router } from 'expo-router';
import { create } from 'zustand';

import { apiFetch, setOnAuthFailure } from '@/services/api';
import { tokenStorage } from '@/services/tokenStorage';
import type { AuthUser, SocialLoginResponse, SocialProvider } from '@/types/auth';

interface AuthState {
  user: AuthUser | null;
  isOnboarded: boolean;

  /** WebView 로그인으로 받은 인가 코드로 백엔드에 로그인합니다. 처음이면 백엔드가 가입시킵니다 */
  loginWithCode: (params: {
    provider: SocialProvider;
    code: string;
    redirectUri: string;
    nonce: string;
  }) => Promise<SocialLoginResponse>;
  logout: () => Promise<void>;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isOnboarded: false,

  loginWithCode: async ({ provider, code, redirectUri, nonce }) => {
    const response = await apiFetch<SocialLoginResponse>('/api/v1/auth/social-login/code', {
      method: 'POST',
      body: JSON.stringify({ provider, code, redirectUri, nonce }),
    });
    await tokenStorage.save(response);
    set({ user: response.user, isOnboarded: response.isOnboarded });
    return response;
  },

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
      set({ user: null, isOnboarded: false });
    }
  },

  reset: () => set({ user: null, isOnboarded: false }),
}));

// refresh까지 실패하면(세션 만료·폐기·탈퇴) 로그인 화면으로 보냅니다
setOnAuthFailure(() => {
  useAuthStore.getState().reset();
  router.replace('/login');
});
