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
  ArrowLeftIcon,
  DumbbellIcon,
  FlameIcon,
  PencilIcon,
  StopwatchIcon,
} from '@/components/home/HomeIcons';
import { useWeeklyPlanStore } from '@/stores/useWeeklyPlanStore';

export default function WeeklyPlanScreen() {
  const planItems = useWeeklyPlanStore((state) => state.planItems);
  const isLoading = useWeeklyPlanStore((state) => state.isLoading);
  const hasLoaded = useWeeklyPlanStore((state) => state.hasLoaded);
  const loadWeeklyPlan = useWeeklyPlanStore((state) => state.loadWeeklyPlan);

  useEffect(() => {
    if (!hasLoaded) {
      void loadWeeklyPlan();
    }
  }, [hasLoaded, loadWeeklyPlan]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/home');
  };

  const openEditScreen = () => {
    router.push('/weekly-plan-edit', { dangerouslySingular: true });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      {/* 상단 네비게이션 헤더 (뒤로가기 / 편집) */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          hitSlop={8}
          onPress={handleBack}
          style={({ pressed }) => [
            styles.circleButton,
            pressed && styles.pressed,
          ]}>
          <ArrowLeftIcon color="#111111" size={18} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="주간 계획 수정"
          hitSlop={8}
          onPress={openEditScreen}
          style={({ pressed }) => [
            styles.circleButton,
            pressed && styles.pressed,
          ]}>
          <PencilIcon color="#111111" size={18} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* 페이지 타이틀 */}
        <Text style={styles.pageTitle}>이번 주 운동 계획</Text>

        {/* 1. 데이터 로딩 상태 */}
        {isLoading && !hasLoaded ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color="#111111" />
            <Text style={styles.stateDescription}>
              이번 주 운동 계획을 불러오는 중입니다...
            </Text>
          </View>
        ) : planItems.length === 0 ? (
          /* 2. 데이터 없음(Empty State) 상태 */
          <View style={styles.stateCard}>
            <View style={styles.emptyIconCircle}>
              <DumbbellIcon color="#71717A" size={22} />
            </View>
            <Text style={styles.emptyTitle}>
              등록된 이번 주 운동 계획이 없습니다
            </Text>
            <Text style={styles.stateDescription}>
              운동 루틴을 생성하거나 주간 계획을 설정하면{'\n'}요일별 루틴 정보가
              이곳에 표시됩니다.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="운동 계획 다시 불러오기"
              onPress={() => void loadWeeklyPlan()}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.retryButtonText}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : (
          /* 3. 요일별 운동 계획 리스트 출력 */
          <View style={styles.planList}>
            {planItems.map((plan) => (
              <View key={plan.id} style={styles.daySection}>
                <Text style={styles.dateHeading}>{plan.dateLabel}</Text>

                <View style={styles.routineCard}>
                  <Text style={styles.routineTitle}>{plan.title}</Text>

                  {/* 종목 / 시간 / 칼로리 메타 정보 */}
                  <View style={styles.routineMetaRow}>
                    <View style={styles.metaItem}>
                      <DumbbellIcon color="#9CA3AF" size={14} />
                      <Text style={styles.metaText}>
                        <Text style={styles.metaValue}>
                          {plan.exerciseCount}
                        </Text>{' '}
                        종목
                      </Text>
                    </View>

                    <View style={styles.metaDivider} />

                    <View style={styles.metaItem}>
                      <StopwatchIcon color="#9CA3AF" size={14} />
                      <Text style={styles.metaText}>
                        <Text style={styles.metaValue}>
                          {plan.durationMinutes}
                        </Text>{' '}
                        분
                      </Text>
                    </View>

                    <View style={styles.metaDivider} />

                    <View style={styles.metaItem}>
                      <FlameIcon color="#9CA3AF" size={14} />
                      <Text style={styles.metaText}>
                        <Text style={styles.metaValue}>{plan.calories}</Text>{' '}
                        kcal
                      </Text>
                    </View>
                  </View>

                  {/* 운동 종목 가로 리스트 */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.exerciseScroll}
                    contentContainerStyle={styles.exerciseScrollContent}>
                    {plan.exercises.map((exercise) => (
                      <View key={exercise.id} style={styles.exerciseItem}>
                        <View style={styles.exerciseThumbnail} />
                        <Text style={styles.exerciseName}>{exercise.name}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 48,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.5,
  },
  stateCard: {
    marginTop: 26,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingVertical: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E4E4E7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  stateDescription: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '400',
    color: '#71717A',
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  planList: {
    marginTop: 26,
    gap: 28,
  },
  daySection: {
    gap: 12,
  },
  dateHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#71717A',
    letterSpacing: -0.3,
  },
  routineCard: {
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
  pressed: {
    opacity: 0.75,
  },
});
