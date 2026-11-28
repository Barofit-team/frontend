import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import { ageFromBirthDate } from '@/utils/birthDate';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { initCrossPlatformAlarm } from '@/services/inactivityAlarmService';
import { updateMyProfile } from '@/services/onboardingService';
import { getReportCalendar } from '@/services/reportService';
import { tokenStorage } from '@/services/tokenStorage';
import { useAppSettingsStore } from '@/stores/useAppSettingsStore';
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
  | 'withdrawConfirm'
  | null;

type EditableField = Exclude<EditFieldType, 'withdrawConfirm' | null>;

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
  { value: 'WEIGHT_LOSS', label: '체중 관리' },
  { value: 'STRENGTH', label: '근력 강화' },
  { value: 'ENDURANCE', label: '체력 향상' },
  { value: 'HABIT', label: '운동 습관 형성' },
];

const GOAL_LABEL_MAP: Record<ExerciseGoal, string> = {
  WEIGHT_LOSS: '체중 관리',
  STRENGTH: '근력 강화',
  ENDURANCE: '체력 향상',
  POSTURE: '자세 교정',
  HABIT: '운동 습관 형성',
};

function goalIconUri(goal: ExerciseGoal, selected: boolean): string {
  const paths: Record<ExerciseGoal, string> = {
    WEIGHT_LOSS: '<path d="M12 2C9 6 5 9 5 14a7 7 0 0 0 14 0c0-3-2-6-4-8 0 3-1 4-2 4 0-3-1-5-1-8Z"/><path d="M12 13c-3 3-3 6 0 7 3-1 3-4 0-7Z" fill="white"/>',
    STRENGTH: '<path d="M2 8h3v8H2zm4-3h3v14H6zm4 6h4v2h-4zm5-6h3v14h-3zm4 3h3v8h-3z"/>',
    ENDURANCE: '<path d="M12 21 3 12C-3 4 8-1 12 6c4-7 15-2 9 6Z"/>',
    HABIT: '<path d="M4 4h16v18H4z"/><path d="M7 2v5m10-5v5M8 14l3 3 5-6" fill="none" stroke="white" stroke-width="2"/>',
    POSTURE: '<path d="M6 3h12v3H6zm-2 4h16v15H4z"/><path d="m8 14 3 3 5-6" fill="none" stroke="white" stroke-width="2"/>',
  };
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${selected ? '#1D61E7' : '#4B5563'}">${paths[goal]}</svg>`)}`;
}

const FREQUENCY_OPTIONS: { value: WeeklyWorkoutDays; label: string }[] = [
  { value: 2, label: '2회' },
  { value: 3, label: '3회' },
  { value: 4, label: '4회' },
  { value: 5, label: '5회' },
];

const DISCOMFORT_OPTIONS: { value: DiscomfortSelection; label: string }[] = [
  { value: 'NONE', label: '불편 부위 없음' },
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
  if (areas !== undefined) {
    return areas.length > 0
      ? areas.map((area) => DISCOMFORT_LABEL_MAP[area]).join(', ')
      : '없음';
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
  const logout = useAuthStore((state) => state.logout);
  const withdraw = useAuthStore((state) => state.withdraw);

  const pushEnabled = useAppSettingsStore((state) => state.pushEnabled);
  const hydrateAppSettings = useAppSettingsStore((state) => state.hydrate);
  const setPushEnabled = useAppSettingsStore((state) => state.setPushEnabled);

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
      void hydrateAppSettings();
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
    }, [hydrateAppSettings, loadMyAccount]),
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
  const [focusedInput, setFocusedInput] = useState<'nickname' | 'birthDate' | 'heightCm' | 'weightCm' | null>(null);
  const weightInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const openEditModal = (field: Exclude<EditFieldType, null>) => {
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
        if (profile?.discomfortAreas !== undefined) {
          setDraftDiscomforts(
            profile.discomfortAreas.length > 0 ? [...profile.discomfortAreas] : ['NONE'],
          );
        } else if (onboardingDiscomforts.length > 0) {
          setDraftDiscomforts([...onboardingDiscomforts]);
        } else {
          setDraftDiscomforts(['NONE']);
        }
        break;
      }
      case 'withdrawConfirm':
        setWithdrawError(null);
        break;
    }
    setSaveError(null);
    setActiveField(field);
  };

  const closeModal = () => {
    if (isWithdrawing || isSaving) return;
    setFocusedInput(null);
    setWithdrawError(null);
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
    if (!activeField || activeField === 'withdrawConfirm') return;
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

  const handleTogglePush = async (next: boolean) => {
    if (next) {
      await initCrossPlatformAlarm();
    }
    await setPushEnabled(next);
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

  const handleConfirmWithdraw = async () => {
    if (isWithdrawing) return;
    setIsWithdrawing(true);
    setWithdrawError(null);

    try {
      await withdraw();
      setActiveField(null);
      router.replace('/login');
    } catch {
      setWithdrawError('회원 탈퇴 처리 중 문제가 발생했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const renderSaveFooter = (options?: { inlineError?: boolean }) => {
    const isNextStep = activeField === 'bodySpec' && focusedInput === 'heightCm';
    return (
      <View style={styles.sheetFooter}>
        {!options?.inlineError && saveError ? (
          <Text style={styles.saveErrorText}>{saveError}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => {
            if (isNextStep) {
              weightInputRef.current?.focus();
              return;
            }
            void handleSaveField();
          }}
          style={({ pressed }) => [
            styles.saveButton,
            isSaving && styles.saveButtonDisabled,
            pressed && !isSaving && styles.pressed,
          ]}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isNextStep ? '다음' : '변경사항 저장'}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderSheetHeader = (title: string) => (
    <View style={styles.sheetHeader}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="닫기"
        hitSlop={10}
        onPress={closeModal}
        style={({ pressed }) => [styles.sheetCloseButton, pressed && styles.pressed]}>
        <Text style={styles.sheetCloseText}>✕</Text>
      </Pressable>
    </View>
  );

  const infoRows: {
    key: Exclude<EditFieldType, 'nickname' | 'profileMeta' | 'withdrawConfirm' | null>;
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
        {/* 1. 프로필 아바타 및 닉네임·성별/생년월일 영역 */}
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
                <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
                  {row.value}
                </Text>
                <ChevronRightIcon color="#374151" size={13} />
              </View>
            </Pressable>
          ))}
        </View>

        {/* 5. 하단 구분선 및 푸시 알림 · 로그아웃 · 회원 탈퇴 */}
        <View style={styles.sectionDivider} />

        <View style={styles.settingToggleRow}>
          <Text style={styles.infoLabel}>푸시 알림</Text>
          <Switch
            value={pushEnabled}
            onValueChange={(value) => void handleTogglePush(value)}
            trackColor={{ false: '#E5E7EB', true: '#1D61E7' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#E5E7EB"
          />
        </View>

        <View style={styles.thinDivider} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="로그아웃"
          onPress={handlePressLogout}
          style={({ pressed }) => [
            styles.accountRow,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.logoutText}>로그아웃</Text>
          <ChevronRightIcon color="#DC2626" size={13} />
        </Pressable>

        <View style={styles.thinDivider} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="회원 탈퇴"
          onPress={() => openEditModal('withdrawConfirm')}
          style={({ pressed }) => [
            styles.accountRow,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.withdrawText}>회원 탈퇴</Text>
          <ChevronRightIcon color="#6B7280" size={13} />
        </Pressable>
      </ScrollView>

      {/* 6. 항목 편집 & 회원 탈퇴 바텀시트 모달 */}
      <Modal
        visible={activeField !== null}
        transparent
        animationType="slide"
        onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {activeField === 'withdrawConfirm' ? (
            <Pressable style={styles.modalDismissArea} onPress={closeModal} />
          ) : null}

          {activeField !== null ? (
            <View
              style={[
                activeField === 'withdrawConfirm'
                  ? styles.withdrawSheetContainer
                  : [styles.fullSheetContainer, { marginTop: insets.top + 12 }],
                { paddingBottom: Math.max(insets.bottom, 20) + 8 },
              ]}>
              {activeField === 'withdrawConfirm' ? (
                <View style={styles.sheetHandle} />
              ) : null}

              {/* 닉네임 변경 모달 (MP01-1 ~ MP01-3) */}
              {activeField === 'nickname' && (
                <View style={styles.sheetBody}>
                  {renderSheetHeader('닉네임 변경')}

                  <View style={styles.sheetContent}>
                    <View
                      style={[
                        styles.inputBox,
                        focusedInput === 'nickname' && styles.inputBoxFocused,
                        saveError && styles.inputBoxError,
                      ]}>
                      <TextInput
                        value={draftText}
                        onChangeText={(text) => {
                          setDraftText(text);
                          if (saveError) setSaveError(null);
                        }}
                        onFocus={() => setFocusedInput('nickname')}
                        onBlur={() => setFocusedInput((prev) => (prev === 'nickname' ? null : prev))}
                        keyboardType="default"
                        maxLength={10}
                        placeholder="닉네임을 입력해주세요"
                        placeholderTextColor="#9CA3AF"
                        style={styles.inputField}
                      />
                      {focusedInput === 'nickname' && draftText.length > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="입력 지우기"
                          hitSlop={8}
                          onPress={() => {
                            setDraftText('');
                            if (saveError) setSaveError(null);
                          }}
                          style={styles.clearButton}>
                          <Text style={styles.clearButtonText}>✕</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {saveError ? (
                      <Text style={styles.inlineErrorText}>{saveError}</Text>
                    ) : null}
                  </View>

                  {renderSaveFooter({ inlineError: true })}
                </View>
              )}

              {/* 성별 및 생년월일 변경 모달 */}
              {activeField === 'profileMeta' && (
                <View style={styles.sheetBody}>
                  {renderSheetHeader('성별 및 생년월일 변경')}
                  <View style={styles.sheetContent}>
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

                      <View
                        style={[
                          styles.inputBox,
                          focusedInput === 'birthDate' && styles.inputBoxFocused,
                          saveError && styles.inputBoxError,
                        ]}>
                        <TextInput
                          value={draftText}
                          onChangeText={(text) => {
                            setDraftText(text.replace(/[^0-9-]/g, ''));
                            if (saveError) setSaveError(null);
                          }}
                          onFocus={() => setFocusedInput('birthDate')}
                          onBlur={() => setFocusedInput((prev) => (prev === 'birthDate' ? null : prev))}
                          keyboardType="default"
                          maxLength={10}
                          placeholder="생년월일 (YYYY-MM-DD)"
                          placeholderTextColor="#9CA3AF"
                          style={styles.inputField}
                        />
                        {focusedInput === 'birthDate' && draftText.length > 0 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="입력 지우기"
                            hitSlop={8}
                            onPress={() => setDraftText('')}
                            style={styles.clearButton}>
                            <Text style={styles.clearButtonText}>✕</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {renderSaveFooter()}
                </View>
              )}

              {/* 신체 정보 (키 / 몸무게) 통합 변경 모달 (MP04, MP04-1) */}
              {activeField === 'bodySpec' && (
                <View style={styles.sheetBody}>
                  {renderSheetHeader('신체 정보 변경')}
                  <View style={[styles.sheetContent, styles.bodySpecGroup]}>
                    <View style={styles.bodySpecField}>
                      <Text style={styles.bodySpecLabel}>키(cm)</Text>
                      <View
                        style={[
                          styles.inputBox,
                          focusedInput === 'heightCm' && styles.inputBoxFocused,
                        ]}>
                        <TextInput
                          value={draftHeightText}
                          onChangeText={(text) => {
                            setDraftHeightText(text.replace(/[^0-9]/g, ''));
                            if (saveError) setSaveError(null);
                          }}
                          onFocus={() => setFocusedInput('heightCm')}
                          onBlur={() => setFocusedInput((prev) => (prev === 'heightCm' ? null : prev))}
                          keyboardType="number-pad"
                          maxLength={3}
                          placeholder="예: 180"
                          placeholderTextColor="#9CA3AF"
                          style={styles.inputField}
                        />
                        {focusedInput === 'heightCm' && draftHeightText.length > 0 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="키 지우기"
                            hitSlop={8}
                            onPress={() => setDraftHeightText('')}
                            style={styles.clearButton}>
                            <Text style={styles.clearButtonText}>✕</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.bodySpecField}>
                      <Text style={styles.bodySpecLabel}>몸무게(kg)</Text>
                      <View
                        style={[
                          styles.inputBox,
                          focusedInput === 'weightCm' && styles.inputBoxFocused,
                        ]}>
                        <TextInput
                          ref={weightInputRef}
                          value={draftWeightText}
                          onChangeText={(text) => {
                            setDraftWeightText(text.replace(/[^0-9]/g, ''));
                            if (saveError) setSaveError(null);
                          }}
                          onFocus={() => setFocusedInput('weightCm')}
                          onBlur={() => setFocusedInput((prev) => (prev === 'weightCm' ? null : prev))}
                          keyboardType="number-pad"
                          maxLength={3}
                          placeholder="예: 80"
                          placeholderTextColor="#9CA3AF"
                          style={styles.inputField}
                        />
                        {focusedInput === 'weightCm' && draftWeightText.length > 0 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="몸무게 지우기"
                            hitSlop={8}
                            onPress={() => setDraftWeightText('')}
                            style={styles.clearButton}>
                            <Text style={styles.clearButtonText}>✕</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {renderSaveFooter()}
                </View>
              )}

              {/* 운동 목표 선택 모달 (MP02) */}
              {activeField === 'goal' && (
                <View style={styles.sheetBody}>
                  {renderSheetHeader('운동 목표 변경')}
                  <View style={styles.sheetContent}>
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
                            <View style={styles.optionRowLeft}>
                              <Image
                                source={{ uri: goalIconUri(item.value, selected) }}
                                style={styles.goalIcon}
                              />
                              <Text
                                style={[
                                  styles.optionCardText,
                                  selected && styles.optionCardTextSelected,
                                ]}>
                                {item.label}
                              </Text>
                            </View>
                            {item.value === 'HABIT' ? (
                              <View style={styles.beginnerBadge}>
                                <Text style={styles.beginnerBadgeText}>초심자 추천</Text>
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {renderSaveFooter()}
                </View>
              )}

              {/* 희망 운동 빈도 선택 모달 (MP03) */}
              {activeField === 'weeklyWorkoutDays' && (
                <View style={styles.sheetBody}>
                  {renderSheetHeader('희망 운동 빈도 변경')}
                  <View style={styles.sheetContent}>
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
                            {item.value === 3 ? (
                              <View style={styles.beginnerBadge}>
                                <Text style={styles.beginnerBadgeText}>초심자 추천</Text>
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {renderSaveFooter()}
                </View>
              )}

              {/* 불편 부위 선택 모달 (MP05) */}
              {activeField === 'discomfort' && (
                <View style={styles.sheetBody}>
                  {renderSheetHeader('불편 부위 변경')}
                  <View style={styles.sheetContent}>
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
                  </View>

                  {renderSaveFooter()}
                </View>
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
    flexShrink: 1,
    marginLeft: 16,
  },
  infoValue: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  sectionDivider: {
    height: 8,
    backgroundColor: '#F3F4F6',
    marginHorizontal: -20,
    marginTop: 18,
    marginBottom: 8,
  },
  settingToggleRow: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  thinDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginHorizontal: -20,
  },
  accountRow: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoutText: {
    fontSize: 15.5,
    fontWeight: '500',
    color: '#DC2626',
    letterSpacing: -0.3,
  },
  withdrawText: {
    fontSize: 15.5,
    fontWeight: '500',
    color: '#6B7280',
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  fullSheetContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  withdrawSheetContainer: {
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
    marginBottom: 16,
  },
  sheetBody: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.4,
  },
  sheetCloseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    fontSize: 20,
    fontWeight: '400',
    color: '#4B5563',
  },
  sheetContent: {
    flex: 1,
  },
  sheetFooter: {
    paddingTop: 12,
  },
  inputBox: {
    height: 54,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputBoxFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#374151',
  },
  inputBoxError: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DC2626',
  },
  inputField: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    paddingVertical: 0,
  },
  clearButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  clearButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  inlineErrorText: {
    marginTop: 8,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#DC2626',
  },
  optionGroup: {
    gap: 12,
  },
  optionCard: {
    height: 54,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionCardSelected: {
    borderColor: '#1D61E7',
    backgroundColor: '#EEF4FF',
  },
  optionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  goalIcon: {
    width: 20,
    height: 20,
  },
  optionCardText: {
    fontSize: 15.5,
    fontWeight: '500',
    color: '#111827',
  },
  optionCardTextSelected: {
    fontWeight: '600',
    color: '#1D61E7',
  },
  beginnerBadge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  beginnerBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D61E7',
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
    height: 52,
    borderRadius: 14,
    backgroundColor: '#1D61E7',
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
