import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError } from '@/services/api';
import { fetchGeneratedReport, toGeneratedReportScreenParts } from '@/services/generatedReportService';
import { toWorkoutRecordErrorMessage } from '@/services/workoutRecordService';
import type { ReportGenerated } from '@/types/report';

interface LoadedReport {
  queryKey: string;
  key: string;
  report: ReportGenerated | null;
  error: string | null;
  notFound: boolean;
}

const NOT_LOADED: LoadedReport = { queryKey: '', key: '', report: null, error: null, notFound: false };

/**
 * 저장된 운동 리포트 조회 (GET /api/v1/reports/sessions/{sessionId}/generated). 조회만 하며 생성(POST)하지 않습니다.
 * useWorkoutSessionResult와 같은 방식입니다.
 *  - sessionId가 없으면 요청하지 않고, 표준 UUID가 아니면 요청하지 않고 오류로 표시합니다.
 *  - sessionId가 바뀌면 새로 조회하고, 이전 세션의 늦은 응답은 버립니다.
 *  - retry: 오류 후 다시 시도 / refresh: 같은 세션 재조회(요청 중이면 무시, 기존 리포트 유지)
 *
 * isNotFound: 서버 404. 리포트가 아직 생성되지 않았거나, 세션이 없거나 본인 세션이 아닌 경우입니다
 * (서버가 같은 code로 보내 구분할 수 없습니다).
 */
export function useGeneratedReport(sessionId: string | null | undefined) {
  const enabled = Boolean(sessionId);
  const [attempt, setAttempt] = useState(0);
  const queryKey = sessionId ?? '';
  const key = `${queryKey}#${attempt}`;
  const [loaded, setLoaded] = useState<LoadedReport>(NOT_LOADED);
  const inFlightRef = useRef<object | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const request = {};
    inFlightRef.current = request;
    fetchGeneratedReport(sessionId)
      .then((report) => {
        if (!cancelled) setLoaded({ queryKey, key, report, error: null, notFound: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoaded({
            queryKey,
            key,
            report: null,
            error: toWorkoutRecordErrorMessage(error, 'AI 리포트'),
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
  const report = enabled && (isCurrent || loaded.queryKey === queryKey) ? loaded.report : null;
  const isLoading = enabled && !isCurrent;
  const error = enabled && isCurrent ? loaded.error : null;

  const screenParts = useMemo(() => (report ? toGeneratedReportScreenParts(report) : null), [report]);

  return {
    /** 검증된 서버 리포트. 아직 없거나 오류면 null */
    report,
    /** 결과 화면 모델 중 /generated로 채울 수 있는 부분 */
    screenParts,
    isLoading,
    error,
    /** 서버 404: 리포트 미생성 또는 세션 없음(구분 불가) */
    isNotFound: enabled && isCurrent && loaded.notFound,
    retry,
    refresh,
  };
}
