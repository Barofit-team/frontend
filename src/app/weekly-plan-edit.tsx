import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  ArrowLeftIcon,
  DragHandleIcon,
  DumbbellIcon,
  FlameIcon,
  PlusIcon,
  StopwatchIcon,
} from '@/components/home/HomeIcons';
import { ApiError } from '@/services/api';
import { clearLocalWorkout, getLocalWorkout } from '@/services/offlineWorkout';
import {
  saveWeeklyPlanChanges,
  toIsoDateString,
} from '@/services/weeklyPlanService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTodayRoutineStore } from '@/stores/useTodayRoutineStore';
import { useWeeklyPlanStore } from '@/stores/useWeeklyPlanStore';
import { useWorkoutDraftStore } from '@/stores/useWorkoutDraftStore';
import type {
  PlannedExerciseItem,
  WeeklyCalendarDay,
  WeeklyPlanDayItem,
} from '@/types/weeklyPlan';

interface RoutinePresetOption {
  id: string;
  title: string;
  exerciseCount: number;
  durationMinutes: number;
  calories: number | null;
  exercises: PlannedExerciseItem[];
}

function createPlanItemForDay(
  day: WeeklyCalendarDay,
  option: RoutinePresetOption,
): WeeklyPlanDayItem {
  return {
    id: `plan-${day.date}-${option.id}`,
    date: day.date,
    dateNumber: day.dateNumber,
    dayLabel: day.dayLabel,
    dateLabel: day.dateLabel,
    routineId: option.id,
    title: option.title,
    exerciseCount: option.exerciseCount,
    durationMinutes: option.durationMinutes,
    calories: option.calories,
    exercises: option.exercises.map((ex, idx) => ({
      ...ex,
      id: `${day.date}-${ex.id}-${idx}`,
    })),
  };
}

export default function WeeklyPlanEditScreen() {
  const insets = useSafeAreaInsets();
  const weekDays = useWeeklyPlanStore((state) => state.weekDays);
  const planItems = useWeeklyPlanStore((state) => state.planItems);
  const recommendedRoutines = useWeeklyPlanStore(
    (state) => state.recommendedRoutines,
  );
  const setPlanItems = useWeeklyPlanStore((state) => state.setPlanItems);

  const todayIso = toIsoDateString(new Date());
  const isPastDay = (dateIso: string): boolean => dateIso < todayIso;

  // 날짜(YYYY-MM-DD)별 편집 중인 루틴 맵
  const [draftByDate, setDraftByDate] = useState<
    Record<string, WeeklyPlanDayItem>
  >(() => {
    const initial: Record<string, WeeklyPlanDayItem> = {};
    for (const item of planItems) {
      initial[item.date] = item;
    }
    return initial;
  });

  // 드래그 핸들(≡) 탭으로 요일 간 위치 교환(Swap/Move)을 수행할 기준 날짜
  const [movingSourceDate, setMovingSourceDate] = useState<string | null>(null);

  // 루틴 추가/변경 모달 대상 요일
  const [pickerTargetDay, setPickerTargetDay] =
    useState<WeeklyCalendarDay | null>(null);

  // 저장 중 상태
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const next: Record<string, WeeklyPlanDayItem> = {};
    for (const item of planItems) {
      next[item.date] = item;
    }
    setDraftByDate(next);
  }, [planItems]);

  const routineOptions = useMemo<RoutinePresetOption[]>(() => {
    return recommendedRoutines.map((rec) => ({
      id: rec.id,
      title: rec.title,
      exerciseCount: rec.exerciseCount,
      durationMinutes: rec.durationMinutes,
      calories: rec.calories,
      exercises: rec.exercises ?? [],
    }));
  }, [recommendedRoutines]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/weekly-plan');
  };

  const checkActiveWorkoutAndConfirm = (action: () => void) => {
    const draft = useWorkoutDraftStore.getState().draft;
    if (draft) {
      Alert.alert(
        '진행 중인 운동 초기화',
        '중단 중 주간 계획 변경을 시도하면 기존의 진행도는 저장되지 않습니다. 당일의 운동 계획을 초기화하고 계속 진행하시겠습니까?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '초기화 후 변경',
            style: 'destructive',
            onPress: async () => {
              const owner = useAuthStore.getState().user?.id;
              useWorkoutDraftStore.getState().clearDraft();
              if (owner) {
                await clearLocalWorkout(owner, draft.sessionId).catch(() => {});
              }
              action();
            },
          },
        ],
      );
      return;
    }
    action();
  };

  const handleComplete = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const updatedList = weekDays
      .map((day) => draftByDate[day.date])
      .filter((item): item is WeeklyPlanDayItem => Boolean(item));

    try {
      await saveWeeklyPlanChanges(planItems, updatedList);

      const owner = useAuthStore.getState().user?.id;
      const draft = useWorkoutDraftStore.getState().draft;
      if (draft) {
        useWorkoutDraftStore.getState().clearDraft();
        if (owner) {
          await clearLocalWorkout(owner, draft.sessionId).catch(() => {});
        }
      } else if (owner) {
        const local = await getLocalWorkout(owner).catch(() => null);
        if (local) {
          await clearLocalWorkout(owner, local.sessionId).catch(() => {});
        }
      }

      useTodayRoutineStore.getState().resetAllSessions();
      await useWeeklyPlanStore.getState().loadWeeklyPlan();
      handleBack();
    } catch (e) {
      console.warn('[WeeklyPlanEdit] 운동 계획 동기화 실패:', e);
      const message =
        e instanceof ApiError
          ? e.message
          : '일부 계획이 저장되지 않았어요. 서버의 계획을 확인한 후 다시 시도해 주세요.';
      Alert.alert('저장 실패', message);
    } finally {
      setIsSaving(false);
    }
  };

  const swapOrMoveBetweenDays = (
    sourceDate: string,
    targetDay: WeeklyCalendarDay,
  ) => {
    // 지난 날짜는 이동 출발지나 목적지가 될 수 없음
    if (isPastDay(sourceDate) || isPastDay(targetDay.date)) {
      setMovingSourceDate(null);
      return;
    }

    if (sourceDate === targetDay.date) {
      setMovingSourceDate(null);
      return;
    }

    const sourceDay = weekDays.find((d) => d.date === sourceDate);
    if (!sourceDay) {
      setMovingSourceDate(null);
      return;
    }

    setDraftByDate((prev) => {
      const next = { ...prev };
      const sourceItem = prev[sourceDate];
      const targetItem = prev[targetDay.date];

      if (!sourceItem) return prev;

      next[targetDay.date] = {
        ...sourceItem,
        id: `plan-${targetDay.date}-${sourceItem.routineId ?? 'routine'}`,
        date: targetDay.date,
        dateNumber: targetDay.dateNumber,
        dayLabel: targetDay.dayLabel,
        dateLabel: targetDay.dateLabel,
      };

      if (targetItem) {
        next[sourceDate] = {
          ...targetItem,
          id: `plan-${sourceDay.date}-${targetItem.routineId ?? 'routine'}`,
          date: sourceDay.date,
          dateNumber: sourceDay.dateNumber,
          dayLabel: sourceDay.dayLabel,
          dateLabel: sourceDay.dateLabel,
        };
      } else {
        delete next[sourceDate];
      }

      return next;
    });

    setMovingSourceDate(null);
  };

  const handleDaySlotPress = (day: WeeklyCalendarDay) => {
    if (isPastDay(day.date)) {
      return;
    }
    if (movingSourceDate) {
      const todayIso = toIsoDateString(new Date());
      if (
        (movingSourceDate === todayIso || day.date === todayIso) &&
        useWorkoutDraftStore.getState().draft
      ) {
        checkActiveWorkoutAndConfirm(() => {
          swapOrMoveBetweenDays(movingSourceDate, day);
        });
        return;
      }
      swapOrMoveBetweenDays(movingSourceDate, day);
      return;
    }

    const todayIso = toIsoDateString(new Date());
    if (day.date === todayIso && useWorkoutDraftStore.getState().draft) {
      checkActiveWorkoutAndConfirm(() => {
        setPickerTargetDay(day);
      });
      return;
    }

    setPickerTargetDay(day);
  };

  const handleHandlePress = (day: WeeklyCalendarDay) => {
    if (isPastDay(day.date)) {
      return;
    }
    if (movingSourceDate === day.date) {
      setMovingSourceDate(null);
      return;
    }
    if (movingSourceDate) {
      const todayIso = toIsoDateString(new Date());
      if (
        (movingSourceDate === todayIso || day.date === todayIso) &&
        useWorkoutDraftStore.getState().draft
      ) {
        checkActiveWorkoutAndConfirm(() => {
          swapOrMoveBetweenDays(movingSourceDate, day);
        });
        return;
      }
      swapOrMoveBetweenDays(movingSourceDate, day);
      return;
    }

    const todayIso = toIsoDateString(new Date());
    if (day.date === todayIso && useWorkoutDraftStore.getState().draft) {
      checkActiveWorkoutAndConfirm(() => {
        setMovingSourceDate(day.date);
      });
      return;
    }

    setMovingSourceDate(day.date);
  };

  const handleSelectRoutineOption = (option: RoutinePresetOption) => {
    if (!pickerTargetDay || isPastDay(pickerTargetDay.date)) return;
    const created = createPlanItemForDay(pickerTargetDay, option);
    setDraftByDate((prev) => ({
      ...prev,
      [pickerTargetDay.date]: created,
    }));
    setPickerTargetDay(null);
  };

  const handleRemoveRoutineFromDay = () => {
    if (!pickerTargetDay || isPastDay(pickerTargetDay.date)) return;
    setDraftByDate((prev) => {
      const next = { ...prev };
      delete next[pickerTargetDay.date];
      return next;
    });
    setPickerTargetDay(null);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      {/* 상단 네비게이션 헤더 (뒤로가기 / 완료) */}
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
          accessibilityLabel="주간 계획 편집 완료"
          disabled={isSaving}
          hitSlop={10}
          onPress={handleComplete}
          style={({ pressed }) => [
            styles.completeButton,
            (pressed || isSaving) && styles.pressed,
          ]}>
          <Text style={styles.completeButtonText}>
            {isSaving ? '저장 중...' : '완료'}
          </Text>
        </Pressable>
      </View>

      {movingSourceDate ? (
        <View style={styles.moveHintBanner}>
          <Text style={styles.moveHintText}>
            이동하거나 맞바꿀 요일 슬롯(오늘 이후)을 선택해주세요.
          </Text>
        </View>
      ) : null}

      {/* 월 ~ 일 7일 편집 리스트 */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.dayRowList}>
          {weekDays.map((day) => {
            const assignedPlan = draftByDate[day.date];
            const isPast = isPastDay(day.date);
            const isMovingSource = movingSourceDate === day.date;

            return (
              <View
                key={day.date}
                style={[styles.dayRow, isPast && styles.pastDayRow]}>
                {/* 좌측 요일 + 일자 컬럼 */}
                <View style={styles.dayMetaColumn}>
                  <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                  <Text style={styles.dateNumber}>{day.dateNumber}</Text>
                </View>

                {/* 우측 루틴 카드 또는 빈 슬롯 (지난 날짜는 읽기 전용 잠금) */}
                {isPast ? (
                  assignedPlan ? (
                    <View
                      accessibilityLabel={`${day.dayLabel}요일 ${day.dateNumber}일 지난 운동 계획 (편집 불가)`}
                      style={styles.filledSlotCard}>
                      <View style={styles.filledCardLeft}>
                        <Text style={styles.routineTitle} numberOfLines={1}>
                          {assignedPlan.title}
                        </Text>

                        <View style={styles.routineMetaRow}>
                          <View style={styles.metaItem}>
                            <DumbbellIcon color="#9CA3AF" size={13} />
                            <Text style={styles.metaText}>
                              <Text style={styles.metaValue}>
                                {assignedPlan.exerciseCount}
                              </Text>{' '}
                              종목
                            </Text>
                          </View>

                          <View style={styles.metaDivider} />

                          <View style={styles.metaItem}>
                            <StopwatchIcon color="#9CA3AF" size={13} />
                            <Text style={styles.metaText}>
                              <Text style={styles.metaValue}>
                                {assignedPlan.durationMinutes}
                              </Text>{' '}
                              분
                            </Text>
                          </View>

                          <View style={styles.metaDivider} />

                          <View style={styles.metaItem}>
                            <FlameIcon color="#9CA3AF" size={13} />
                            <Text style={styles.metaText}>
                              <Text style={styles.metaValue}>
                                {assignedPlan.calories ?? '—'}
                              </Text>{' '}
                              kcal
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View
                      accessibilityLabel={`${day.dayLabel}요일 ${day.dateNumber}일 지난 날짜 (편집 불가)`}
                      style={styles.emptySlotCard}
                    />
                  )
                ) : assignedPlan ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${day.dayLabel}요일 ${assignedPlan.title} 편집`}
                    onPress={() => handleDaySlotPress(day)}
                    style={({ pressed }) => [
                      styles.filledSlotCard,
                      isMovingSource && styles.filledSlotCardActive,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.filledCardLeft}>
                      <Text style={styles.routineTitle} numberOfLines={1}>
                        {assignedPlan.title}
                      </Text>

                      <View style={styles.routineMetaRow}>
                        <View style={styles.metaItem}>
                          <DumbbellIcon color="#9CA3AF" size={13} />
                          <Text style={styles.metaText}>
                            <Text style={styles.metaValue}>
                              {assignedPlan.exerciseCount}
                            </Text>{' '}
                            종목
                          </Text>
                        </View>

                        <View style={styles.metaDivider} />

                        <View style={styles.metaItem}>
                          <StopwatchIcon color="#9CA3AF" size={13} />
                          <Text style={styles.metaText}>
                            <Text style={styles.metaValue}>
                              {assignedPlan.durationMinutes}
                            </Text>{' '}
                            분
                          </Text>
                        </View>

                        <View style={styles.metaDivider} />

                        <View style={styles.metaItem}>
                          <FlameIcon color="#9CA3AF" size={13} />
                          <Text style={styles.metaText}>
                            <Text style={styles.metaValue}>
                              {assignedPlan.calories ?? '—'}
                            </Text>{' '}
                            kcal
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${day.dayLabel}요일 루틴 순서 이동`}
                      hitSlop={12}
                      onPress={() => handleHandlePress(day)}
                      style={({ pressed }) => [
                        styles.handleButton,
                        pressed && styles.pressed,
                      ]}>
                      <DragHandleIcon color="#71717A" size={18} />
                    </Pressable>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${day.dayLabel}요일 ${day.dateNumber}일 루틴 추가`}
                    onPress={() => handleDaySlotPress(day)}
                    style={({ pressed }) => [
                      styles.emptySlotCard,
                      movingSourceDate && styles.emptySlotCardTargetable,
                      pressed && styles.pressed,
                    ]}>
                    <PlusIcon color="#9CA3AF" size={20} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* 요일별 루틴 선택 / 삭제 바텀시트 모달 */}
      <Modal
        visible={pickerTargetDay !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerTargetDay(null)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerTargetDay(null)}>
          <Pressable
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {pickerTargetDay
                  ? `${pickerTargetDay.dateLabel} 운동 루틴 설정`
                  : '운동 루틴 설정'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerTargetDay(null)}>
                <Text style={styles.sheetCloseText}>닫기</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetScrollView}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={true}>
              <View style={styles.optionList}>
                {routineOptions.length === 0 ? (
                  <View style={styles.emptyOptionContainer}>
                    <Text style={styles.emptyOptionText}>
                      불러올 수 있는 운동 루틴 템플릿이 없습니다.
                    </Text>
                  </View>
                ) : (
                  routineOptions.map((option) => (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      onPress={() => handleSelectRoutineOption(option)}
                      style={({ pressed }) => [
                        styles.optionCard,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.optionTitle}>{option.title}</Text>
                      <View style={styles.routineMetaRow}>
                        <View style={styles.metaItem}>
                          <DumbbellIcon color="#9CA3AF" size={13} />
                          <Text style={styles.metaText}>
                            <Text style={styles.metaValue}>
                              {option.exerciseCount}
                            </Text>{' '}
                            종목
                          </Text>
                        </View>
                        <View style={styles.metaDivider} />
                        <View style={styles.metaItem}>
                          <StopwatchIcon color="#9CA3AF" size={13} />
                          <Text style={styles.metaText}>
                            <Text style={styles.metaValue}>
                              {option.durationMinutes}
                            </Text>{' '}
                            분
                          </Text>
                        </View>
                        <View style={styles.metaDivider} />
                        <View style={styles.metaItem}>
                          <FlameIcon color="#9CA3AF" size={13} />
                          <Text style={styles.metaText}>
                            <Text style={styles.metaValue}>{option.calories ?? '—'}</Text>{' '}
                            kcal
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  ))
                )}
              </View>
            </ScrollView>

            {pickerTargetDay && draftByDate[pickerTargetDay.date] ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleRemoveRoutineFromDay}
                style={({ pressed }) => [
                  styles.removeButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.removeButtonText}>
                  이 요일의 루틴 비우기
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
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
  completeButton: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
    letterSpacing: -0.3,
  },
  moveHintBanner: {
    marginHorizontal: 20,
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#111111',
  },
  moveHintText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
  },
  dayRowList: {
    gap: 12,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pastDayRow: {
    opacity: 0.45,
  },
  dayMetaColumn: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  dateNumber: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  filledSlotCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 12,
    backgroundColor: '#D6D6D8',
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filledSlotCardActive: {
    borderWidth: 1.5,
    borderColor: '#111111',
  },
  filledCardLeft: {
    flex: 1,
    paddingRight: 12,
  },
  routineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.4,
  },
  routineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
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
    backgroundColor: '#B8B8BD',
    marginHorizontal: 8,
  },
  handleButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotCardTargetable: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9CA3AF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 22,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.4,
  },
  sheetCloseText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#71717A',
  },
  sheetScrollView: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScrollContent: {
    paddingBottom: 12,
  },
  optionList: {
    gap: 10,
  },
  emptyOptionContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyOptionText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  optionCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  removeButton: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  pressed: {
    opacity: 0.75,
  },
});
