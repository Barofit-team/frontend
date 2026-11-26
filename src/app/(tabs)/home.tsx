import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
} from '@/components/home/HomeIcons';
import { RoutineMetrics } from '@/components/home/RoutineMetrics';
import { RoutinePickerSheet } from '@/components/home/RoutinePickerSheet';
import { WeeklyGoalNotice } from '@/components/home/WeeklyGoalNotice';
import { flushWorkoutQueue, getLocalWorkout } from '@/services/offlineWorkout';
import {
  getRoutineTemplateDetail,
  getWeeklyGoalProgress,
} from '@/services/routineService';
import {
  estimateRoutineMetrics,
  getMondayOfWeek,
  toIsoDateString,
} from '@/services/weeklyPlanService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTodayRoutineStore } from '@/stores/useTodayRoutineStore';
import { useWeeklyPlanStore } from '@/stores/useWeeklyPlanStore';
import { useWorkoutDraftStore } from '@/stores/useWorkoutDraftStore';
import type {
  BackendRoutineDetail,
  RecommendedRoutineItem,
  WeeklyGoalProgress,
} from '@/types/weeklyPlan';

export default function HomeScreen() {
  const owner = useAuthStore((s) => s.user?.id);
  const {
    weekDays,
    selectedDate,
    planItems,
    recommendedRoutines,
    availableRoutines,
    isLoading,
    hasLoaded,
    error,
    recommendationError,
    setSelectedDate,
    loadWeeklyPlan,
  } = useWeeklyPlanStore();
  const draft = useWorkoutDraftStore((s) => s.draft);
  const [progress, setProgress] = useState<WeeklyGoalProgress | null>(null);
  const [progressError, setProgressError] = useState(false);
  const [localSnapshot, setLocalSnapshot] =
    useState<BackendRoutineDetail | null>(null);
  const [localError, setLocalError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const today = toIsoDateString(new Date());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadWeeklyPlan();
      setProgress(null);
      setProgressError(false);
      setLocalSnapshot(null);
      setLocalError(false);
      if (owner) {
        void flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner)
          .catch(() => {})
          .then(() => getWeeklyGoalProgress(toIsoDateString(getMondayOfWeek(new Date()))))
          .then((result) => {
            if (active && useAuthStore.getState().user?.id === owner)
              setProgress(result);
          })
          .catch(() => {
            if (active) setProgressError(true);
          });
        void getLocalWorkout(owner)
          .then((local) => {
            if (!active || useAuthStore.getState().user?.id !== owner) return;
            const inProgress =
              local &&
              local.session.status !== 'COMPLETED' &&
              local.session.status !== 'ABANDONED';
            if (inProgress) {
              useWorkoutDraftStore.getState().saveDraft(local.draft);
              setLocalSnapshot(local.session.routineSnapshot);
            } else useWorkoutDraftStore.getState().clearDraft();
          })
          .catch(() => {
            if (active) setLocalError(true);
          });
      }
      return () => {
        active = false;
      };
    }, [owner, loadWeeklyPlan]),
  );

  const selectedPlan = planItems.find((p) => p.date === selectedDate);
  const recommendation = recommendedRoutines[0];
  const hasDraft = Boolean(draft && localSnapshot && selectedDate === today);
  const dayCompleted = !hasDraft && !!progress?.completedDates.includes(selectedDate);
  const cardAction = hasDraft ? '운동 재개하기' : dayCompleted ? '기록 보기' : '루틴 미리보기';
  const snapshot = hasDraft ? localSnapshot : selectedPlan?.routineSnapshot;
  const cardTitle = hasDraft
    ? localSnapshot?.name
    : (selectedPlan?.title ?? recommendation?.title);
  const custom = snapshot?.type === 'USER';
  const count =
    snapshot?.exercises.length ??
    selectedPlan?.exerciseCount ??
    recommendation?.exerciseCount ??
    0;
  const metrics =
    hasDraft && localSnapshot
      ? estimateRoutineMetrics(localSnapshot)
      : (selectedPlan ?? recommendation);

  const openRoutine = async (item?: RecommendedRoutineItem) => {
    if (opening) return;
    const expectedOwner = owner;
    setOpening(true);
    try {
      if (hasDraft && !item && localSnapshot) {
        useTodayRoutineStore.getState().setPlan(localSnapshot, today);
      } else {
        const target = item ?? recommendation;
        const detail =
          !item && selectedPlan?.routineSnapshot
            ? selectedPlan.routineSnapshot
            : (target?.routineSnapshot ??
              (target
                ? await getRoutineTemplateDetail(target.templateId ?? target.id)
                : null));
        if (useAuthStore.getState().user?.id !== expectedOwner) return;
        if (!detail)
          throw new Error('표시할 루틴이 없어요. 다른 루틴을 선택해 주세요.');
        useTodayRoutineStore
          .getState()
          .setPlan(
            detail,
            selectedDate,
            item ? 'selected' : selectedPlan ? 'assigned' : 'recommended',
          );
      }
      setPickerOpen(false);
      router.push('/today-routine', { dangerouslySingular: true });
    } catch (e) {
      Alert.alert(
        '루틴을 열지 못했어요',
        e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.calendar}>
          <View style={styles.progressRow}>
            <View style={styles.goalGroup}>
              <Text style={styles.completeText}>
                완료{' '}
                <Text style={styles.blue}>
                  {progress ? `${progress.completedCount}회` : '—'}
                </Text>
              </Text>
              <View
                style={styles.goalDots}
                accessibilityLabel={
                  progress
                    ? `주간 목표 ${progress.weeklyGoal}회 중 ${progress.goalProgress}회 달성`
                    : '주간 진행률 확인 중'
                }
              >
                {progress ? (
                  Array.from({ length: progress.weeklyGoal }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        i < progress.goalProgress && styles.dotComplete,
                      ]}
                    />
                  ))
                ) : (
                  <View style={styles.progressPlaceholder} />
                )}
              </View>
            </View>
            <View style={styles.streak}>
              <FlameIcon color="#A9C6FF" size={20} />
              <Text style={styles.streakText}>
                {progress?.streakWeeks == null
                  ? '—주 연속'
                  : `${progress.streakWeeks}주 연속`}
              </Text>
            </View>
          </View>
          <WeeklyGoalNotice owner={owner} progress={progress} />
          {progressError && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setProgressError(false);
                if (owner)
                  void getWeeklyGoalProgress(
                    toIsoDateString(getMondayOfWeek(new Date())),
                  )
                    .then(setProgress)
                    .catch(() => setProgressError(true));
              }}
            >
              <Text style={styles.progressError}>
                완료 기록을 불러오지 못했어요 · 다시 시도
              </Text>
            </Pressable>
          )}
          <View style={styles.days}>
            {weekDays.map((day) => {
              const selected = selectedDate === day.date;
              const completed = progress?.completedDates.includes(day.date);
              return (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.dayLabel}요일 ${day.dateNumber}일${completed ? ', 운동 완료' : ''}`}
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedDate(day.date)}
                  style={[styles.day, selected && styles.daySelected]}
                >
                  <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                  <Text style={styles.dayNumber}>{day.dateNumber}</Text>
                  {completed && (
                    <View style={styles.completedMark}>
                      <Text style={styles.completedCheck}>✓</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.body}>
          {localError && (
            <Text style={styles.progressError}>
              저장한 운동을 확인하지 못했어요. 앱을 다시 열어 확인해 주세요.
            </Text>
          )}
          <View style={styles.recommendation}>
            <View style={styles.cardHeading}>
              <View style={styles.headingLabel}>
                <Text style={styles.bookmark}>✦</Text>
                <Text style={styles.sectionTitle}>
                  {custom ? '사용자 지정 루틴' : 'AI 추천 루틴'}
                </Text>
              </View>
              {(hasDraft || dayCompleted) && (
                <View style={styles.inProgress}>
                  <Text style={styles.inProgressText}>{hasDraft ? '진행 중' : '운동 완료'}</Text>
                </View>
              )}
            </View>
            {isLoading && !hasLoaded ? (
              <View style={styles.empty}>
                <ActivityIndicator color="#2460E8" />
                <Text style={styles.muted}>루틴을 불러오고 있어요.</Text>
              </View>
            ) : cardTitle ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${cardTitle} ${cardAction}`}
                  disabled={opening}
                  onPress={() => dayCompleted ? router.push({ pathname: '/record', params: { date: selectedDate } }) : void openRoutine()}
                  style={styles.routineCard}
                >
                  <View style={styles.titleRow}>
                    <Text style={styles.routineTitle}>{cardTitle}</Text>
                    <ChevronRightIcon color="#555555" size={15} />
                  </View>
                  <RoutineMetrics
                    count={count}
                    minutes={metrics?.durationMinutes ?? 0}
                    calories={metrics?.calories ?? null}
                  />
                  <View style={[styles.primaryButton, dayCompleted && styles.completedButton]}>
                    {opening ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={[styles.primaryText, dayCompleted && styles.completedButtonText]}>
                        {cardAction}
                      </Text>
                    )}
                  </View>
                </Pressable>
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>
                    {hasDraft
                      ? '오늘 진행 중인 루틴이 있어요.'
                      : dayCompleted
                        ? selectedDate === today
                          ? '오늘 운동을 완료했어요. 수고했어요! 다른 루틴을 선택해 추가로 운동할 수도 있어요.'
                          : '이 날짜의 운동을 완료했어요. 기록에서 운동 결과를 확인해 보세요.'
                      : custom
                        ? '내가 선택한 루틴으로 오늘의 운동을 시작해 보세요.'
                        : '내 운동 목표와 경험, 불편 부위를 고려한 루틴을 준비했어요.'}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {error || recommendationError
                    ? '루틴을 불러오지 못했어요'
                    : '지금 추천할 수 있는 루틴이 없어요'}
                </Text>
                <Text style={styles.muted}>
                  {error ??
                    recommendationError ??
                    '다른 루틴에서 직접 선택할 수 있어요.'}
                </Text>
                {(error || recommendationError) && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void loadWeeklyPlan()}
                    style={styles.retry}
                  >
                    <Text style={styles.blue}>다시 시도</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.browse, pressed && styles.pressed]}
          >
            <DumbbellIcon color="#555555" size={19} />
            <Text style={styles.browseText}>다른 루틴 찾아보기</Text>
            <ChevronRightIcon color="#999999" size={13} />
          </Pressable>
        </View>
      </ScrollView>
      <RoutinePickerSheet
        visible={pickerOpen}
        routines={availableRoutines}
        loading={isLoading && !hasLoaded}
        busy={opening}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => void openRoutine(item)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  completedButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#3972FF' },
  completedButtonText: { color: '#2460E8' },
  safeArea: { flex: 1, backgroundColor: '#F2F2F2' },
  content: { paddingBottom: 126 },
  calendar: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 17,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  goalGroup: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  completeText: { fontSize: 13, fontWeight: '600', color: '#222222' },
  blue: { color: '#2460E8', fontWeight: '600' },
  goalDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    flexShrink: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E3E3E3' },
  dotComplete: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#3972FF',
    borderWidth: 3,
    borderColor: '#DCE8FF',
  },
  progressPlaceholder: {
    width: 64,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#EDF2FC',
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#F0F5FF',
  },
  streakText: { fontSize: 12, color: '#6C9AFF', fontWeight: '600' },
  days: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  day: {
    width: 40,
    minHeight: 67,
    alignItems: 'center',
    paddingVertical: 9,
    gap: 13,
    borderRadius: 23,
  },
  daySelected: { backgroundColor: '#F0F5FF' },
  dayLabel: { fontSize: 13, color: '#777777', fontWeight: '500' },
  dayNumber: { fontSize: 15, fontWeight: '600', color: '#555555' },
  completedMark: {
    width: 14,
    height: 14,
    backgroundColor: '#3972FF',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  completedCheck: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  body: { padding: 16, gap: 10 },
  recommendation: {
    backgroundColor: '#EAF1FF',
    borderWidth: 1,
    borderColor: '#D6E4FF',
    borderRadius: 10,
    padding: 15,
    gap: 12,
  },
  cardHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headingLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bookmark: { fontSize: 20, color: '#2053A9' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#17438C' },
  inProgress: {
    backgroundColor: '#2460E8',
    borderRadius: 5,
    paddingVertical: 4,
    paddingHorizontal: 7,
  },
  inProgressText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  routineCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#8BAFFF',
    borderRadius: 8,
    padding: 14,
    gap: 15,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    color: '#222222',
    letterSpacing: -0.4,
  },
  primaryButton: {
    minHeight: 45,
    backgroundColor: '#245EE5',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  notice: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6E4FF',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    fontSize: 13,
    color: '#19428E',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  browse: {
    minHeight: 57,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  browseText: { fontSize: 15, fontWeight: '600', color: '#333333', flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  emptyTitle: {
    fontSize: 15,
    color: '#333333',
    fontWeight: '600',
    textAlign: 'center',
  },
  muted: {
    color: '#777777',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  retry: { padding: 10 },
  progressError: {
    color: '#777777',
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
  pressed: { opacity: 0.7 },
});
