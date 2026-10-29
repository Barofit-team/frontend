import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  CheckCircleSolidIcon,
  ChevronRightIcon,
  FlameSolidIcon,
  GearIcon,
  SolidPencilIcon,
} from '@/components/home/HomeIcons';
import { createMockWorkoutResult } from '@/mocks/workoutResult';
import { ApiError } from '@/services/api';
import { triggerManualInactivityAlarm } from '@/services/inactivityAlarmService';
import { tokenStorage } from '@/services/tokenStorage';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';
import type {
  DiscomfortArea,
  DiscomfortSelection,
  ExerciseGoal,
  Gender,
  WeeklyWorkoutDays,
} from '@/types/onboarding';

type EditFieldType =
  | 'nickname'
  | 'gender'
  | 'age'
  | 'heightCm'
  | 'weightKg'
  | 'goal'
  | 'weeklyWorkoutDays'
  | 'discomfort'
  | 'settings'
  | 'withdrawConfirm'
  | null;

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: '남성' },
  { value: 'FEMALE', label: '여성' },
];

const GOAL_OPTIONS: { value: ExerciseGoal; label: string }[] = [
  { value: 'WEIGHT_LOSS', label: '체중 감량' },
  { value: 'STRENGTH', label: '근력 향상' },
  { value: 'ENDURANCE', label: '체력 증진' },
  { value: 'POSTURE', label: '자세 교정' },
];

const GOAL_LABEL_MAP: Record<ExerciseGoal, string> = {
  WEIGHT_LOSS: '체중 감량',
  STRENGTH: '근력 향상',
  ENDURANCE: '체력 증진',
  POSTURE: '자세 교정',
};

const FREQUENCY_OPTIONS: { value: WeeklyWorkoutDays; label: string }[] = [
  { value: 2, label: '주 2회' },
  { value: 3, label: '주 3회' },
  { value: 4, label: '주 4회' },
  { value: 5, label: '주 5회' },
  { value: 6, label: '주 6회' },
];

const DISCOMFORT_OPTIONS: { value: DiscomfortSelection; label: string }[] = [
  { value: 'NONE', label: '해당 없음' },
  { value: 'NECK_SHOULDER', label: '목 / 어깨' },
  { value: 'ARM_WRIST', label: '팔 / 손목' },
  { value: 'BACK', label: '등 / 허리' },
  { value: 'LEG_ANKLE', label: '다리 / 발목' },
];

const DISCOMFORT_LABEL_MAP: Record<DiscomfortArea, string> = {
  NECK_SHOULDER: '목 / 어깨',
  ARM_WRIST: '팔 / 손목',
  BACK: '등 / 허리',
  LEG_ANKLE: '다리 / 발목',
};

function formatDiscomfortSummary(
  areas: DiscomfortArea[] | undefined,
  selections: DiscomfortSelection[],
): string {
  if (areas && areas.length > 0) {
    return areas.map((area) => DISCOMFORT_LABEL_MAP[area]).join(', ');
  }
  const activeAreas = selections.filter(
    (item): item is DiscomfortArea => item !== 'NONE',
  );
  if (activeAreas.length > 0) {
    return activeAreas.map((area) => DISCOMFORT_LABEL_MAP[area]).join(', ');
  }
  return '해당 없음';
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const loadMyAccount = useAuthStore((state) => state.loadMyAccount);
  const updateUserNickname = useAuthStore((state) => state.updateUserNickname);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const logout = useAuthStore((state) => state.logout);
  const withdraw = useAuthStore((state) => state.withdraw);

  const onboardingNickname = useOnboardingStore((state) => state.nickname);
  const onboardingGender = useOnboardingStore((state) => state.gender);
  const onboardingAge = useOnboardingStore((state) => state.age);
  const onboardingHeightCm = useOnboardingStore((state) => state.heightCm);
  const onboardingWeightKg = useOnboardingStore((state) => state.weightKg);
  const onboardingGoal = useOnboardingStore((state) => state.goal);
  const onboardingWeeklyDays = useOnboardingStore(
    (state) => state.weeklyWorkoutDays,
  );
  const onboardingDiscomforts = useOnboardingStore(
    (state) => state.discomfortSelections,
  );

  const setOnboardingNickname = useOnboardingStore(
    (state) => state.setNickname,
  );
  const setOnboardingGender = useOnboardingStore((state) => state.setGender);
  const setOnboardingAgeInput = useOnboardingStore(
    (state) => state.setAgeInput,
  );
  const setOnboardingHeightInput = useOnboardingStore(
    (state) => state.setHeightInput,
  );
  const setOnboardingWeightInput = useOnboardingStore(
    (state) => state.setWeightInput,
  );
  const setOnboardingGoal = useOnboardingStore((state) => state.setGoal);
  const setOnboardingWeeklyDays = useOnboardingStore(
    (state) => state.setWeeklyWorkoutDays,
  );
  const setOnboardingDiscomforts = useOnboardingStore(
    (state) => state.setDiscomfortSelections,
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const token = await tokenStorage.getAccessToken();
      if (token && mounted && !profile) {
        try {
          await loadMyAccount();
        } catch {
          // 오프라인·dev 로그인 상태에서는 로컬 스토어 값 사용
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadMyAccount, profile]);

  // 현재 표시할 프로필 값 (백엔드 프로필 -> 온보딩 스토어 -> 시안 기본값 순)
  const displayName =
    user?.nickname?.trim() || onboardingNickname.trim() || '역삼역날다람쥐';
  const effectiveGender: Gender = profile?.gender ?? onboardingGender ?? 'MALE';
  const effectiveAge: number = profile?.age ?? onboardingAge ?? 29;
  const effectiveHeightCm: number =
    profile?.heightCm ?? onboardingHeightCm ?? 185;
  const effectiveWeightKg: number =
    profile?.weightKg ?? onboardingWeightKg ?? 84;
  const effectiveGoal: ExerciseGoal =
    profile?.goal ?? onboardingGoal ?? 'ENDURANCE';
  const effectiveWeeklyDays: WeeklyWorkoutDays =
    profile?.weeklyWorkoutDays ?? onboardingWeeklyDays ?? 3;
  const discomfortLabel = formatDiscomfortSummary(
    profile?.discomfortAreas,
    onboardingDiscomforts,
  );

  // 모달 편집 상태
  const [activeField, setActiveField] = useState<EditFieldType>(null);
  const [draftText, setDraftText] = useState<string>('');
  const [draftGender, setDraftGender] = useState<Gender>(effectiveGender);
  const [draftGoal, setDraftGoal] = useState<ExerciseGoal>(effectiveGoal);
  const [draftWeeklyDays, setDraftWeeklyDays] =
    useState<WeeklyWorkoutDays>(effectiveWeeklyDays);
  const [draftDiscomforts, setDraftDiscomforts] = useState<
    DiscomfortSelection[]
  >(['NONE']);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const openEditModal = (field: Exclude<EditFieldType, null>) => {
    switch (field) {
      case 'nickname':
        setDraftText(displayName);
        break;
      case 'gender':
        setDraftGender(effectiveGender);
        break;
      case 'age':
        setDraftText(String(effectiveAge));
        break;
      case 'heightCm':
        setDraftText(String(effectiveHeightCm));
        break;
      case 'weightKg':
        setDraftText(String(effectiveWeightKg));
        break;
      case 'goal':
        setDraftGoal(effectiveGoal);
        break;
      case 'weeklyWorkoutDays':
        setDraftWeeklyDays(effectiveWeeklyDays);
        break;
      case 'discomfort': {
        if (profile?.discomfortAreas && profile.discomfortAreas.length > 0) {
          setDraftDiscomforts([...profile.discomfortAreas]);
        } else if (onboardingDiscomforts.length > 0) {
          setDraftDiscomforts([...onboardingDiscomforts]);
        } else {
          setDraftDiscomforts(['NONE']);
        }
        break;
      }
      case 'settings':
        break;
      case 'withdrawConfirm':
        setWithdrawError(null);
        break;
    }
    setActiveField(field);
  };

  const closeModal = () => {
    if (isWithdrawing) return;
    setWithdrawError(null);
    setActiveField(null);
  };

  const toggleDraftDiscomfort = (selection: DiscomfortSelection) => {
    setDraftDiscomforts((prev) => {
      if (selection === 'NONE') {
        return ['NONE'];
      }
      const withoutNone = prev.filter((item) => item !== 'NONE');
      const exists = withoutNone.includes(selection);
      const next = exists
        ? withoutNone.filter((item) => item !== selection)
        : [...withoutNone, selection];
      return next.length > 0 ? next : ['NONE'];
    });
  };

  const handleSaveField = () => {
    if (!activeField) return;

    switch (activeField) {
      case 'nickname': {
        const cleaned = draftText.trim();
        if (cleaned) {
          updateUserNickname(cleaned);
          setOnboardingNickname(cleaned);
        }
        break;
      }
      case 'gender': {
        updateProfile({ gender: draftGender });
        setOnboardingGender(draftGender);
        break;
      }
      case 'age': {
        const num = Number(draftText.replace(/[^0-9]/g, ''));
        if (Number.isFinite(num) && num > 0) {
          updateProfile({ age: num });
          setOnboardingAgeInput(String(num));
        }
        break;
      }
      case 'heightCm': {
        const num = Number(draftText.replace(/[^0-9]/g, ''));
        if (Number.isFinite(num) && num > 0) {
          updateProfile({ heightCm: num });
          setOnboardingHeightInput(String(num));
        }
        break;
      }
      case 'weightKg': {
        const num = Number(draftText.replace(/[^0-9]/g, ''));
        if (Number.isFinite(num) && num > 0) {
          updateProfile({ weightKg: num });
          setOnboardingWeightInput(String(num));
        }
        break;
      }
      case 'goal': {
        updateProfile({ goal: draftGoal });
        setOnboardingGoal(draftGoal);
        break;
      }
      case 'weeklyWorkoutDays': {
        updateProfile({ weeklyWorkoutDays: draftWeeklyDays });
        setOnboardingWeeklyDays(draftWeeklyDays);
        break;
      }
      case 'discomfort': {
        const areas = draftDiscomforts.filter(
          (item): item is DiscomfortArea => item !== 'NONE',
        );
        updateProfile({ discomfortAreas: areas });
        setOnboardingDiscomforts(draftDiscomforts);
        break;
      }
      case 'settings':
      case 'withdrawConfirm':
        break;
    }

    closeModal();
  };

  const handleLogout = async () => {
    closeModal();
    await logout();
    router.replace('/login');
  };

  const handleConfirmWithdraw = async () => {
    if (isWithdrawing) return;
    setIsWithdrawing(true);
    setWithdrawError(null);

    try {
      await withdraw();
      setActiveField(null);
      router.replace('/login');
    } catch (error) {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : '회원 탈퇴 처리 중 문제가 발생했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
      setWithdrawError(message);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleOpenOnboarding = () => {
    closeModal();
    useOnboardingStore.getState().resetOnboarding();
    router.push('/onboarding');
  };

  const handleOpenWorkoutResult = () => {
    closeModal();
    useWorkoutResultStore.getState().setResult(createMockWorkoutResult());
    router.push('/workout-result', { dangerouslySingular: true });
  };

  const infoRows: {
    key: Exclude<
      EditFieldType,
      'nickname' | 'settings' | 'withdrawConfirm' | null
    >;
    label: string;
    value: string;
  }[] = [
    {
      key: 'gender',
      label: '성별',
      value: effectiveGender === 'MALE' ? '남성' : '여성',
    },
    {
      key: 'age',
      label: '나이',
      value: String(effectiveAge),
    },
    {
      key: 'heightCm',
      label: '키(cm)',
      value: String(effectiveHeightCm),
    },
    {
      key: 'weightKg',
      label: '몸무게(kg)',
      value: String(effectiveWeightKg),
    },
    {
      key: 'goal',
      label: '운동 목표',
      value: GOAL_LABEL_MAP[effectiveGoal],
    },
    {
      key: 'weeklyWorkoutDays',
      label: '희망 운동 빈도',
      value: `주 ${effectiveWeeklyDays}회`,
    },
    {
      key: 'discomfort',
      label: '불편 부위',
      value: discomfortLabel,
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* 1. 프로필 아바타 및 닉네임 영역 */}
        <View style={styles.profileRow}>
          <View style={styles.avatarCircle} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닉네임 수정"
            hitSlop={8}
            onPress={() => openEditModal('nickname')}
            style={({ pressed }) => [
              styles.nicknameButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.nicknameText}>{`${displayName}님`}</Text>
            <SolidPencilIcon color="#111111" size={18} />
          </Pressable>
        </View>

        {/* 3. 운동 완료일 & Streak Day 요약 카드 */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>운동 완료일</Text>
            <View style={styles.statValueRow}>
              <CheckCircleSolidIcon color="#111111" size={20} />
              <Text style={styles.statValueText}>57일</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Streak Day</Text>
            <View style={styles.statValueRow}>
              <FlameSolidIcon color="#111111" size={20} />
              <Text style={styles.statValueText}>12일</Text>
            </View>
          </View>
        </View>

        {/* 4. 신체 정보 및 운동 설정 리스트 */}
        <View style={styles.infoList}>
          {infoRows.map((row) => (
            <Pressable
              key={row.key}
              accessibilityRole="button"
              accessibilityLabel={`${row.label} ${row.value} 변경`}
              onPress={() => openEditModal(row.key)}
              style={({ pressed }) => [
                styles.infoRow,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.infoLabel}>{row.label}</Text>

              <View style={styles.infoRight}>
                <Text style={styles.infoValue}>{row.value}</Text>
                <ChevronRightIcon color="#111111" size={14} />
              </View>
            </Pressable>
          ))}
        </View>

        {/* 5. 하단 구분선 및 앱 설정 */}
        <View style={styles.sectionDivider} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="앱 설정"
          onPress={() => openEditModal('settings')}
          style={({ pressed }) => [
            styles.appSettingsRow,
            pressed && styles.pressed,
          ]}>
          <View style={styles.appSettingsLeft}>
            <GearIcon color="#111111" size={20} />
            <Text style={styles.appSettingsText}>앱 설정</Text>
          </View>

          <ChevronRightIcon color="#111111" size={14} />
        </Pressable>
      </ScrollView>

      {/* 6. 항목 편집 & 앱 설정 바텀시트 모달 */}
      <Modal
        visible={activeField !== null}
        transparent
        animationType="fade"
        onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismissArea} onPress={closeModal} />

          {activeField !== null ? (
            <View
              style={[
                styles.sheetContainer,
                { paddingBottom: Math.max(insets.bottom, 20) + 8 },
              ]}>
              <View style={styles.sheetHandle} />

              {/* 닉네임 / 나이 / 키 / 몸무게 텍스트 입력 모달 */}
              {(activeField === 'nickname' ||
                activeField === 'age' ||
                activeField === 'heightCm' ||
                activeField === 'weightKg') && (
                <>
                  <Text style={styles.sheetTitle}>
                    {activeField === 'nickname'
                      ? '닉네임 변경'
                      : activeField === 'age'
                        ? '나이 변경'
                        : activeField === 'heightCm'
                          ? '키(cm) 변경'
                          : '몸무게(kg) 변경'}
                  </Text>

                  <TextInput
                    value={draftText}
                    onChangeText={(text) =>
                      setDraftText(
                        activeField === 'nickname'
                          ? text
                          : text.replace(/[^0-9]/g, ''),
                      )
                    }
                    keyboardType={
                      activeField === 'nickname' ? 'default' : 'number-pad'
                    }
                    maxLength={activeField === 'nickname' ? 10 : 3}
                    autoFocus
                    placeholder={
                      activeField === 'nickname'
                        ? '닉네임을 입력해주세요'
                        : '숫자를 입력해주세요'
                    }
                    placeholderTextColor="#9CA3AF"
                    style={styles.sheetInput}
                  />

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleSaveField}
                    style={({ pressed }) => [
                      styles.saveButton,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.saveButtonText}>저장</Text>
                  </Pressable>
                </>
              )}

              {/* 성별 선택 모달 */}
              {activeField === 'gender' && (
                <>
                  <Text style={styles.sheetTitle}>성별 변경</Text>
                  <View style={styles.optionGroup}>
                    {GENDER_OPTIONS.map((item) => {
                      const selected = draftGender === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => setDraftGender(item.value)}
                          style={[
                            styles.optionCard,
                            selected && styles.optionCardSelected,
                          ]}>
                          <Text
                            style={[
                              styles.optionCardText,
                              selected && styles.optionCardTextSelected,
                            ]}>
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleSaveField}
                    style={({ pressed }) => [
                      styles.saveButton,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.saveButtonText}>저장</Text>
                  </Pressable>
                </>
              )}

              {/* 운동 목표 선택 모달 */}
              {activeField === 'goal' && (
                <>
                  <Text style={styles.sheetTitle}>운동 목표 변경</Text>
                  <View style={styles.optionGroup}>
                    {GOAL_OPTIONS.map((item) => {
                      const selected = draftGoal === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => setDraftGoal(item.value)}
                          style={[
                            styles.optionCard,
                            selected && styles.optionCardSelected,
                          ]}>
                          <Text
                            style={[
                              styles.optionCardText,
                              selected && styles.optionCardTextSelected,
                            ]}>
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleSaveField}
                    style={({ pressed }) => [
                      styles.saveButton,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.saveButtonText}>저장</Text>
                  </Pressable>
                </>
              )}

              {/* 희망 운동 빈도 선택 모달 */}
              {activeField === 'weeklyWorkoutDays' && (
                <>
                  <Text style={styles.sheetTitle}>희망 운동 빈도 변경</Text>
                  <View style={styles.optionGroup}>
                    {FREQUENCY_OPTIONS.map((item) => {
                      const selected = draftWeeklyDays === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => setDraftWeeklyDays(item.value)}
                          style={[
                            styles.optionCard,
                            selected && styles.optionCardSelected,
                          ]}>
                          <Text
                            style={[
                              styles.optionCardText,
                              selected && styles.optionCardTextSelected,
                            ]}>
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleSaveField}
                    style={({ pressed }) => [
                      styles.saveButton,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.saveButtonText}>저장</Text>
                  </Pressable>
                </>
              )}

              {/* 불편 부위 선택 모달 */}
              {activeField === 'discomfort' && (
                <>
                  <Text style={styles.sheetTitle}>불편 부위 변경</Text>
                  <View style={styles.optionGroup}>
                    {DISCOMFORT_OPTIONS.map((item) => {
                      const selected = draftDiscomforts.includes(item.value);
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => toggleDraftDiscomfort(item.value)}
                          style={[
                            styles.optionCard,
                            selected && styles.optionCardSelected,
                          ]}>
                          <Text
                            style={[
                              styles.optionCardText,
                              selected && styles.optionCardTextSelected,
                            ]}>
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleSaveField}
                    style={({ pressed }) => [
                      styles.saveButton,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.saveButtonText}>저장</Text>
                  </Pressable>
                </>
              )}

              {/* 앱 설정 모달 */}
              {activeField === 'settings' && (
                <>
                  <Text style={styles.sheetTitle}>앱 설정</Text>
                  <View style={styles.optionGroup}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        closeModal();
                        void triggerManualInactivityAlarm();
                      }}
                      style={({ pressed }) => [
                        styles.optionCard,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.optionCardText}>
                        알람 수동 발송 테스트
                      </Text>
                    </Pressable>

                    {__DEV__ && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleOpenOnboarding}
                        style={({ pressed }) => [
                          styles.optionCard,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={styles.optionCardText}>
                          [DEV] 온보딩 다시 보기
                        </Text>
                      </Pressable>
                    )}

                    {__DEV__ && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleOpenWorkoutResult}
                        style={({ pressed }) => [
                          styles.optionCard,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={styles.optionCardText}>
                          [DEV] 오늘의 결과 바로가기
                        </Text>
                      </Pressable>
                    )}

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void handleLogout()}
                      style={({ pressed }) => [
                        styles.optionCard,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.optionCardText}>로그아웃</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openEditModal('withdrawConfirm')}
                      style={({ pressed }) => [
                        styles.optionCard,
                        styles.logoutOptionCard,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.logoutOptionText}>회원 탈퇴</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {/* 회원 탈퇴 확인 모달 */}
              {activeField === 'withdrawConfirm' && (
                <>
                  <Text style={styles.sheetTitle}>정말 탈퇴하시겠어요?</Text>

                  <View style={styles.withdrawNoticeBox}>
                    <Text style={styles.withdrawNoticeTitle}>
                      탈퇴 전 꼭 확인해 주세요
                    </Text>
                    <Text style={styles.withdrawNoticeItem}>
                      • 신체 프로필, 운동 목표, 불편 부위 등 개인 맞춤 설정이 즉시 삭제되며 복구할 수 없어요.
                    </Text>
                    <Text style={styles.withdrawNoticeItem}>
                      • 소셜 계정 연동이 해제되어 같은 계정으로 다시 로그인하면 신규 회원으로 시작하게 돼요.
                    </Text>
                  </View>

                  {withdrawError ? (
                    <Text style={styles.withdrawErrorText}>{withdrawError}</Text>
                  ) : null}

                  <View style={styles.withdrawButtonRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="탈퇴 취소"
                      disabled={isWithdrawing}
                      onPress={closeModal}
                      style={({ pressed }) => [
                        styles.withdrawCancelButton,
                        pressed && !isWithdrawing && styles.pressed,
                      ]}>
                      <Text style={styles.withdrawCancelButtonText}>취소</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="회원 탈퇴 확정"
                      disabled={isWithdrawing}
                      onPress={() => void handleConfirmWithdraw()}
                      style={({ pressed }) => [
                        styles.withdrawConfirmButton,
                        isWithdrawing && styles.withdrawButtonDisabled,
                        pressed && !isWithdrawing && styles.pressed,
                      ]}>
                      {isWithdrawing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.withdrawConfirmButtonText}>
                          탈퇴하기
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#D4D4D8',
  },
  nicknameButton: {
    marginLeft: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  nicknameText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 26,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#EAEAEA',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111111',
    letterSpacing: -0.2,
  },
  statValueRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statValueText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  infoList: {
    marginTop: 22,
  },
  infoRow: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
    letterSpacing: -0.3,
  },
  infoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111111',
    letterSpacing: -0.2,
  },
  sectionDivider: {
    height: 8,
    backgroundColor: '#F3F4F6',
    marginHorizontal: -20,
    marginTop: 14,
    marginBottom: 4,
  },
  appSettingsRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appSettingsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appSettingsText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111111',
    letterSpacing: -0.3,
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
    color: '#111111',
    letterSpacing: -0.4,
  },
  sheetInput: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
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
    borderColor: '#111111',
    backgroundColor: '#FFFFFF',
  },
  optionCardText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111111',
  },
  optionCardTextSelected: {
    fontWeight: '700',
  },
  logoutOptionCard: {
    backgroundColor: '#FEF2F2',
  },
  logoutOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
  },
  withdrawNoticeBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  withdrawNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 2,
  },
  withdrawNoticeItem: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '400',
    color: '#7F1D1D',
    letterSpacing: -0.2,
  },
  withdrawErrorText: {
    marginTop: 12,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
    color: '#DC2626',
  },
  withdrawButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  withdrawCancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
    letterSpacing: -0.2,
  },
  withdrawConfirmButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawButtonDisabled: {
    opacity: 0.6,
  },
  withdrawConfirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  saveButton: {
    marginTop: 22,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  pressed: {
    opacity: 0.75,
  },
});
