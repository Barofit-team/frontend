import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchReportSessionSets, fetchReportSessionSummary } from '@/services/reportSessionDetailService';
import { toWorkoutRecordErrorMessage } from '@/services/workoutRecordService';
import type { ReportSessionPostureSummary, ReportSessionSet } from '@/types/report';

interface Loaded<T> {
  queryKey: string;
  key: string;
  data: T | null;
  error: string | null;
}

/**
 * 세션 단위 조회 공통 훅. useWorkoutSessionResult·useGeneratedReport와 같은 방식입니다.
 *  - sessionId가 없으면 요청하지 않고, 표준 UUID가 아니면 요청하지 않고 오류로 표시합니다.
 *  - sessionId가 바뀌면 새로 조회하고, 이전 세션의 늦은 응답은 버립니다.
 *  - retry: 오류 후 다시 시도 / refresh: 같은 세션 재조회(요청 중이면 무시, 기존 데이터 유지)
 *  - 화면을 벗어나면(언마운트) 늦은 응답으로 상태를 바꾸지 않습니다.
 */
function useSessionQuery<T>(sessionId: string | null | undefined, fetcher: (sessionId: string) => Promise<T>) {
  const enabled = Boolean(sessionId);
  const [attempt, setAttempt] = useState(0);
  const queryKey = sessionId ?? '';
  const key = `${queryKey}#${attempt}`;
  const [loaded, setLoaded] = useState<Loaded<T>>({ queryKey: '', key: '', data: null, error: null });
  const inFlightRef = useRef<object | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const request = {};
    inFlightRef.current = request;
    fetcher(sessionId)
      .then((data) => {
        if (!cancelled) setLoaded({ queryKey, key, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ queryKey, key, data: null, error: toWorkoutRecordErrorMessage(error, '운동기록') });
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
    return () => {
      cancelled = true;
      if (inFlightRef.current === request) inFlightRef.current = null;
    };
  }, [key, queryKey, sessionId, fetcher]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const refresh = useCallback(() => {
    if (inFlightRef.current) return;
    setAttempt((value) => value + 1);
  }, []);

  const isCurrent = loaded.key === key;
  const data = enabled && (isCurrent || loaded.queryKey === queryKey) ? loaded.data : null;
  const isLoading = enabled && !isCurrent;
  const error = enabled && isCurrent ? loaded.error : null;
  return { data, isLoading, error, retry, refresh };
}

/**
 * 세션 자세 집계 (GET .../sessions/{sessionId}/summary).
 * isEmpty: 정상 응답이지만 업로드된 AI 세트 결과가 없음(setCount 0). 서버가 세션 존재·소유를 확인하지 않아
 * 없는 세션·남의 세션도 같은 응답입니다.
 */
export function useReportSessionSummary(sessionId: string | null | undefined) {
  const { data, isLoading, error, retry, refresh } = useSessionQuery<ReportSessionPostureSummary>(
    sessionId,
    fetchReportSessionSummary
  );
  return {
    summary: data,
    isLoading,
    error,
    isEmpty: !isLoading && !error && data !== null && data.setCount === 0,
    retry,
    refresh,
  };
}

/**
 * 세트별 AI 결과 원문 (GET .../sessions/{sessionId}/sets). 서버 순서 그대로입니다.
 * isEmpty: 정상 응답 []. 의미는 /summary의 setCount 0과 같습니다(업로드된 결과 없음, 세션 존재 여부는 알 수 없음).
 */
export function useReportSessionSets(sessionId: string | null | undefined) {
  const { data, isLoading, error, retry, refresh } = useSessionQuery<ReportSessionSet[]>(
    sessionId,
    fetchReportSessionSets
  );
  return {
    sets: data,
    isLoading,
    error,
    isEmpty: !isLoading && !error && data !== null && data.length === 0,
    retry,
    refresh,
  };
}
