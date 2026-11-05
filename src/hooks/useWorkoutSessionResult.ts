import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError } from '@/services/api';
import { toWorkoutRecordErrorMessage } from '@/services/workoutRecordService';
import { fetchReportWorkoutResult, toWorkoutResultScreenParts } from '@/services/workoutSessionResultService';
import type { ReportWorkoutResult } from '@/types/report';

interface LoadedResult {
  /** 어느 세션의 응답인지 */
  queryKey: string;
  /** 어느 세션(+재조회 횟수)의 응답인지 */
  key: string;
  result: ReportWorkoutResult | null;
  error: string | null;
  /** 서버 404 (세션이 없거나 본인 세션이 아님) */
  notFound: boolean;
}

const NOT_LOADED: LoadedResult = { queryKey: '', key: '', result: null, error: null, notFound: false };

/**
 * 운동 결과 상세 (GET /api/v1/reports/sessions/{sessionId}/result).
 * useExerciseScoreHistory·useReportPeriodSummary와 같은 방식으로 동작합니다.
 *  - sessionId가 없으면(null·undefined·빈 문자열) 요청하지 않습니다.
 *  - 표준 UUID가 아닌 sessionId(예: Mock의 'mock-session-…')는 요청하지 않고 오류로 표시합니다.
 *  - sessionId가 바뀌면 새로 조회하고, 이전 세션의 늦은 응답은 버립니다.
 *  - retry: 오류 후 다시 시도
 *  - refresh: 같은 세션을 다시 조회합니다. 이미 요청 중이면 무시하고, 응답이 올 때까지 기존 결과를 보여줍니다.
 *
 * result는 검증된 서버 응답 원본, screenParts는 결과 화면 모델 중 1:1로 옮길 수 있는 부분입니다.
 * 404는 error와 함께 isNotFound로도 알려줍니다. 수행 세트가 0인 200 응답은 정상 결과입니다.
 */
export function useWorkoutSessionResult(sessionId: string | null | undefined) {
  const enabled = Boolean(sessionId);
  const [attempt, setAttempt] = useState(0);
  const queryKey = sessionId ?? '';
  const key = `${queryKey}#${attempt}`;
  const [loaded, setLoaded] = useState<LoadedResult>(NOT_LOADED);
  /** 진행 중인 요청 (중복 재조회 방지). 요청마다 새 객체라 같은 key가 두 번 실행돼도 구분됩니다 */
  const inFlightRef = useRef<object | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const request = {};
    inFlightRef.current = request;
    fetchReportWorkoutResult(sessionId)
      .then((result) => {
        if (!cancelled) setLoaded({ queryKey, key, result, error: null, notFound: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          // 인증·네트워크·형식 오류도 빈 결과가 아니라 오류로 표시합니다
          setLoaded({
            queryKey,
            key,
            result: null,
            error: toWorkoutRecordErrorMessage(error, '운동기록'),
            notFound: error instanceof ApiError && error.status === 404,
          });
        }
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
    return () => {
      cancelled = true;
      if (inFlightRef.current === request) inFlightRef.current = null;
    };
  }, [key, queryKey, sessionId]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const refresh = useCallback(() => {
    if (inFlightRef.current) return;
    setAttempt((value) => value + 1);
  }, []);

  const isCurrent = loaded.key === key;
  // 같은 세션을 다시 불러오는 중에는 이전 응답을 유지 (다른 세션으로 바뀐 경우에는 비움)
  const result = enabled && (isCurrent || loaded.queryKey === queryKey) ? loaded.result : null;
  const isLoading = enabled && !isCurrent;
  const error = enabled && isCurrent ? loaded.error : null;

  const screenParts = useMemo(() => (result ? toWorkoutResultScreenParts(result) : null), [result]);

  return {
    /** 검증된 서버 응답. 아직 없거나 오류면 null */
    result,
    /** 결과 화면 모델 중 /result로 채울 수 있는 부분. 아직 없거나 오류면 null */
    screenParts,
    isLoading,
    error,
    /** 서버 404: 세션이 없거나 본인 세션이 아님 */
    isNotFound: enabled && isCurrent && loaded.notFound,
    retry,
    refresh,
  };
}
