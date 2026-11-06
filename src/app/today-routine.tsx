import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
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
  MinusIcon,
  PlusIcon,
} from '@/components/home/HomeIcons';
import { apiFetch } from '@/services/api';
import { getTodayWorkoutPlan } from '@/services/workoutSessionService';
import { cachePlan, clearLocalWorkout, getCachedPlan, getLocalWorkout, isOffline, pendingCount } from '@/services/offlineWorkout';
import { useAuthStore } from '@/stores/useAuthStore';
import { useWorkoutDraftStore } from '@/stores/useWorkoutDraftStore';
import type { BackendRoutineDetail } from '@/types/weeklyPlan';
import {
  useTodayRoutineStore,
  type TodayRoutineSession,
} from '@/stores/useTodayRoutineStore';

const MIN_SETS = 1;
const MAX_SETS = 15;
const MIN_REPS = 1;
const MAX_REPS = 100;

export default function TodayRoutineScreen() {
  const insets = useSafeAreaInsets();

  const owner = useAuthStore(state => state.user?.id);
  const savedWorkout = useWorkoutDraftStore((state) => state.draft);
  const routineTitle = useTodayRoutineStore((state) => state.routineTitle);
  const tags = useTodayRoutineStore((state) => state.tags);
  const sessions = useTodayRoutineStore((state) => state.sessions);
  const routineSnapshot = useTodayRoutineStore((state) => state.routineSnapshot);
  const planDate = useTodayRoutineStore((state) => state.planDate);
  const setPlan = useTodayRoutineStore((state) => state.setPlan);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    const refresh = () => void pendingCount(owner).then(count => { if (active) setPending(count); }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [owner]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!owner) return;
    setLoading(true);
    void (async () => {
      const local = await getLocalWorkout(owner);
      if (local && (local.session.status === 'COMPLETED' || local.session.status === 'ABANDONED')) {
        await clearLocalWorkout(owner, local.sessionId);
        if (mounted) useWorkoutDraftStore.getState().clearDraft();
      } else if (mounted && local) useWorkoutDraftStore.getState().saveDraft(local.draft);
      try {
        const day = await getTodayWorkoutPlan();
        await cachePlan(owner, day);
        if (mounted) { setPlan(day.routine, day.date); setLoadError(null); }
      } catch (error) {
        const cached = isOffline(error) ? await getCachedPlan(owner) : null;
        const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (mounted && cached?.date === today) {
          setPlan(cached.routine, cached.date);
          setLoadError('오프라인: 저장된 오늘의 계획을 보여드려요.');
        } else if (mounted) {
          setPlan(null, '');
          setLoadError('오늘의 계획을 불러오지 못했어요. 온라인에서 계획을 먼저 확인해 주세요.');
        }
      }
    })().catch(() => { if (mounted) setLoadError('기기에 저장된 운동을 읽지 못했어요.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [owner, setPlan]);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftSets, setDraftSets] = useState<number>(3);
  const [draftReps, setDraftReps] = useState<number>(20);

  const editingSession =
    sessions.find((item) => item.id === editingSessionId) ?? null;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/home');
  };

  const handleOpenSessionSheet = (session: TodayRoutineSession) => {
    setEditingSessionId(session.id);
    setDraftSets(session.sets);
    setDraftReps(session.reps);
  };

  const handleCloseSessionSheet = () => {
    setEditingSessionId(null);
  };

  const handleSaveSession = async () => {
    if (!editingSession || !routineSnapshot || !planDate || saving) return;
    setSaving(true);
    try {
      const goal = editingSession.measurementType === 'DURATION'
        ? { targetDurationSeconds: draftReps } : { targetReps: draftReps };
      let updated: BackendRoutineDetail;
      if (routineSnapshot.type === 'TEMPLATE') {
        updated = await apiFetch<BackendRoutineDetail>('/api/v1/routines', {
          method: 'POST', auth: true, body: JSON.stringify({ templateId: routineSnapshot.id,
            exercises: [{ templateExerciseId: editingSession.id, setCount: draftSets, ...goal }] }),
        });
        await apiFetch(`/api/v1/workout-plans/${planDate}`, {
          method: 'PUT', auth: true, body: JSON.stringify({ routineId: updated.id }),
        });
      } else {
        updated = await apiFetch<BackendRoutineDetail>(`/api/v1/routines/${routineSnapshot.id}`, {
          method: 'PATCH', auth: true, body: JSON.stringify({ exercises: [
            { routineExerciseId: editingSession.id, setCount: draftSets, ...goal },
          ] }),
        });
      }
      setPlan(updated, planDate);
      if (owner) await cachePlan(owner, { date: planDate, planId: null, routine: updated });
      setEditingSessionId(null);
    } catch {
      Alert.alert('저장 실패', '운동 설정을 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { setSaving(false); }
  };

  const handleRevertSession = () => {
    if (!editingSession) return;
    setDraftSets(editingSession.defaultSets);
    setDraftReps(editingSession.defaultReps);
  };

  const handleResumeWorkout = async () => {
    if (!savedWorkout || saving) return;
    setSaving(true);
    try {
      if (!owner) throw new Error('로그인이 필요해요.');
      const local = await getLocalWorkout(owner);
      if (!local || local.sessionId !== savedWorkout.sessionId) throw new Error('저장된 운동이 없어요.');
      setPlan(local.session.routineSnapshot, planDate ?? '');
      router.push({ pathname: '/workout-session', params: { resume: '1' } });
    } catch {
      Alert.alert('이어하기 실패', '저장된 운동 세션을 불러오지 못했어요.');
    } finally { setSaving(false); }
  };

  const handleStartWorkout = () => {
    if (savedWorkout) { Alert.alert('진행 중인 운동', '저장된 운동을 먼저 이어서 진행해 주세요.'); return; }
    if (!routineSnapshot || loading || saving) { Alert.alert('운동 계획 없음', '오늘의 운동을 먼저 계획해 주세요.'); return; }
    router.push('/workout-preparation', { dangerouslySingular: true });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      {/* 상단 네비게이션 바 (뒤로가기) */}
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
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 92 },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* 상단 루틴 제목 및 태그 */}
        <View style={styles.titleSection}>
          <Text style={styles.pageTitle}>오늘의 운동 루틴</Text>
          <Text style={styles.routineSubtitle}>{loading ? '운동 계획을 불러오는 중이에요.' : (loadError ?? routineTitle)}</Text>
          {pending > 0 && <Text style={styles.routineSubtitle}>기기에 저장됨 · 서버 동기화 대기 중</Text>}
          <Text style={styles.assessmentNotice}>판정 로직 상태를 표시해요. 앱에서 자세 측정 기능을 연결하고 있어요.</Text>

          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagChipText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        {savedWorkout && (
          <Pressable accessibilityRole="button" disabled={saving} onPress={handleResumeWorkout} style={styles.adjustButton}>
            <Text style={styles.adjustButtonText}>저장한 운동 이어하기</Text>
          </Pressable>
        )}

        {/* 운동 세션 및 휴식 타임라인 리스트 */}
        <View style={styles.sessionList}>
          {sessions.map((session, index) => (
            <React.Fragment key={session.id}>
              {/* 운동 종목 카드 */}
              <View style={styles.exerciseCard}>
                <Text style={styles.exerciseTitle}>{session.name}</Text>
                <Text style={styles.assessmentStatus}>
                  {session.assessmentStatus === 'READY' ? '판정 로직 준비' : session.assessmentStatus ? '판정 로직 준비 중' : '판정 상태 확인 중'}
                </Text>

                <View style={styles.exerciseMetaGroup}>
                  <Text style={styles.exerciseVolumeText}>
                    {`${session.reps}${session.measurementType === 'DURATION' ? '초' : '회'} × ${session.sets}세트`}
                  </Text>
                  <Text style={styles.exerciseRestText}>
                    {`세트 간 ${session.restSeconds}초 휴식`}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${session.name} 세트·횟수 조절`}
                  onPress={() => handleOpenSessionSheet(session)}
                  style={({ pressed }) => [
                    styles.adjustButton,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={styles.adjustButtonText}>세트·횟수 조절</Text>
                </Pressable>
              </View>

              {/* 종목 간 휴식 카드 */}
              {index < sessions.length - 1 ? (
                <View style={styles.restCard}>
                  <Text style={styles.restTitle}>휴식</Text>
                  <Text style={styles.restDesc}>
                    {`종목 간 ${routineSnapshot?.exercises[index]?.sets.at(-1)?.restSeconds ?? session.restSeconds}초 휴식`}
                  </Text>
                </View>
              ) : null}
            </React.Fragment>
          ))}

          {/* 마무리 카드 */}
          <View style={styles.restCard}>
            <Text style={styles.restTitle}>마무리</Text>
            <Text style={styles.restDesc}>스트레칭 및 호흡 정리</Text>
          </View>
        </View>
      </ScrollView>

      {/* 하단 고정 '운동 시작하기' CTA 버튼 */}
      <View
        pointerEvents="box-none"
        style={[
          styles.footer,
          { bottom: Math.max(insets.bottom, 16) },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="운동 시작하기"
          onPress={handleStartWorkout}
          style={({ pressed }) => [
            styles.startButton,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.startButtonText}>운동 시작하기</Text>
        </Pressable>
      </View>

      {/* 세트·횟수 조절 바텀시트 모달 */}
      <Modal
        visible={editingSession !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSessionSheet}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={handleCloseSessionSheet}
          />

          {editingSession ? (
            <View
              style={[
                styles.sheetContainer,
                { paddingBottom: Math.max(insets.bottom, 20) + 8 },
              ]}>
              {/* 상단 그랩 바 */}
              <View style={styles.sheetHandle} />

              {/* 종목 타이틀 & 썸네일 */}
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetTitleGroup}>
                  <Text style={styles.sheetExerciseTitle}>
                    {editingSession.name}
                  </Text>
                  <Text style={styles.sheetExerciseSubtitle}>
                    {editingSession.partAndLevel}
                  </Text>
                </View>

                <View style={styles.sheetThumbnail} />
              </View>

              {/* 세트 수 조절 카드 */}
              <View style={styles.stepperCard}>
                <Text style={styles.stepperLabel}>세트 수</Text>
                <View style={styles.stepperValueRow}>
                  <Text style={styles.stepperValueText}>
                    {`${draftSets}세트`}
                  </Text>

                  <View style={styles.stepperControlPill}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="세트 수 감소"
                      disabled={draftSets <= MIN_SETS}
                      onPress={() =>
                        setDraftSets((prev) => Math.max(MIN_SETS, prev - 1))
                      }
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.pressed,
                      ]}>
                      <MinusIcon
                        color={draftSets <= MIN_SETS ? '#A1A1AA' : '#111111'}
                        size={14}
                      />
                    </Pressable>

                    <View style={styles.stepperDivider} />

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="세트 수 증가"
                      disabled={draftSets >= MAX_SETS}
                      onPress={() =>
                        setDraftSets((prev) => Math.min(MAX_SETS, prev + 1))
                      }
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.pressed,
                      ]}>
                      <PlusIcon
                        color={draftSets >= MAX_SETS ? '#A1A1AA' : '#111111'}
                        size={14}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* 세트당 횟수 조절 카드 */}
              <View style={styles.stepperCard}>
                <Text style={styles.stepperLabel}>{editingSession.measurementType === 'DURATION' ? '세트당 시간' : '세트당 횟수'}</Text>
                <View style={styles.stepperValueRow}>
                  <Text style={styles.stepperValueText}>
                    {`${draftReps}${editingSession.measurementType === 'DURATION' ? '초' : '회'}`}
                  </Text>

                  <View style={styles.stepperControlPill}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="세트당 횟수 감소"
                      disabled={draftReps <= MIN_REPS}
                      onPress={() =>
                        setDraftReps((prev) => Math.max(MIN_REPS, prev - 1))
                      }
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.pressed,
                      ]}>
                      <MinusIcon
                        color={draftReps <= MIN_REPS ? '#A1A1AA' : '#111111'}
                        size={14}
                      />
                    </Pressable>

                    <View style={styles.stepperDivider} />

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="세트당 횟수 증가"
                      disabled={draftReps >= MAX_REPS}
                      onPress={() =>
                        setDraftReps((prev) => Math.min(MAX_REPS, prev + 1))
                      }
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.pressed,
                      ]}>
                      <PlusIcon
                        color={draftReps >= MAX_REPS ? '#A1A1AA' : '#111111'}
                        size={14}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* 세션 저장 버튼 */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="세션 저장"
                onPress={handleSaveSession}
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveSessionButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.saveSessionButtonText}>세션 저장</Text>
              </Pressable>

              {/* 변경사항 되돌리기 */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="변경사항 되돌리기"
                onPress={handleRevertSession}
                style={({ pressed }) => [
                  styles.revertButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.revertButtonText}>변경사항 되돌리기</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  titleSection: {
    marginBottom: 22,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.5,
  },
  routineSubtitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '500',
    color: '#60646C',
    letterSpacing: -0.3,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  tagChip: {
    backgroundColor: '#EBEBED',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  sessionList: {
    gap: 12,
  },
  exerciseCard: {
    backgroundColor: '#E4E4E7',
    borderRadius: 14,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  exerciseTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  assessmentNotice: {
    marginTop: 10,
    fontSize: 13,
    color: '#71717A',
  },
  assessmentStatus: {
    marginTop: 8,
    fontSize: 13,
    color: '#52525B',
  },
  exerciseMetaGroup: {
    marginTop: 12,
    gap: 4,
  },
  exerciseVolumeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#52525B',
    letterSpacing: -0.2,
  },
  exerciseRestText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  adjustButton: {
    marginTop: 16,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.2,
  },
  restCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  restTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  restDesc: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '400',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  footer: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  startButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
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
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 12,
  },
  sheetTitleGroup: {
    flex: 1,
    paddingRight: 16,
  },
  sheetExerciseTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.4,
  },
  sheetExerciseSubtitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '500',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  sheetThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#D9D9D9',
  },
  stepperCard: {
    marginTop: 12,
    backgroundColor: '#F4F4F5',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  stepperLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.2,
  },
  stepperValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  stepperValueText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#52525B',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  stepperControlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E4E4E7',
  },
  stepperButton: {
    width: 44,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#C4C4C8',
  },
  saveSessionButton: {
    marginTop: 26,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveSessionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  revertButton: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revertButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  pressed: {
    opacity: 0.75,
  },
});
