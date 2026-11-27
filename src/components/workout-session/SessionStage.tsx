/**
 * 운동 진행 화면의 단계별 UI 조합 (표시 전용).
 * 실제 운동 화면(app/workout-session.tsx)과 개발용 미리보기(DevSessionPreview)가 함께 사용합니다.
 * 타이머·단계 전환·판정·저장은 하지 않으며, 부모가 넘겨준 상태를 그리기만 합니다.
 */
import { PauseView, type PauseExerciseItem } from './PauseView';
import { PhaseTimer } from './PhaseTimer';
import { SessionHud, type SessionHudContent } from './SessionHud';
import { SessionStatusPill } from './SessionStatusPill';
import { RESUME_COUNTDOWN_SECONDS } from './sessionConfig';
import type { ActivePhase } from './sessionFlow';
import { StopConfirmSheet } from './StopConfirmSheet';

/** 휴식 단계 시작 후 '세트 N 완료!'를 보여주는 시간(표시 전용, 휴식 타이머와 무관) */
export const SET_COMPLETE_DISPLAY_SECONDS = 3;

export type SessionPauseState = 'none' | 'paused' | 'stop-confirm' | 'resuming';

export type PauseSummary = {
  completedSets: number;
  totalSets: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  exercises: PauseExerciseItem[];
};

type SessionStageProps = {
  phase: ActivePhase;
  pause: SessionPauseState;
  /** 현재 단계 타이머의 남은 시간 */
  remainingSeconds: number;
  /** 현재 단계 타이머의 전체 시간 */
  phaseSeconds: number;
  exerciseName: string;
  targetReps: number;
  currentReps: number | null;
  isDuration: boolean;
  /** 재개 카운트다운 하단 문구 (예: '세트 1 진행 중') */
  resumeSubtitle: string;
  /** 일시정지 화면 수치. 일시정지 상태에서만 호출 */
  getPauseSummary: () => PauseSummary;
  busy: boolean;
  onPressMenu: () => void;
  onFinishResume: () => void;
  onPressStop: () => void;
  onPressResume: () => void;
  onConfirmStop: () => void;
  onSaveForLater?: () => void;
  onCancelStop: () => void;
  /** 일시정지 화면 종목 행 → 세트 수정 (제공될 때만 '›' 표시) */
  onPressExercise?: (index: number) => void;
};

export function SessionStage(props: SessionStageProps) {
  const { phase: current, pause, remainingSeconds, phaseSeconds } = props;
  const pill = (subtitle: string) => (
    <SessionStatusPill exerciseName={props.exerciseName} subtitle={subtitle} onPressMenu={props.onPressMenu} />
  );

  if (pause === 'resuming') {
    return (
      <PhaseTimer durationSeconds={RESUME_COUNTDOWN_SECONDS} onComplete={props.onFinishResume}>
        {resumeSeconds => (
          <>
            <SessionHud tone="accent" content={{ kind: 'title-timer', title: '복귀', seconds: resumeSeconds }} />
            {pill(props.resumeSubtitle)}
          </>
        )}
      </PhaseTimer>
    );
  }

  if (pause !== 'none') {
    const summary = props.getPauseSummary();
    return (
      <>
        <PauseView
          completedSets={summary.completedSets}
          totalSets={summary.totalSets}
          elapsedSeconds={summary.elapsedSeconds}
          remainingSeconds={summary.remainingSeconds}
          exercises={summary.exercises}
          onPressStop={props.onPressStop}
          onPressResume={props.onPressResume}
          onPressExercise={props.onPressExercise}
        />
        <StopConfirmSheet
          visible={pause === 'stop-confirm'}
          busy={props.busy}
          onConfirm={props.onConfirmStop}
          onSaveForLater={props.onSaveForLater}
          onCancel={props.onCancelStop}
        />
      </>
    );
  }

  switch (current.kind) {
    case 'countdown':
      return (
        <>
          <SessionHud content={{ kind: 'title-timer', title: '준비', seconds: remainingSeconds }} />
          {pill(`세트 ${current.set} 준비`)}
        </>
      );
    case 'resting': {
      const justCompleted = remainingSeconds > phaseSeconds - SET_COMPLETE_DISPLAY_SECONDS;
      return justCompleted ? (
        <>
          <SessionHud tone="accent" content={{ kind: 'check', title: `세트 ${current.completedSet} 완료!` }} />
          {pill(`세트 ${current.completedSet} 완료`)}
        </>
      ) : (
        <>
          <SessionHud content={{ kind: 'title-timer', title: '휴식', seconds: remainingSeconds }} />
          {pill('세트 간 휴식 시간')}
        </>
      );
    }
    case 'exercising': {
      // 운동 단계에 들어온 첫 1초(타이머가 아직 시작값)는 '운동 시작' 표시
      const starting = remainingSeconds >= phaseSeconds;
      const content: SessionHudContent = starting
        ? { kind: 'title', title: '운동 시작' }
        : props.isDuration
          ? {
              kind: 'duration',
              seconds: remainingSeconds,
              progress: phaseSeconds > 0 ? 1 - remainingSeconds / phaseSeconds : 0,
              // 시간 운동의 currentReps = AI 유효 자세 유지 시간(초, 기존 화면과 같은 값)
              holdSeconds: props.currentReps,
            }
          : { kind: 'reps', reps: props.currentReps, target: props.targetReps, seconds: remainingSeconds };
      return (
        <>
          <SessionHud tone={starting ? 'accent' : 'dark'} content={content} />
          {pill(`세트 ${current.set} 진행 중`)}
        </>
      );
    }
  }
}
