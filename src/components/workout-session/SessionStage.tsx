/**
 * 운동 진행 화면의 단계별 UI 조합 (표시 전용).
 * 실제 운동 화면(app/workout-session.tsx)과 개발용 미리보기(DevSessionPreview)가 함께 사용합니다.
 * 타이머·단계 전환·판정·저장은 하지 않으며, 부모가 넘겨준 상태를 그리기만 합니다.
 */
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PauseView, type PauseExerciseItem } from './PauseView';
import { PhaseTimer } from './PhaseTimer';
import { SessionHud, type SessionHudContent } from './SessionHud';
import { SessionStatusPill } from './SessionStatusPill';
import { RESUME_COUNTDOWN_SECONDS } from './sessionConfig';
import { SessionColors } from './sessionPalette';
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
  /** Controller 없는 세트(분석기 미연결·프레임 없음 M10 재시도)의 수동 재개 5초 완료. Controller 세트에서는 호출되지 않는다 */
  onFinishResume: () => void;
  /**
   * 07-B: Controller countdown 표시 초(Math.ceil(countdownRemainingMs/1000)). 값이 있으면 복귀 화면은 이 값만 표시하고
   * 자체 타이머를 돌리지 않는다(복귀 확정은 Controller active). null/undefined면 기존 수동 재개 5초 타이머(Controller 없는 세트 전용)
   */
  resumeCountdownSeconds?: number | null;
  onPressStop: () => void;
  onPressResume: () => void;
  onConfirmStop: () => void;
  onCancelStop: () => void;
  /** 일시정지 화면 종목 행 → 세트 수정 (제공될 때만 '›' 표시) */
  onPressExercise?: (index: number) => void;
  /** 09: 시작 카운트다운(준비·종목 간 휴식) 동안 보여줄 이번 종목 준비 안내(Routine 종목 가이드 원문). 없으면 표시하지 않음 */
  guide?: string | null;
  /** 09: 세트 최초 신체 인식 대기 안내(Controller 사유별). 값이 있는 동안 운동 타이머는 부모가 멈춘다 */
  recognitionGuide?: string | null;
};

export function SessionStage(props: SessionStageProps) {
  const { phase: current, pause, remainingSeconds, phaseSeconds } = props;
  const insets = useSafeAreaInsets();
  const caption = (text: string | null | undefined, style: 'guide' | 'headline') => text ? (
    <Text
      style={style === 'guide' ? [styles.guide, { bottom: insets.bottom + 92 }] : styles.headline}
      accessibilityLiveRegion="polite"
      numberOfLines={style === 'guide' ? 4 : 3}>
      {text}
    </Text>
  ) : null;
  const pill = (subtitle: string) => (
    <SessionStatusPill exerciseName={props.exerciseName} subtitle={subtitle} onPressMenu={props.onPressMenu} />
  );

  if (pause === 'resuming' && typeof props.resumeCountdownSeconds === 'number') {
    return (
      <>
        <SessionHud tone="accent" content={{ kind: 'title-timer', title: '복귀', seconds: props.resumeCountdownSeconds }} />
        {pill(props.resumeSubtitle)}
      </>
    );
  }

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
          onCancel={props.onCancelStop}
        />
      </>
    );
  }

  switch (current.kind) {
    case 'countdown': {
      // 두 번째 종목부터의 첫 세트 카운트다운은 종목 간 휴식(interExerciseRestSeconds)이자 다음 종목 안내다(추가 카운트다운 없음)
      const nextExercise = current.set === 1 && current.exerciseIndex > 0;
      return (
        <>
          <SessionHud content={{ kind: 'title-timer', title: nextExercise ? '휴식' : '준비', seconds: remainingSeconds }} />
          {caption(props.guide, 'guide')}
          {pill(nextExercise ? `다음 운동 · 세트 ${current.set} 준비` : `세트 ${current.set} 준비`)}
        </>
      );
    }
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
          {pill(`세트 간 휴식 · 다음 세트 ${current.completedSet + 1}`)}
        </>
      );
    }
    case 'exercising': {
      // 09: 세트 최초 신체 인식 대기 중에는 타이머가 멈춰 있으므로 '자세 인식 중'과 사유별 안내를 표시
      if (props.recognitionGuide) {
        return (
          <>
            <SessionHud tone="accent" content={{ kind: 'title', title: '자세 인식 중' }} />
            {caption(props.recognitionGuide, 'headline')}
            {pill(`세트 ${current.set} 준비`)}
          </>
        );
      }
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

const styles = StyleSheet.create({
  /** 자동 일시정지 화면 안내 문구와 같은 형태 */
  headline: {
    position: 'absolute', left: 24, right: 24, top: '22%', textAlign: 'center',
    fontSize: 22, lineHeight: 30, fontWeight: '700', color: SessionColors.onCamera,
  },
  guide: {
    position: 'absolute', left: 24, right: 24, textAlign: 'center',
    fontSize: 14, lineHeight: 20, fontWeight: '600', color: SessionColors.onCamera,
  },
});
