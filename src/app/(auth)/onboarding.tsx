import React, { useRef, useState } from 'react';
import {
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

import { useAuthStore } from '@/stores/useAuthStore';
import { TOTAL_ONBOARDING_STEPS, useOnboardingStore } from '@/stores/useOnboardingStore';
import type {
  CoachingStyle,
  DiscomfortArea,
  WeeklyFrequency,
  WorkoutExperience,
  WorkoutGoal,
} from '@/types/onboarding';

const GOAL_OPTIONS: { value: WorkoutGoal; label: string }[] = [
  { value: 'WEIGHT_LOSS', label: '체중 감량' },
  { value: 'MUSCLE_GAIN', label: '근력 향상' },
  { value: 'ENDURANCE', label: '체력 증진' },
  { value: 'POSTURE_CORRECTION', label: '자세 교정' },
];

const FREQUENCY_OPTIONS: { value: WeeklyFrequency; label: string }[] = [
  { value: 2, label: '주 2회' },
  { value: 3, label: '주 3회' },
  { value: 4, label: '주 4회' },
  { value: 5, label: '주 5회' },
  { value: 6, label: '주 6회' },
];

const EXPERIENCE_OPTIONS: {
  value: WorkoutExperience;
  title: string;
  description: string;
}[] = [
  {
    value: 'NEWBIE',
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

const DISCOMFORT_OPTIONS: { value: DiscomfortArea; label: string }[] = [
  { value: 'NONE', label: '해당 없음' },
  { value: 'NECK_SHOULDER', label: '목 / 어깨' },
  { value: 'ARM_WRIST', label: '팔 / 손목' },
  { value: 'BACK_WAIST', label: '등 / 허리' },
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
    value: 'SPARTAN',
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
    weeklyFrequency,
    experience,
    discomfortAreas,
    coachingStyle,
    nextStep,
    prevStep,
    setNickname,
    toggleGender,
    setAgeInput,
    setHeightInput,
    setWeightInput,
    setGoal,
    setWeeklyFrequency,
    setExperience,
    toggleDiscomfortArea,
    setCoachingStyle,
  } = useOnboardingStore();

  const completeOnboarding = useAuthStore((state) => state.completeOnboarding);

  const [nicknameFocused, setNicknameFocused] = useState(false);
  const [focusedBodyField, setFocusedBodyField] = useState<'age' | 'height' | 'weight' | null>(
    null,
  );
  const [genderTouched, setGenderTouched] = useState(false);

  const ageInputRef = useRef<TextInput>(null);
  const heightInputRef = useRef<TextInput>(null);
  const weightInputRef = useRef<TextInput>(null);

  const displayNickname = nickname.trim() || '사용자';

  const isStepValid = (() => {
    switch (step) {
      case 1:
        return nickname.trim().length > 0;
      case 2:
        return Boolean(gender && age && heightCm && weightKg);
      case 3:
        return goal !== null;
      case 4:
        return weeklyFrequency !== null;
      case 5:
        return experience !== null;
      case 6:
        return discomfortAreas.length > 0;
      case 7:
        return coachingStyle !== null;
      default:
        return false;
    }
  })();

  const handleBack = () => {
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

  const handleNext = () => {
    if (!isStepValid) return;
    Keyboard.dismiss();

    if (step < TOTAL_ONBOARDING_STEPS) {
      nextStep();
      return;
    }

    completeOnboarding(nickname.trim());
    router.replace('/home');
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
                    onFocus={() => setNicknameFocused(true)}
                    onBlur={() => setNicknameFocused(false)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleNext}
                    style={[
                      styles.nicknameInput,
                      (nicknameFocused || nickname.trim().length > 0) &&
                        styles.nicknameInputActive,
                    ]}
                  />
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
                          keyboardType="decimal-pad"
                          maxLength={5}
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
                          keyboardType="decimal-pad"
                          maxLength={5}
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
                      const selected = weeklyFrequency === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => setWeeklyFrequency(item.value)}
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
                      const selected = experience === item.value;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => setExperience(item.value)}
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
                      const selected = discomfortAreas.includes(item.value);
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="button"
                          onPress={() => toggleDiscomfortArea(item.value)}
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
                disabled={!isStepValid}
                onPress={handleNext}
                style={({ pressed }) => [
                  styles.nextButton,
                  isStepValid ? styles.nextButtonEnabled : styles.nextButtonDisabled,
                  pressed && isStepValid && styles.pressed,
                ]}>
                <Text style={styles.nextButtonText}>다음</Text>
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
