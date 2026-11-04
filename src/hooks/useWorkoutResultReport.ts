import { useMemo } from 'react';

import { useExerciseScoreHistory } from '@/hooks/useExerciseScoreHistory';
import { useGeneratedReport } from '@/hooks/useGeneratedReport';
import { useWorkoutSessionResult } from '@/hooks/useWorkoutSessionResult';
import type { GeneratedReportScreenParts } from '@/services/generatedReportService';
import type { WorkoutResultScreenParts } from '@/services/workoutSessionResultService';
import type { ReportWorkoutResult } from '@/types/report';
import type { ExerciseResult, PostureScoreHistory, WorkoutSessionResult } from '@/types/workoutResult';

/**
 * F01에 표시할 결과. Mock 결과(WorkoutSessionResult)와 같은 모양이며,
 * API 응답과 화면 의미가 1:1로 정해지지 않은 값(시간 3종, nextFocus)은 비워 둡니다.
 */
export type WorkoutResultView = Pick<WorkoutSessionResult, 'completedSets' | 'totalReps' | 'exercises'> &
  Partial<
    Pick<
      WorkoutSessionResult,
      'exerciseDurationSeconds' | 'restDurationSeconds' | 'totalDurationSeconds' | 'postureScore' | 'nextFocus'
    >
  >;

/**
 * /result 종목 카드에 /generated의 잘한 점·개선할 점을 붙입니다.
 * 두 응답은 모두 루틴 스냅샷의 종목 순서이므로, 종목 수가 같고 같은 위치의 exerciseId가 같을 때만 붙입니다.
 * 맞지 않으면 문구 없이 /result 값만 씁니다(다른 종목 문구가 섞이지 않게).
 */
export function mergeExerciseResults(
  result: WorkoutResultScreenParts,
  generated: GeneratedReportScreenParts | null
): ExerciseResult[] {
  const aligned = generated !== null && generated.exercises.length === result.exercises.length;
  return result.exercises.map((exercise, index) => {
    const report = aligned ? generated.exercises[index] : undefined;
    if (!report || report.exerciseId !== exercise.exerciseId) return { ...exercise };
    return {
      ...exercise,
      ...(report.goodFeedback !== undefined ? { goodFeedback: report.goodFeedback } : {}),
      ...(report.improvementFeedback !== undefined ? { improvementFeedback: report.improvementFeedback } : {}),
    };
  });
}

/**
 * 점수 차트에 쓸 종목: 이번 세션에서 자세 점수가 나온 첫 종목.
 * 차트는 마지막 막대를 '오늘'로 표시하므로, 이번 점수가 없는 종목은 고르지 않습니다.
 */
export function pickScoreExercise(result: ReportWorkoutResult | null) {
  const exercise = result?.exercises.find((item) => item.postureScore !== null);
  return exercise && exercise.postureScore !== null
    ? { exerciseId: exercise.exerciseId, name: exercise.name, score: exercise.postureScore }
    : null;
}

/** /scores의 마지막(가장 최근) 점수가 이번 세션 점수와 같을 때만 '오늘' 막대로 쓸 수 있습니다 */
export function isCurrentScoreLast(history: PostureScoreHistory, currentScore: number): boolean {
  const last = history.history[history.history.length - 1];
  return last !== undefined && last.score === currentScore;
}

/**
 * F01 Report API 조회 (GET /result, GET /generated, GET /scores). 조회만 하며 리포트를 생성(POST)하지 않습니다.
 *  - sessionId가 null이면 세 API 모두 요청하지 않습니다(Mock 화면).
 *  - /scores는 /result에서 이번 점수가 있는 종목을 찾은 뒤에만 요청합니다.
 *  - 세 API의 로딩·오류는 따로 돌려줘, 한 API 실패가 다른 영역 표시를 막지 않습니다.
 */
export function useWorkoutResultReport(sessionId: string | null) {
  const resultQuery = useWorkoutSessionResult(sessionId);
  const generatedQuery = useGeneratedReport(sessionId);
  const target = useMemo(() => pickScoreExercise(resultQuery.result), [resultQuery.result]);
  const scoresQuery = useExerciseScoreHistory(target?.exerciseId ?? null, target?.name ?? '');

  const resultParts = resultQuery.screenParts;
  const generatedParts = generatedQuery.screenParts;
  const scoreHistory = scoresQuery.postureScore;
  const targetScore = target?.score ?? null;

  const view = useMemo<WorkoutResultView | null>(() => {
    if (!resultParts) return null;
    const postureScore =
      scoreHistory && targetScore !== null && isCurrentScoreLast(scoreHistory, targetScore) ? scoreHistory : undefined;
    return {
      completedSets: resultParts.summary.completedSets,
      totalReps: resultParts.summary.totalReps,
      exercises: mergeExerciseResults(resultParts, generatedParts),
      ...(postureScore ? { postureScore } : {}),
    };
  }, [resultParts, generatedParts, scoreHistory, targetScore]);

  return {
    view,
    result: {
      isLoading: resultQuery.isLoading,
      error: resultQuery.error,
      isNotFound: resultQuery.isNotFound,
      retry: resultQuery.retry,
    },
    generated: {
      isLoading: generatedQuery.isLoading,
      error: generatedQuery.error,
      /** 서버 404: 아직 생성된 리포트 없음 (생성 요청은 하지 않음) */
      isNotFound: generatedQuery.isNotFound,
      retry: generatedQuery.retry,
    },
    scores: {
      /** 이번 세션 점수가 있는 종목이 있어 /scores를 요청하는지 */
      enabled: target !== null,
      exerciseId: target?.exerciseId ?? null,
      isLoading: scoresQuery.isLoading,
      error: scoresQuery.error,
      retry: scoresQuery.retry,
    },
  };
}
