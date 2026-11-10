/** 서버 운동 세션과 코칭 연결 화면. AI 측정 결과 연동 전에는 세트 완료를 추정하지 않습니다. */
import type { PoseFrame } from '@barofit/pose';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrepColors } from '@/components/workout-preparation/palette';
import { CountdownView } from '@/components/workout-session/CountdownView';
import { ExerciseCameraArea } from '@/components/workout-session/ExerciseCameraArea';
import { ExerciseStatusPanel } from '@/components/workout-session/ExerciseStatusPanel';
import { PauseView } from '@/components/workout-session/PauseView';
import { PhaseTimer } from '@/components/workout-session/PhaseTimer';
import {
  EXERCISES,
  RESUME_COUNTDOWN_SECONDS,
  type ExerciseConfig,
  type RoutineItem,
} from '@/components/workout-session/sessionConfig';
import {
  INITIAL_PHASE,
  nextPhase,
  phaseDurationSeconds,
  type ActivePhase,
  type SessionPhase,
} from '@/components/workout-session/sessionFlow';
import { StopConfirmSheet } from '@/components/workout-session/StopConfirmSheet';
import { WorkoutCompleteView } from '@/components/workout-session/WorkoutCompleteView';
import { createWorkoutSessionDraft, type WorkoutSessionSync, type WorkoutStatus } from '@/services/workoutSessionService';
import { clearLocalWorkout, flushWorkoutQueue, getLocalWorkout, pendingCount, queueSession, savePosition } from '@/services/offlineWorkout';
import { createExerciseAnalyzer, createPosePipeline } from '@/services/posePipeline';
import { useAuthStore } from '@/stores/useAuthStore';
import type { WorkoutDraft } from '@/stores/useWorkoutDraftStore';
import { connectSessionCoach } from '@/services/ttsService';
import { useTtsStore } from '@/stores/useTtsStore';
import { useTodayRoutineStore } from '@/stores/useTodayRoutineStore';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';
import { useWorkoutDraftStore } from '@/stores/useWorkoutDraftStore';

/**
 * none: 정상 진행 / paused: 일시 정지 화면 / stop-confirm: 중단 확인 시트 /
 * resuming: 운동 재개 전 5초 카운트다운 (Phase 타이머는 계속 정지 상태)
 */
type PauseState = 'none' | 'paused' | 'stop-confirm' | 'resuming';

/**
 * 일시 정지 상태가 바뀐 직후 이 시간 동안은 화면 탭을 무시합니다.
 * (예: X를 빠르게 두 번 탭 → 일시 정지 직후 같은 위치의 X가 다시 눌려 중단 시트가 열리는 것 방지)
 */
const TAP_LOCK_MS = 400;

/** 운동 완료 화면을 보여준 뒤 결과 화면(F01)으로 넘어가기까지의 시간 */
const RESULT_ENTRY_DELAY_MS = 1200;

/** 일시 정지 화면·중단 시트에 표시할 진행 상태 문구 */
function describePause(phase: ActivePhase, exerciseName: string) {
  switch (phase.kind) {
    case 'exercising':
      return {
        set: phase.set,
        subtitle: `세트 ${phase.set} 진행 중`,
        statusText: `${exerciseName} · ${phase.set}세트 진행 중`,
      };
    case 'countdown':
      return {
        set: phase.set,
        subtitle: `세트 ${phase.set} 시작 전`,
        statusText: `${exerciseName} · ${phase.set}세트 시작 전`,
      };
    case 'resting':
      return {
        set: phase.completedSet,
        subtitle: `세트 ${phase.completedSet} 완료 · 휴식 중`,
        statusText: `${exerciseName} · ${phase.completedSet}세트 완료`,
      };
  }
}

export default function WorkoutSessionScreen() {
  const insets = useSafeAreaInsets();
  const owner = useAuthStore(state => state.user?.id);
  const params = useLocalSearchParams<{ resume?: string }>();
  const resumeDraft = useRef(params.resume === '1' ? useWorkoutDraftStore.getState().draft : null);
  const initialPhase: SessionPhase = !resumeDraft.current ? INITIAL_PHASE
    : resumeDraft.current.phase === 'resting'
      ? { id: 0, kind: 'resting', exerciseIndex: resumeDraft.current.exerciseIndex, completedSet: resumeDraft.current.set }
      : { id: 0, kind: resumeDraft.current.phase, exerciseIndex: resumeDraft.current.exerciseIndex, set: resumeDraft.current.set };
  const sessions = useTodayRoutineStore((state) => state.sessions);
  const snapshot = useTodayRoutineStore((state) => state.routineSnapshot);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const serverSession = useRef<{ sessionId: string; session: WorkoutSessionSync } | null>(null);
  const startPromise = useRef<Promise<{ sessionId: string; session: WorkoutSessionSync }> | null>(null);
  const updateQueue = useRef<Promise<void>>(Promise.resolve());
  const running = useRef<{ started: number; kind: 'active' | 'rest' } | null>(null);
  const remainingRef = useRef(resumeDraft.current?.remainingSeconds ?? 0);
  const positionRef = useRef<WorkoutDraft | null>(resumeDraft.current);
  const coachCleanup = useRef<(() => void) | null>(null);
  const coachAttempting = useRef(false);
  const elapsed = useRef({ activeMs: 0, restMs: 0 });
  const phaseRef = useRef<SessionPhase>(initialPhase);

  const currentElapsed = useCallback(() => {
    const value = { ...elapsed.current };
    if (running.current) {
      const delta = Math.max(0, Date.now() - running.current.started);
      if (running.current.kind === 'active') value.activeMs += delta;
      else value.restMs += delta;
    }
    return value;
  }, []);
  const updateServerStatus = useCallback((status: WorkoutStatus) => {
    const operation = updateQueue.current.then(async () => {
      const currentRef = serverSession.current;
      if (!currentRef || !owner || !positionRef.current) throw new Error('운동 세션이 아직 준비되지 않았어요.');
      const local = await getLocalWorkout(owner);
      if (!local || local.sessionId !== currentRef.sessionId) throw new Error('저장된 운동 세션을 찾지 못했어요.');
      const current = { sessionId: local.sessionId, session: local.session };
      const duration = currentElapsed();
      const next: WorkoutSessionSync = { ...current.session, status, revision: current.session.revision + 1,
        endedAt: status === 'COMPLETED' || status === 'ABANDONED' ? new Date().toISOString() : null,
        activeDurationSeconds: Math.floor(duration.activeMs / 1000),
        restDurationSeconds: Math.floor(duration.restMs / 1000) };
      await queueSession(owner, current.sessionId, next, positionRef.current);
      serverSession.current = { sessionId: current.sessionId, session: next };
      void flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner).catch(() => {});
    });
    updateQueue.current = operation.catch(() => {});
    return operation;
  }, [owner, currentElapsed]);

  useEffect(() => {
    let cancelled = false;
    if (!snapshot) { setSessionError('오늘의 운동 계획을 먼저 선택해 주세요.'); return; }
    if (!owner) { setSessionError('로그인이 필요해요.'); return; }
    if (!startPromise.current) {
      if (resumeDraft.current) {
        const saved = resumeDraft.current;
        startPromise.current = getLocalWorkout(owner).then(local => {
          if (!local || local.sessionId !== saved.sessionId || local.session.routineId !== snapshot.id ||
              local.session.status === 'COMPLETED' || local.session.status === 'ABANDONED')
            throw new Error('이어갈 수 없는 세션입니다.');
          positionRef.current = local.draft;
          return { sessionId: local.sessionId, session: local.session };
        });
      } else {
        const draft = createWorkoutSessionDraft(snapshot);
        const first = snapshot.exercises[0];
        if (!first) { setSessionError('운동 종목이 없어요.'); return; }
        const currentSessions = useTodayRoutineStore.getState().sessions;
        const position: WorkoutDraft = { sessionId: draft.sessionId, routineId: snapshot.id,
          exerciseIndex: 0, totalExercises: snapshot.exercises.length, exerciseId: first.exerciseId,
          exerciseName: first.name, phase: 'countdown', set: 1, totalSets: first.sets.length,
          reps: null, targetReps: first.sets[0]?.targetReps ?? 0,
          remainingSeconds: phaseDurationSeconds(INITIAL_PHASE, currentSessions.map(s => ({ exerciseId: s.exerciseId, sets: s.sets }))) ?? 0,
          savedAt: new Date().toISOString(), activeDurationSeconds: 0, restDurationSeconds: 0 };
        positionRef.current = position;
        remainingRef.current = position.remainingSeconds;
        startPromise.current = getLocalWorkout(owner)
          .then(async (local) => {
            if (local && local.sessionId !== draft.sessionId) {
              await clearLocalWorkout(owner, local.sessionId);
            }
            await queueSession(owner, draft.sessionId, draft.session, position);
            return draft;
          });
      }
    }
    startPromise.current.then((draft) => {
      if (cancelled) return;
      serverSession.current = draft;
      elapsed.current = { activeMs: (positionRef.current?.activeDurationSeconds ?? draft.session.activeDurationSeconds) * 1000,
        restMs: (positionRef.current?.restDurationSeconds ?? draft.session.restDurationSeconds ?? 0) * 1000 };
      setSessionReady(true);
      coachAttempting.current = true;
      flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner).then(() => connectSessionCoach(draft.sessionId)).then((cleanup) => {
        if (cancelled) { cleanup(); return; }
        coachCleanup.current = cleanup;
        const current = phaseRef.current;
        if (!resumeDraft.current && current.kind !== 'completed') {
          const exercise = snapshot.exercises[current.exerciseIndex];
          if (exercise) useTtsStore.getState().sendCoachEvent({ eventType: 'EXERCISE_START', exerciseId: exercise.exerciseId });
        }
      }).catch(() => {
        if (cancelled) return;
        const current = phaseRef.current;
        if (current.kind !== 'completed') {
          const intro = snapshot.exercises[current.exerciseIndex]?.introTtsText;
          if (intro) useTtsStore.getState().playSpeech(intro, 'EXERCISE_START');
        }
      }).finally(() => { coachAttempting.current = false; });
    }).catch(() => { if (!cancelled) setSessionError('운동 세션을 저장하지 못했어요. 연결을 확인한 후 다시 시작해 주세요.'); });
    return () => { cancelled = true; coachCleanup.current?.(); coachCleanup.current = null; };
  }, [snapshot, owner]);

  // Reconnect after an offline workout without interrupting local speech or delaying the session.
  useEffect(() => {
    if (!sessionReady || !owner) return;
    let disposed = false;
    const reconnect = () => {
      const session = serverSession.current;
      const state = useTtsStore.getState().socketStatus;
      if (disposed || coachAttempting.current || !session || state === 'connected' || state === 'connecting') return;
      coachAttempting.current = true;
      void flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner)
        .then(() => {
          if (disposed || useAuthStore.getState().user?.id !== owner) return null;
          return connectSessionCoach(session.sessionId);
        }).then(cleanup => {
          if (!cleanup) return;
          if (disposed) cleanup();
          else coachCleanup.current = cleanup;
        }).catch(() => {}).finally(() => { coachAttempting.current = false; });
    };
    const timer = setInterval(reconnect, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') reconnect(); });
    return () => { disposed = true; clearInterval(timer); subscription.remove(); };
  }, [sessionReady, owner]);

  const activeRoutine = useMemo<readonly RoutineItem[]>(
    () =>
      sessions.map((s, index) => ({ exerciseId: s.exerciseId, sets: s.sets, targets: snapshot?.exercises[index]?.sets })),
    [sessions, snapshot],
  );

  /** 현재 Phase의 종목 데이터 (오늘의 운동 루틴에서 설정한 세트/횟수 반영) */
  const resolveExercise = useCallback(
    (current: ActivePhase): ExerciseConfig => {
      const session = sessions[current.exerciseIndex];
      const exerciseId = session?.exerciseId ?? activeRoutine[current.exerciseIndex]?.exerciseId ?? '';
      const base = EXERCISES[exerciseId] ?? { id: exerciseId, name: session?.name ?? exerciseId,
        targetReps: session?.reps ?? 0, cameraView: 'side' as const };
      return {
        ...base,
        name: session?.name ?? base.name,
        targetReps: session?.reps ?? base.targetReps,
      };
    },
    [sessions, activeRoutine],
  );

  const [phase, setPhase] = useState<SessionPhase>(initialPhase);
  const [pause, setPause] = useState<PauseState>(resumeDraft.current ? 'paused' : 'none');
  const [exiting, setExiting] = useState(false);
  const [currentReps, setCurrentReps] = useState<number | null>(null);
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | 'both'>('both');
  const poseSetRef = useRef<{
    phaseId: number;
    setNumber: number;
    routineSetId: string;
    exerciseId: string;
    pipeline: ReturnType<typeof createPosePipeline>;
    frameCount: number;
    lastValue: number | null;
    finishing: boolean;
  } | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
    setCurrentReps(null);
    setSelectedSide('both');
  }, [phase]);
  useEffect(() => {
    if (!sessionReady || pause !== 'none' || phase.kind === 'completed') return;
    const kind = phase.kind === 'exercising' ? 'active'
      : phase.kind === 'resting' || (phase.kind === 'countdown' && phase.exerciseIndex > 0 && phase.set === 1) ? 'rest' : null;
    if (!kind) return;
    running.current = { started: Date.now(), kind };
    return () => {
      if (!running.current) return;
      const duration = Math.max(0, Date.now() - running.current.started);
      if (running.current.kind === 'active') elapsed.current.activeMs += duration;
      else elapsed.current.restMs += duration;
      running.current = null;
    };
  }, [phase, pause, sessionReady]);

  useEffect(() => {
    if (!sessionReady || pause !== 'none' || phase.kind !== 'countdown' || phase.set !== 1 || phase.exerciseIndex === 0) return;
    const exercise = snapshot?.exercises[phase.exerciseIndex];
    if (exercise && !useTtsStore.getState().sendCoachEvent({ eventType: 'EXERCISE_START', exerciseId: exercise.exerciseId })) {
      if (exercise.introTtsText) useTtsStore.getState().playSpeech(exercise.introTtsText, 'EXERCISE_START');
    }
  }, [phase, pause, sessionReady, snapshot]);
  const checkpoint = useCallback((remainingSeconds: number) => {
    remainingRef.current = remainingSeconds;
    const current = serverSession.current;
    if (!owner || !current || phase.kind === 'completed') return;
    const exercise = resolveExercise(phase);
    const duration = currentElapsed();
    const position: WorkoutDraft = { sessionId: current.sessionId, routineId: current.session.routineId,
      exerciseIndex: phase.exerciseIndex, totalExercises: activeRoutine.length, exerciseId: exercise.id,
      exerciseName: exercise.name, phase: phase.kind, set: describePause(phase, exercise.name).set,
      totalSets: activeRoutine[phase.exerciseIndex]?.sets ?? 1, reps: null, targetReps: exercise.targetReps,
      remainingSeconds, savedAt: new Date().toISOString(),
      activeDurationSeconds: Math.floor(duration.activeMs / 1000), restDurationSeconds: Math.floor(duration.restMs / 1000) };
    positionRef.current = position;
    void savePosition(owner, current.sessionId, position).catch(() => Alert.alert('저장 실패', '기기에 운동 진행 상태를 저장하지 못했어요.'));
  }, [owner, phase, resolveExercise, activeRoutine, currentElapsed]);
  const exitingRef = useRef(false);

  // 일시 정지 상태를 바꾼 시각. 렌더·effect를 기다리지 않도록 전환을 요청하는 즉시 기록
  const pauseChangedAtRef = useRef(0);
  const markPauseChange = useCallback(() => {
    pauseChangedAtRef.current = Date.now();
  }, []);
  /** 방금 화면이 바뀌어 탭을 무시해야 하면 true */
  const isTapLocked = useCallback(() => Date.now() - pauseChangedAtRef.current < TAP_LOCK_MS, []);

  // 타이머가 끝난 Phase의 id를 받아 다음 Phase로 전환. 이미 지나간 Phase면 무시(중복 완료 방지)
  const completePhase = useCallback(
    (finishedId: number) => {
      setPhase((current) =>
        current.id === finishedId ? nextPhase(current, activeRoutine) : current,
      );
    },
    [activeRoutine],
  );

  const finishCurrentPoseSet = useCallback(
    (finishedPhaseId: number) => {
      const activeSet = poseSetRef.current;
      if (!activeSet || activeSet.phaseId !== finishedPhaseId || activeSet.finishing || !owner) return;
      activeSet.finishing = true;
      const operation = updateQueue.current.then(async () => {
        const completed = await activeSet.pipeline.finish();
        const local = await getLocalWorkout(owner);
        if (local && serverSession.current && local.sessionId === serverSession.current.sessionId) {
          serverSession.current = { sessionId: local.sessionId, session: local.session };
        }
        const summary = completed.summary as { count?: number | null; holdSeconds?: number | null } | undefined;
        useTtsStore.getState().sendCoachEvent({
          eventType: 'SET_FEEDBACK',
          exerciseId: activeSet.exerciseId,
          actualReps: typeof summary?.count === 'number' ? summary.count : undefined,
          actualDurationSeconds:
            typeof summary?.holdSeconds === 'number' ? Math.floor(summary.holdSeconds) : undefined,
        });
        completePhase(finishedPhaseId);
      });
      updateQueue.current = operation.catch((err) => {
        activeSet.finishing = false;
        if (__DEV__) console.warn('[WorkoutSession] finishCurrentPoseSet failed', err);
      });
    },
    [owner, completePhase],
  );

  const handlePoseFrame = useCallback(
    (frame: PoseFrame) => {
      const currentPhase = phaseRef.current;
      if (currentPhase.kind !== 'exercising' || pause !== 'none' || !owner || !serverSession.current || !snapshot) {
        return;
      }
      let activeSet = poseSetRef.current;
      if (!activeSet || activeSet.phaseId !== currentPhase.id) {
        const routineExercise = snapshot.exercises[currentPhase.exerciseIndex];
        const routineSet = routineExercise?.sets[currentPhase.set - 1];
        if (!routineExercise || !routineSet) return;
        const analyzer = createExerciseAnalyzer(routineExercise.exerciseId);
        if (!analyzer) return;
        const pipeline = createPosePipeline({
          analyzer,
          owner,
          sessionId: serverSession.current.sessionId,
          routineSetId: routineSet.id,
          resultId: randomUUID(),
          isOwner: () => useAuthStore.getState().user?.id === owner,
          sendCoach: (event) => useTtsStore.getState().sendCoachEvent(event),
          speak: (text) => useTtsStore.getState().playSpeech(text, 'REP_FEEDBACK'),
        });
        activeSet = {
          phaseId: currentPhase.id,
          setNumber: currentPhase.set,
          routineSetId: routineSet.id,
          exerciseId: routineExercise.exerciseId,
          pipeline,
          frameCount: 0,
          lastValue: null,
          finishing: false,
        };
        poseSetRef.current = activeSet;
      }
      if (activeSet.finishing) return;

      try {
        const output = activeSet.pipeline.pushFrame(frame);
        activeSet.frameCount += 1;

        const side = (output as { side?: string | null }).side;
        if (side === 'left' || side === 'right' || side === 'both') {
          setSelectedSide((prev) => (prev === side ? prev : side));
        }

        const measured =
          typeof output.count === 'number'
            ? output.count
            : typeof output.holdSeconds === 'number'
              ? Math.floor(output.holdSeconds)
              : null;

        if (measured !== null && measured !== activeSet.lastValue) {
          activeSet.lastValue = measured;
          setCurrentReps(measured);
        }

        const exercise = resolveExercise(currentPhase);
        if (
          typeof output.count === 'number' &&
          exercise.targetReps > 0 &&
          output.count >= exercise.targetReps
        ) {
          finishCurrentPoseSet(currentPhase.id);
        }
      } catch (err) {
        if (__DEV__) console.warn('[WorkoutSession] pose frame error', err);
      }
    },
    [owner, pause, snapshot, resolveExercise, finishCurrentPoseSet],
  );

  if (__DEV__) console.log('[WorkoutSession]', phase, pause);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, []);

  // 상태 전환은 모두 "현재 상태가 기대한 값일 때만" 적용 → 연속 탭에도 한 번만 전환
  const requestPause = useCallback(() => {
    markPauseChange();
    poseSetRef.current?.pipeline.pause();
    setPause(p => (p === 'none' || p === 'resuming' ? 'paused' : p));
    if (serverSession.current) void updateServerStatus('PAUSED').catch(() => Alert.alert('동기화 실패', '운동 일시 정지 상태를 저장하지 못했어요.'));
  }, [markPauseChange, updateServerStatus]);
  const resume = useCallback(() => {
    if (isTapLocked()) return;
    markPauseChange();
    // 운동 중이었다면 재개 카운트다운, 시작·휴식 카운트다운 중이었다면 바로 이어서
    setPause(p => (p !== 'paused' ? p : phase.kind === 'exercising' ? 'resuming' : 'none'));
    void updateServerStatus('ACTIVE').catch(() => Alert.alert('동기화 실패', '운동 재개 상태를 저장하지 못했어요.'));
  }, [phase.kind, isTapLocked, markPauseChange, updateServerStatus]);
  const finishResumeCountdown = useCallback(() => {
    markPauseChange();
    setPause(p => (p === 'resuming' ? 'none' : p));
  }, [markPauseChange]);
  const openStopConfirm = useCallback(() => {
    if (isTapLocked()) return;
    markPauseChange();
    setPause(p => (p === 'paused' ? 'stop-confirm' : p));
  }, [isTapLocked, markPauseChange]);
  const cancelStop = useCallback(() => {
    if (isTapLocked()) return;
    markPauseChange();
    setPause(p => (p === 'stop-confirm' ? 'paused' : p));
  }, [isTapLocked, markPauseChange]);

  /** 상단 X · Android 뒤로가기 */
  const handleClose = useCallback(() => {
    if (exitingRef.current || isTapLocked()) return;
    if (phase.kind === 'completed') {
      // 결과 화면 자동 이동과 겹치지 않도록 잠금
      exitingRef.current = true;
      close();
    }
    else if (pause === 'paused') openStopConfirm();
    else if (pause !== 'stop-confirm') requestPause(); // 시트가 열려 있으면 Modal이 뒤로가기를 처리
  }, [phase.kind, pause, close, openStopConfirm, requestPause, isTapLocked]);

  const saveAndExit = useCallback(
    (remainingSeconds: number) => {
      if (exitingRef.current || isTapLocked() || phase.kind === 'completed') return;
      exitingRef.current = true;
      setExiting(true);
      const exercise = resolveExercise(phase);
      const current = serverSession.current;
      if (!current) { exitingRef.current = false; setExiting(false); return; }
      const draft = {
        sessionId: current.sessionId,
        routineId: current.session.routineId,
        exerciseIndex: phase.exerciseIndex,
        totalExercises: activeRoutine.length,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        phase: phase.kind,
        set: describePause(phase, exercise.name).set,
        totalSets: activeRoutine[phase.exerciseIndex]?.sets ?? 1,
        reps: null,
        targetReps: exercise.targetReps,
        remainingSeconds,
        savedAt: new Date().toISOString(),
      };
      checkpoint(remainingSeconds);
      void updateServerStatus('PAUSED').then(async () => {
        const saved = positionRef.current ?? draft;
        if (owner) await savePosition(owner, current.sessionId, saved);
        useWorkoutDraftStore.getState().saveDraft(saved);
        close();
      }).catch(() => {
        exitingRef.current = false; setExiting(false);
        Alert.alert('저장 실패', '운동 상태를 저장하지 못했어요. 연결 후 다시 시도해 주세요.');
      });
    },
    [phase, close, isTapLocked, resolveExercise, activeRoutine, updateServerStatus, checkpoint, owner]
  );

  // 모델이 연결되기 전에는 측정 결과를 만들어 내지 않습니다.
  useEffect(() => {
    if (phase.kind !== 'completed' || !sessionReady) return;
    let cancelled = false;
    updateServerStatus('COMPLETED').then(async () => {
      useTtsStore.getState().sendCoachEvent({ eventType: 'WORKOUT_FINISH' });
      const current = serverSession.current;
      if (!owner || !current) throw new Error('운동 세션을 찾지 못했어요.');
      const hasResult = current.session.sets.some(set => (set.actualReps ?? 0) > 0 || (set.actualDurationSeconds ?? 0) > 0);
      await clearLocalWorkout(owner, current.sessionId);
      useWorkoutDraftStore.getState().clearDraft();
      let uploaded = false;
      try {
        await flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner);
        if (await pendingCount(owner)) await flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner);
        uploaded = await pendingCount(owner) === 0;
      } catch { /* The persisted queue will retry once connectivity returns. */ }
      if (!cancelled) setTimeout(() => {
        if (cancelled || exitingRef.current) return;
        exitingRef.current = true;
        if (uploaded && hasResult) {
          useWorkoutResultStore.getState().openApiSession(current.sessionId, 'workout');
          router.replace('/workout-result');
        } else {
          Alert.alert('운동 종료', uploaded ? '운동 세션을 저장했어요.' : '운동 기록은 기기에 보관됐어요. 연결되면 동기화합니다.');
          router.replace('/home');
        }
      }, RESULT_ENTRY_DELAY_MS);
    }).catch(() => { if (!cancelled) Alert.alert('저장 실패', '운동 종료 상태를 저장하지 못했어요.'); });
    return () => { cancelled = true; };
  }, [phase.kind, sessionReady, updateServerStatus, owner]);

  // 앱이 백그라운드로 가면 일시 정지 (복귀 후에는 사용자가 '운동 이어하기'로 재개)
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') { checkpoint(remainingRef.current); requestPause(); }
    });
    return () => sub.remove();
  }, [requestPause, checkpoint]);

  // Android 하드웨어 뒤로가기 → 상단 X와 동일하게 처리
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [handleClose]);

  const renderExercise = (exercise: (typeof EXERCISES)[keyof typeof EXERCISES], remainingSeconds: number) => (
    <View style={styles.screen}>
      <ExerciseCameraArea
        onPressClose={handleClose}
        onPoseFrame={handlePoseFrame}
        selectedSide={selectedSide}
      />
      <ExerciseStatusPanel
        exerciseName={exercise.name}
        currentReps={currentReps}
        targetReps={exercise.targetReps}
        measurementType={sessions[phase.kind === 'completed' ? 0 : phase.exerciseIndex]?.measurementType}
        remainingSeconds={remainingSeconds}
        bottomInset={insets.bottom}
      />
    </View>
  );

  const renderPhase = (current: ActivePhase, remainingSeconds: number) => {
    const exercise = resolveExercise(current);
    switch (current.kind) {
      case 'countdown':
        return (
          <CountdownView
            // 디자인: 종목의 첫 세트는 "세션 N"(종목 순서), 이후 세트는 "세트 N"
            subtitle={current.set === 1 ? `세션 ${current.exerciseIndex + 1}` : `세트 ${current.set}`}
            title={exercise.name}
            remainingSeconds={remainingSeconds}
            onPressClose={handleClose}
          />
        );
      case 'resting':
        return (
          <CountdownView
            subtitle={`세트 ${current.completedSet} 완료`}
            title="휴식"
            remainingSeconds={remainingSeconds}
            onPressClose={handleClose}
          />
        );
      case 'exercising':
        return renderExercise(exercise, remainingSeconds);
    }
  };

  const renderPaused = (current: ActivePhase, remainingSeconds: number) => {
    const exercise = resolveExercise(current);
    const info = describePause(current, exercise.name);
    if (pause === 'resuming') {
      return (
        <PhaseTimer durationSeconds={RESUME_COUNTDOWN_SECONDS} onComplete={finishResumeCountdown}>
          {resumeSeconds => (
            <CountdownView
              subtitle={info.subtitle}
              title={exercise.name}
              remainingSeconds={resumeSeconds}
              onPressClose={handleClose}
            />
          )}
        </PhaseTimer>
      );
    }
    return (
      <>
        <PauseView
          subtitle={info.subtitle}
          statusText={info.statusText}
          reps={currentReps}
          targetReps={exercise.targetReps}
          onPressStop={openStopConfirm}
          onPressResume={resume}
          onPressClose={handleClose}
        />
        <StopConfirmSheet
          visible={pause === 'stop-confirm'}
          statusText={info.statusText}
          reps={currentReps}
          targetReps={exercise.targetReps}
          busy={exiting}
          onConfirm={() => saveAndExit(remainingSeconds)}
          onCancel={cancelStop}
        />
      </>
    );
  };

  const duration = resumeDraft.current && phase.id === 0
    ? resumeDraft.current.remainingSeconds : phaseDurationSeconds(phase, activeRoutine);

  return (
    <>
      <StatusBar style="dark" />
      {!sessionReady ? (
        <View style={[styles.screen, { paddingTop: insets.top + 30, paddingHorizontal: 20 }]}>
          <Text>{sessionError ?? '운동 세션을 준비하고 있어요.'}</Text>
          {sessionError && <Pressable onPress={close}><Text>돌아가기</Text></Pressable>}
        </View>
      ) : phase.kind === 'completed' || duration === null ? (
        // 카메라를 끄고 완료 화면만 표시 → RESULT_ENTRY_DELAY_MS 뒤 결과 화면으로 이동
        <WorkoutCompleteView onPressClose={handleClose} />
      ) : (
        <PhaseTimer
          key={phase.id}
          durationSeconds={duration}
          paused={pause !== 'none'}
          onTick={checkpoint}
          onComplete={() => {
            if (phase.kind === 'exercising') {
              const activeSet = poseSetRef.current;
              if (activeSet && activeSet.phaseId === phase.id && activeSet.frameCount > 0) {
                finishCurrentPoseSet(phase.id);
                return;
              }
              requestPause();
              Alert.alert('자세 측정 연결 대기', 'AI 모델이 연결되면 세트 수행 결과를 기록할 수 있어요.');
              return;
            }
            completePhase(phase.id);
          }}>
          {remainingSeconds =>
            pause === 'none' ? renderPhase(phase, remainingSeconds) : renderPaused(phase, remainingSeconds)
          }
        </PhaseTimer>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PrepColors.cameraBackground },
});
