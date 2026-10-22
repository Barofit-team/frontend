/**
 * 운동 진행 화면 (Workout Session)
 *
 * 흐름 (sessionFlow.ts) — Mock 루틴(MOCK_ROUTINE): 스쿼트 2세트 → 푸쉬업 2세트
 *   시작 카운트다운 10초 → 운동 60초 → 휴식 30초 → 다음 세트 시작 카운트다운 → …
 *   → 다음 종목 안내 카운트다운 30초("세션 2 / 푸쉬업") → … 마지막 종목의 마지막 세트가 끝나면 completed.
 *   종목이 바뀌어도 같은 화면 컴포넌트를 쓰고, 현재 Phase의 종목 데이터(운동명·목표 횟수)로 표시합니다.
 *
 *  - 운동: 전면 카메라 + 횟수(0/20 고정) · 운동명 · 60초 (ExerciseCameraArea + ExerciseStatusPanel)
 *  - 시작/휴식: CountdownView (카메라 비활성)
 *  - 각 Phase는 key가 다른 PhaseTimer로 렌더 → 이전 타이머는 정리되고 새 타이머가 처음부터 시작.
 *    완료 시 Phase id를 비교해 중복·지연 완료 처리를 무시합니다.
 *
 * 일시 정지 (pause 상태)
 *  - 상단 X / Android 뒤로가기 / 앱 백그라운드 전환 → 일시 정지. 타이머는 멈추고(같은 인스턴스 유지)
 *    PauseView를 표시하므로 카메라는 언마운트됩니다.
 *  - 운동 이어하기: 운동 중이었다면 5초 재개 카운트다운 후 남은 시간부터, 시작·휴식 중이었다면 바로 이어서 진행.
 *  - 운동 중단하기(또는 일시 정지 화면의 X) → 중단 확인 시트
 *    · 계속 운동하기 → 일시 정지 화면으로 복귀
 *    · 저장하고 나가기 → 진행 상태를 Mock 저장소(useWorkoutDraftStore)에 보관하고 이전 화면(홈)으로 이동
 *
 * 운동 완료 (completed 상태)
 *  - "오늘의 루틴 / 운동 완료!" 화면을 약 1.2초 보여준 뒤 결과 화면(F01, workout-result)으로 replace.
 *    replace라서 뒤로가기 시 운동 진행 화면으로 돌아오지 않습니다. 이동은 한 번만 실행되고,
 *    화면을 벗어나면 타이머가 정리됩니다.
 *  - 결과 데이터는 [Mock] 예시 결과를 useWorkoutResultStore에 넣습니다 (AI 분석·기록 API 연동 전).
 *
 * 이번 단계 범위 밖: AI 자세 분석, 스켈레톤 Overlay, 횟수 계산, 서버 연동
 *
 * 개발용 진입: barofit://workout-session
 */
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrepColors } from '@/components/workout-preparation/palette';
import { CountdownView } from '@/components/workout-session/CountdownView';
import { ExerciseCameraArea } from '@/components/workout-session/ExerciseCameraArea';
import { ExerciseStatusPanel } from '@/components/workout-session/ExerciseStatusPanel';
import { PauseView } from '@/components/workout-session/PauseView';
import { PhaseTimer } from '@/components/workout-session/PhaseTimer';
import { EXERCISES, MOCK_ROUTINE, RESUME_COUNTDOWN_SECONDS } from '@/components/workout-session/sessionConfig';
import {
  INITIAL_PHASE,
  nextPhase,
  phaseDurationSeconds,
  type ActivePhase,
  type SessionPhase,
} from '@/components/workout-session/sessionFlow';
import { StopConfirmSheet } from '@/components/workout-session/StopConfirmSheet';
import { WorkoutCompleteView } from '@/components/workout-session/WorkoutCompleteView';
import { createMockWorkoutResult } from '@/mocks/workoutResult';
import { useWorkoutDraftStore } from '@/stores/useWorkoutDraftStore';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';

/** 횟수 계산 방식이 정해지기 전까지 고정값으로 표시합니다 */
const PLACEHOLDER_REPS = 0;

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

/** 현재 Phase의 종목 데이터 (Mock 루틴 기준) */
function exerciseOf(phase: ActivePhase) {
  return EXERCISES[MOCK_ROUTINE[phase.exerciseIndex].exerciseId];
}

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
  const [phase, setPhase] = useState<SessionPhase>(INITIAL_PHASE);
  const [pause, setPause] = useState<PauseState>('none');
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);

  // 일시 정지 상태를 바꾼 시각. 렌더·effect를 기다리지 않도록 전환을 요청하는 즉시 기록
  const pauseChangedAtRef = useRef(0);
  const markPauseChange = useCallback(() => {
    pauseChangedAtRef.current = Date.now();
  }, []);
  /** 방금 화면이 바뀌어 탭을 무시해야 하면 true */
  const isTapLocked = useCallback(() => Date.now() - pauseChangedAtRef.current < TAP_LOCK_MS, []);

  // 타이머가 끝난 Phase의 id를 받아 다음 Phase로 전환. 이미 지나간 Phase면 무시(중복 완료 방지)
  const completePhase = useCallback((finishedId: number) => {
    setPhase(current => (current.id === finishedId ? nextPhase(current, MOCK_ROUTINE) : current));
  }, []);

  if (__DEV__) console.log('[WorkoutSession]', phase, pause);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, []);

  // 상태 전환은 모두 "현재 상태가 기대한 값일 때만" 적용 → 연속 탭에도 한 번만 전환
  const requestPause = useCallback(() => {
    markPauseChange();
    setPause(p => (p === 'none' || p === 'resuming' ? 'paused' : p));
  }, [markPauseChange]);
  const resume = useCallback(() => {
    if (isTapLocked()) return;
    markPauseChange();
    // 운동 중이었다면 재개 카운트다운, 시작·휴식 카운트다운 중이었다면 바로 이어서
    setPause(p => (p !== 'paused' ? p : phase.kind === 'exercising' ? 'resuming' : 'none'));
  }, [phase.kind, isTapLocked, markPauseChange]);
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
      // [Mock] 백엔드 저장 대신 메모리에 보관
      const exercise = exerciseOf(phase);
      useWorkoutDraftStore.getState().saveDraft({
        exerciseIndex: phase.exerciseIndex,
        totalExercises: MOCK_ROUTINE.length,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        phase: phase.kind,
        set: describePause(phase, exercise.name).set,
        totalSets: MOCK_ROUTINE[phase.exerciseIndex].sets,
        reps: PLACEHOLDER_REPS,
        targetReps: exercise.targetReps,
        remainingSeconds,
        savedAt: new Date().toISOString(),
      });
      // 화면이 언마운트되며 타이머·카메라가 정리됩니다
      close();
    },
    [phase, close, isTapLocked]
  );

  // 운동 완료 → 결과 저장 후 잠시 완료 화면을 보여주고 결과 화면으로 교체 (한 번만)
  useEffect(() => {
    if (phase.kind !== 'completed') return;
    // [Mock] 실제 횟수·자세 분석 결과가 아직 없어 예시 결과를 넣습니다
    useWorkoutResultStore.getState().setResult(createMockWorkoutResult());
    const timer = setTimeout(() => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      router.replace('/workout-result');
    }, RESULT_ENTRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase.kind]);

  // 앱이 백그라운드로 가면 일시 정지 (복귀 후에는 사용자가 '운동 이어하기'로 재개)
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') requestPause();
    });
    return () => sub.remove();
  }, [requestPause]);

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
      <ExerciseCameraArea onPressClose={handleClose} />
      <ExerciseStatusPanel
        exerciseName={exercise.name}
        currentReps={PLACEHOLDER_REPS}
        targetReps={exercise.targetReps}
        remainingSeconds={remainingSeconds}
        bottomInset={insets.bottom}
      />
    </View>
  );

  const renderPhase = (current: ActivePhase, remainingSeconds: number) => {
    const exercise = exerciseOf(current);
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
    const exercise = exerciseOf(current);
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
          reps={PLACEHOLDER_REPS}
          targetReps={exercise.targetReps}
          onPressStop={openStopConfirm}
          onPressResume={resume}
          onPressClose={handleClose}
        />
        <StopConfirmSheet
          visible={pause === 'stop-confirm'}
          statusText={info.statusText}
          reps={PLACEHOLDER_REPS}
          targetReps={exercise.targetReps}
          busy={exiting}
          onConfirm={() => saveAndExit(remainingSeconds)}
          onCancel={cancelStop}
        />
      </>
    );
  };

  const duration = phaseDurationSeconds(phase);

  return (
    <>
      <StatusBar style="dark" />
      {phase.kind === 'completed' || duration === null ? (
        // 카메라를 끄고 완료 화면만 표시 → RESULT_ENTRY_DELAY_MS 뒤 결과 화면으로 이동
        <WorkoutCompleteView onPressClose={handleClose} />
      ) : (
        <PhaseTimer
          key={phase.id}
          durationSeconds={duration}
          paused={pause !== 'none'}
          onComplete={() => completePhase(phase.id)}>
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
