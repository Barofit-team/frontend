import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { ApiError } from '@/services/api';
import {
  OAUTH_REDIRECT_URI,
  createSocialLoginRequest,
  isOAuthRedirect,
  missingClientKey,
  parseOAuthRedirect,
  type SocialLoginRequest,
} from '@/services/socialAuth';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import type { SocialProvider } from '@/types/auth';

const PROVIDER_NAME: Record<SocialProvider, string> = { KAKAO: '카카오', GOOGLE: 'Google' };

export default function LoginScreen() {
  const { height } = useWindowDimensions();
  const extraHeight = Math.max(0, height - 640);
  const heroTop = Math.max(32, height * 0.104) + Math.min(48, extraHeight * 0.24);
  const bottomSpacing = 16 + Math.min(96, extraHeight * 0.48);
  const loginWithCode = useAuthStore((state) => state.loginWithCode);
  const devLogin = useAuthStore((state) => state.devLogin);
  // 진행 중인 로그인 시도(state, nonce 포함). null이면 모달이 닫혀 있습니다
  const [authRequest, setAuthRequest] = useState<SocialLoginRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 같은 redirect를 두 번 처리하지 않도록 막습니다(onShouldStartLoadWithRequest와 onNavigationStateChange 양쪽에서 감지될 수 있음)
  const handledRef = useRef(false);

  const openLogin = (provider: SocialProvider) => {
    const missing = missingClientKey(provider);
    if (missing) {
      Alert.alert('알림', `.env 파일에 ${missing}가 설정되지 않았습니다.`);
      return;
    }
    handledRef.current = false;
    setAuthRequest(createSocialLoginRequest(provider));
  };

  const closeModal = () => setAuthRequest(null);

  // 웹뷰가 redirect_uri로 이동하려는 순간 인가 코드를 가로채 백엔드로 보냅니다
  const handleRedirect = async (url: string) => {
    if (!authRequest || handledRef.current) return;
    handledRef.current = true;
    const request = authRequest;
    closeModal();

    const result = parseOAuthRedirect(url, request.state);
    if (result.type === 'cancelled') {
      Alert.alert('로그인 취소', '로그인이 취소되었습니다.');
      return;
    }
    if (result.type === 'error') {
      Alert.alert('로그인 실패', result.message);
      return;
    }

    setSubmitting(true);
    try {
      const response = await loginWithCode({
        provider: request.provider,
        code: result.code,
        redirectUri: OAUTH_REDIRECT_URI,
        nonce: request.nonce,
      });
      // 신규 회원이거나 온보딩을 마치지 않았으면 온보딩 스토어를 초기화하고 온보딩 화면으로, 완료된 회원이면 내 프로필 조회 후 홈으로 이동
      if (response.isOnboarded) {
        void useAuthStore.getState().loadMyAccount().catch(() => {});
        router.replace('/home');
      } else {
        useOnboardingStore.getState().resetOnboarding();
        router.replace('/onboarding');
      }
    } catch (error) {
      Alert.alert(`${PROVIDER_NAME[request.provider]} 로그인 실패`, toMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleShouldStartLoad = (request: ShouldStartLoadRequest) => {
    if (isOAuthRedirect(request.url)) {
      handleRedirect(request.url);
      return false;
    }
    return true;
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    if (isOAuthRedirect(navState.url)) {
      handleRedirect(navState.url);
    }
  };

  const handleGuestMode = () => {
    router.push('/trial');
  };

  const handleDevLogin = () => {
    const onboardingNickname = useOnboardingStore.getState().nickname.trim();
    devLogin(onboardingNickname || '사용자');
    router.replace('/home');
  };

  const handleDevOnboarding = () => {
    useOnboardingStore.getState().resetOnboarding();
    router.push('/onboarding');
  };

  const showDeveloperActions = () => {
    Alert.alert('개발 도구', undefined, [
      { text: 'dev 로그인', onPress: handleDevLogin },
      { text: 'dev 온보딩', onPress: handleDevOnboarding },
      { text: '둘러보기', onPress: handleGuestMode },
    ], { cancelable: true });
  };

  return (
    <View style={styles.screen}>
      <Image
        source={require('@/assets/images/auth-background.svg')}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: bottomSpacing }]}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[styles.hero, { paddingTop: heroTop }]}
            activeOpacity={1}
            onLongPress={__DEV__ ? showDeveloperActions : undefined}
            accessible={false}
          >
            <Image
              source={require('@/assets/images/login-glass.png')}
              style={styles.heroImage}
              contentFit="fill"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <Text accessibilityRole="header" style={styles.headline}>
              {'집에서 혼자 운동해도\n자세는 바로핏이 봐드릴게요'}
            </Text>
          </TouchableOpacity>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.socialButton, styles.kakaoButton]}
              activeOpacity={0.8}
              onPress={() => openLogin('KAKAO')}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="카카오 로그인"
              accessibilityState={{ disabled: submitting }}
            >
              <Image source={require('@/assets/images/social-kakao.svg')} style={styles.providerIcon} />
              <Text style={styles.socialButtonText}>카카오 로그인</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialButton, styles.googleButton]}
              activeOpacity={0.8}
              onPress={() => openLogin('GOOGLE')}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Google 계정으로 로그인"
              accessibilityState={{ disabled: submitting }}
            >
              <Image source={require('@/assets/images/social-google.svg')} style={styles.providerIcon} />
              <Text style={styles.socialButtonText}>Google 계정으로 로그인</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* 인앱 웹뷰 로그인 모달 */}
      <Modal
        visible={authRequest !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {authRequest ? `${PROVIDER_NAME[authRequest.provider]} 로그인` : ''}
            </Text>
            <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>

          {authRequest ? (
            <WebView
              source={{ uri: authRequest.url }}
              onShouldStartLoadWithRequest={handleShouldStartLoad}
              onNavigationStateChange={handleNavigationStateChange}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#3B82F6" />
                </View>
              )}
            />
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* 백엔드 로그인 처리 중 */}
      {submitting ? (
        <View style={styles.submittingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.submittingText}>로그인 중...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    flexShrink: 0,
  },
  heroImage: {
    width: 184,
    height: 144,
  },
  headline: {
    marginTop: 52,
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.7,
    color: '#222222',
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginTop: 32,
  },
  socialButton: {
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  kakaoButton: {
    backgroundColor: '#FFEB00',
  },
  googleButton: {
    backgroundColor: '#F2F2F2',
  },
  providerIcon: {
    width: 22,
    height: 22,
  },
  socialButtonText: {
    color: '#191919',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  // 모달 스타일
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  closeButtonText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  submittingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  submittingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
});

function toMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '알 수 없는 오류가 발생했습니다.';
  }
  switch (error.code) {
    case 'NETWORK_ERROR':
      return error.message;
    case 'AUTH_INVALID_AUTHORIZATION_CODE':
    case 'AUTH_INVALID_ID_TOKEN':
      return '로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.';
    case 'AUTH_SOCIAL_PROVIDER_UNAVAILABLE':
      return '소셜 로그인 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    default:
      return error.message;
  }
}
