import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
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
  const loginWithCode = useAuthStore((state) => state.loginWithCode);
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
      // 신규 회원이거나 온보딩을 마치지 않았으면 온보딩, 아니면 홈
      router.replace(response.isOnboarded ? '/home' : '/onboarding');
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
    router.replace('/home');
  };

  const handleDevOnboarding = () => {
    useOnboardingStore.getState().resetOnboarding();
    router.push('/onboarding');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {/* 상단 미니멀 타이틀 */}
        <View style={styles.header}>
          <Text style={styles.title}>BaroFit</Text>
          <Text style={styles.subtitle}>AI 실시간 운동 코칭</Text>
        </View>

        {/* 소셜 로그인 버튼 영역 */}
        <View style={styles.buttonContainer}>
          {/* 카카오 로그인 */}
          <TouchableOpacity
            style={styles.kakaoButton}
            activeOpacity={0.85}
            onPress={() => openLogin('KAKAO')}
          >
            <Text style={styles.kakaoButtonText}>카카오로 시작하기</Text>
          </TouchableOpacity>

          {/* Google 로그인 */}
          <TouchableOpacity
            style={styles.googleButton}
            activeOpacity={0.85}
            onPress={() => openLogin('GOOGLE')}
          >
            <Text style={styles.googleButtonText}>Google로 계속하기</Text>
          </TouchableOpacity>

          {/* 둘러보기 */}
          <TouchableOpacity
            style={styles.guestButton}
            activeOpacity={0.7}
            onPress={handleGuestMode}
          >
            <Text style={styles.guestButtonText}>둘러보기</Text>
          </TouchableOpacity>

          {/* DEV: 온보딩 바로가기 */}
          {__DEV__ && (
            <TouchableOpacity
              style={styles.devOnboardingButton}
              activeOpacity={0.7}
              onPress={handleDevOnboarding}
            >
              <Text style={styles.devOnboardingButtonText}>[DEV] 온보딩 화면 테스트</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF', // 흰색 배경
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 40,
  },
  header: {
    marginTop: 80,
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  kakaoButton: {
    backgroundColor: '#FEE500',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kakaoButtonText: {
    color: '#191919',
    fontSize: 15,
    fontWeight: '700',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  googleButtonText: {
    color: '#1F2937',
    fontSize: 15,
    fontWeight: '700',
  },
  guestButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  guestButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  devOnboardingButton: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  devOnboardingButtonText: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '600',
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
