import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { ageFromBirthDate } from '@/utils/birthDate';
import {
  ActivityIndicator,
  Image,
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
  ChevronRightIcon,
  ProfileTabIcon,
  SolidPencilIcon,
} from '@/components/home/HomeIcons';
import { ApiError } from '@/services/api';
import { updateMyProfile } from '@/services/onboardingService';
import { getReportCalendar } from '@/services/reportService';
import { tokenStorage } from '@/services/tokenStorage';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import {
  NICKNAME_REGEX,
  type DiscomfortArea,
  type DiscomfortSelection,
  type ExerciseGoal,
  type Gender,
  type ProfileUpdateRequest,
  type WeeklyWorkoutDays,
} from '@/types/onboarding';

type EditFieldType =
  | 'nickname'
  | 'profileMeta'
  | 'bodySpec'
  | 'goal'
  | 'weeklyWorkoutDays'
  | 'discomfort'
  | null;

type EditableField = Exclude<EditFieldType, null>;

/** 서버 검증 규칙(docs/onboarding-api.md 3장)과 같은 숫자 범위 */
const NUMBER_RULES: Record<'heightCm' | 'weightKg', { min: number; max: number; label: string }> = {
  heightCm: { min: 100, max: 250, label: '키' },
  weightKg: { min: 20, max: 300, label: '몸무게' },
};

/** 프로필 수정 실패 응답을 사용자 안내 문구로 바꿉니다 */
function toProfileUpdateMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '프로필을 저장하지 못했어요. 다시 시도해 주세요.';
  }
  switch (error.code) {
    case 'PROFILE_NICKNAME_DUPLICATED':
      return '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.';
    case 'PROFILE_NICKNAME_INVALID':
      return '닉네임은 2~10자의 한글, 영문, 숫자만 사용할 수 있어요.';
    case 'INVALID_INPUT':
      return '입력한 값을 다시 확인해 주세요.';
    default:
      // 서버 detail·네트워크 오류 원문(서버 주소 포함)은 화면에 보여주지 않습니다
      return '프로필을 저장하지 못했어요. 다시 시도해 주세요.';
  }
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: '남성' },
  { value: 'FEMALE', label: '여성' },
];

const GOAL_OPTIONS: { value: ExerciseGoal; label: string }[] = [
  { value: 'WEIGHT_LOSS', label: '체중 감량' },
  { value: 'STRENGTH', label: '근력 향상' },
  { value: 'ENDURANCE', label: '체력 증진' },
  { value: 'POSTURE', label: '자세 교정' },
  { value: 'HABIT', label: '운동 습관 형성' },
];

const GOAL_LABEL_MAP: Record<ExerciseGoal, string> = {
  WEIGHT_LOSS: '체중 감량',
  STRENGTH: '근력 향상',
  ENDURANCE: '체력 증진',
  POSTURE: '자세 교정',
  HABIT: '운동 습관 형성',
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
  return '없음';
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const loadMyAccount = useAuthStore((state) => state.loadMyAccount);
  const updateUserNickname = useAuthStore((state) => state.updateUserNickname);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const applyMeResponse = useAuthStore((state) => state.applyMeResponse);

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

  const [completedDays, setCompletedDays] = useState<number | null>(null);
  const [streakDays, setStreakDays] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const token = await tokenStorage.getAccessToken();
        if (!token || !active) return;

        const now = new Date();
        await Promise.allSettled([
          loadMyAccount(),
          getReportCalendar(now.getFullYear(), now.getMonth() + 1).then((calendar) => {
            if (!active) return;
            setCompletedDays(calendar.completedDays);
            setStreakDays(calendar.streakDays);
          }),
        ]);
      })();
      return () => {
        active = false;
      };
    }, [loadMyAccount]),
  );

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
  const [draftHeightText, setDraftHeightText] = useState<string>('');
  const [draftWeightText, setDraftWeightText] = useState<string>('');
  const [draftGender, setDraftGender] = useState<Gender>(effectiveGender);
  const [draftGoal, setDraftGoal] = useState<ExerciseGoal>(effectiveGoal);
  const [draftWeeklyDays, setDraftWeeklyDays] =
    useState<WeeklyWorkoutDays>(effectiveWeeklyDays);
  const [draftDiscomforts, setDraftDiscomforts] = useState<
    DiscomfortSelection[]
  >(['NONE']);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openEditModal = (field: EditableField) => {
    switch (field) {
      case 'nickname':
        setDraftText(displayName);
        break;
      case 'profileMeta':
        setDraftGender(effectiveGender);
        setDraftText(profile?.birthDate ?? '');
        break;
      case 'bodySpec':
        setDraftHeightText(String(effectiveHeightCm));
        setDraftWeightText(String(effectiveWeightKg));
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
    }
    setSaveError(null);
    setActiveField(field);
  };

  const closeModal = () => {
    if (isSaving) return;
    setSaveError(null);
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

  /**
   * 편집 중인 항목을 PATCH /api/v1/users/me/profile 요청으로 만듭니다.
   * 값이 바뀌지 않았으면 null, 입력이 규칙에 맞지 않으면 error를 돌려줍니다.
   */
  const buildProfileUpdate = (
    field: EditableField,
  ): { request: ProfileUpdateRequest | null } | { error: string } => {
    switch (field) {
      case 'nickname': {
        const nickname = draftText.trim();
        if (!NICKNAME_REGEX.test(nickname)) {
          return { error: '닉네임은 2~10자의 한글, 영문, 숫자만 사용할 수 있어요.' };
        }
        return { request: nickname === user?.nickname ? null : { nickname } };
      }
      case 'profileMeta': {
        const birthDate = draftText.trim();
        const parts = birthDate.split('-');
        const age = ageFromBirthDate(parts[0] ?? '', parts[1] ?? '', parts[2] ?? '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || age === null || age < 14 || age > 100) {
          return { error: '생년월일을 YYYY-MM-DD 형식으로 입력해주세요. 만 14~100세만 사용할 수 있어요.' };
        }
        const patch: ProfileUpdateRequest = {};
        if (draftGender !== effectiveGender) patch.gender = draftGender;
        if (birthDate !== profile?.birthDate) patch.birthDate = birthDate;
        return { request: Object.keys(patch).length > 0 ? patch : null };
      }
      case 'bodySpec': {
        const hRule = NUMBER_RULES.heightCm;
        const wRule = NUMBER_RULES.weightKg;
        const heightCm = Number(draftHeightText);
        const weightKg = Number(draftWeightText);
        if (!draftHeightText || !Number.isInteger(heightCm) || heightCm < hRule.min || heightCm > hRule.max) {
          return { error: `${hRule.label}는 ${hRule.min}~${hRule.max} 사이로 입력해 주세요.` };
        }
        if (!draftWeightText || !Number.isInteger(weightKg) || weightKg < wRule.min || weightKg > wRule.max) {
          return { error: `${wRule.label}는 ${wRule.min}~${wRule.max} 사이로 입력해 주세요.` };
        }
        const patch: ProfileUpdateRequest = {};
        if (heightCm !== effectiveHeightCm) patch.heightCm = heightCm;
        if (weightKg !== effectiveWeightKg) patch.weightKg = weightKg;
        return { request: Object.keys(patch).length > 0 ? patch : null };
      }
      case 'goal':
        return { request: draftGoal === effectiveGoal ? null : { goal: draftGoal } };
      case 'weeklyWorkoutDays':
        return {
          request:
            draftWeeklyDays === effectiveWeeklyDays ? null : { weeklyWorkoutDays: draftWeeklyDays },
        };
      case 'discomfort': {
        const areas = draftDiscomforts.filter(
          (item): item is DiscomfortArea => item !== 'NONE',
        );
        const current = profile?.discomfortAreas ?? [];
        const unchanged =
          profile !== null &&
          areas.length === current.length &&
          areas.every((area) => current.includes(area));
        // '해당 없음'은 빈 배열로 보냅니다
        return { request: unchanged ? null : { discomfortAreas: areas } };
      }
    }
  };

  /** [DEV] 토큰 없는 로컬 테스트 모드: 서버 대신 앱 스토어에만 반영합니다 */
  const applyLocally = (request: ProfileUpdateRequest) => {
    const { nickname, ...profileFields } = request;
    if (nickname) {
      updateUserNickname(nickname);
      setOnboardingNickname(nickname);
    }
    if (Object.keys(profileFields).length > 0) {
      const birth = profileFields.birthDate?.split('-');
      const age = birth ? ageFromBirthDate(birth[0], birth[1], birth[2]) : null;
      updateProfile({ ...profileFields, ...(age === null ? {} : { age }) });
      if (birth) {
        const store = useOnboardingStore.getState();
        store.setBirthDatePart('birthYear', birth[0]);
        store.setBirthDatePart('birthMonth', birth[1]);
        store.setBirthDatePart('birthDay', birth[2]);
      }
    }
    if (profileFields.gender) setOnboardingGender(profileFields.gender);
    if (profileFields.age) setOnboardingAgeInput(String(profileFields.age));
    if (profileFields.heightCm) setOnboardingHeightInput(String(profileFields.heightCm));
    if (profileFields.weightKg) setOnboardingWeightInput(String(profileFields.weightKg));
    if (profileFields.goal) setOnboardingGoal(profileFields.goal);
    if (profileFields.weeklyWorkoutDays) setOnboardingWeeklyDays(profileFields.weeklyWorkoutDays);
    if (profileFields.discomfortAreas) setOnboardingDiscomforts(draftDiscomforts);
  };

  const handleSaveField = async () => {
    if (!activeField) return;
    if (isSaving) return;

    const result = buildProfileUpdate(activeField);
    if ('error' in result) {
      setSaveError(result.error);
      return;
    }
    if (!result.request) {
      closeModal();
      return;
    }

    const accessToken = await tokenStorage.getAccessToken();
    if (!accessToken) {
      applyLocally(result.request);
      closeModal();
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const me = await updateMyProfile(result.request);
      applyMeResponse(me);
      setActiveField(null);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROFILE_NOT_ONBOARDED') {
        // 온보딩을 마치지 않은 계정은 온보딩부터 진행합니다
        setActiveField(null);
        useOnboardingStore.getState().resetOnboarding();
        router.replace('/onboarding');
        return;
      }
      // 401(세션 만료·탈퇴)은 apiFetch가 로그인 화면으로 보냅니다
      setSaveError(toProfileUpdateMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const renderSaveFooter = () => (
    <>
      {saveError ? <Text style={styles.saveErrorText}>{saveError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={isSaving}
        onPress={() => void handleSaveField()}
        style={({ pressed }) => [
          styles.saveButton,
          isSaving && styles.saveButtonDisabled,
          pressed && !isSaving && styles.pressed,
        ]}>
        {isSaving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.saveButtonText}>저장</Text>
        )}
      </Pressable>
    </>
  );

  const infoRows: {
    key: Exclude<EditFieldType, 'nickname' | 'profileMeta' | null>;
    label: string;
    value: string;
  }[] = [
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
      key: 'bodySpec',
      label: '신체 정보',
      value: `${effectiveHeightCm}cm / ${effectiveWeightKg}kg`,
    },
    {
      key: 'discomfort',
      label: '불편 부위',
      value: discomfortLabel,
    },
  ];

  const genderLabel = effectiveGender === 'MALE' ? '남성' : '여성';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 100 },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* 1. 상단 타이틀 */}
        <Text style={styles.pageTitle}>내 정보</Text>

        {/* 2. 프로필 아바타 및 닉네임·성별/나이 영역 */}
        <View style={styles.profileRow}>
          <View style={styles.avatarCircle}>
            {user?.profileImageUrl ? (
              <Image
                source={{ uri: user.profileImageUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <ProfileTabIcon color="#FFFFFF" size={32} />
            )}
          </View>

          <View style={styles.profileInfo}>
            <View style={styles.nicknameRow}>
              <Text style={styles.nicknameText} numberOfLines={1}>
                {displayName}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="닉네임 수정"
                hitSlop={8}
                onPress={() => openEditModal('nickname')}
                style={({ pressed }) => [
                  styles.editBadgeButton,
                  pressed && styles.pressed,
                ]}>
                <SolidPencilIcon color="#6B7280" size={14} />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="성별 및 생년월일 수정"
              hitSlop={6}
              onPress={() => openEditModal('profileMeta')}
              style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.profileSubText}>
                {`${genderLabel} · ${profile?.birthDate ? profile.birthDate.replace(/-/g, '.') : `만 ${effectiveAge}세`}`}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 3. 운동 완료일 · 연속 운동일 요약 카드 */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>운동 완료일</Text>
            <Text style={styles.statValue}>
              {completedDays !== null ? `${completedDays}일` : '-일'}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>연속 운동일</Text>
            <Text style={styles.statValue}>
              {streakDays !== null ? `${streakDays}일` : '-일'}
            </Text>
          </View>
        </View>

        {/* 4. 신체 정보 및 운동 설정 리스트 */}
        <View style={styles.sectionDivider} />

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
                <ChevronRightIcon color="#374151" size={13} />
              </View>
            </Pressable>
          ))}
        </View>

        {/* 5. 하단 구분선 및 앱 설정 */}
        <View style={styles.sectionDivider} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="앱 설정"
          onPress={() => router.push('/app-settings')}
          style={({ pressed }) => [
            styles.appSettingsRow,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.appSettingsText}>앱 설정</Text>
          <ChevronRightIcon color="#374151" size={13} />
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

              {/* 닉네임 변경 모달 */}
              {activeField === 'nickname' && (
                <>
                  <Text style={styles.sheetTitle}>닉네임 변경</Text>

                  <TextInput
                    value={draftText}
                    onChangeText={setDraftText}
                    keyboardType="default"
                    maxLength={10}
                    autoFocus
                    placeholder="닉네임을 입력해주세요"
                    placeholderTextColor="#9CA3AF"
                    style={styles.sheetInput}
                  />

                  {renderSaveFooter()}
                </>
              )}

              {/* 성별 및 생년월일 변경 모달 */}
              {activeField === 'profileMeta' && (
                <>
                  <Text style={styles.sheetTitle}>성별 및 생년월일 변경</Text>
                  <View style={styles.optionGroup}>
                    <View style={styles.genderRow}>
                      {GENDER_OPTIONS.map((item) => {
                        const selected = draftGender === item.value;
                        return (
                          <Pressable
                            key={item.value}
                            accessibilityRole="button"
                            onPress={() => setDraftGender(item.value)}
                            style={[
                              styles.optionCard,
                              styles.genderOptionCard,
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

                    <TextInput
                      value={draftText}
                      onChangeText={(text) => setDraftText(text.replace(/[^0-9-]/g, ''))}
                      keyboardType="default"
                      maxLength={10}
                      placeholder="생년월일 (YYYY-MM-DD)"
                      placeholderTextColor="#9CA3AF"
                      style={styles.sheetInput}
                    />
                  </View>

                  {renderSaveFooter()}
                </>
              )}

              {/* 신체 정보 (키 / 몸무게) 통합 변경 모달 */}
              {activeField === 'bodySpec' && (
                <>
                  <Text style={styles.sheetTitle}>신체 정보 변경</Text>
                  <View style={styles.bodySpecGroup}>
                    <View style={styles.bodySpecField}>
                      <Text style={styles.bodySpecLabel}>키 (cm)</Text>
                      <TextInput
                        value={draftHeightText}
                        onChangeText={(text) => setDraftHeightText(text.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        maxLength={3}
                        autoFocus
                        placeholder="예: 180"
                        placeholderTextColor="#9CA3AF"
                        style={styles.sheetInput}
                      />
                    </View>
                    <View style={styles.bodySpecField}>
                      <Text style={styles.bodySpecLabel}>몸무게 (kg)</Text>
                      <TextInput
                        value={draftWeightText}
                        onChangeText={(text) => setDraftWeightText(text.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="예: 80"
                        placeholderTextColor="#9CA3AF"
                        style={styles.sheetInput}
                      />
                    </View>
                  </View>

                  {renderSaveFooter()}
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

                  {renderSaveFooter()}
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

                  {renderSaveFooter()}
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

                  {renderSaveFooter()}
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
    paddingTop: 12,
    paddingBottom: 120,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.4,
    marginBottom: 20,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 60,
    height: 60,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
    gap: 4,
  },
  nicknameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nicknameText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  editBadgeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSubText: {
    fontSize: 13.5,
    fontWeight: '400',
    color: '#6B7280',
    letterSpacing: -0.2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F1F5FF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  statLabel: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#4B5563',
    letterSpacing: -0.2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1D61E7',
    letterSpacing: -0.4,
  },
  infoList: {
    marginTop: 4,
  },
  infoRow: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 15.5,
    fontWeight: '500',
    color: '#111827',
    letterSpacing: -0.3,
  },
  infoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoValue: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.2,
  },
  sectionDivider: {
    height: 8,
    backgroundColor: '#F3F4F6',
    marginHorizontal: -20,
    marginTop: 18,
    marginBottom: 8,
  },
  appSettingsRow: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appSettingsText: {
    fontSize: 15.5,
    fontWeight: '500',
    color: '#111827',
    letterSpacing: -0.3,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderOptionCard: {
    flex: 1,
    alignItems: 'center',
  },
  bodySpecGroup: {
    gap: 14,
  },
  bodySpecField: {
    gap: 6,
  },
  bodySpecLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#4B5563',
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
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveErrorText: {
    marginTop: 12,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
    color: '#DC2626',
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
