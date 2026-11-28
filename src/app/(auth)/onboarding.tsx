import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

import { PlanLoading } from '@/components/onboarding/PlanLoading';
import { BirthDatePicker } from '@/components/onboarding/BirthDatePicker';
import { ApiError, type ApiFieldError } from '@/services/api';
import {
  checkNicknameAvailability,
  submitOnboarding,
} from '@/services/onboardingService';
import { tokenStorage } from '@/services/tokenStorage';
import { useAuthStore } from '@/stores/useAuthStore';
import { TOTAL_ONBOARDING_STEPS, useOnboardingStore } from '@/stores/useOnboardingStore';
import {
  NICKNAME_REGEX,
  type DiscomfortSelection,
  type ExerciseGoal,
  type ExperienceLevel,
  type NicknameAvailabilityReason,
  type OnboardingRequest,
  type WeeklyWorkoutDays,
} from '@/types/onboarding';

function goalIcon(goal: ExerciseGoal, selected: boolean) {
  const paths: Record<ExerciseGoal, string> = {
    WEIGHT_LOSS: '<path d="M12 2C9 6 5 9 5 14a7 7 0 0 0 14 0c0-3-2-6-4-8 0 3-1 4-2 4 0-3-1-5-1-8Z"/><path d="M12 13c-3 3-3 6 0 7 3-1 3-4 0-7Z" fill="white"/>',
    STRENGTH: '<path d="M2 8h3v8H2zm4-3h3v14H6zm4 6h4v2h-4zm5-6h3v14h-3zm4 3h3v8h-3z"/>',
    ENDURANCE: '<path d="M12 21 3 12C-3 4 8-1 12 6c4-7 15-2 9 6Z"/>',
    HABIT: '<path d="M4 4h16v18H4z"/><path d="M7 2v5m10-5v5M8 14l3 3 5-6" fill="none" stroke="white" stroke-width="2"/>',
    POSTURE: '<path d="M6 3h12v3H6zm-2 4h16v15H4z"/><path d="m8 14 3 3 5-6" fill="none" stroke="white" stroke-width="2"/>',
  };
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${selected ? '#3473F8' : '#666666'}">${paths[goal]}</svg>`)}`;
}

const GOAL_OPTIONS: { value: ExerciseGoal; label: string }[] = [
  { value: 'WEIGHT_LOSS', label: '체중 관리' },
  { value: 'STRENGTH', label: '근력 강화' },
  { value: 'ENDURANCE', label: '체력 향상' },
  { value: 'HABIT', label: '운동 습관 형성' },
];

const FREQUENCY_OPTIONS: { value: WeeklyWorkoutDays; label: string }[] = [
  { value: 2, label: '2회' },
  { value: 3, label: '3회' },
  { value: 4, label: '4회' },
  { value: 5, label: '5회' },
];

const EXPERIENCE_OPTIONS: {
  value: ExperienceLevel;
  title: string;
  description: string;
}[] = [
  {
    value: 'NOVICE',
    title: '입문자',
    description: '운동을 거의 해본 적이 없어요.',
  },
  {
    value: 'BEGINNER',
    title: '초급자',
    description: '운동 경험은 있지만 아직 익숙하지 않아요.',
  },
  {
    value: 'ADVANCED',
    title: '숙련자',
    description: '운동 경험이 있고 다양한 동작에 익숙해요.',
  },
];

const DISCOMFORT_OPTIONS: { value: DiscomfortSelection; label: string }[] = [
  { value: 'NECK_SHOULDER', label: '목 / 어깨' },
  { value: 'ARM_WRIST', label: '팔 / 손목' },
  { value: 'BACK', label: '등 / 허리' },
  { value: 'LEG_ANKLE', label: '다리 / 발목' },
  { value: 'NONE', label: '해당 없음' },
];

/** 서버 요청 필드 → 해당 입력 단계 (400 INVALID_INPUT의 errors[].field 기준) */
const FIELD_TO_STEP: Record<keyof OnboardingRequest, number> = {
  nickname: 1,
  gender: 2,
  birthDate: 3,
  heightCm: 4,
  weightKg: 4,
  goal: 7,
  weeklyWorkoutDays: 8,
  experienceLevel: 6,
  discomfortAreas: 5,
  coachingStyle: 8,
};

/** 오류가 난 필드 중 가장 앞 단계. 알 수 없는 필드뿐이면 null */
function findInvalidStep(errors: ApiFieldError[]): number | null {
  const steps = errors
    .map((error) => FIELD_TO_STEP[error.field.split(/[.[]/)[0] as keyof OnboardingRequest])
    .filter((step): step is number => step !== undefined);
  return steps.length > 0 ? Math.min(...steps) : null;
}

export default function OnboardingScreen() {
  const {
    step,
    nickname,
    gender,
    age,
    heightCm,
    weightKg,
    birthYear,
    birthMonth,
    birthDay,
    heightInput,
    weightInput,
    goal,
    weeklyWorkoutDays,
    experienceLevel,
    discomfortSelections,
    setStep,
    nextStep,
    prevStep,
    setNickname,
    setGender,
    setBirthDatePart,
    setHeightInput,
    setWeightInput,
    setGoal,
    setWeeklyWorkoutDays,
    setExperienceLevel,
    toggleDiscomfortSelection,
    toOnboardingRequest,
  } = useOnboardingStore();

  const applyMeResponse = useAuthStore((state) => state.applyMeResponse);
  const completeOnboarding = useAuthStore((state) => state.completeOnboarding);
  const loadMyAccount = useAuthStore((state) => state.loadMyAccount);

  const insets = useSafeAreaInsets();
  const nicknameInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [nicknameFocused, setNicknameFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [focusedBodyField, setFocusedBodyField] = useState<'height' | 'weight' | null>(
    null,
  );

  const [checkingNickname, setCheckingNickname] = useState(false);
  const [verifiedNickname, setVerifiedNickname] = useState<string | null>(null);
  const [nicknameCheckError, setNicknameCheckError] = useState(false);
  const [nicknameCheckAttempt, setNicknameCheckAttempt] = useState(0);
  const [nicknameReason, setNicknameReason] = useState<NicknameAvailabilityReason>(null);
  const [submitting, setSubmitting] = useState(false);
  // 서버 저장(또는 로컬 완료 처리)까지는 끝났지만, 완료 게이지 애니메이션이 100%에 닿기 전까지는
  // 대기해야 해서 submitting과 별도로 둔다 (PlanLoading의 onFinished에서만 다음 화면으로 넘어간다).
  const [planReady, setPlanReady] = useState(false);

  const heightInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const weightInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const trimmedNickname = nickname.trim();

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Only the exact nickname confirmed by the latest request may advance.
  useEffect(() => {
    let cancelled = false;
    setVerifiedNickname(null);
    setNicknameCheckError(false);
    setNicknameReason(null);
    setCheckingNickname(false);

    if (!trimmedNickname) return;
    if (!NICKNAME_REGEX.test(trimmedNickname)) {
      setNicknameReason('INVALID_FORMAT');
      return;
    }

    // Include the debounce period in the pending state to prevent advancing early.
    setCheckingNickname(true);
    const timer = setTimeout(async () => {
      try {
        const accessToken = await tokenStorage.getAccessToken();
        if (cancelled) return;
        if (!accessToken) {
          // Keep token-free local design previews available only in development.
          if (__DEV__) setVerifiedNickname(trimmedNickname);
          else setNicknameCheckError(true);
          return;
        }
        const res = await checkNicknameAvailability(trimmedNickname);
        if (cancelled) return;
        if (res.nickname !== trimmedNickname) {
          setNicknameCheckError(true);
          return;
        }
        if (res.available && (res.reason === null || res.reason === 'AVAILABLE')) {
          setVerifiedNickname(trimmedNickname);
        } else {
          setNicknameReason(res.reason === 'INVALID_FORMAT' ? 'INVALID_FORMAT' : 'DUPLICATED');
        }
      } catch {
        if (!cancelled) setNicknameCheckError(true);
      } finally {
        if (!cancelled) setCheckingNickname(false);
      }
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [trimmedNickname, nicknameCheckAttempt]);

  useEffect(() => {
    if (step === 3 && !birthYear && !birthMonth && !birthDay) {
      setBirthDatePart('birthYear', '2000');
      setBirthDatePart('birthMonth', '01');
      setBirthDatePart('birthDay', '20');
    }
  }, [step, birthYear, birthMonth, birthDay, setBirthDatePart]);

  const isAgeValid = age !== null && age >= 14 && age <= 100;
  const isHeightValid = heightCm !== null && heightCm >= 100 && heightCm <= 250;
  const isWeightValid = weightKg !== null && weightKg >= 20 && weightKg <= 300;

  const bodyValidationMessage = (() => {
    if (heightInput.length > 0 && !isHeightValid) {
      return '키는 100~250cm 사이로 입력해주세요.';
    }
    if (weightInput.length > 0 && !isWeightValid) {
      return '몸무게는 20~300kg 사이로 입력해주세요.';
    }
    return null;
  })();

  const nicknameValidationMessage = (() => {
    if (!trimmedNickname) return null;
    if (nicknameReason === 'INVALID_FORMAT') {
      if (nicknameFocused && trimmedNickname.length < 2) return null;
      return '2~10자의 한글, 영문, 숫자만 사용할 수 있어요.';
    }
    if (nicknameReason === 'DUPLICATED') {
      return '이미 사용 중인 닉네임이에요.';
    }
    return null;
  })();

  const isStepValid = (() => {
    switch (step) {
      case 1:
        return (
          NICKNAME_REGEX.test(trimmedNickname) &&
          nicknameReason === null &&
          verifiedNickname === trimmedNickname &&
          !nicknameCheckError &&
          !checkingNickname
        );
      case 2:
        return gender !== null;
      case 3:
        return isAgeValid;
      case 4:
        return Boolean(isHeightValid && isWeightValid);
      case 5:
        return discomfortSelections.length > 0;
      case 6:
        return experienceLevel !== null;
      case 7:
        return goal !== null;
      case 8:
        return weeklyWorkoutDays !== null;
      default:
        return false;
    }
  })();

  const clearNickname = () => {
    setNickname('');
    nicknameInputRef.current?.focus();
  };

  const handleBack = () => {
    if (submitting) return;
    Keyboard.dismiss();
    if (step > 1) {
      prevStep();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/login');
    }
  };

  const handleNext = async () => {
    if (!isStepValid || submitting) return;
    Keyboard.dismiss();

    if (step < TOTAL_ONBOARDING_STEPS) {
      nextStep();
      return;
    }

    const payload = toOnboardingRequest();
    if (!payload) return;

    setSubmitting(true);
    try {
      const accessToken = await tokenStorage.getAccessToken();
      if (!accessToken) {
        if (!__DEV__) throw new Error('로그인 세션이 필요합니다.');
        // [DEV] 토큰 없는 로컬 테스트 모드
        completeOnboarding(payload.nickname, {
          gender: payload.gender,
          age: age ?? 0,
          birthDate: payload.birthDate,
          heightCm: payload.heightCm,
          weightKg: payload.weightKg,
          goal: payload.goal,
          experienceLevel: payload.experienceLevel,
          weeklyWorkoutDays: payload.weeklyWorkoutDays,
          discomfortAreas: payload.discomfortAreas,
          coachingStyle: payload.coachingStyle,
        });
        setPlanReady(true);
        return;
      }

      const meResponse = await submitOnboarding(payload);
      applyMeResponse(meResponse);
      setPlanReady(true);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'PROFILE_ALREADY_ONBOARDED') {
          // 이미 저장됨(중복 탭·응답 유실 후 재시도). 서버에 저장된 값으로 다시 맞춘 뒤 홈으로 이동
          try {
            await loadMyAccount();
          } catch {
            Alert.alert('저장 확인 실패', '저장된 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
            return;
          }
          setPlanReady(true);
          return;
        }
        if (error.code === 'INVALID_INPUT') {
          const invalidStep = findInvalidStep(error.errors);
          if (invalidStep !== null) {
            setStep(invalidStep);
            Alert.alert('입력 확인', '입력한 정보를 다시 확인해주세요.');
            return;
          }
        }
        if (error.code === 'PROFILE_NICKNAME_INVALID') {
          setNicknameReason('INVALID_FORMAT');
          setStep(1);
          Alert.alert('닉네임 확인', '2~10자의 한글, 영문, 숫자만 사용할 수 있습니다.');
          return;
        }
        if (error.code === 'PROFILE_NICKNAME_DUPLICATED') {
          setNicknameReason('DUPLICATED');
          setStep(1);
          Alert.alert('닉네임 중복', '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.');
          return;
        }
        Alert.alert('온보딩 저장 실패', error.message);
      } else {
        Alert.alert('오류', '온보딩 정보를 저장하지 못했습니다. 다시 시도해주세요.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitting || planReady) {
    return <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <PlanLoading done={planReady} onFinished={() => router.replace('/onboarding-complete')} />
    </SafeAreaView>;
  }

  const progressRatio = (step / TOTAL_ONBOARDING_STEPS) * 100;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.container}>
            {/* 상단 네비게이션 & 프로그레스 바 */}
            <View style={styles.topBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="뒤로 가기"
                onPress={handleBack}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                <View style={styles.backIcon} accessible={false}>
                  <View style={styles.backArrowShaft} />
                  <View style={styles.backArrowHead} />
                </View>
              </Pressable>

              <View
                style={styles.progressTrack}
                accessibilityRole="progressbar"
                accessibilityLabel="온보딩 진행률"
                aria-valuemin={0}
                aria-valuemax={TOTAL_ONBOARDING_STEPS}
                aria-valuenow={step}
                aria-valuetext={`${TOTAL_ONBOARDING_STEPS}단계 중 ${step}단계`}
                accessibilityValue={{ min: 0, max: TOTAL_ONBOARDING_STEPS, now: step, text: `${TOTAL_ONBOARDING_STEPS}단계 중 ${step}단계` }}
              >
                <View style={[styles.progressFill, { width: `${progressRatio}%` }]} />
              </View>
            </View>

            {/* 본문 영역 */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {step === 1 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>
                    {'환영합니다!\n어떤 이름으로 불러드릴까요?'}
                  </Text>

                  <View style={[
                    styles.nicknameField,
                    nicknameFocused && styles.nicknameFieldFocused,
                    nicknameValidationMessage && styles.nicknameFieldError,
                  ]}>
                    <TextInput
                      ref={nicknameInputRef}
                      value={nickname}
                      onChangeText={setNickname}
                      placeholder="2~10자 닉네임을 입력해주세요."
                      placeholderTextColor="#A5A5A5"
                      accessibilityLabel="닉네임"
                      accessibilityHint="2~10자의 한글, 영문, 숫자로 입력해주세요."
                      maxLength={10}
                      onFocus={() => setNicknameFocused(true)}
                      onBlur={(event) => {
                        // On web the clear button receives focus before its click event.
                        // Keep the field active while focus moves within this input group.
                        const nextTarget = (event as unknown as {
                          relatedTarget?: { getAttribute?: (name: string) => string | null };
                        }).relatedTarget;
                        if (Platform.OS === 'web' && nextTarget?.getAttribute?.('aria-label') === '닉네임 지우기') return;
                        setNicknameFocused(false);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      clearButtonMode="never"
                      returnKeyType="done"
                      onSubmitEditing={() => { void handleNext(); }}
                      style={styles.nicknameInput}
                    />
                    {nicknameFocused && nickname.length > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="닉네임 지우기"
                        onPress={clearNickname}
                        onBlur={() => setNicknameFocused(false)}
                        style={styles.clearButton}
                      >
                        <View style={styles.clearIcon}>
                          <View style={[styles.clearLine, styles.clearLineFirst]} />
                          <View style={[styles.clearLine, styles.clearLineSecond]} />
                        </View>
                      </Pressable>
                    ) : null}
                  </View>

                  {nicknameValidationMessage ? (
                    <Text accessibilityLiveRegion="polite" style={styles.validationErrorText}>{nicknameValidationMessage}</Text>
                  ) : nicknameCheckError ? (
                    <View style={styles.nicknameCheckFeedback}>
                      <Text accessibilityLiveRegion="polite" style={styles.validationErrorText}>닉네임을 확인하지 못했어요.</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="닉네임 다시 확인"
                        onPress={() => setNicknameCheckAttempt((attempt) => attempt + 1)}
                        style={styles.retryButton}
                      >
                        <Text style={styles.retryButtonText}>다시 확인</Text>
                      </Pressable>
                    </View>
                  ) : checkingNickname ? (
                    <Text accessibilityLiveRegion="polite" style={styles.nicknameCheckText}>닉네임을 확인하고 있어요.</Text>
                  ) : null}
                </View>
              )}

              {step === 2 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>성별을 선택해주세요</Text>
                  <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel="성별"
                    style={styles.genderOptions}
                  >
                    {([{ value: 'MALE', label: '남성' }, { value: 'FEMALE', label: '여성' }] as const).map((option) => {
                      const selected = gender === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="radio"
                          accessibilityLabel={option.label}
                          accessibilityState={{ checked: selected }}
                          aria-checked={selected}
                          onPress={() => setGender(option.value)}
                          style={({ pressed }) => [
                            styles.genderOption,
                            selected && styles.genderOptionSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={[styles.genderOptionText, selected && styles.genderOptionTextSelected]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {step === 3 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>생년월일을 선택해주세요</Text>
                  <BirthDatePicker year={Number(birthYear) || 2000}
                    month={Number(birthMonth) || 1} day={Number(birthDay) || 20}
                    onChange={(year, month, day) => {
                      setBirthDatePart('birthYear', String(year));
                      setBirthDatePart('birthMonth', String(month).padStart(2, '0'));
                      setBirthDatePart('birthDay', String(day).padStart(2, '0'));
                    }} />
                  {birthYear.length === 4 && birthMonth && birthDay && !isAgeValid ? (
                    <Text accessibilityLiveRegion="polite" style={styles.validationErrorText}>
                      {age === null ? '올바른 생년월일을 입력해주세요.' : '만 14~100세만 가입할 수 있어요.'}
                    </Text>
                  ) : null}
                </View>
              )}

              {step === 4 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>
                    현재 키와 몸무게를 알려주세요
                  </Text>

                  <View style={styles.bodyGrid}>
                    {([
                      { key: 'height', label: '키(cm)', value: heightInput, setValue: setHeightInput, ref: heightInputRef },
                      { key: 'weight', label: '몸무게(kg)', value: weightInput, setValue: setWeightInput, ref: weightInputRef },
                    ] as const).map((field) => (
                      <View key={field.key} style={styles.bodyGridColumn}>
                        <Text style={styles.bodyFieldLabel}>{field.label}</Text>
                        <View style={[styles.bodyCard, focusedBodyField === field.key && styles.nicknameFieldFocused]}>
                          <TextInput
                            ref={field.ref}
                            accessibilityLabel={field.label}
                            value={field.value}
                            onChangeText={field.setValue}
                            placeholder="숫자를 입력하세요"
                            placeholderTextColor="#999999"
                            keyboardType="number-pad"
                            inputMode="numeric"
                            maxLength={3}
                            onFocus={() => setFocusedBodyField(field.key)}
                            onBlur={(event) => {
                              const target = (event as unknown as { relatedTarget?: { getAttribute?: (name: string) => string | null } }).relatedTarget;
                              if (Platform.OS === 'web' && target?.getAttribute?.('aria-label') === `${field.label} 지우기`) return;
                              setFocusedBodyField(null);
                            }}
                            style={styles.bodyCardInput}
                          />
                          {focusedBodyField === field.key && field.value.length > 0 && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${field.label} 지우기`}
                              onPress={() => { field.setValue(''); field.ref.current?.focus(); }}
                              onBlur={() => setFocusedBodyField(null)}
                              style={styles.clearButton}>
                              <View style={styles.clearIcon}>
                                <View style={[styles.clearLine, styles.clearLineFirst]} />
                                <View style={[styles.clearLine, styles.clearLineSecond]} />
                              </View>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>

                  {bodyValidationMessage ? (
                    <Text style={styles.validationErrorText}>{bodyValidationMessage}</Text>
                  ) : null}
                </View>
              )}

              {step === 7 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>운동 목표는 무엇인가요?</Text>
                  <Text style={styles.selectionSubtitle}>
                    가장 중요하게 생각하는 목표를 선택해주세요
                  </Text>

                  <View accessibilityRole="radiogroup" accessibilityLabel="운동 목표" style={styles.selectionList}>
                    {GOAL_OPTIONS.map((item) => {
                      const selected = goal === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="radio"
                          accessibilityLabel={item.label}
                          accessibilityState={{ checked: selected }} aria-checked={selected}
                          onPress={() => setGoal(item.value)}
                          style={({ pressed }) => [
                            styles.goalCard,
                            selected && styles.selectionSelected,
                            pressed && styles.pressed,
                          ]}>
                          <Image source={{ uri: goalIcon(item.value, selected) }} style={{ width: 20, height: 20 }} />
                          <Text style={[styles.selectionTitle, selected && styles.selectionTextSelected]}>{item.label}</Text>
                          {item.value === 'HABIT' && <Text style={styles.beginnerBadge}>초심자 추천</Text>}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {step === 8 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>운동 횟수 주간 목표를 알려주세요</Text>
                  <Text style={styles.selectionSubtitle}>
                    매 주 꾸준히 이어갈 수 있는 균형 잡힌 목표를 추천해요
                  </Text>

                  <View accessibilityRole="radiogroup" accessibilityLabel="주간 운동 횟수" style={styles.selectionList}>
                    {FREQUENCY_OPTIONS.map((item) => {
                      const selected = weeklyWorkoutDays === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="radio"
                          accessibilityLabel={item.label}
                          accessibilityState={{ checked: selected }} aria-checked={selected}
                          onPress={() => setWeeklyWorkoutDays(item.value)}
                          style={({ pressed }) => [
                            styles.goalCard,
                            selected && styles.selectionSelected,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={[styles.selectionTitle, selected && styles.selectionTextSelected]}>{item.label}</Text>
                          {item.value === 3 && <Text style={styles.beginnerBadge}>초심자 추천</Text>}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {step === 6 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>
                    운동 경험은 어느 정도인가요?
                  </Text>
                  <Text style={styles.selectionSubtitle}>
                    경험에 따라 적절한 난이도의 운동을 추천해드려요
                  </Text>

                  <View accessibilityRole="radiogroup" accessibilityLabel="운동 경험" style={styles.selectionList}>
                    {EXPERIENCE_OPTIONS.map((item) => {
                      const selected = experienceLevel === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="radio"
                          accessibilityLabel={item.title}
                          accessibilityState={{ checked: selected }} aria-checked={selected}
                          onPress={() => setExperienceLevel(item.value)}
                          style={({ pressed }) => [
                            styles.experienceCard,
                            selected && styles.selectionSelected,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={[styles.selectionTitle, selected && styles.selectionTextSelected]}>{item.title}</Text>
                          <Text style={[styles.selectionDescription, selected && styles.selectionTextSelected]}>{item.description}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {step === 5 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>불편한 부위가 있으신가요?</Text>
                  <Text style={styles.selectionSubtitle}>
                    불편한 부위를 고려해서 루틴을 생성해드려요
                  </Text>

                  <View accessibilityLabel="불편 부위, 여러 부위 선택 가능" style={styles.selectionList}>
                    {DISCOMFORT_OPTIONS.map((item) => {
                      const selected = discomfortSelections.includes(item.value);
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="checkbox"
                          accessibilityLabel={item.label}
                          accessibilityState={{ checked: selected }}
                          aria-checked={selected}
                          onPress={() => toggleDiscomfortSelection(item.value)}
                          style={({ pressed }) => [
                            styles.goalCard,
                            selected && styles.selectionSelected,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={[styles.selectionTitle, selected && styles.selectionTextSelected]}>{item.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}


            </ScrollView>

            {/* 하단 고정 '다음' 버튼 */}
            <View style={[styles.footer, { paddingBottom: keyboardVisible ? 16 : insets.bottom + 16 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="다음"
                accessibilityState={{ disabled: !isStepValid || submitting, busy: submitting }}
                disabled={!isStepValid || submitting}
                onPress={() => {
                  void handleNext();
                }}
                style={({ pressed }) => [
                  styles.nextButton,
                  isStepValid && !submitting
                    ? styles.nextButtonEnabled
                    : styles.nextButtonDisabled,
                  pressed && isStepValid && !submitting && styles.pressed,
                ]}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.nextButtonText, !isStepValid && styles.nextButtonTextDisabled]}>다음</Text>
                )}
              </Pressable>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  topBar: {
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrowShaft: { width: 14, height: 1.5, backgroundColor: '#31558B' },
  backArrowHead: {
    position: 'absolute', left: 3, width: 8, height: 8,
    borderLeftWidth: 1.5, borderBottomWidth: 1.5,
    borderColor: '#31558B', transform: [{ rotate: '45deg' }],
  },
  progressTrack: {
    width: 184,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#DCE8FF',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 7,
    backgroundColor: '#3473F8',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 28,
    paddingBottom: 24,
  },
  stepSection: {
    width: '100%',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0B0B0B',
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 14,
    fontWeight: '400',
    color: '#222222',
    marginTop: 10,
    lineHeight: 20,
  },
  nicknameField: {
    marginTop: 40,
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#F2F2F2',
    flexDirection: 'row',
    alignItems: 'center',
  },
  nicknameFieldFocused: { borderColor: '#999999' },
  nicknameFieldError: { borderColor: '#E5484D' },
  nicknameInput: {
    flex: 1,
    minWidth: 0,
    height: 52,
    paddingHorizontal: 18,
    fontSize: 14,
    fontWeight: '400',
    color: '#222222',
    backgroundColor: 'transparent',
    outlineWidth: 0,
  },
  clearButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  clearIcon: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#777777', alignItems: 'center', justifyContent: 'center' },
  clearLine: { position: 'absolute', width: 8, height: 1.5, backgroundColor: '#FFFFFF' },
  clearLineFirst: { transform: [{ rotate: '45deg' }] },
  clearLineSecond: { transform: [{ rotate: '-45deg' }] },
  nicknameCheckFeedback: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  retryButtonText: { color: '#245FE5', fontSize: 13, fontWeight: '600' },
  nicknameCheckText: { marginTop: 8, paddingLeft: 4, color: '#888888', fontSize: 13 },
  validationErrorText: {
    marginTop: 8,
    paddingLeft: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#E5484D',
  },
  genderOptions: {
    marginTop: 52,
    gap: 8,
  },
  genderOption: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  genderOptionSelected: {
    borderColor: '#3473F8',
    backgroundColor: '#F1F5FF',
  },
  genderOptionText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#222222',
  },
  genderOptionTextSelected: { color: '#3473F8' },
  bodyGrid: { marginTop: 52, gap: 20 },
  bodyGridColumn: { width: '100%' },
  bodyFieldLabel: { fontSize: 12, lineHeight: 18, color: '#777777', marginBottom: 6 },
  bodyCard: {
    minHeight: 54, borderRadius: 8, backgroundColor: '#F2F2F2',
    borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center',
  },
  bodyCardValueActive: { color: '#222222' },
  bodyCardInput: {
    flex: 1, minWidth: 0, height: 52, paddingHorizontal: 18,
    fontSize: 14, fontWeight: '400', color: '#222222', outlineWidth: 0,
  },
  beginnerBadge: { marginLeft: 'auto', fontSize: 10, color: '#3473F8', backgroundColor: '#DCE8FF', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  selectionSubtitle: { marginTop: 8, fontSize: 12, lineHeight: 18, color: '#888888' },
  selectionList: { marginTop: 40, gap: 8 },
  selectionSelected: { borderColor: '#3473F8', backgroundColor: '#F1F5FF' },
  selectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#222222' },
  selectionDescription: { fontSize: 11, lineHeight: 16, color: '#777777' },
  selectionTextSelected: { color: '#3473F8' },
  experienceCard: { minHeight: 70, paddingHorizontal: 16, paddingVertical: 12, gap: 4,
    borderWidth: 1.5, borderColor: 'transparent', borderRadius: 6, backgroundColor: '#F2F2F2' },
  goalCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1.5,
    borderColor: 'transparent', borderRadius: 6, backgroundColor: '#F2F2F2' },
  optionList: {
    marginTop: 32,
    gap: 14,
  },
  singleLineOptionCard: {
    height: 60,
    borderRadius: 10,
    backgroundColor: '#EAEAEA',
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 22,
    justifyContent: 'center',
  },
  multiLineOptionCard: {
    borderRadius: 10,
    backgroundColor: '#EAEAEA',
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: 18,
    paddingHorizontal: 22,
    gap: 6,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0B0B0B',
  },
  optionDescription: {
    fontSize: 13,
    fontWeight: '400',
    color: '#666666',
    lineHeight: 18,
  },
  cardSelected: {
    borderColor: '#0B0B0B',
    borderWidth: 1.5,
  },
  footer: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  nextButton: {
    height: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonEnabled: {
    backgroundColor: '#245FE5',
  },
  nextButtonDisabled: {
    backgroundColor: '#E5E5E5',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  nextButtonTextDisabled: { color: '#999999' },
  pressed: {
    opacity: 0.75,
  },
});
