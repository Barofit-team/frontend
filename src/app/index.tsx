import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
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

    const restoreSession = async () => {
      const accessToken = await tokenStorage.getAccessToken();
      if (!active) return;
      if (!accessToken) {
        router.replace('/login');
        return;
      }

      try {
        const me = await useAuthStore.getState().loadMyAccount();
        if (!active) return;
        if (me.isOnboarded) {
          router.replace('/home');
        } else {
          useOnboardingStore.getState().resetOnboarding();
          router.replace('/onboarding');
        }
      } catch {
        // 네트워크 오류 등으로 확인하지 못하면 로그인 화면에서 다시 시작합니다
        if (active) router.replace('/login');
      }
    };

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
