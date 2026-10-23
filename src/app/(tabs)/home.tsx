import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChevronRightIcon,
  DumbbellIcon,
  FlameIcon,
  StopwatchIcon,
} from '@/components/home/HomeIcons';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useWeeklyPlanStore } from '@/stores/useWeeklyPlanStore';
import type { ExerciseGoal } from '@/types/onboarding';

const GOAL_LABEL_MAP: Record<ExerciseGoal, string> = {
  WEIGHT_LOSS: '체중 감량',
  STRENGTH: '근력 향상',
  ENDURANCE: '체력 증진',
  POSTURE: '자세 교정',
};

/** 한글 마지막 글자의 받침(종성) 유무에 따라 조사 '을' 또는 '를'을 붙여 반환합니다. */
function withObjectParticle(word: string): string {
  const trimmed = word.trim();
  if (!trimmed) return word;
  const lastCharCode = trimmed.charCodeAt(trimmed.length - 1);
  // 한글 완성형 음절 범위 (가 ~ 힣)
  if (lastCharCode >= 0xac00 && lastCharCode <= 0xd7a3) {
    const hasJongseong = (lastCharCode - 0xac00) % 28 !== 0;
    return `${trimmed}${hasJongseong ? '을' : '를'}`;
  }
  return `${trimmed}을(를)`;
}

export default function HomeScreen() {
  const authUser = useAuthStore((state) => state.user);
  const authProfile = useAuthStore((state) => state.profile);
  const onboardingNickname = useOnboardingStore((state) => state.nickname);
  const onboardingGoal = useOnboardingStore((state) => state.goal);

  const weekTitle = useWeeklyPlanStore((state) => state.weekTitle);
  const weekDays = useWeeklyPlanStore((state) => state.weekDays);
  const selectedDate = useWeeklyPlanStore((state) => state.selectedDate);
  const planItems = useWeeklyPlanStore((state) => state.planItems);
  const recommendedRoutines = useWeeklyPlanStore(
    (state) => state.recommendedRoutines,
  );
  const isLoading = useWeeklyPlanStore((state) => state.isLoading);
  const hasLoaded = useWeeklyPlanStore((state) => state.hasLoaded);
  const setSelectedDate = useWeeklyPlanStore((state) => state.setSelectedDate);
  const loadWeeklyPlan = useWeeklyPlanStore((state) => state.loadWeeklyPlan);

  useEffect(() => {
    if (!hasLoaded) {
      void loadWeeklyPlan();
    }
  }, [hasLoaded, loadWeeklyPlan]);

  const displayName =
    authUser?.nickname?.trim() ||
    onboardingNickname.trim() ||
    '사용자';

  const effectiveGoal = authProfile?.goal ?? onboardingGoal;
  const goalLabel = effectiveGoal
    ? GOAL_LABEL_MAP[effectiveGoal]
    : '체중 감량';
  const goalPhrase = withObjectParticle(goalLabel);

  const selectedDayPlan = planItems.find((item) => item.date === selectedDate);

  // dangerouslySingular: 버튼을 연달아 눌러도 운동 준비 화면이 스택에 중복으로 쌓이지 않게 함
  const openWorkout = () =>
    router.push('/workout-preparation', { dangerouslySingular: true });

  const openWeeklyPlan = () =>
    router.push('/weekly-plan', { dangerouslySingular: true });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* 1. 상단 인사말 헤더 */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingText}>
            {`${displayName}님,\n오늘도 힘내봐요`}
          </Text>
        </View>

        {/* 2. 주간 일정 캘린더 */}
        <View style={styles.weeklySection}>
          <View style={styles.weeklyHeader}>
            <Text style={styles.weeklyTitle}>{weekTitle}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="주간 계획 보기"
              onPress={openWeeklyPlan}
              style={({ pressed }) => [
                styles.weeklyPlanLink,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.weeklyPlanLinkText}>주간 계획</Text>
              <ChevronRightIcon color="#666666" size={12} />
            </Pressable>
          </View>

          <View style={styles.dayStrip}>
            {weekDays.map((item) => {
              const isSelected = selectedDate === item.date;
              return (
                <Pressable
                  key={item.date}
                  accessibilityRole="button"
                  accessibilityState={isSelected ? { selected: true } : {}}
                  accessibilityLabel={`${item.dayLabel}요일 ${item.dateNumber}일`}
                  onPress={() => setSelectedDate(item.date)}
                  style={[
                    styles.dayColumn,
                    isSelected && styles.dayColumnSelected,
                  ]}>
                  <Text
                    style={[
                      styles.dayLabel,
                      isSelected && styles.dayLabelSelected,
                    ]}>
                    {item.dayLabel}
                  </Text>
                  <Text
                    style={[
                      styles.dateText,
                      isSelected && styles.dateTextSelected,
                    ]}>
                    {item.dateNumber}
                  </Text>
                  <View style={styles.dayIconSlot}>
                    {item.hasWorkout ? (
                      <DumbbellIcon
                        color={isSelected ? '#FFFFFF' : '#71717A'}
                        size={16}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 3. 선택된 날짜의 루틴 카드 (데이터 유무 분기) */}
        <View style={styles.routineCard}>
          {isLoading && !hasLoaded ? (
            <View style={styles.emptyRoutineContainer}>
              <ActivityIndicator size="small" color="#111111" />
              <Text style={styles.emptyRoutineDesc}>
                운동 계획 데이터를 불러오는 중입니다...
              </Text>
            </View>
          ) : selectedDayPlan ? (
            <>
              <Text style={styles.routineTitle}>{selectedDayPlan.title}</Text>

              {/* 종목 / 시간 / 칼로리 메타 정보 */}
              <View style={styles.routineMetaRow}>
                <View style={styles.metaItem}>
                  <DumbbellIcon color="#9CA3AF" size={14} />
                  <Text style={styles.metaText}>
                    <Text style={styles.metaValue}>
                      {selectedDayPlan.exerciseCount}
                    </Text>{' '}
                    종목
                  </Text>
                </View>

                <View style={styles.metaDivider} />

                <View style={styles.metaItem}>
                  <StopwatchIcon color="#9CA3AF" size={14} />
                  <Text style={styles.metaText}>
                    <Text style={styles.metaValue}>
                      {selectedDayPlan.durationMinutes}
                    </Text>{' '}
                    분
                  </Text>
                </View>

                <View style={styles.metaDivider} />

                <View style={styles.metaItem}>
                  <FlameIcon color="#9CA3AF" size={14} />
                  <Text style={styles.metaText}>
                    <Text style={styles.metaValue}>
                      {selectedDayPlan.calories}
                    </Text>{' '}
                    kcal
                  </Text>
                </View>
              </View>

              {/* 종목 가로 리스트 */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.exerciseScroll}
                contentContainerStyle={styles.exerciseScrollContent}>
                {selectedDayPlan.exercises.map((exercise) => (
                  <View key={exercise.id} style={styles.exerciseItem}>
                    <View style={styles.exerciseThumbnail} />
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                  </View>
                ))}
              </ScrollView>

              {/* 오늘의 운동 확인 CTA 버튼 */}
              <Pressable
                accessibilityRole="button"
                onPress={openWorkout}
                style={({ pressed }) => [
                  styles.startWorkoutButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.startWorkoutButtonText}>
                  오늘의 운동 확인
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.emptyRoutineContainer}>
              <Text style={styles.emptyRoutineTitle}>
                등록된 운동 계획이 없습니다
              </Text>
              <Text style={styles.emptyRoutineDesc}>
                선택한 날짜에 예정된 루틴 데이터가 없습니다.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={openWorkout}
                style={({ pressed }) => [
                  styles.startWorkoutButton,
                  styles.fullWidthButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.startWorkoutButtonText}>
                  오늘의 운동 확인
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* 4. 맞춤형 추천 루틴 섹션 */}
        <View style={styles.recommendSection}>
          <Text style={styles.recommendHeading}>
            {`${goalPhrase} 원하는 회원님!\n이 루틴은 어떠세요?`}
          </Text>

          {recommendedRoutines.length > 0 ? (
            <View style={styles.recommendList}>
              {recommendedRoutines.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={openWorkout}
                  style={({ pressed }) => [
                    styles.recommendCard,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={styles.recommendCategory}>{item.category}</Text>
                  <Text style={styles.recommendTitle}>{item.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyRecommendCard}>
              <Text style={styles.emptyRoutineDesc}>
                표시할 추천 루틴 데이터가 없습니다.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
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
    paddingBottom: 130,
  },
  greetingSection: {
    marginTop: 4,
  },
  greetingText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111111',
    lineHeight: 35,
    letterSpacing: -0.5,
  },
  weeklySection: {
    marginTop: 28,
  },
  weeklyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weeklyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.4,
  },
  weeklyPlanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  weeklyPlanLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    letterSpacing: -0.2,
  },
  dayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  dayColumn: {
    width: 44,
    borderRadius: 10,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: 'center',
  },
  dayColumnSelected: {
    backgroundColor: '#141414',
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#71717A',
  },
  dayLabelSelected: {
    color: '#D4D4D8',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    marginTop: 6,
  },
  dateTextSelected: {
    color: '#FFFFFF',
  },
  dayIconSlot: {
    height: 18,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineCard: {
    marginTop: 20,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingTop: 22,
    paddingBottom: 20,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  routineTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.4,
  },
  routineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#71717A',
  },
  metaValue: {
    fontWeight: '700',
    color: '#111111',
  },
  metaDivider: {
    width: 1,
    height: 11,
    backgroundColor: '#D4D4D8',
    marginHorizontal: 10,
  },
  exerciseScroll: {
    marginTop: 18,
    marginHorizontal: -18,
  },
  exerciseScrollContent: {
    paddingHorizontal: 18,
    gap: 12,
  },
  exerciseItem: {
    width: 60,
    alignItems: 'center',
  },
  exerciseThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#D6D6D8',
  },
  exerciseName: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: '#3F3F46',
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: -0.2,
  },
  emptyRoutineContainer: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyRoutineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  emptyRoutineDesc: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '400',
    color: '#71717A',
    textAlign: 'center',
  },
  startWorkoutButton: {
    marginTop: 20,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidthButton: {
    width: '100%',
  },
  startWorkoutButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  recommendSection: {
    marginTop: 34,
  },
  recommendHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    lineHeight: 29,
    letterSpacing: -0.4,
  },
  recommendList: {
    marginTop: 16,
    gap: 14,
  },
  recommendCard: {
    height: 118,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 18,
    paddingBottom: 16,
    justifyContent: 'flex-end',
    gap: 4,
  },
  recommendCategory: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  recommendTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#60646C',
    letterSpacing: -0.2,
  },
  emptyRecommendCard: {
    marginTop: 16,
    height: 96,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pressed: {
    opacity: 0.75,
  },
});
