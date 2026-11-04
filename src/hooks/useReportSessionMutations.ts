import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/services/api';
import { requestReportGeneration } from '@/services/generatedReportService';
import { submitReportFeedback, toReportActionErrorMessage, type ReportAction } from '@/services/reportFeedbackService';
import { uploadReportSetResult } from '@/services/reportSetUploadService';
import type {
  ReportFeedback,
  ReportGenerated,
  ReportSetCompletedPayload,
  ReportSetUploadOptions,
  ReportSetUploadResult,
} from '@/types/report';

interface MutationState<T> {
  /** 어느 세션의 상태인지 */
  sessionKey: string;
  data: T | null;
  isPending: boolean;
  error: string | null;
  /** 실패한 HTTP 상태(네트워크 오류는 0). 요청 전 검증 실패·응답 형식 오류는 null */
  errorStatus: number | null;
}

const idle = <T>(sessionKey: string): MutationState<T> => ({
  sessionKey,
  data: null,
  isPending: false,
  error: null,
  errorStatus: null,
});

/**
 * 세션 단위 변경 요청(PUT·POST) 공통 훅.
 *  - 자동으로 요청하지 않습니다. 반환된 함수를 호출할 때만 요청합니다.
 *  - 같은 세션에 요청이 진행 중이면 추가 호출은 요청 없이 null을 돌려줍니다(연타 방지).
 *  - 실패해도 자동 재시도하지 않습니다. 다시 호출해야 다시 요청합니다.
 *  - sessionId가 바뀌면 상태를 비우고, 이전 세션 요청의 늦은 응답은 상태에 반영하지 않습니다.
 */
function useSessionMutation<TInput, TResult>(
  sessionId: string | null | undefined,
  action: ReportAction,
  run: (sessionId: string, input: TInput) => Promise<TResult>
) {
  const sessionKey = sessionId ?? '';
  const [state, setState] = useState<MutationState<TResult>>(() => idle(sessionKey));
  const inFlightRef = useRef<{ sessionKey: string } | null>(null);
  /** 응답 도착 시점의 현재 세션·마운트 여부 */
  const latestSessionRef = useRef(sessionKey);
  const mountedRef = useRef(true);

  useEffect(() => {
    latestSessionRef.current = sessionKey;
  }, [sessionKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (input: TInput): Promise<TResult | null> => {
      if (!sessionKey) return null;
      if (inFlightRef.current?.sessionKey === sessionKey) return null;
      const request = { sessionKey };
      inFlightRef.current = request;
      const isLatest = () => mountedRef.current && latestSessionRef.current === sessionKey;
      setState((prev) => ({
        ...(prev.sessionKey === sessionKey ? prev : idle<TResult>(sessionKey)),
        isPending: true,
        error: null,
        errorStatus: null,
      }));
      try {
        const data = await run(sessionKey, input);
        if (isLatest()) setState({ sessionKey, data, isPending: false, error: null, errorStatus: null });
        return data;
      } catch (error: unknown) {
        if (isLatest()) {
          setState((prev) => ({
            ...(prev.sessionKey === sessionKey ? prev : idle<TResult>(sessionKey)),
            isPending: false,
            error: toReportActionErrorMessage(error, action),
            errorStatus: error instanceof ApiError ? error.status : null,
          }));
        }
        return null;
      } finally {
        if (inFlightRef.current === request) inFlightRef.current = null;
      }
    },
    [sessionKey, action, run]
  );

  const reset = useCallback(() => setState(idle(sessionKey)), [sessionKey]);

  const current = state.sessionKey === sessionKey ? state : idle<TResult>(sessionKey);
  return { execute, reset, ...current };
}

const saveFeedback = (sessionId: string, feedback: ReportFeedback) => submitReportFeedback(sessionId, feedback);
const generate = (sessionId: string) => requestReportGeneration(sessionId);

/**
 * 운동 후 피드백 저장 (PUT .../feedback).
 * save(feedback)는 저장된 피드백을, 실패·무시된 호출은 null을 돌려줍니다.
 * feedback은 서버 코드 형식(EASY·MODERATE·HARD, [A-Z_] 부위 코드)이어야 합니다.
 */
export function useSaveReportFeedback(sessionId: string | null | undefined) {
  const { execute, reset, data, isPending, error, errorStatus } = useSessionMutation<ReportFeedback, ReportFeedback>(
    sessionId,
    '피드백 저장',
    saveFeedback
  );
  return { save: execute, savedFeedback: data, isSaving: isPending, error, errorStatus, reset };
}

/**
 * 운동 리포트 생성 (POST .../generated). 화면이 명시적으로 generate()를 호출할 때만 요청합니다.
 * 이미 생성된 세션이면 서버가 저장본을 돌려줍니다. 409(생성 조건 미충족)는 errorStatus로 확인할 수 있습니다.
 */
export function useGenerateReport(sessionId: string | null | undefined) {
  const { execute, reset, data, isPending, error, errorStatus } = useSessionMutation<void, ReportGenerated>(
    sessionId,
    '리포트 생성',
    generate
  );
  const run = useCallback(() => execute(undefined), [execute]);
  return { generate: run, report: data, isGenerating: isPending, error, errorStatus, reset };
}

interface ReportSetUploadInput {
  setId: string;
  payload: ReportSetCompletedPayload;
  options?: ReportSetUploadOptions;
}

const uploadSet = (sessionId: string, input: ReportSetUploadInput) =>
  uploadReportSetResult(sessionId, input.setId, input.payload, input.options);

/**
 * AI 세트 결과 업로드 (POST .../sets/{setId}). upload()를 호출할 때만 요청합니다.
 *  - 같은 세션에 업로드가 진행 중이면 추가 호출(다른 세트 포함)은 요청 없이 null을 돌려줍니다.
 *    세트를 연달아 올리는 흐름은 결과를 기다린 뒤 다음 세트를 호출하거나, 서비스 함수(uploadReportSetResult)를 직접 쓰세요.
 *  - 실패해도 자동 재시도하지 않습니다. 같은 setId·원문·수행 시각으로 다시 보내면 서버가 already_saved로 처리합니다.
 */
export function useUploadReportSet(sessionId: string | null | undefined) {
  const { execute, reset, data, isPending, error, errorStatus } = useSessionMutation<
    ReportSetUploadInput,
    ReportSetUploadResult
  >(sessionId, '세트 결과 저장', uploadSet);
  const upload = useCallback(
    (setId: string, payload: ReportSetCompletedPayload, options?: ReportSetUploadOptions) =>
      execute({ setId, payload, options }),
    [execute]
  );
  return { upload, result: data, isUploading: isPending, error, errorStatus, reset };
}
