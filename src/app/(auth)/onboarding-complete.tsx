import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/stores/useAuthStore';

export default function OnboardingCompleteScreen() {
  const isOnboarded = useAuthStore((state) => state.isOnboarded);
  const insets = useSafeAreaInsets();
  if (!isOnboarded) return <Redirect href="/onboarding" />;
  return (
    <View style={styles.container}>
      <Image source={require('@/assets/images/auth-background.svg')} style={StyleSheet.absoluteFill} contentFit="fill" />
      <StatusBar style="dark" />
      <SafeAreaView style={styles.content} edges={['top', 'left', 'right']}>
        <View style={styles.hero}>
          <View style={styles.badge} accessibilityLabel="온보딩 완료" accessibilityRole="image">
            <View style={styles.check} />
          </View>
          <Text style={styles.heading}>{'오늘 루틴이 준비됐어요\n바로 시작해봐요'}</Text>
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="시작하기"
            onPress={() => router.replace('/home')}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}>
            <Text style={styles.buttonText}>시작하기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, paddingHorizontal: 16 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  badge: { width: 128, height: 128, borderRadius: 64, backgroundColor: '#3473E9', borderWidth: 3,
    borderColor: '#2865DD', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.18)' },
  check: { width: 44, height: 24, borderLeftWidth: 6, borderBottomWidth: 6, borderColor: '#FFFFFF',
    transform: [{ rotate: '-45deg' }], marginTop: -10 },
  heading: { marginTop: 36, color: '#222222', fontSize: 22, lineHeight: 30, fontWeight: '600', textAlign: 'center' },
  footer: { paddingTop: 12 },
  button: { height: 54, borderRadius: 8, backgroundColor: '#245FE5', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
