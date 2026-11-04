import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchReportPeriodSummary,
  isEmptyPeriodSummary,
  type ReportSummaryPeriod,
} from '@/services/reportSummaryService';
import { toWorkoutRecordErrorMessage } from '@/services/workoutRecordService';
import type { ReportPeriodSummary } from '@/types/report';

interface LoadedSummary {
  /** 어느 조회 조건('period#date')의 응답인지 */
  queryKey: string;
  /** 어느 조건(+재조회 횟수)의 응답인지 */
  key: string;
  summary: ReportPeriodSummary | null;
  error: string | null;
}

const NOT_LOADED: LoadedSummary = { queryKey: '', key: '', summary: null, error: null };

/**
 * 기간 집계 공통 훅. useExerciseScoreHistory와 같은 방식으로 동작합니다.
 *  - date가 없으면(null·undefined·빈 문자열) 요청하지 않습니다.
 *  - date가 바뀌면 새로 조회하고, 이전 날짜의 늦은 응답은 버립니다.
 *  - 잘못된 날짜는 요청하지 않고 오류로 표시합니다 (reportSummaryService에서 확인).
 *  - retry: 오류 후 다시 시도
 *  - refresh: 같은 날짜를 다시 조회합니다. 이미 요청 중이면 무시하고, 응답이 올 때까지 기존 집계를 보여줍니다.
 */
function useReportPeriodSummary(period: ReportSummaryPeriod, date: string | null | undefined) {
  const enabled = Boolean(date);
  const [attempt, setAttempt] = useState(0);
  const queryKey = `${period}#${date ?? ''}`;
  const key = `${queryKey}#${attempt}`;
  const [loaded, setLoaded] = useState<LoadedSummary>(NOT_LOADED);
  /** 진행 중인 요청 (중복 재조회 방지). 요청마다 새 객체라 같은 key가 두 번 실행돼도 구분됩니다 */
  const inFlightRef = useRef<object | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    const request = {};
    inFlightRef.current = request;
    fetchReportPeriodSummary(period, date)
      .then((summary) => {
        if (!cancelled) setLoaded({ queryKey, key, summary, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          // 인증·네트워크 오류도 빈 집계가 아니라 오류로 표시합니다
          setLoaded({ queryKey, key, summary: null, error: toWorkoutRecordErrorMessage(error, '운동기록') });
        }
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
    return () => {
      cancelled = true;
      if (inFlightRef.current === request) inFlightRef.current = null;
    };
  }, [key, queryKey, period, date]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const refresh = useCallback(() => {
    if (inFlightRef.current) return;
    setAttempt((value) => value + 1);
  }, []);

  const isCurrent = loaded.key === key;
  // 같은 날짜를 다시 불러오는 중에는 이전 응답을 유지 (다른 날짜로 바뀐 경우에는 비움)
  const summary = enabled && (isCurrent || loaded.queryKey === queryKey) ? loaded.summary : null;
  const isLoading = enabled && !isCurrent;
  const error = enabled && isCurrent ? loaded.error : null;

  return {
    /** 서버 집계 원본. 아직 없거나 오류면 null */
    summary,
    isLoading,
    error,
    /** 정상 응답이지만 업로드된 세트 결과가 없는 경우 (setCount 0) */
    isEmpty: !isLoading && !error && summary !== null && isEmptyPeriodSummary(summary),
    retry,
    refresh,
  };
}

/** 하루(KST) 집계 (GET /api/v1/reports/daily?date=). date: 'YYYY-MM-DD' */
export function useDailyReportSummary(date: string | null | undefined) {
  return useReportPeriodSummary('daily', date);
}

/** startDate부터 7일(KST) 집계 (GET /api/v1/reports/weekly?startDate=). startDate: 'YYYY-MM-DD' */
export function useWeeklyReportSummary(startDate: string | null | undefined) {
  return useReportPeriodSummary('weekly', startDate);
}
