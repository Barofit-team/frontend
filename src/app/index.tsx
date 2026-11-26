import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';

import { ApiError } from '@/services/api';
import type { MeResponse } from '@/types/onboarding';
import { tokenStorage } from '@/services/tokenStorage';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';

/**
 * 앱 시작 시 저장된 토큰으로 세션을 복원합니다.
 * 토큰 없음 → 로그인 / GET /api/v1/users/me 의 isOnboarded로 홈·온보딩 분기
 * Access Token이 만료됐으면 apiFetch가 refresh 후 재시도하고, 세션 만료·탈퇴(401)면 로그인 화면으로 보냅니다.
 */
export default function Index() {
  useEffect(() => {
    let active = true;
    let splashTimer: ReturnType<typeof setTimeout>;
    const minimumSplash = new Promise<void>((resolve) => {
      splashTimer = setTimeout(resolve, 2000);
    });
    const navigate = async (path: '/login' | '/home' | '/onboarding') => {
      await minimumSplash;
      if (active) router.replace(path);
    };

    const restoreSession = async () => {
      const accessToken = await tokenStorage.getAccessToken();
      if (!active) return;
      if (!accessToken) {
        await navigate('/login');
        return;
      }

      try {
        const me = await useAuthStore.getState().loadMyAccount();
        if (!active) return;
        if (me.isOnboarded) {
          await navigate('/home');
        } else {
          useOnboardingStore.getState().resetOnboarding();
          await navigate('/onboarding');
        }
      } catch (error) {
        // 오프라인일 때만 마지막으로 서버가 확인한 계정을 사용합니다.
        if (error instanceof ApiError && error.status === 0) {
          const cached = await tokenStorage.getCachedAccount();
          if (cached) {
            try {
              const me = JSON.parse(cached) as MeResponse;
              if (me.id && me.isOnboarded) {
                useAuthStore.getState().applyMeResponse(me);
                if (active) await navigate('/home');
                return;
              }
            } catch {}
          }
        }
        if (active) await navigate('/login');
      }
    };

    void restoreSession();
    return () => {
      active = false;
      clearTimeout(splashTimer);
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Image
        source={require('@/assets/images/splash-logo.png')}
        style={styles.logo}
        contentFit="contain"
        accessibilityLabel="Barofit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  logo: {
    width: 172,
    height: 140,
  },
});
