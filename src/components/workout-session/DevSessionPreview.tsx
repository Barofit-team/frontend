/**
 * [개발 전용] F04 운동 코칭 화면 미리보기. 라우트: /dev-f04-session (운영 빌드에서는 진입 불가)
 *
 * 안전장치
 *  - 서버 API·오프라인 저장(offlineWorkout)·세트 결과 저장(posePipeline)·코치 WebSocket·TTS·스토어를 import하지 않습니다.
 *    → 운동 세션 생성, 기록 저장, 동기화가 일어나지 않습니다.
 *  - 횟수는 @barofit/pose 분석기를 메모리에서만 사용해 셉니다(finish() 미호출, 결과 저장 없음).
 *  - 세트 수정은 이 화면의 Mock 루틴(state)에만 반영됩니다.
 *  - 단계 전환 규칙(sessionFlow), 타이머(PhaseTimer), 화면 조합(SessionStage), 세트 수정 UI(SetEditSheet)는
 *    실제 운동 화면과 같은 코드를 씁니다.
 *
 * 실제 화면과 다른 점(미리보기 단순화)
 *  - 운동 타이머가 끝나면 측정 여부와 관계없이 다음 단계로 넘어갑니다.
 *  - '운동 종료'는 저장 없이 미리보기를 닫습니다. 운동 시간은 일시정지 시간을 포함한 대략값입니다.
 *  - '자동정지 UI' 버튼은 감지 기능이 아니라 자동 일시정지 화면을 수동으로 띄워 보는 개발용 버튼입니다.
 */
import { PlankAnalyzer, SquatAnalyzer, type PoseFrame } from '@barofit/pose';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutoPauseOverlay } from './AutoPauseOverlay';
import { ExerciseCameraArea } from './ExerciseCameraArea';
import { PhaseTimer } from './PhaseTimer';
import {
  applyEditToRoutine,
  createEditDraft,
  describeTargets,
  lockedSetCount,
  type ExerciseEditDraft,
  type MeasurementType,
} from './routineEdit';
import type { RoutineItem } from './sessionConfig';
import { INITIAL_PHASE, nextPhase, phaseDurationSeconds, type ActivePhase, type SessionPhase } from './sessionFlow';
import { SessionColors } from './sessionPalette';
import { countSets, estimateRemainingSeconds } from './sessionProgress';
import { SessionStage, type SessionPauseState } from './SessionStage';
import { SetEditSheet } from './SetEditSheet';
import { WorkoutCompleteView } from './WorkoutCompleteView';

type MockExercise = {
  id: string;
  name: string;
  analyzer: 'squat' | 'plank';
  measurementType: MeasurementType;
  /** 세트별 목표가 없을 때 쓰는 값(횟수 또는 초) */
  fallbackGoal: number;
};

/** 짧게 확인할 수 있도록 줄인 Mock 루틴 */
const MOCK_EXERCISES: readonly MockExercise[] = [
  { id: 'dev-squat', name: '스쿼트 (DEV)', analyzer: 'squat', measurementType: 'REPS', fallbackGoal: 5 },
  { id: 'dev-plank', name: '플랭크 (DEV)', analyzer: 'plank', measurementType: 'DURATION', fallbackGoal: 20 },
];

const INITIAL_ROUTINE: RoutineItem[] = [
  {
    exerciseId: 'squat',
    sets: 2,
    targets: [1, 2].map(() => ({ targetDurationSeconds: 30, restSeconds: 10, targetReps: 5 })),
  },
  { exerciseId: 'plank', sets: 1, targets: [{ targetDurationSeconds: 20, restSeconds: 10 }] },
];

type FrameAnalyzer = {
  pushFrame(frame: PoseFrame): { count?: number | null; holdSeconds?: number | null; side?: string | null };
  breakContinuity(reason: 'pause'): unknown;
};

function createAnalyzer(kind: MockExercise['analyzer']): FrameAnalyzer {
  return (kind === 'plank' ? new PlankAnalyzer() : new SquatAnalyzer()) as unknown as FrameAnalyzer;
}

/** 현재 세트의 목표(횟수 운동: 횟수, 시간 운동: 초) */
function targetFor(routine: readonly RoutineItem[], phase: ActivePhase) {
  const meta = MOCK_EXERCISES[phase.exerciseIndex];
  const setIndex = phase.kind === 'resting' ? phase.completedSet - 1 : phase.set - 1;
  const target = routine[phase.exerciseIndex]?.targets?.[setIndex];
  if (!meta) return 0;
  return meta.measurementType === 'REPS'
    ? (target?.targetReps ?? meta.fallbackGoal)
    : (target?.targetDurationSeconds ?? meta.fallbackGoal);
}

export function DevSessionPreview() {
  const insets = useSafeAreaInsets();
  const [routine, setRoutine] = useState<RoutineItem[]>(INITIAL_ROUTINE);
  const [phase, setPhase] = useState<SessionPhase>(INITIAL_PHASE);
  const [pause, setPause] = useState<SessionPauseState>('none');
  const [autoPause, setAutoPause] = useState(false);
  const [editing, setEditing] = useState<ExerciseEditDraft | null>(null);
  const [currentReps, setCurrentReps] = useState<number | null>(null);
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | 'both'>('both');
  const phaseRef = useRef(phase);
  const pauseRef = useRef(pause);
  const autoPauseRef = useRef(autoPause);
  const routineRef = useRef(routine);
  const analyzerRef = useRef<{ phaseId: number; analyzer: FrameAnalyzer } | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    phaseRef.current = phase;
    setCurrentReps(null);
    setSelectedSide('both');
  }, [phase]);
  useEffect(() => {
    pauseRef.current = pause;
    autoPauseRef.current = autoPause;
    routineRef.current = routine;
  }, [pause, autoPause, routine]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  const completePhase = useCallback((finishedId: number) => {
    setPhase(current => (current.id === finishedId ? nextPhase(current, routineRef.current) : current));
  }, []);

  const handlePoseFrame = useCallback(
    (frame: PoseFrame) => {
      const current = phaseRef.current;
      if (current.kind !== 'exercising' || pauseRef.current !== 'none' || autoPauseRef.current) return;
      const meta = MOCK_EXERCISES[current.exerciseIndex];
      if (!meta) return;
      if (!analyzerRef.current || analyzerRef.current.phaseId !== current.id) {
        analyzerRef.current = { phaseId: current.id, analyzer: createAnalyzer(meta.analyzer) };
      }
      try {
        const output = analyzerRef.current.analyzer.pushFrame(frame);
        if (output.side === 'left' || output.side === 'right' || output.side === 'both') {
          const side = output.side;
          setSelectedSide(prev => (prev === side ? prev : side));
        }
        const measured =
          typeof output.count === 'number'
            ? output.count
            : typeof output.holdSeconds === 'number'
              ? Math.floor(output.holdSeconds)
              : null;
        if (measured !== null) setCurrentReps(prev => (prev === measured ? prev : measured));
        const goal = targetFor(routineRef.current, current);
        if (meta.measurementType === 'REPS' && typeof output.count === 'number' && goal > 0 && output.count >= goal) {
          completePhase(current.id);
        }
      } catch (err) {
        if (__DEV__) console.warn('[DevSessionPreview] pose frame error', err);
      }
    },
    [completePhase],
  );

  const requestPause = useCallback(() => {
    analyzerRef.current?.analyzer.breakContinuity('pause');
    setPause(p => (p === 'none' || p === 'resuming' ? 'paused' : p));
  }, []);

  const handleMenu = useCallback(() => {
    if (editing) return;
    if (phaseRef.current.kind === 'completed') close();
    else if (autoPauseRef.current) {
      // 시안: 자동 일시정지 중 메뉴 → 오늘의 운동 루틴
      setAutoPause(false);
      setPause('paused');
    } else if (pauseRef.current === 'paused') setPause('stop-confirm');
    else if (pauseRef.current !== 'stop-confirm') requestPause();
  }, [close, requestPause, editing]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleMenu();
      return true;
    });
    return () => sub.remove();
  }, [handleMenu]);

  /** 개발용: 자동 일시정지 화면 띄우기 / 재인식(복귀) 흉내 */
  const toggleAutoPausePreview = () => {
    if (autoPause) {
      setAutoPause(false);
      setPause('resuming');
    } else {
      analyzerRef.current?.analyzer.breakContinuity('pause');
      setAutoPause(true);
    }
  };

  const openEditor = (index: number) => {
    if (phase.kind === 'completed') return;
    const item = routine[index];
    const meta = MOCK_EXERCISES[index];
    if (!item || !meta) return;
    const locked = lockedSetCount(phase, index, item.sets);
    if (locked >= item.sets) return;
    setEditing(createEditDraft(item, index, meta.measurementType, locked, meta.fallbackGoal));
  };

  const duration = phaseDurationSeconds(phase, routine);
  const canPreviewAutoPause = phase.kind === 'exercising' && (pause === 'none' || autoPause);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {phase.kind === 'completed' || duration === null ? (
        <WorkoutCompleteView />
      ) : (
        <>
          <ExerciseCameraArea onPoseFrame={handlePoseFrame} selectedSide={selectedSide} />
          <PhaseTimer
            key={phase.id}
            durationSeconds={duration}
            paused={pause !== 'none' || autoPause}
            onComplete={() => completePhase(phase.id)}>
            {remainingSeconds => {
              const meta = MOCK_EXERCISES[phase.exerciseIndex];
              const goal = targetFor(routine, phase);
              const subtitle =
                phase.kind === 'resting' ? `세트 ${phase.completedSet} 완료 · 휴식 중` : `세트 ${phase.set} 진행 중`;
              if (autoPause) {
                return (
                  <AutoPauseOverlay
                    alternate={
                      meta?.measurementType === 'DURATION'
                        ? { kind: 'duration', seconds: remainingSeconds, progress: duration > 0 ? 1 - remainingSeconds / duration : 0, holdSeconds: currentReps }
                        : { kind: 'reps', reps: currentReps, target: goal, seconds: remainingSeconds }
                    }
                    exerciseName={meta?.name ?? ''}
                    subtitle={subtitle}
                    onPressMenu={handleMenu}
                  />
                );
              }
              return (
                <SessionStage
                  phase={phase}
                  pause={pause}
                  remainingSeconds={remainingSeconds}
                  phaseSeconds={duration}
                  exerciseName={meta?.name ?? ''}
                  targetReps={goal}
                  currentReps={currentReps}
                  isDuration={meta?.measurementType === 'DURATION'}
                  resumeSubtitle={subtitle}
                  getPauseSummary={() => {
                    const sets = countSets(phase, routine);
                    return {
                      completedSets: sets.completed,
                      totalSets: sets.total,
                      elapsedSeconds: Math.floor((Date.now() - startedAt.current) / 1000),
                      remainingSeconds: estimateRemainingSeconds(phase, remainingSeconds, routine),
                      exercises: MOCK_EXERCISES.map((item, index) => {
                        const routineItem = routine[index];
                        return {
                          key: item.id,
                          name: item.name,
                          detail: routineItem ? describeTargets(routineItem, item.measurementType, item.fallbackGoal) : '',
                          current: index === phase.exerciseIndex,
                          editable: routineItem ? lockedSetCount(phase, index, routineItem.sets) < routineItem.sets : false,
                        };
                      }),
                    };
                  }}
                  busy={false}
                  onPressMenu={handleMenu}
                  onFinishResume={() => setPause(p => (p === 'resuming' ? 'none' : p))}
                  onPressStop={() => setPause(p => (p === 'paused' ? 'stop-confirm' : p))}
                  onPressResume={() =>
                    setPause(p => (p !== 'paused' ? p : phase.kind === 'exercising' ? 'resuming' : 'none'))
                  }
                  onConfirmStop={close}
                  onCancelStop={() => setPause(p => (p === 'stop-confirm' ? 'paused' : p))}
                  onPressExercise={openEditor}
                />
              );
            }}
          </PhaseTimer>
        </>
      )}

      {editing && (
        <SetEditSheet
          exerciseName={MOCK_EXERCISES[editing.exerciseIndex]?.name ?? ''}
          initialDraft={editing}
          onCancel={() => setEditing(null)}
          onSave={draft => {
            setRoutine(prev => applyEditToRoutine(prev, draft));
            setEditing(null);
          }}
        />
      )}

      {/* 개발 미리보기 표시 (실제 화면에는 없음) */}
      <View style={[styles.devBar, { top: insets.top + 4 }]} pointerEvents="box-none">
        {canPreviewAutoPause && (
          <Pressable accessibilityRole="button" onPress={toggleAutoPausePreview} style={styles.devBadge}>
            <Text style={styles.devBadgeText}>{autoPause ? '재인식(복귀)' : '자동정지 UI'}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="개발 미리보기 닫기" onPress={close} style={styles.devBadge}>
          <Text style={styles.devBadgeText}>DEV 미리보기 · 저장 안 됨 ✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SessionColors.base },
  devBar: { position: 'absolute', right: 10, flexDirection: 'row', gap: 6 },
  devBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.92)',
  },
  devBadgeText: { fontSize: 11, fontWeight: '700', color: '#111111' },
});
