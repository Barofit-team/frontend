import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronRightIcon } from '@/components/home/HomeIcons';
import { initCrossPlatformAlarm } from '@/services/inactivityAlarmService';
import { type AppThemeMode, useAppSettingsStore } from '@/stores/useAppSettingsStore';
import { useAuthStore } from '@/stores/useAuthStore';

type InfoModalType = 'theme' | 'notice' | 'terms' | 'privacy' | null;

function BackArrowIcon({ color = '#1D61E7', size = 18 }: { color?: string; size?: number }) {
  const head = Math.round(size * 0.45);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: size * 0.72,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.14,
          width: head,
          height: head,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

const INFO_MODAL_CONTENT: Record<
  Exclude<InfoModalType, 'theme' | null>,
  { title: string; body: string }
> = {
  notice: {
    title: '공지사항',
    body: '현재 등록된 새로운 공지사항이 없습니다.\n바로핏과 함께 꾸준한 운동 습관을 만들어 보세요!',
  },
  terms: {
    title: '이용약관',
    body: '바로핏(BaroFit)은 AI 기반 실시간 운동 자세 코칭 및 운동 기록 관리 서비스입니다.\n\n• 본 서비스의 자세 분석 및 코칭은 의료적 진단이나 치료를 대체하지 않으며, 부상 예방을 보장하지 않습니다.\n• 운동 중 통증이나 이상 증상이 느껴지면 즉시 운동을 중단하고 전문가와 상담하시기 바랍니다.',
  },
  privacy: {
    title: '개인정보 처리방침',
    body: '바로핏은 서비스 제공을 위해 최소한의 회원 및 운동 프로필 정보(닉네임, 성별, 나이, 신체 스펙, 운동 목표, 불편 부위, 운동 기록)를 안전하게 처리합니다.\n\n• 카메라 영상은 온디바이스 자세 좌표 추출에만 사용되며, 별도 영상 파일로 서버에 저장되지 않습니다.',
  },
};

export default function AppSettingsScreen() {
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((state) => state.logout);

  const pushEnabled = useAppSettingsStore((state) => state.pushEnabled);
  const soundEnabled = useAppSettingsStore((state) => state.soundEnabled);
  const vibrationEnabled = useAppSettingsStore((state) => state.vibrationEnabled);
  const themeMode = useAppSettingsStore((state) => state.themeMode);
  const hydrate = useAppSettingsStore((state) => state.hydrate);
  const setPushEnabled = useAppSettingsStore((state) => state.setPushEnabled);
  const setSoundEnabled = useAppSettingsStore((state) => state.setSoundEnabled);
  const setVibrationEnabled = useAppSettingsStore((state) => state.setVibrationEnabled);
  const setThemeMode = useAppSettingsStore((state) => state.setThemeMode);

  const [activeModal, setActiveModal] = useState<InfoModalType>(null);

  useFocusEffect(
    useCallback(() => {
      void hydrate();
    }, [hydrate]),
  );

  const handleTogglePush = async (next: boolean) => {
    if (next) {
      await initCrossPlatformAlarm();
    }
    await setPushEnabled(next);
  };

  const handleSelectTheme = async (mode: AppThemeMode) => {
    await setThemeMode(mode);
    setActiveModal(null);
  };

  const handlePressLogout = () => {
    Alert.alert('로그아웃', '현재 계정에서 로그아웃하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await logout();
            router.replace('/login');
          })();
        },
      },
    ]);
  };

  const appVersion = Constants.expoConfig?.version ?? '0.0.0';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* 상단 헤더 */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <BackArrowIcon color="#1D61E7" size={18} />
        </Pressable>
        <Text style={styles.headerTitle}>앱 설정</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* 섹션 1: 알림 / 소리 / 진동 / 모드 */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>푸시 알림</Text>
            <Switch
              value={pushEnabled}
              onValueChange={(value) => void handleTogglePush(value)}
              trackColor={{ false: '#E5E7EB', true: '#1D61E7' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E5E7EB"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>소리</Text>
            <Switch
              value={soundEnabled}
              onValueChange={(value) => void setSoundEnabled(value)}
              trackColor={{ false: '#E5E7EB', true: '#1D61E7' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E5E7EB"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>진동</Text>
            <Switch
              value={vibrationEnabled}
              onValueChange={(value) => void setVibrationEnabled(value)}
              trackColor={{ false: '#E5E7EB', true: '#1D61E7' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E5E7EB"
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="화면 모드 변경"
            onPress={() => setActiveModal('theme')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.rowLabel}>모드</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{themeMode === 'dark' ? '다크' : '라이트'}</Text>
              <ChevronRightIcon color="#374151" size={13} />
            </View>
          </Pressable>
        </View>

        <View style={styles.sectionDivider} />

        {/* 섹션 2: 공지사항 / 이용약관 / 개인정보 처리방침 */}
        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveModal('notice')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.rowLabel}>공지사항</Text>
            <ChevronRightIcon color="#374151" size={13} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveModal('terms')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.rowLabel}>이용약관</Text>
            <ChevronRightIcon color="#374151" size={13} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveModal('privacy')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.rowLabel}>개인정보 처리방침</Text>
            <ChevronRightIcon color="#374151" size={13} />
          </Pressable>
        </View>

        <View style={styles.sectionDivider} />

        {/* 섹션 3: 로그아웃 */}
        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="로그아웃"
            onPress={handlePressLogout}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.logoutLabel}>로그아웃</Text>
            <ChevronRightIcon color="#DC2626" size={13} />
          </Pressable>
        </View>

        {/* 하단 버전 표시 */}
        <View style={styles.footer}>
          <Text style={styles.versionText}>{`version v${appVersion}`}</Text>
        </View>
      </ScrollView>

      {/* 모드 선택 / 안내 모달 */}
      <Modal
        visible={activeModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setActiveModal(null)} />
          {activeModal === 'theme' ? (
            <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>화면 모드 선택</Text>
              <View style={styles.optionGroup}>
                {(
                  [
                    { value: 'light', label: '라이트' },
                    { value: 'dark', label: '다크' },
                  ] as const
                ).map((item) => {
                  const selected = themeMode === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      accessibilityRole="button"
                      onPress={() => void handleSelectTheme(item.value)}
                      style={[styles.optionCard, selected && styles.optionCardSelected]}>
                      <Text style={[styles.optionCardText, selected && styles.optionCardTextSelected]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : activeModal !== null ? (
            <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>{INFO_MODAL_CONTENT[activeModal].title}</Text>
              <Text style={styles.infoBodyText}>{INFO_MODAL_CONTENT[activeModal].body}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setActiveModal(null)}
                style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}>
                <Text style={styles.confirmButtonText}>확인</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 38,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#F3F4F6',
  },
  section: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  row: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 15.5,
    fontWeight: '500',
    color: '#111827',
    letterSpacing: -0.3,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  sectionDivider: {
    height: 8,
    backgroundColor: '#F3F4F6',
  },
  logoutLabel: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#DC2626',
    letterSpacing: -0.3,
  },
  footer: {
    paddingTop: 22,
    paddingBottom: 24,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B7280',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E4E7',
  },
  sheetTitle: {
    marginTop: 20,
    marginBottom: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.4,
  },
  optionGroup: {
    gap: 10,
  },
  optionCard: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  optionCardSelected: {
    borderColor: '#1D61E7',
    backgroundColor: '#F1F5FF',
  },
  optionCardText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  optionCardTextSelected: {
    fontWeight: '700',
    color: '#1D61E7',
  },
  infoBodyText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: '#374151',
  },
  confirmButton: {
    marginTop: 22,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1D61E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.72,
  },
});
