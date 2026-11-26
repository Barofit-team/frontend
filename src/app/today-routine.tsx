import { router, useFocusEffect } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ArrowLeftIcon } from '@/components/home/HomeIcons';
import { ExerciseSetSheet } from '@/components/home/ExerciseSetSheet';
import { RoutineExerciseRow } from '@/components/home/RoutineExerciseRow';
import { RoutineMetrics } from '@/components/home/RoutineMetrics';
import { confirmAction } from '@/components/home/confirmAction';
import {
  editableRoutine,
  formatDuration,
  moveExercise,
  withoutExercise,
} from '@/components/home/routineEditing';
import {
  getWorkoutPlanDate,
  saveDailyRoutine,
} from '@/services/dailyRoutineService';
import {
  cachePlan,
  flushWorkoutQueue,
  getCachedPlan,
  getLocalWorkout,
  isOffline,
  pendingCount,
  savePosition,
  settleStaleWorkout,
} from '@/services/offlineWorkout';
import { kstDateOf } from '@/services/kstDate';
import { restoredPosition } from '@/components/workout-session/sessionResume';
import { assignWorkoutPlan } from '@/services/routineService';
import {
  estimateRoutineMetrics,
  toIsoDateString,
} from '@/services/weeklyPlanService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTodayRoutineStore } from '@/stores/useTodayRoutineStore';
import { useWorkoutDraftStore } from '@/stores/useWorkoutDraftStore';
import { useWeeklyPlanStore } from '@/stores/useWeeklyPlanStore';
import type {
  RoutineDetail,
  RoutineExerciseDetail,
  WorkoutPlanDay,
} from '@/types/routine';

export default function TodayRoutineScreen() {
  const insets = useSafeAreaInsets();
  const owner = useAuthStore((s) => s.user?.id);
  const source = useTodayRoutineStore((s) => s.routineSnapshot);
  // 오늘은 Routine 당일 계획과 같은 한국 시간(Asia/Seoul) 기준이다(기기 시간대와 무관)
  const today = kstDateOf(Date.now()) ?? toIsoDateString(new Date());
  const date = useTodayRoutineStore((s) => s.planDate) ?? today;
  const origin = useTodayRoutineStore((s) => s.selectionOrigin);
  const savedWorkout = useWorkoutDraftStore((s) => s.draft);
  const [draft, setDraft] = useState<RoutineDetail | null>(() =>
    source ? editableRoutine(source) : null,
  );
  const [serverDay, setServerDay] = useState<WorkoutPlanDay | null>(null);
  const [expectedId, setExpectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(0);
  const [reorder, setReorder] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<RoutineExerciseDetail | null>(null);
  const [leaving, setLeaving] = useState(false);
  const savingLock = useRef(false);
  const dirty = Boolean(
    source &&
      draft &&
      JSON.stringify(editableRoutine(source)) !== JSON.stringify(draft),
  );
  useEffect(() => {
    if (source) setDraft(editableRoutine(source));
  }, [source]);
  const disableRemovalPrevention = usePreventRemove(
    dirty && !leaving,
    ({ repeat }) => {
      if (savingLock.current) return;
      void confirmAction(
        '편집 중인 루틴',
        '저장하지 않은 변경사항을 버리고 나갈까요?',
        '나가기',
      ).then((ok) => {
        if (ok) {
          setLeaving(true);
          repeat();
        }
      });
    },
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLeaving(false);
      setLoading(true);
      setError(null);
      void (async () => {
        if (owner) {
          // 이전 날짜의 미완료 세션은 이어하지 않고 ABANDONED로 끝낸다(완료 세트·전송 대기 큐 보존). 새 운동 시작을 막지 않는다
          if (await settleStaleWorkout(owner))
            void flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner).catch(() => {});
          const local = await getLocalWorkout(owner);
          if (!active || useAuthStore.getState().user?.id !== owner) return;
          if (
            local &&
            local.session.status !== 'COMPLETED' &&
            local.session.status !== 'ABANDONED'
          )
            useWorkoutDraftStore.getState().saveDraft(local.draft);
          else useWorkoutDraftStore.getState().clearDraft();
          setPending(await pendingCount(owner));
        }
        try {
          const day = await getWorkoutPlanDate(date);
          if (!active || useAuthStore.getState().user?.id !== owner) return;
          setServerDay(day);
          setExpectedId(day.routine?.id ?? null);
          if (!useTodayRoutineStore.getState().routineSnapshot)
            useTodayRoutineStore.getState().setPlan(day.routine, date);
        } catch (e) {
          const cached =
            owner && isOffline(e) ? await getCachedPlan(owner) : null;
          if (!active) return;
          if (cached?.date === date && cached.routine) {
            if (!useTodayRoutineStore.getState().routineSnapshot)
              useTodayRoutineStore.getState().setPlan(cached.routine, date);
            setExpectedId(cached.routine.id);
            setError(
              '오프라인이에요. 저장한 운동은 이어할 수 있고 루틴 편집은 연결 후 가능해요.',
            );
          } else
            setError(
              '운동 계획을 확인하지 못했어요. 연결 상태를 확인하고 다시 열어주세요.',
            );
        }
      })()
        .catch(() => {
          if (active) setError('기기에 저장된 운동을 확인하지 못했어요.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [owner, date]),
  );

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };
  const showError = (e: unknown) =>
    Alert.alert(
      '저장하지 못했어요',
      e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.',
    );
  const persist = async (
    candidate: RoutineDetail,
    force = false,
  ): Promise<WorkoutPlanDay> => {
    if (!owner || !source || loading || savingLock.current || error)
      throw new Error('연결 상태와 운동 계획을 먼저 확인해 주세요.');
    savingLock.current = true;
    setSaving(true);
    try {
      const changed =
        JSON.stringify(editableRoutine(source)) !== JSON.stringify(candidate);
      const day =
        changed || force || origin === 'selected'
          ? await saveDailyRoutine(date, source, candidate, expectedId)
          : expectedId !== source.id
            ? await assignWorkoutPlan(date, source.id)
            : await getWorkoutPlanDate(date);
      if (useAuthStore.getState().user?.id !== owner)
        throw new Error('로그인 계정이 변경됐어요.');
      if (!day.routine)
        throw new Error('저장된 루틴이 없어요. 다시 확인해 주세요.');
      useTodayRoutineStore.getState().setPlan(day.routine, date);
      setServerDay(day);
      setDraft(editableRoutine(day.routine));
      setExpectedId(day.routine.id);
      await cachePlan(owner, day);
      void useWeeklyPlanStore.getState().loadWeeklyPlan();
      return day;
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  };
  const start = async () => {
    if (savingLock.current) return;
    if (savedWorkout) {
      try {
        if (!owner) throw new Error('로그인이 필요해요.');
        if (await settleStaleWorkout(owner)) {
          useWorkoutDraftStore.getState().clearDraft();
          void flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner).catch(() => {});
          Alert.alert('이전 운동 종료', '이전 날짜의 운동은 기록을 저장하고 종료했어요. 오늘의 운동을 새로 시작해 주세요.');
          return;
        }
        const local = await getLocalWorkout(owner);
        if (!local || local.sessionId !== savedWorkout.sessionId)
          throw new Error('저장한 운동을 찾지 못했어요.');
        // 완료 세트 기준으로 이어할 위치를 다시 계산한다(진행 중이던 세트는 처음부터)
        const position = restoredPosition(local.draft, local.session);
        await savePosition(owner, local.sessionId, position);
        useWorkoutDraftStore.getState().saveDraft(position);
        useTodayRoutineStore
          .getState()
          .setPlan(local.session.routineSnapshot, date);
        setLeaving(true);
        disableRemovalPrevention();
        router.push({ pathname: '/workout-session', params: { resume: '1' } });
      } catch (e) {
        showError(e);
      }
      return;
    }
    if (!draft) return;
    if (date !== today) {
      if (dirty) {
        try {
          await persist(draft);
        } catch (e) {
          showError(e);
        }
      }
      return;
    }
    try {
      await persist(draft);
      setLeaving(true);
      disableRemovalPrevention();
      router.push('/workout-preparation', { dangerouslySingular: true });
    } catch (e) {
      showError(e);
    }
  };
  const toggleReorder = async () => {
    if (reorder && dirty && draft) {
      try {
        await persist(draft);
        setReorder(false);
      } catch (e) {
        showError(e);
      }
    } else setReorder((x) => !x);
  };
  const localMetrics = draft ? estimateRoutineMetrics(draft) : null;
  const metrics =
    !dirty && serverDay?.routine?.id === draft?.id
      ? {
          durationMinutes:
            serverDay?.estimatedMinutes ?? localMetrics?.durationMinutes ?? 0,
          calories: serverDay?.estimatedKcal ?? null,
        }
      : localMetrics;
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          onPress={back}
          style={styles.circle}
        >
          <ArrowLeftIcon color="#0A2E70" size={19} />
        </Pressable>
      </View>
      <ScrollView
        scrollEnabled={!dragging}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 100,
        }}
      >
        <View style={styles.titleSection}>
          {origin === 'recommended' ||
          (source?.type === 'TEMPLATE' && origin !== 'selected') ? (
            <View style={styles.recommendBadge}>
              <Text style={styles.recommendBadgeText}>오늘의 추천</Text>
            </View>
          ) : null}
          <Text style={styles.title}>{draft?.name ?? '오늘의 운동 루틴'}</Text>
          <Text style={styles.description}>
            {draft?.description ||
              '나에게 맞는 운동으로 건강한 습관을 만들어 보세요'}
          </Text>
        </View>
        <View style={styles.body}>
          {error && <Text style={styles.error}>{error}</Text>}
          {pending > 0 && (
            <Text style={styles.syncNotice}>
              운동 기록이 기기에 저장돼 있어요 · 서버 동기화 대기 중
            </Text>
          )}
          {loading && (
            <ActivityIndicator color="#2460E8" style={{ padding: 20 }} />
          )}
          {!loading && !draft && (
            <Text style={styles.empty}>
              선택한 루틴이 없어요. 홈에서 루틴을 선택해 주세요.
            </Text>
          )}
          {draft && (
            <>
              <View style={styles.summary}>
                <RoutineMetrics
                  count={draft.exercises.length}
                  minutes={metrics?.durationMinutes ?? 0}
                  calories={metrics?.calories ?? null}
                  compact
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: reorder }}
                  disabled={
                    saving || loading || Boolean(savedWorkout) || Boolean(error)
                  }
                  onPress={() => void toggleReorder()}
                  style={[styles.reorder, reorder && styles.reorderActive]}
                >
                  <Text style={[styles.reorderText, reorder && styles.blue]}>
                    {reorder ? '✓ 순서 저장' : '≡ 순서 변경'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.list}>
                {draft.exercises.map((exercise) => (
                  <RoutineExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    reorder={reorder}
                    disabled={
                      saving ||
                      loading ||
                      Boolean(savedWorkout) ||
                      Boolean(error)
                    }
                    onPress={() => setEditing(exercise)}
                    onMove={(id, direction) =>
                      setDraft((value) =>
                        value ? moveExercise(value, id, direction) : value,
                      )
                    }
                    onDragging={setDragging}
                  />
                ))}
              </View>
              {!reorder && (
                <View style={styles.rest}>
                  <Text style={styles.restLabel}>종목 간 휴식</Text>
                  <View style={styles.restControls}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="종목 간 휴식 줄이기"
                      disabled={
                        Boolean(savedWorkout) ||
                        saving ||
                        Boolean(error) ||
                        (draft.interExerciseRestSeconds ?? 60) <= 0
                      }
                      onPress={() =>
                        setDraft((value) =>
                          value
                            ? {
                                ...value,
                                interExerciseRestSeconds: Math.max(
                                  0,
                                  (value.interExerciseRestSeconds ?? 60) - 10,
                                ),
                              }
                            : value,
                        )
                      }
                      style={styles.step}
                    >
                      <Text style={styles.stepText}>−</Text>
                    </Pressable>
                    <Text style={styles.restValue}>
                      {formatDuration(draft.interExerciseRestSeconds ?? 60)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="종목 간 휴식 늘리기"
                      disabled={
                        Boolean(savedWorkout) ||
                        saving ||
                        Boolean(error) ||
                        (draft.interExerciseRestSeconds ?? 60) >= 600
                      }
                      onPress={() =>
                        setDraft((value) =>
                          value
                            ? {
                                ...value,
                                interExerciseRestSeconds: Math.min(
                                  600,
                                  (value.interExerciseRestSeconds ?? 60) + 10,
                                ),
                              }
                            : value,
                        )
                      }
                      style={styles.step}
                    >
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {Boolean(savedWorkout) && (
                <Text style={styles.syncNotice}>
                  진행 중인 운동이 있어요. 이어서 완료한 뒤 루틴을 편집할 수
                  있어요.
                </Text>
              )}
              {dirty && (
                <Text style={styles.syncNotice}>
                  변경사항은 선택한 날짜에만 적용돼요.
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
      {draft && (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 18) },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            disabled={
              saving ||
              loading ||
              (!savedWorkout && (Boolean(error) || (date !== today && !dirty)))
            }
            onPress={() => void start()}
            style={[
              styles.start,
              (saving ||
                loading ||
                (!savedWorkout &&
                  (Boolean(error) || (date !== today && !dirty)))) &&
                styles.disabled,
            ]}
          >
            <Text style={styles.startText}>
              {saving
                ? '저장 중…'
                : savedWorkout
                  ? '운동 재개하기'
                  : date !== today
                    ? '변경사항 저장'
                    : reorder
                      ? '시작하기'
                      : '오늘의 운동 시작하기'}
            </Text>
          </Pressable>
          {date !== today && !savedWorkout && (
            <Text style={styles.dateNotice}>
              선택한 날짜에 운동을 시작할 수 있어요.
            </Text>
          )}
        </View>
      )}
      {editing && draft && (
        <ExerciseSetSheet
          key={editing.id}
          exercise={editing}
          canDelete={draft.exercises.length > 1}
          busy={saving}
          onClose={() => setEditing(null)}
          onSave={async (updated) => {
            try {
              await persist({
                ...draft,
                exercises: draft.exercises.map((e) =>
                  e.id === updated.id ? updated : e,
                ),
              });
              setEditing(null);
            } catch (e) {
              showError(e);
            }
          }}
          onDelete={async () => {
            try {
              await persist(withoutExercise(draft, editing.id));
              setEditing(null);
            } catch (e) {
              showError(e);
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F2F2' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  circle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F0F5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 22,
    gap: 9,
  },
  recommendBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#2460E8',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recommendBadgeText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: '#222222',
  },
  description: { fontSize: 12, lineHeight: 19, color: '#777777' },
  body: { padding: 16 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 10,
  },
  reorder: {
    borderWidth: 1,
    borderColor: '#D6D6D6',
    borderRadius: 21,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  reorderActive: { borderColor: '#3972FF', backgroundColor: '#F0F5FF' },
  reorderText: { fontSize: 12, color: '#888888', fontWeight: '500' },
  blue: { color: '#3972FF' },
  list: { gap: 8 },
  rest: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BCCFFF',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  restLabel: { color: '#777777', fontSize: 14 },
  restControls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  step: {
    width: 38,
    height: 42,
    backgroundColor: '#F0F5FF',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: '#2460E8', fontSize: 27 },
  restValue: { fontSize: 18, fontWeight: '600', color: '#222222' },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#F2F2F2' },
  start: {
    backgroundColor: '#245EE5',
    minHeight: 49,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  empty: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 40,
  },
  error: { color: '#AB3B3B', fontSize: 12, lineHeight: 19, marginBottom: 12 },
  syncNotice: { color: '#777777', fontSize: 12, lineHeight: 19, marginTop: 12 },
  dateNotice: {
    color: '#777777',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
});
