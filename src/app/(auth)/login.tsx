import React, { useState } from 'react';
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

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const REDIRECT_URI = 'http://localhost:8081';

export default function LoginScreen() {
  const [authModal, setAuthModal] = useState<{
    visible: boolean;
    provider: 'KAKAO' | 'GOOGLE';
    url: string;
  }>({
    visible: false,
    provider: 'KAKAO',
    url: '',
  });

  // 카카오 로그인
  const handleKakaoLogin = () => {
    if (!KAKAO_REST_API_KEY) {
      Alert.alert('알림', '.env 파일에 EXPO_PUBLIC_KAKAO_REST_API_KEY가 설정되지 않았습니다.');
      return;
    }

    const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&response_type=code`;

    setAuthModal({
      visible: true,
      provider: 'KAKAO',
      url: kakaoAuthUrl,
    });
  };

  // 구글 로그인
  const handleGoogleLogin = () => {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert('알림', '.env 파일에 EXPO_PUBLIC_GOOGLE_CLIENT_ID가 설정되지 않았습니다.');
      return;
    }

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&response_type=code&scope=${encodeURIComponent('openid profile email')}`;

    setAuthModal({
      visible: true,
      provider: 'GOOGLE',
      url: googleAuthUrl,
    });
  };

  // 웹뷰에서 리다이렉트 URL 가로채기 (인가 코드 획득)
  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    const { url } = navState;

    if (url.includes('code=')) {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');

        setAuthModal({ visible: false, provider: 'KAKAO', url: '' });

        if (code) {
          Alert.alert(
            `${authModal.provider === 'KAKAO' ? '카카오' : 'Google'} 로그인 성공!`,
            `인가 코드(code) 획득 완료:\n${code.substring(0, 22)}...\n\n온보딩 화면으로 이동합니다.`,
            [
              {
                text: '확인',
                onPress: () => router.replace('/onboarding'),
              },
            ]
          );
        }
      } catch (err) {
        console.error('URL 파싱 실패:', err);
      }
    } else if (url.includes('error=')) {
      setAuthModal({ visible: false, provider: 'KAKAO', url: '' });
      Alert.alert('로그인 취소', '로그인이 취소되었습니다.');
    }
  };

  const handleGuestMode = () => {
    router.replace('/home');
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
            onPress={handleKakaoLogin}
          >
            <Text style={styles.kakaoButtonText}>카카오로 시작하기</Text>
          </TouchableOpacity>

          {/* Google 로그인 */}
          <TouchableOpacity
            style={styles.googleButton}
            activeOpacity={0.85}
            onPress={handleGoogleLogin}
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
        </View>
      </View>

      {/* 인앱 웹뷰 로그인 모달 */}
      <Modal
        visible={authModal.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAuthModal({ visible: false, provider: 'KAKAO', url: '' })}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {authModal.provider === 'KAKAO' ? '카카오 로그인' : 'Google 로그인'}
            </Text>
            <TouchableOpacity
              onPress={() => setAuthModal({ visible: false, provider: 'KAKAO', url: '' })}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>

          {authModal.url ? (
            <WebView
              source={{ uri: authModal.url }}
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
});
