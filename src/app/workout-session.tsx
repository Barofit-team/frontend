/** 서버 운동 세션과 코칭 연결 화면. AI 측정 결과 연동 전에는 세트 완료를 추정하지 않습니다. */
import { SESSION_CONFIG, type PoseFrame, type SessionPhase as ControllerPhase, type SessionState as ControllerState } from '@barofit/pose';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrepColors } from '@/components/workout-preparation/palette';
import { ExerciseCameraArea } from '@/components/workout-session/ExerciseCameraArea';
import { AutoPauseOverlay } from '@/components/workout-session/AutoPauseOverlay';
import { PhaseTimer } from '@/components/workout-session/PhaseTimer';
import { SessionStage } from '@/components/workout-session/SessionStage';
import { SessionColors } from '@/components/workout-session/sessionPalette';
import { countSets, estimateRemainingSeconds, recognitionGuideText, routineSummaryOf } from '@/components/workout-session/sessionProgress';
import {
  EXERCISES,
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
import { WorkoutCompleteView } from '@/components/workout-session/WorkoutCompleteView';
import { createWorkoutSessionDraft, type WorkoutSessionSync, type WorkoutStatus } from '@/services/workoutSessionService';
import { clearLocalWorkout, flushWorkoutQueue, getLocalWorkout, pendingCount, queueSession, savePosition, settleStaleWorkout } from '@/services/offlineWorkout';
import { kstDateOf, kstDateOfIso } from '@/services/kstDate';
import { createExerciseAnalyzer, createPosePipeline } from '@/services/posePipeline';
import { SESSION_WATCHDOG_MS, sessionNow } from '@/services/sessionClock';
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

/** 목표값을 읽을 세트 번호. 휴식 중에는 휴식 뒤 이어질 같은 종목의 다음 세트 */
function targetSetNumber(phase: ActivePhase) {
  return phase.kind === 'resting' ? phase.completedSet + 1 : phase.set;
}

const isTargetReps = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/**
 * 현재 세트의 목표 횟수. REPS 종목이 아니거나 목표를 결정할 수 없으면 null (임의 목표로 세트를 완료하지 않는다).
 *  - 서버 snapshot 세트 목표가 있으면 해당 세트의 targetReps
 *  - 명시적 로컬 세트 증가(세트 수 > 서버 세트 수)로 생긴 세트만 백엔드 정책과 같이 마지막 세트 목표를 복사
 *  - snapshot 세트 목표가 아예 없는 DEV·기존 테스트 환경만 종목 단위 목표(session.reps) 사용
 *  - 그 외 목표 누락·배열 길이 불일치는 다른 세트 값으로 대체하지 않는다
 */
function resolveTargetReps(
  item: RoutineItem | undefined,
  session: { sets: number; defaultSets: number; reps: number; measurementType: 'REPS' | 'DURATION' } | undefined,
  setNumber: number,
): number | null {
  if (session?.measurementType !== 'REPS') return null;
  const targets = item?.targets;
  if (!targets) return isTargetReps(session.reps) ? session.reps : null;
  const target = targets[setNumber - 1];
  if (target) return isTargetReps(target.targetReps) ? target.targetReps : null;
  const locallyAdded = session.sets > session.defaultSets && targets.length === session.defaultSets
    && setNumber > targets.length && setNumber <= session.sets;
  const last = targets.at(-1)?.targetReps;
  return locallyAdded && isTargetReps(last) ? last : null;
}

export default function WorkoutSessionScreen() {
  const insets = useSafeAreaInsets();
  const owner = useAuthStore(state => state.user?.id);
  const params = useLocalSearchParams<{ resume?: string }>();
  const resumeDraft = useRef(params.resume === '1' ? useWorkoutDraftStore.getState().draft : null);
  /**
   * 앱을 나갔다가 이어하는 세션에서 운동 중이던 세트는 처음부터 다시 한다(새 Controller·분석기는 측정값 0에서 시작하므로 타이머도 전체 시간).
   * 휴식·시작 카운트다운(측정 없는 단계)만 저장된 남은 시간을 이어간다. 화면 안의 일시정지·재개는 phase가 바뀌지 않아 영향 없다.
   */
  const resumeRemainingSeconds = resumeDraft.current && resumeDraft.current.phase !== 'exercising'
    ? resumeDraft.current.remainingSeconds : null;
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
  const remainingRef = useRef(resumeRemainingSeconds ?? 0);
  const positionRef = useRef<WorkoutDraft | null>(resumeDraft.current);
  const coachCleanup = useRef<(() => void) | null>(null);
  const coachAttempting = useRef(false);
  const elapsed = useRef({ activeMs: 0, restMs: 0 });
  const phaseRef = useRef<SessionPhase>(initialPhase);

  // 카메라 바인딩과 TTS 시작이 같은 타이밍에 몰리면(기기 쪽 리소스 경합) 카메라가 잠깐
  // 끊겼다 자동 복구되는 현상이 있어, 첫 안내 음성은 카메라가 준비된 뒤로 미룬다.
  const [cameraReady, setCameraReadyState] = useState(false);
  const cameraReadyRef = useRef(false);
  const pendingCameraReadyAction = useRef<(() => void) | null>(null);
  const handleCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
    setCameraReadyState(true);
  }, []);
  const runWhenCameraReady = useCallback((action: () => void) => {
    if (cameraReadyRef.current) action();
    else pendingCameraReadyAction.current = action;
  }, []);
  useEffect(() => {
    if (!cameraReady) return;
    const action = pendingCameraReadyAction.current;
    if (action) {
      pendingCameraReadyAction.current = null;
      action();
    }
  }, [cameraReady]);

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
          // 날짜 경계(Asia/Seoul): 이전 날짜에 시작한 세션은 이어하지 않는다(종료 처리는 진입 화면의 settleStaleWorkout이 한다)
          const startedDay = kstDateOfIso(local.session.startedAt), today = kstDateOf(Date.now());
          if (startedDay && today && startedDay < today) throw new Error('이전 날짜의 운동은 이어할 수 없어요.');
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
        // 새 운동 시작 전에 이전 날짜의 미완료 세션을 ABANDONED로 끝낸다(전송 대기 큐는 유지)
        startPromise.current = settleStaleWorkout(owner)
          .then(() => getLocalWorkout(owner))
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
          if (exercise) {
            runWhenCameraReady(() => {
              if (!cancelled) useTtsStore.getState().sendCoachEvent({ eventType: 'EXERCISE_START', exerciseId: exercise.exerciseId });
            });
          }
        }
      }).catch(() => {
        if (cancelled) return;
        const current = phaseRef.current;
        if (current.kind !== 'completed') {
          const intro = snapshot.exercises[current.exerciseIndex]?.introTtsText;
          if (intro) {
            runWhenCameraReady(() => {
              if (!cancelled) useTtsStore.getState().playSpeech(intro, 'EXERCISE_START');
            });
          }
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
      sessions.map((s, index) => ({ exerciseId: s.exerciseId, sets: s.sets, interExerciseRestSeconds: snapshot?.interExerciseRestSeconds, targets: snapshot?.exercises[index]?.sets })),
    [sessions, snapshot],
  );

  /**
   * 현재 Phase의 종목 데이터. targetReps = 현재 세트의 목표 횟수(REPS만, 결정할 수 없으면 0 = 횟수로 완료하지 않음).
   * 목표 시간·휴식은 기존대로 sessionFlow가 세트별 targets에서 읽는다.
   */
  const resolveExercise = useCallback(
    (current: ActivePhase): ExerciseConfig => {
      const session = sessions[current.exerciseIndex];
      const exerciseId = session?.exerciseId ?? activeRoutine[current.exerciseIndex]?.exerciseId ?? '';
      const base = EXERCISES[exerciseId] ?? { id: exerciseId, name: session?.name ?? exerciseId,
        targetReps: 0 };
      return {
        ...base,
        name: session?.name ?? base.name,
        targetReps: resolveTargetReps(activeRoutine[current.exerciseIndex], session, targetSetNumber(current)) ?? 0,
      };
    },
    [sessions, activeRoutine],
  );
  /** REPS 세트인데 유효한 목표 횟수를 결정할 수 없음(snapshot 목표 누락·불일치). 이런 세트는 정상 완료·결과 저장하지 않는다 */
  const hasInvalidRepsTarget = useCallback(
    (current: ActivePhase) =>
      sessions[current.exerciseIndex]?.measurementType === 'REPS' && resolveExercise(current).targetReps <= 0,
    [sessions, resolveExercise],
  );

  const [phase, setPhase] = useState<SessionPhase>(initialPhase);
  const [pause, setPause] = useState<PauseState>(resumeDraft.current ? 'paused' : 'none');
  const pauseRef = useRef<PauseState>(pause);
  pauseRef.current = pause;
  /**
   * 현재 세트 ExerciseSessionController의 phase(07-A). 인식 이탈·자동 일시정지·복귀 판정의 단일 주체이며 FE는 다시 판정하지 않는다.
   * 세트(phase)가 바뀌면 null. 전체 상태(recognition·countdownRemainingMs·summary 등)는 controllerStateRef로 07-B에서 사용한다.
   */
  const [controllerPhase, setControllerPhase] = useState<ControllerPhase | null>(null);
  const controllerPhaseRef = useRef<ControllerPhase | null>(null);
  const controllerStateRef = useRef<ControllerState | null>(null);
  /** 07-B: Controller countdown 표시 초. Controller countdown 중에만 값이 있고 FE는 시간을 따로 세지 않는다 */
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  /** 09: Controller 인식 사유(recognition.reasonCode). 세트 최초 인식 대기 안내 문구에만 쓴다(판정은 Controller) */
  const [recognitionReason, setRecognitionReason] = useState<string | null>(null);
  /**
   * 자동 일시정지 화면 상태는 Controller phase를 기존 화면에 최소 매핑한 값이다(서버 상태는 바꾸지 않음).
   *  - auto_paused → LOST(AutoPauseOverlay, PhaseTimer 정지) / countdown → RECOVERING(기존 복귀 화면, PhaseTimer 정지)
   *  - recognition_lost(2초 미만)·waiting_for_pose·active → TRACKING (측정 차단 여부는 Controller가 결정)
   * 수동 일시정지·재개 중(pause !== 'none')에는 수동 화면이 우선이다.
   */
  const autoPause: 'TRACKING' | 'LOST' | 'RECOVERING' = pause !== 'none' || phase.kind !== 'exercising' ? 'TRACKING'
    : controllerPhase === 'auto_paused' ? 'LOST' : controllerPhase === 'countdown' ? 'RECOVERING' : 'TRACKING';
  const autoPaused = autoPause !== 'TRACKING';
  const [exiting, setExiting] = useState(false);
  /** AI 측정 횟수(count). 세트(phase)가 바뀌면 초기화하고 일시정지·복귀 중에는 유지 */
  const [measuredCount, setMeasuredCount] = useState<number | null>(null);
  /** AI 유효 자세 유지 시간(holdSeconds, 초 내림). PhaseTimer 잔여·경과 시간과 별개이며 서로 대체하지 않는다 */
  const [measuredHoldSeconds, setMeasuredHoldSeconds] = useState<number | null>(null);
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | 'both'>('both');
  const poseSetRef = useRef<{
    phaseId: number;
    setNumber: number;
    routineSetId: string;
    exerciseId: string;
    /** Routine 측정 유형. SET_FEEDBACK 주 측정값 선택에 사용 */
    measurementType: 'REPS' | 'DURATION';
    pipeline: ReturnType<typeof createPosePipeline>;
    /** Controller가 분석기로 보낸(측정한) 프레임 수. 0이면 측정 결과 없는 세트(M10) */
    frameCount: number;
    lastCount: number | null;
    lastHoldSeconds: number | null;
    finishing: boolean;
  } | null>(null);
  /**
   * 08-3: 세트에서 아직 한 번도 측정하지 않은 최초 신체 인식 대기(Controller waiting_for_pose, 분석기 전달 프레임 0) 동안은
   * 운동 타이머·운동 시간을 멈춘다(인식 준비 시간이 목표 시간·제한 시간을 소모하지 않음).
   * 측정을 시작한 뒤의 짧은 재인식 안정화·이탈(2초 미만)은 07-B 동작(타이머 진행)을 유지하고, 2초 이탈은 기존 자동 일시정지가 처리한다.
   * 프레임이 오기 전(Controller 없음, 기존 M10 경로)은 그대로 진행한다. 판정은 Controller phase만 쓴다. 별도 준비 화면은 09단계 범위.
   */
  const waitingForPose = pause === 'none' && phase.kind === 'exercising' && controllerPhase === 'waiting_for_pose' &&
    (poseSetRef.current?.phaseId !== phase.id || poseSetRef.current.frameCount === 0);

  useEffect(() => {
    phaseRef.current = phase;
    // 새 세트(또는 M10 재시도의 새 phase)는 측정값을 새로 시작. 일시정지·복귀는 phase가 그대로라 유지된다
    setMeasuredCount(null);
    setMeasuredHoldSeconds(null);
    setSelectedSide('both');
    // 단계가 바뀌면 이전 세트 Controller 상태를 이어받지 않는다(새 세트는 첫 프레임에서 새 Controller 생성)
    controllerPhaseRef.current = null;
    controllerStateRef.current = null;
    setControllerPhase(null);
    setCountdownSeconds(null);
    setRecognitionReason(null);
  }, [phase]);
  useEffect(() => {
    if (!sessionReady || pause !== 'none' || autoPaused || waitingForPose || phase.kind === 'completed') return;
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
  }, [phase, pause, autoPaused, waitingForPose, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !cameraReady || pause !== 'none' || phase.kind !== 'countdown' || phase.set !== 1 || phase.exerciseIndex === 0) return;
    const exercise = snapshot?.exercises[phase.exerciseIndex];
    if (exercise && !useTtsStore.getState().sendCoachEvent({ eventType: 'EXERCISE_START', exerciseId: exercise.exerciseId })) {
      if (exercise.introTtsText) useTtsStore.getState().playSpeech(exercise.introTtsText, 'EXERCISE_START');
    }
  }, [phase, pause, sessionReady, snapshot, cameraReady]);
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

  /**
   * 세트 분석기. 측정 계약은 진행 중 세션에 고정된 routineSnapshot(결과 저장 검증과 같은 값) 기준이며,
   * 화면 snapshot과 종목·측정 유형이 다르면(예: 이어하기한 V13 이전 DURATION 마운틴 클라이머 세션) 연결하지 않는다
   */
  const createSessionAnalyzer = useCallback((exerciseIndex: number) => {
    const planned = snapshot?.exercises[exerciseIndex];
    const frozen = serverSession.current?.session.routineSnapshot?.exercises[exerciseIndex];
    if (!planned || !frozen || planned.exerciseId !== frozen.exerciseId || planned.measurementType !== frozen.measurementType) return null;
    return createExerciseAnalyzer(frozen.exerciseId, frozen.measurementType);
  }, [snapshot]);

  /**
   * M10: 측정 결과 없이 0초에 도달해 멈춘 운동 세트의 phase id. 사용자가 '운동 재개'를 눌러야만(명시적 선택) 같은 세트를 처음부터 다시 시작.
   * 이어하기로 재진입한 운동 단계는 세트를 처음부터(전체 시간) 시작하므로 0초 상태로 시작하지 않는다.
   * 자동 일시정지(남은 시간 보존 후 5초 복귀)와는 별개 기능.
   */
  const stalledPhaseIdRef = useRef<number | null>(null);

  /** 멈춘 세트를 같은 운동·세트 번호로 새 phase id에 다시 시작. 분석기 미지원 종목은 재시도해도 측정할 수 없어 하지 않는다 */
  const restartStalledSet = useCallback((): boolean => {
    const current = phaseRef.current;
    if (current.kind !== 'exercising' || stalledPhaseIdRef.current !== current.id) return false;
    if (!createSessionAnalyzer(current.exerciseIndex)) return false;
    // 목표 횟수를 결정할 수 없는 REPS 세트도 재시도해도 같은 무효 목표라 재시작하지 않는다(무한 재시도 방지)
    if (hasInvalidRepsTarget(current)) return false;
    stalledPhaseIdRef.current = null; // 연속 입력 시 한 번만
    poseSetRef.current = null; // 측정 결과 없는 이전 pipeline은 버림 (finish 호출 안 함 → AI 결과 없음)
    // 새 id → PhaseTimer key 변경으로 타이머 remount(completedRef 초기화), 목표 시간 재적용. 이전 타이머의 늦은 완료는 id 불일치로 무시
    setPhase(p => (p.id === current.id ? { ...current, id: current.id + 1 } : p));
    return true;
  }, [createSessionAnalyzer, hasInvalidRepsTarget]);

  const checkpointRef = useRef(checkpoint);
  checkpointRef.current = checkpoint;

  // 일시 정지 상태를 바꾼 시각. 렌더·effect를 기다리지 않도록 전환을 요청하는 즉시 기록
  const pauseChangedAtRef = useRef(0);
  const markPauseChange = useCallback(() => {
    pauseChangedAtRef.current = Date.now();
  }, []);
  /** 방금 화면이 바뀌어 탭을 무시해야 하면 true */
  const isTapLocked = useCallback(() => Date.now() - pauseChangedAtRef.current < TAP_LOCK_MS, []);

  /**
   * Controller 상태 반영(프레임·watchdog 공통). 전이 판단은 하지 않고 Controller 결과만 화면 상태로 옮긴다.
   *  - auto_paused 진입: 기존과 같이 남은 시간 checkpoint (분석기 연속성 끊기는 Controller가 이미 수행)
   *  - 수동 재개(pause 'resuming') 중 Controller가 active가 되는 순간에만 재개 확정(FE 5초 완료 이벤트는 확정 권한 없음)
   */
  const applyControllerState = useCallback((state: ControllerState) => {
    if (state.ignored) return;
    controllerStateRef.current = state;
    // countdown 표시 = Controller countdownRemainingMs (5 → 1, Pose 문서 Math.ceil). countdown이 끝나거나 취소되면 바로 비움.
    // countdown 만료 후 다음 카메라 프레임에서 active가 되기 전(watchdog tick)까지 0이 보이지 않도록 1에서 멈춘다
    const seconds = state.phase === 'countdown' && state.countdownRemainingMs !== null
      ? Math.max(1, Math.ceil(state.countdownRemainingMs / 1000)) : null;
    setCountdownSeconds(prev => (prev === seconds ? prev : seconds));
    const reason = state.phase === 'waiting_for_pose' ? state.recognition?.reasonCode ?? null : null;
    setRecognitionReason(prev => (prev === reason ? prev : reason));
    if (state.phase !== controllerPhaseRef.current) {
      controllerPhaseRef.current = state.phase;
      setControllerPhase(state.phase);
      if (state.phase === 'auto_paused' && pauseRef.current === 'none') checkpointRef.current(remainingRef.current);
    }
    if (state.phase === 'active' && pauseRef.current === 'resuming') {
      pauseChangedAtRef.current = Date.now();
      pauseRef.current = 'none';
      setPause(p => (p === 'resuming' ? 'none' : p));
    }
  }, []);

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
        // 주 측정값만 전달: REPS = count, DURATION = floor(holdSeconds). 보조값을 다른 측정 유형 값으로 보내지 않는다
        const isReps = activeSet.measurementType === 'REPS';
        useTtsStore.getState().sendCoachEvent({
          eventType: 'SET_FEEDBACK',
          exerciseId: activeSet.exerciseId,
          actualReps: isReps && typeof summary?.count === 'number' ? summary.count : undefined,
          actualDurationSeconds:
            !isReps && typeof summary?.holdSeconds === 'number' ? Math.floor(summary.holdSeconds) : undefined,
        });
        completePhase(finishedPhaseId);
      });
      updateQueue.current = operation.catch(async (err) => {
        if (__DEV__) console.warn('[WorkoutSession] finishCurrentPoseSet failed', err);
        // 08-3: 결과가 불확실하면 기기 기록으로 확인한다. 이미 저장된 세트면 중복 저장 없이 다음 단계로
        const local = await getLocalWorkout(owner).catch(() => null);
        if (local && local.sessionId === serverSession.current?.sessionId &&
            local.session.sets.some(set => set.routineSetId === activeSet.routineSetId)) {
          serverSession.current = { sessionId: local.sessionId, session: local.session };
          completePhase(finishedPhaseId);
          return;
        }
        // 기기에 저장하지 못한 세트는 완료로 처리하지 않는다. 확정된 AI 결과는 pipeline에 남아 같은 결과로 다시 저장할 수 있다
        activeSet.finishing = false;
        if (phaseRef.current.id !== finishedPhaseId) return;
        pendingCommitPhaseIdRef.current = finishedPhaseId;
        requestPauseRef.current();
        Alert.alert('세트 기록 저장 실패', '이번 세트 결과를 기기에 저장하지 못했어요. 운동 재개를 누르면 다시 저장하고, 운동 종료를 누르면 이 세트는 기록하지 않고 종료해요.');
      });
    },
    [owner, completePhase],
  );
  /** 08-3: 세트 결과를 기기에 저장하지 못해 멈춘 세트의 phase id. '운동 재개'를 누르면 같은 결과로 다시 저장한다 */
  const pendingCommitPhaseIdRef = useRef<number | null>(null);
  const requestPauseRef = useRef<() => void>(() => {});

  /**
   * 카메라 프레임 → 현재 세트 Controller. 운동 단계에서는 수동·자동 일시정지 중에도 계속 전달한다
   * (측정은 Controller가 active일 때만 분석기로 보낸다 → 재인식 판정 가능, 프레임당 측정 1회).
   * timestampMs는 콜백 처리 시점의 sessionNow()로 찍어 watchdog tick과 같은 시간축을 쓴다.
   */
  const handlePoseFrame = useCallback(
    (frame: PoseFrame) => {
      const currentPhase = phaseRef.current;
      if (currentPhase.kind !== 'exercising' || !owner || !serverSession.current || !snapshot) {
        return;
      }
      let activeSet = poseSetRef.current;
      if (!activeSet || activeSet.phaseId !== currentPhase.id) {
        const routineExercise = snapshot.exercises[currentPhase.exerciseIndex];
        const routineSet = routineExercise?.sets[currentPhase.set - 1];
        if (!routineExercise || !routineSet) return;
        const analyzer = createSessionAnalyzer(currentPhase.exerciseIndex);
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
        // 수동 일시정지 중 생성(이어하기·재시도)되면 같은 상태로 맞춘다: 정지 중이면 manually_paused, 재개 중이면 resume 경로
        if (pauseRef.current !== 'none') pipeline.pause();
        if (pauseRef.current === 'resuming') pipeline.resume();
        activeSet = {
          phaseId: currentPhase.id,
          setNumber: currentPhase.set,
          routineSetId: routineSet.id,
          exerciseId: routineExercise.exerciseId,
          measurementType: routineExercise.measurementType,
          pipeline,
          frameCount: 0,
          lastCount: null,
          lastHoldSeconds: null,
          finishing: false,
        };
        poseSetRef.current = activeSet;
      }
      if (activeSet.finishing) return;

      try {
        const state = activeSet.pipeline.pushFrame({ ...frame, timestampMs: sessionNow() });
        applyControllerState(state);
        const output = state.frameResult as { count?: unknown; holdSeconds?: unknown; side?: unknown } | null;
        if (!output) return; // Controller가 측정을 차단한 프레임(대기·이탈·복귀·일시정지)
        activeSet.frameCount += 1;

        const side = output.side;
        if (side === 'left' || side === 'right' || side === 'both') {
          setSelectedSide((prev) => (prev === side ? prev : side));
        }

        const count = typeof output.count === 'number' ? output.count : null;
        const holdSeconds = typeof output.holdSeconds === 'number' ? Math.floor(output.holdSeconds) : null;
        if (count !== null && count !== activeSet.lastCount) {
          activeSet.lastCount = count;
          setMeasuredCount(count);
        }
        if (holdSeconds !== null && holdSeconds !== activeSet.lastHoldSeconds) {
          activeSet.lastHoldSeconds = holdSeconds;
          setMeasuredHoldSeconds(holdSeconds);
        }

        // REPS: 현재 세트 목표 횟수 도달로 종료(제한 시간 만료는 PhaseTimer). DURATION: AI 유효 유지 시간(floor)이 목표 시간에 도달하면 종료.
        // 목표 미달로 시간이 끝나면 PhaseTimer 만료에서 실제 측정값으로 종료한다. 동시에 일어나도 finishCurrentPoseSet이 한 번만 처리한다
        const exercise = resolveExercise(currentPhase);
        const measurementType = sessions[currentPhase.exerciseIndex]?.measurementType;
        const targetSeconds = snapshot.exercises[currentPhase.exerciseIndex]?.sets[currentPhase.set - 1]?.targetDurationSeconds;
        if (
          (measurementType === 'REPS' && count !== null && exercise.targetReps > 0 && count >= exercise.targetReps) ||
          (measurementType === 'DURATION' && holdSeconds !== null && typeof targetSeconds === 'number' && targetSeconds > 0 &&
            holdSeconds >= targetSeconds)
        ) {
          finishCurrentPoseSet(currentPhase.id);
        }
      } catch (err) {
        if (__DEV__) console.warn('[WorkoutSession] pose frame error', err);
      }
    },
    [owner, snapshot, sessions, resolveExercise, finishCurrentPoseSet, applyControllerState, createSessionAnalyzer],
  );

  // watchdog: 운동 단계 동안 SESSION_WATCHDOG_MS마다 같은 시간축으로 tick → 카메라 콜백 자체가 멈춰도 이탈 감지.
  // 일시정지 중에도 동작(Controller 계약). 세트가 바뀌거나 화면이 사라지면 interval을 정리한다
  useEffect(() => {
    if (!sessionReady || phase.kind !== 'exercising') return;
    const phaseId = phase.id;
    const timer = setInterval(() => {
      const activeSet = poseSetRef.current;
      if (!activeSet || activeSet.phaseId !== phaseId || activeSet.finishing) return;
      applyControllerState(activeSet.pipeline.tick(sessionNow()));
    }, SESSION_WATCHDOG_MS);
    return () => clearInterval(timer);
  }, [sessionReady, phase, applyControllerState]);

  if (__DEV__) console.log('[WorkoutSession]', phase, pause);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, []);

  // 상태 전환은 모두 "현재 상태가 기대한 값일 때만" 적용 → 연속 탭에도 한 번만 전환
  const requestPause = useCallback(() => {
    markPauseChange();
    // 수동 일시정지·백그라운드: Controller manually_paused(진행 중 자동 복귀 취소, 자동 해제 없음). 카메라 관측은 계속
    const activeSet = poseSetRef.current;
    if (activeSet && activeSet.phaseId === phaseRef.current.id && !activeSet.finishing) applyControllerState(activeSet.pipeline.pause());
    if (pauseRef.current === 'none' || pauseRef.current === 'resuming') pauseRef.current = 'paused';
    setPause(p => (p === 'none' || p === 'resuming' ? 'paused' : p));
    if (serverSession.current) void updateServerStatus('PAUSED').catch(() => Alert.alert('동기화 실패', '운동 일시 정지 상태를 저장하지 못했어요.'));
  }, [markPauseChange, updateServerStatus, applyControllerState]);
  requestPauseRef.current = requestPause;
  const resume = useCallback(() => {
    if (isTapLocked()) return;
    markPauseChange();
    // 08-3: 세트 결과 저장에 실패해 멈춘 세트면 측정을 다시 하지 않고 확정된 같은 결과를 다시 저장한다(성공해야 다음 단계)
    if (pause === 'paused' && phase.kind === 'exercising' && pendingCommitPhaseIdRef.current === phase.id) {
      pendingCommitPhaseIdRef.current = null;
      pauseRef.current = 'none';
      setPause(p => (p === 'paused' ? 'none' : p));
      void updateServerStatus('ACTIVE').catch(() => Alert.alert('동기화 실패', '운동 재개 상태를 저장하지 못했어요.'));
      finishCurrentPoseSet(phase.id);
      return;
    }
    // M10: 0초에 멈춘 세트면 같은 세트를 처음부터 (재개 5초 카운트다운 동안 새 타이머는 정지 상태로 대기)
    if (pause === 'paused') restartStalledSet();
    // 운동 중: Controller resume(재인식 안정 → 5초 countdown → active). 시작·휴식 카운트다운 중이었다면 바로 이어서
    if (pause === 'paused' && phase.kind === 'exercising') {
      pauseRef.current = 'resuming';
      const activeSet = poseSetRef.current;
      if (activeSet && activeSet.phaseId === phase.id && !activeSet.finishing) applyControllerState(activeSet.pipeline.resume());
    }
    setPause(p => (p !== 'paused' ? p : phase.kind === 'exercising' ? 'resuming' : 'none'));
    void updateServerStatus('ACTIVE').catch(() => Alert.alert('동기화 실패', '운동 재개 상태를 저장하지 못했어요.'));
  }, [phase.kind, phase.id, pause, isTapLocked, markPauseChange, updateServerStatus, restartStalledSet, applyControllerState, finishCurrentPoseSet]);
  const finishResumeCountdown = useCallback(() => {
    markPauseChange();
    setPause(p => (p === 'resuming' ? 'none' : p));
  }, [markPauseChange]);
  /**
   * Controller가 없는 세트(분석기 미연결·프레임 없음 M10 재시도)의 수동 재개 5초 종료만 처리한다.
   * Controller 세트의 복귀 화면은 countdownRemainingMs만 표시하고 자체 타이머가 없어 이 콜백이 오지 않으며, 재개·복귀는 Controller active에서만 확정된다.
   */
  const handleResumeCountdownFinished = useCallback(() => {
    if (pause === 'none' || controllerPhaseRef.current !== null) return;
    finishResumeCountdown();
  }, [pause, finishResumeCountdown]);
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
      // 이번 세션의 요청(세션·AI 결과·Report)이 모두 전송됐는지만 본다. 다른 세션의 보존 기록(영구 오류)이 결과 화면을 막지 않는다
      const syncNow = () => flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner).catch(() => {});
      try {
        await syncNow();
        if (await pendingCount(owner, current.sessionId)) await syncNow();
        uploaded = await pendingCount(owner, current.sessionId) === 0;
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

  /** 화면 표시만 담당하는 SessionStage에 현재 상태를 넘깁니다. 타이머·단계 전환은 PhaseTimer/completePhase가 그대로 담당 */
  const renderStage = (current: ActivePhase, remainingSeconds: number, phaseSeconds: number) => {
    const exercise = resolveExercise(current);
    const isDuration = sessions[current.exerciseIndex]?.measurementType === 'DURATION';
    // SessionStage의 currentReps: 횟수 운동 = AI 횟수, 시간 운동 = AI 유효 자세 유지 시간(타이머 잔여 시간과 별개)
    const displayedMeasure = isDuration ? measuredHoldSeconds : measuredCount;
    // 수동 일시정지 화면이 항상 우선. 자동 일시정지는 pause === 'none'일 때만 표시.
    // 수동 재개 중(Controller 있는 세트)에는 Controller가 countdown에 들어가기 전까지 기존 이탈 화면, countdown부터 복귀 화면(Controller 초 표시)
    const controlledResume = pause === 'resuming' && current.kind === 'exercising' && controllerPhase !== null;
    if ((pause === 'none' && autoPause === 'LOST') || (controlledResume && controllerPhase !== 'countdown')) {
      return (
        <AutoPauseOverlay
          alternate={isDuration
            ? { kind: 'duration', seconds: remainingSeconds, progress: phaseSeconds > 0 ? 1 - remainingSeconds / phaseSeconds : 0, holdSeconds: measuredHoldSeconds }
            : { kind: 'reps', reps: measuredCount, target: exercise.targetReps, seconds: remainingSeconds }}
          exerciseName={exercise.name}
          subtitle={describePause(current, exercise.name).subtitle}
          onPressMenu={handleClose}
        />
      );
    }
    const stagePause = pause !== 'none' ? pause : autoPause === 'RECOVERING' ? 'resuming' : 'none';
    return (
      <SessionStage
        key={pause === 'none' && autoPause === 'RECOVERING' ? 'auto-resume' : controlledResume ? 'controller-resume' : 'stage'}
        phase={current}
        pause={stagePause}
        remainingSeconds={remainingSeconds}
        phaseSeconds={phaseSeconds}
        exerciseName={exercise.name}
        targetReps={exercise.targetReps}
        currentReps={displayedMeasure}
        isDuration={isDuration}
        resumeSubtitle={describePause(current, exercise.name).subtitle}
        // Controller 세트의 복귀(자동·수동 재개) 화면 초 = Controller countdownRemainingMs. Controller 없는 세트만 기존 5초 타이머
        // (countdown 진입과 같은 갱신에서 값이 채워지며, 없으면 Pose SESSION_CONFIG 기준 시작값. FE 타이머로 대체하지 않음)
        resumeCountdownSeconds={(pause === 'none' && autoPause === 'RECOVERING') || controlledResume
          ? countdownSeconds ?? Math.ceil(SESSION_CONFIG.countdownMs / 1000) : null}
        // 09: 시작 카운트다운 동안 이번 종목 준비 안내(진행 중 세션 snapshot의 Routine 가이드 원문), 최초 인식 대기 안내
        guide={current.kind === 'countdown'
          ? (serverSession.current?.session.routineSnapshot ?? snapshot)?.exercises[current.exerciseIndex]?.preparation?.trim() || null
          : null}
        recognitionGuide={current.kind === 'exercising' && waitingForPose ? recognitionGuideText(recognitionReason) : null}
        getPauseSummary={() => {
          const spent = currentElapsed();
          const time = {
            elapsedSeconds: Math.floor((spent.activeMs + spent.restMs) / 1000),
            remainingSeconds: estimateRemainingSeconds(current, remainingSeconds, activeRoutine),
          };
          // 09: 진행 중인 세션의 snapshot과 실제 완료 기록 기준(저장되지 않은 세트는 완료로 세지 않음)
          const session = serverSession.current?.session;
          if (session) return { ...time, ...routineSummaryOf(session, current.exerciseIndex) };
          const sets = countSets(current, activeRoutine);
          return {
            completedSets: sets.completed,
            totalSets: sets.total,
            ...time,
            exercises: sessions.map((item, index) => ({
              key: `${item.id}-${index}`,
              name: item.name,
              detail: `${item.sets}세트 · ${item.reps}${item.measurementType === 'DURATION' ? '초' : '개'}`,
              current: index === current.exerciseIndex,
            })),
          };
        }}
        busy={exiting}
        onPressMenu={handleClose}
        onFinishResume={handleResumeCountdownFinished}
        onPressStop={openStopConfirm}
        onPressResume={resume}
        onConfirmStop={() => saveAndExit(remainingSeconds)}
        onCancelStop={cancelStop}
      />
    );
  };

  const duration = resumeRemainingSeconds !== null && phase.id === 0
    ? resumeRemainingSeconds : phaseDurationSeconds(phase, activeRoutine);

  return (
    <>
      {/* 운동 완료 화면은 밝은 배경 */}
      <StatusBar style={sessionReady && phase.kind !== 'completed' ? 'light' : 'dark'} />
      {!sessionReady ? (
        <View style={[styles.screen, { paddingTop: insets.top + 30, paddingHorizontal: 20 }]}>
          <Text>{sessionError ?? '운동 세션을 준비하고 있어요.'}</Text>
          {sessionError && <Pressable onPress={close}><Text>돌아가기</Text></Pressable>}
        </View>
      ) : phase.kind === 'completed' || duration === null ? (
        // 카메라를 끄고 완료 화면만 표시 → RESULT_ENTRY_DELAY_MS 뒤 결과 화면으로 이동
        <WorkoutCompleteView />
      ) : (
        // 카메라는 세션 화면 동안 한 번만 마운트(단계·일시정지 전환 시 재시작 없음). 판정은 handlePoseFrame이 운동 단계에서만 수행
        <View style={styles.stage}>
          <ExerciseCameraArea onPoseFrame={handlePoseFrame} selectedSide={selectedSide} onCameraReady={handleCameraReady} />
        <PhaseTimer
          key={phase.id}
          durationSeconds={duration}
          paused={pause !== 'none' || autoPaused || waitingForPose}
          onTick={checkpoint}
          onComplete={() => {
            if (phase.kind === 'exercising') {
              const activeSet = poseSetRef.current;
              // 목표 횟수를 결정할 수 없는 REPS 세트는 측정이 있어도 정상 완료·AI 결과·세트 결과를 만들지 않는다
              if (activeSet && activeSet.phaseId === phase.id && activeSet.frameCount > 0 && !hasInvalidRepsTarget(phase)) {
                finishCurrentPoseSet(phase.id);
                return;
              }
              // 측정 결과 없는 세트(또는 목표 무효 세트)는 완료 처리하지 않는다. '운동 재개'를 누르면 restartStalledSet으로 같은 세트 재시작(목표 무효·미지원은 재시작 안 함)
              stalledPhaseIdRef.current = phase.id;
              requestPause();
              Alert.alert('자세 측정 연결 대기', 'AI 모델이 연결되면 세트 수행 결과를 기록할 수 있어요.');
              return;
            }
            completePhase(phase.id);
          }}>
          {remainingSeconds => renderStage(phase, remainingSeconds, duration)}
        </PhaseTimer>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PrepColors.cameraBackground },
  stage: { flex: 1, backgroundColor: SessionColors.base },
});
