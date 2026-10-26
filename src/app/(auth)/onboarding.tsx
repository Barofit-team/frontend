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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

import { ApiError } from '@/services/api';
import {
  checkNicknameAvailability,
  fetchRandomNickname,
  submitOnboarding,
} from '@/services/onboardingService';
import { tokenStorage } from '@/services/tokenStorage';
import { useAuthStore } from '@/stores/useAuthStore';
import { TOTAL_ONBOARDING_STEPS, useOnboardingStore } from '@/stores/useOnboardingStore';
import {
  NICKNAME_REGEX,
  type CoachingStyle,
  type DiscomfortSelection,
  type ExerciseGoal,
  type ExperienceLevel,
  type NicknameAvailabilityReason,
  type WeeklyWorkoutDays,
} from '@/types/onboarding';

const GOAL_OPTIONS: { value: ExerciseGoal; label: string }[] = [
  { value: 'WEIGHT_LOSS', label: '체중 감량' },
  { value: 'STRENGTH', label: '근력 향상' },
  { value: 'ENDURANCE', label: '체력 증진' },
  { value: 'POSTURE', label: '자세 교정' },
];

const FREQUENCY_OPTIONS: { value: WeeklyWorkoutDays; label: string }[] = [
  { value: 2, label: '주 2회' },
  { value: 3, label: '주 3회' },
  { value: 4, label: '주 4회' },
  { value: 5, label: '주 5회' },
  { value: 6, label: '주 6회' },
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
    value: 'INTERMEDIATE',
    title: '중급자',
    description: '운동 경험이 있고 기본적인 동작에 익숙해요.',
  },
  {
    value: 'ADVANCED',
    title: '숙련자',
    description: '운동 경험이 있고 다양한 동작에 익숙해요.',
  },
];

const DISCOMFORT_OPTIONS: { value: DiscomfortSelection; label: string }[] = [
  { value: 'NONE', label: '해당 없음' },
  { value: 'NECK_SHOULDER', label: '목 / 어깨' },
  { value: 'ARM_WRIST', label: '팔 / 손목' },
  { value: 'BACK', label: '등 / 허리' },
  { value: 'LEG_ANKLE', label: '다리 / 발목' },
];

const COACHING_STYLE_OPTIONS: {
  value: CoachingStyle;
  title: string;
  description: string;
}[] = [
  {
    value: 'FRIENDLY',
    title: '친근한',
    description: '친구처럼 편안하게 응원하고 격려해줘요.',
  },
  {
    value: 'CALM',
    title: '차분한',
    description: '원하는 속도에 따라 부담없이 이끌어줘요.',
  },
  {
    value: 'SPARTA',
    title: '스파르타',
    description: '강한 동기부여로 한계에 도전하게 이끌어줘요.',
  },
  {
    value: 'ANALYTICAL',
    title: '분석적인',
    description: '운동 과정과 성과를 구체적으로 설명해줘요.',
  },
];

export default function OnboardingScreen() {
  const {
    step,
    nickname,
    gender,
    age,
    heightCm,
    weightKg,
    ageInput,
    heightInput,
    weightInput,
    goal,
    weeklyWorkoutDays,
    experienceLevel,
    discomfortSelections,
    coachingStyle,
    setStep,
    nextStep,
    prevStep,
    setNickname,
    toggleGender,
    setAgeInput,
    setHeightInput,
    setWeightInput,
    setGoal,
    setWeeklyWorkoutDays,
    setExperienceLevel,
    toggleDiscomfortSelection,
    setCoachingStyle,
    toOnboardingRequest,
  } = useOnboardingStore();

  const applyMeResponse = useAuthStore((state) => state.applyMeResponse);
  const completeOnboarding = useAuthStore((state) => state.completeOnboarding);

  const [nicknameFocused, setNicknameFocused] = useState(false);
  const [focusedBodyField, setFocusedBodyField] = useState<'age' | 'height' | 'weight' | null>(
    null,
  );
  const [genderTouched, setGenderTouched] = useState(false);

  const [checkingNickname, setCheckingNickname] = useState(false);
  const [nicknameReason, setNicknameReason] = useState<NicknameAvailabilityReason>(null);
  const [submitting, setSubmitting] = useState(false);

  const ageInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const heightInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const weightInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const trimmedNickname = nickname.trim();
  const displayNickname = trimmedNickname || '사용자';

  // Step 1 최초 진입 시: 토큰이 있고 닉네임이 비어 있으면 랜덤 닉네임 기본값 조회
  useEffect(() => {
    let active = true;
    const initRandomNickname = async () => {
      if (useOnboardingStore.getState().nickname.trim().length > 0) return;
      const accessToken = await tokenStorage.getAccessToken();
      if (!accessToken) return;
      try {
        const res = await fetchRandomNickname();
        if (active && !useOnboardingStore.getState().nickname.trim()) {
          setNickname(res.nickname);
        }
      } catch {
        // 랜덤 생성 실패(503 등) 시 사용자가 직접 입력하도록 유지
      }
    };
    void initRandomNickname();
    return () => {
      active = false;
    };
  }, [setNickname]);

  // Step 1 닉네임 변경 시 형식 검증 + 디바운스 중복 체크
  useEffect(() => {
    if (!trimmedNickname) {
      setNicknameReason(null);
      setCheckingNickname(false);
      return;
    }

    if (!NICKNAME_REGEX.test(trimmedNickname)) {
      setNicknameReason('INVALID_FORMAT');
      setCheckingNickname(false);
      return;
    }

    let cancelled = false;
    setNicknameReason(null);

    const timer = setTimeout(async () => {
      const accessToken = await tokenStorage.getAccessToken();
      if (!accessToken || cancelled) return;

      setCheckingNickname(true);
      try {
        const res = await checkNicknameAvailability(trimmedNickname);
        if (!cancelled) {
          setNicknameReason(res.available ? null : (res.reason ?? 'DUPLICATED'));
        }
      } catch {
        // 네트워크 오류 시 최종 제출 시점에 서버에서 검증
        if (!cancelled) {
          setNicknameReason(null);
        }
      } finally {
        if (!cancelled) {
          setCheckingNickname(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedNickname]);

  const isAgeValid = age !== null && age >= 14 && age <= 100;
  const isHeightValid = heightCm !== null && heightCm >= 100 && heightCm <= 250;
  const isWeightValid = weightKg !== null && weightKg >= 20 && weightKg <= 300;

  const bodyValidationMessage = (() => {
    if (ageInput.length > 0 && !isAgeValid) {
      return '나이는 14~100세 사이로 입력해주세요.';
    }
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
          !checkingNickname
        );
      case 2:
        return Boolean(gender && isAgeValid && isHeightValid && isWeightValid);
      case 3:
        return goal !== null;
      case 4:
        return weeklyWorkoutDays !== null;
      case 5:
        return experienceLevel !== null;
      case 6:
        return discomfortSelections.length > 0;
      case 7:
        return coachingStyle !== null;
      default:
        return false;
    }
  })();

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

    const accessToken = await tokenStorage.getAccessToken();
    if (!accessToken) {
      // [DEV] 토큰 없는 로컬 테스트 모드
      completeOnboarding(payload.nickname, {
        gender: payload.gender,
        age: payload.age,
        heightCm: payload.heightCm,
        weightKg: payload.weightKg,
        goal: payload.goal,
        experienceLevel: payload.experienceLevel,
        weeklyWorkoutDays: payload.weeklyWorkoutDays,
        discomfortAreas: payload.discomfortAreas,
        coachingStyle: payload.coachingStyle,
      });
      router.replace('/home');
      return;
    }

    setSubmitting(true);
    try {
      const meResponse = await submitOnboarding(payload);
      applyMeResponse(meResponse);
      router.replace('/home');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'PROFILE_ALREADY_ONBOARDED') {
          completeOnboarding(payload.nickname);
          router.replace('/home');
          return;
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

  const progressRatio = (step / TOTAL_ONBOARDING_STEPS) * 100;

  return (
    <SafeAreaView style={styles.safeArea}>
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
                <Text style={styles.backArrow}>←</Text>
              </Pressable>

              <View style={styles.progressTrack}>
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

                  <TextInput
                    value={nickname}
                    onChangeText={setNickname}
                    placeholder="닉네임을 입력해주세요"
                    placeholderTextColor="#C7C7CC"
                    maxLength={10}
                    onFocus={() => setNicknameFocused(true)}
                    onBlur={() => setNicknameFocused(false)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      void handleNext();
                    }}
                    style={[
                      styles.nicknameInput,
                      (nicknameFocused || trimmedNickname.length > 0) &&
                        styles.nicknameInputActive,
                      nicknameValidationMessage ? styles.nicknameInputError : null,
                    ]}
                  />

                  {nicknameValidationMessage ? (
                    <Text style={styles.validationErrorText}>{nicknameValidationMessage}</Text>
                  ) : null}
                </View>
              )}

              {step === 2 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>
                    {`맞춤형 운동 플랜 세팅을 위한\n${displayNickname}님의 신체 정보를 알려주세요!`}
                  </Text>

                  <View style={styles.bodyGrid}>
                    {/* 성별 */}
                    <View style={styles.bodyGridColumn}>
                      <Text style={styles.bodyFieldLabel}>성별</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="성별 선택"
                        onPress={() => {
                          Keyboard.dismiss();
                          if (!genderTouched) {
                            setGenderTouched(true);
                          } else {
                            toggleGender();
                          }
                        }}
                        style={({ pressed }) => [
                          styles.bodyCard,
                          genderTouched && styles.cardSelected,
                          pressed && styles.pressed,
                        ]}>
                        <Text
                          style={[
                            styles.bodyCardValue,
                            genderTouched && styles.bodyCardValueActive,
                          ]}>
                          {gender === 'MALE' ? '남자' : '여자'}
                        </Text>
                      </Pressable>
                    </View>

                    {/* 나이 */}
                    <View style={styles.bodyGridColumn}>
                      <Text style={styles.bodyFieldLabel}>나이</Text>
                      <Pressable
                        onPress={() => ageInputRef.current?.focus()}
                        style={[
                          styles.bodyCard,
                          (focusedBodyField === 'age' || ageInput.length > 0) &&
                            styles.cardSelected,
                        ]}>
                        <TextInput
                          ref={ageInputRef}
                          value={ageInput}
                          onChangeText={setAgeInput}
                          placeholder="29"
                          placeholderTextColor="#666666"
                          keyboardType="number-pad"
                          maxLength={3}
                          onFocus={() => setFocusedBodyField('age')}
                          onBlur={() => setFocusedBodyField(null)}
                          style={[
                            styles.bodyCardInput,
                            ageInput.length > 0 && styles.bodyCardValueActive,
                          ]}
                        />
                      </Pressable>
                    </View>

                    {/* 키(cm) */}
                    <View style={styles.bodyGridColumn}>
                      <Text style={styles.bodyFieldLabel}>키(cm)</Text>
                      <Pressable
                        onPress={() => heightInputRef.current?.focus()}
                        style={[
                          styles.bodyCard,
                          (focusedBodyField === 'height' || heightInput.length > 0) &&
                            styles.cardSelected,
                        ]}>
                        <TextInput
                          ref={heightInputRef}
                          value={heightInput}
                          onChangeText={setHeightInput}
                          placeholder="185"
                          placeholderTextColor="#666666"
                          keyboardType="number-pad"
                          maxLength={3}
                          onFocus={() => setFocusedBodyField('height')}
                          onBlur={() => setFocusedBodyField(null)}
                          style={[
                            styles.bodyCardInput,
                            heightInput.length > 0 && styles.bodyCardValueActive,
                          ]}
                        />
                      </Pressable>
                    </View>

                    {/* 몸무게(kg) */}
                    <View style={styles.bodyGridColumn}>
                      <Text style={styles.bodyFieldLabel}>몸무게(kg)</Text>
                      <Pressable
                        onPress={() => weightInputRef.current?.focus()}
                        style={[
                          styles.bodyCard,
                          (focusedBodyField === 'weight' || weightInput.length > 0) &&
                            styles.cardSelected,
                        ]}>
                        <TextInput
                          ref={weightInputRef}
                          value={weightInput}
                          onChangeText={setWeightInput}
                          placeholder="84"
                          placeholderTextColor="#666666"
                          keyboardType="number-pad"
                          maxLength={3}
                          onFocus={() => setFocusedBodyField('weight')}
                          onBlur={() => setFocusedBodyField(null)}
                          style={[
                            styles.bodyCardInput,
                            weightInput.length > 0 && styles.bodyCardValueActive,
                          ]}
                        />
                      </Pressable>
                    </View>
                  </View>

                  {bodyValidationMessage ? (
                    <Text style={styles.validationErrorText}>{bodyValidationMessage}</Text>
                  ) : null}
                </View>
              )}

              {step === 3 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>어떤 운동 목표를 가지고 계신가요?</Text>
                  <Text style={styles.subheading}>
                    가장 중요하게 생각하는 목표를 선택해주세요!
                  </Text>

                  <View style={styles.goalGrid}>
                    {GOAL_OPTIONS.map((item) => {
                      const selected = goal === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => setGoal(item.value)}
                          style={({ pressed }) => [
                            styles.goalCard,
                            selected && styles.cardSelected,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={styles.goalCardLabel}>{item.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {step === 4 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>일주일에 몇 번 운동하고 싶으신가요?</Text>
                  <Text style={styles.subheading}>
                    현실적으로 실천 가능한 운동 플랜을 제공해드려요!
                  </Text>

                  <View style={styles.optionList}>
                    {FREQUENCY_OPTIONS.map((item) => {
                      const selected = weeklyWorkoutDays === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => setWeeklyWorkoutDays(item.value)}
                          style={({ pressed }) => [
                            styles.singleLineOptionCard,
                            selected && styles.cardSelected,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={styles.optionTitle}>{item.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {step === 5 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>
                    {`${displayNickname}님의 운동 경험을 알려주세요!`}
                  </Text>
                  <Text style={styles.subheading}>
                    경험에 따라 적절한 난이도의 운동을 추천해드려요!
                  </Text>

                  <View style={styles.optionList}>
                    {EXPERIENCE_OPTIONS.map((item) => {
                      const selected = experienceLevel === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => setExperienceLevel(item.value)}
                          style={({ pressed }) => [
                            styles.multiLineOptionCard,
                            selected && styles.cardSelected,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={styles.optionTitle}>{item.title}</Text>
                          <Text style={styles.optionDescription}>{item.description}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {step === 6 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>운동할 때 불편한 부위가 있으신가요?</Text>
                  <Text style={styles.subheading}>
                    불편한 부위를 고려해 운동을 추천해드려요!
                  </Text>

                  <View style={styles.optionList}>
                    {DISCOMFORT_OPTIONS.map((item) => {
                      const selected = discomfortSelections.includes(item.value);
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => toggleDiscomfortSelection(item.value)}
                          style={({ pressed }) => [
                            styles.singleLineOptionCard,
                            selected && styles.cardSelected,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={styles.optionTitle}>{item.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {step === 7 && (
                <View style={styles.stepSection}>
                  <Text style={styles.heading}>어떤 스타일의 코칭을 선호하시나요?</Text>
                  <Text style={styles.subheading}>
                    {`${displayNickname}님의 성향과 잘 맞는 AI 코치가 함께해요!`}
                  </Text>

                  <View style={styles.optionList}>
                    {COACHING_STYLE_OPTIONS.map((item) => {
                      const selected = coachingStyle === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => setCoachingStyle(item.value)}
                          style={({ pressed }) => [
                            styles.multiLineOptionCard,
                            selected && styles.cardSelected,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={styles.optionTitle}>{item.title}</Text>
                          <Text style={styles.optionDescription}>{item.description}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* 하단 고정 '다음' 버튼 */}
            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
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
                  <Text style={styles.nextButtonText}>다음</Text>
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
    paddingHorizontal: 22,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111111',
    marginTop: -2,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EAEAEA',
    marginLeft: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#0B0B0B',
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
  nicknameInput: {
    marginTop: 32,
    height: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4D4D8',
    paddingHorizontal: 18,
    fontSize: 15,
    fontWeight: '500',
    color: '#0B0B0B',
    backgroundColor: '#FFFFFF',
  },
  nicknameInputActive: {
    borderWidth: 1.5,
    borderColor: '#0B0B0B',
    fontWeight: '600',
  },
  nicknameInputError: {
    borderColor: '#E5484D',
  },
  validationErrorText: {
    marginTop: 8,
    paddingLeft: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#E5484D',
  },
  bodyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 36,
    rowGap: 22,
  },
  bodyGridColumn: {
    width: '47.5%',
  },
  bodyFieldLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0B0B0B',
    marginBottom: 8,
    paddingLeft: 4,
  },
  bodyCard: {
    height: 124,
    borderRadius: 12,
    backgroundColor: '#EAEAEA',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyCardValue: {
    fontSize: 28,
    fontWeight: '600',
    color: '#666666',
  },
  bodyCardValueActive: {
    color: '#0B0B0B',
  },
  bodyCardInput: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '600',
    color: '#666666',
    padding: 0,
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 32,
    rowGap: 16,
  },
  goalCard: {
    width: '47.5%',
    height: 184,
    borderRadius: 12,
    backgroundColor: '#EAEAEA',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  goalCardLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0B0B0B',
  },
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
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonEnabled: {
    backgroundColor: '#0B0B0B',
  },
  nextButtonDisabled: {
    backgroundColor: '#D9D9D9',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
