import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchPostureScorePoints,
  POSTURE_SCORE_HISTORY_LIMIT,
  toPostureScoreHistory,
} from '@/services/postureScoreService';
import { toWorkoutRecordErrorMessage } from '@/services/workoutRecordService';
import type { PostureScorePoint } from '@/types/workoutResult';

interface LoadedScores {
  /** 어느 조회 조건('exerciseId#limit')의 응답인지 */
  queryKey: string;
  /** 어느 조건(+재조회 횟수)의 응답인지 */
  key: string;
  points: PostureScorePoint[] | null;
  error: string | null;
}

const NOT_LOADED: LoadedScores = { queryKey: '', key: '', points: null, error: null };

/**
 * 종목별 자세 점수 이력 (GET /api/v1/reports/exercises/{exerciseId}/scores).
 * useMonthlyWorkoutStatus와 같은 방식으로 동작합니다.
 *  - exerciseId가 없으면(null·undefined·빈 문자열) 요청하지 않습니다.
 *  - exerciseId·limit이 바뀌면 새로 조회하고, 이전 조건의 늦은 응답은 버립니다.
 *  - 잘못된 exerciseId·limit은 요청하지 않고 오류로 표시합니다 (postureScoreService에서 확인).
 *  - retry: 오류 후 다시 시도
 *  - refresh: 같은 조건을 다시 조회합니다. 이미 요청 중이면 무시하고, 응답이 올 때까지 기존 점수를 보여줍니다.
 *  - exerciseName은 표시용이라 바뀌어도 다시 요청하지 않습니다.
 *
 * postureScore는 PostureScoreChart에 그대로 넘길 수 있는 형태(오래된 순)이며, 서버 응답만 담습니다.
 */
export function useExerciseScoreHistory(
  exerciseId: string | null | undefined,
  exerciseName: string,
  limit: number = POSTURE_SCORE_HISTORY_LIMIT
) {
  const enabled = Boolean(exerciseId);
  const [attempt, setAttempt] = useState(0);
  const queryKey = `${exerciseId ?? ''}#${limit}`;
  const key = `${queryKey}#${attempt}`;
  const [loaded, setLoaded] = useState<LoadedScores>(NOT_LOADED);
  /** 진행 중인 요청 (중복 재조회 방지). 요청마다 새 객체라 같은 key가 두 번 실행돼도 구분됩니다 */
  const inFlightRef = useRef<object | null>(null);

  useEffect(() => {
    if (!exerciseId) return;
    let cancelled = false;
    const request = {};
    inFlightRef.current = request;
    fetchPostureScorePoints(exerciseId, limit)
      .then((points) => {
        if (!cancelled) setLoaded({ queryKey, key, points, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          // 인증·네트워크 오류도 빈 점수가 아니라 오류로 표시합니다
          setLoaded({ queryKey, key, points: null, error: toWorkoutRecordErrorMessage(error, '자세 점수 기록') });
        }
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
    return () => {
      cancelled = true;
      if (inFlightRef.current === request) inFlightRef.current = null;
    };
  }, [key, queryKey, exerciseId, limit]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const refresh = useCallback(() => {
    if (inFlightRef.current) return;
    setAttempt((value) => value + 1);
  }, []);

  const isCurrent = loaded.key === key;
  // 같은 조건을 다시 불러오는 중에는 이전 응답을 유지 (다른 종목·limit으로 바뀐 경우에는 비움)
  const points = enabled && (isCurrent || loaded.queryKey === queryKey) ? loaded.points : null;
  const isLoading = enabled && !isCurrent;
  const error = enabled && isCurrent ? loaded.error : null;

  const postureScore = useMemo(
    () => (exerciseId && points ? toPostureScoreHistory(exerciseId, exerciseName, points) : undefined),
    [exerciseId, exerciseName, points]
  );

  return {
    /** PostureScoreChart의 postureScore prop. 아직 없거나 오류면 undefined */
    postureScore,
    isLoading,
    error,
    /** 정상 응답이 빈 배열인 경우 */
    isEmpty: !isLoading && !error && points?.length === 0,
    retry,
    refresh,
  };
}
