import { useCallback, useEffect, useRef, useState } from 'react';

import type { YearMonth } from '@/components/workout-records/calendar';
import {
  fetchMonthlyWorkoutRecords,
  MONTHLY_RECORD_PAGE_SIZE,
  toWorkoutRecordErrorMessage,
} from '@/services/workoutRecordService';
import type { DailyWorkoutRecord } from '@/types/workoutRecord';

/** 조회 조건 (연·월·페이지 크기) */
interface MonthlyRecordsQuery {
  key: string;
  year: number;
  month: number;
  size: number;
}

interface MonthlyRecordsState {
  /** 이 상태가 어느 조회 조건의 것인지 (다른 월 데이터 혼합 방지) */
  key: string;
  records: DailyWorkoutRecord[];
  nextPage: number;
  hasNext: boolean;
  isLoading: boolean;
  error: string | null;
}

function initialStateOf(key: string): MonthlyRecordsState {
  return { key, records: [], nextPage: 0, hasNext: true, isLoading: true, error: null };
}

/** 페이지 사이에 서버 데이터가 바뀌어 같은 기록이 다시 오더라도 한 번만 둡니다 */
function mergeRecords(base: DailyWorkoutRecord[], incoming: DailyWorkoutRecord[]): DailyWorkoutRecord[] {
  const seen = new Set(base.map((record) => record.id));
  const merged = [...base];
  for (const record of incoming) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    merged.push(record);
  }
  return merged;
}

/**
 * 선택한 월의 운동일지 (GET /api/v1/reports/history, 서버 페이지네이션).
 * useDailyWorkoutRecords와 같은 방식으로 동작합니다.
 *  - 연·월·페이지 크기가 바뀌면 목록을 비우고 첫 페이지부터 다시 불러옵니다.
 *  - loadMore: 다음 페이지를 이어 붙입니다. 요청 중이거나 마지막 페이지 이후에는 요청하지 않습니다.
 *  - retry: 실패한 페이지를 다시 요청합니다.
 *  - refresh: 같은 조건의 첫 페이지를 다시 받습니다 (목록은 응답이 올 때까지 유지, 첫 페이지를 받는 중이면 무시).
 *  - 조건이 바뀌었거나 새 요청으로 대체된 응답은 버립니다.
 */
export function useMonthlyWorkoutRecords({ year, month }: YearMonth, size: number = MONTHLY_RECORD_PAGE_SIZE) {
  const key = `${year}-${month}#${size}`;
  const [state, setState] = useState<MonthlyRecordsState>(() => initialStateOf(key));
  const latestQueryRef = useRef<MonthlyRecordsQuery>({ key, year, month, size });
  /** 진행 중인 요청 (렌더링 전에도 바로 확인할 수 있도록 ref로 관리) */
  const inFlightRef = useRef<{ key: string; page: number } | null>(null);

  const load = useCallback(async (query: MonthlyRecordsQuery, page: number) => {
    if (inFlightRef.current?.key === query.key) return;
    const request = { key: query.key, page };
    inFlightRef.current = request;
    setState((prev) => (prev.key === query.key ? { ...prev, isLoading: true, error: null } : prev));

    try {
      const result = await fetchMonthlyWorkoutRecords(query.year, query.month, page, query.size);
      if (latestQueryRef.current.key !== query.key || inFlightRef.current !== request) return;
      setState((prev) =>
        prev.key !== query.key
          ? prev
          : {
              ...prev,
              records: mergeRecords(page === 0 ? [] : prev.records, result.items),
              nextPage: page + 1,
              hasNext: result.hasNext,
              isLoading: false,
            }
      );
    } catch (error) {
      if (latestQueryRef.current.key !== query.key || inFlightRef.current !== request) return;
      setState((prev) =>
        prev.key !== query.key
          ? prev
          : // 다시 시도하면 실패한 페이지를 다시 요청하도록 (refresh 실패 시 page 0)
            { ...prev, nextPage: page, isLoading: false, error: toWorkoutRecordErrorMessage(error, '운동기록') }
      );
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    const query = { key, year, month, size };
    latestQueryRef.current = query;
    inFlightRef.current = null;
    setState(initialStateOf(key));
    void load(query, 0);
  }, [key, year, month, size, load]);

  // 조건이 막 바뀐 렌더에서는 이전 월 목록 대신 초기 상태를 보여줍니다
  const current = state.key === key ? state : initialStateOf(key);

  const loadMore = useCallback(() => {
    if (current.key !== key || !current.hasNext || current.isLoading || current.error) return;
    if (inFlightRef.current) return;
    void load({ key, year, month, size }, current.nextPage);
  }, [current, key, year, month, size, load]);

  const retry = useCallback(() => {
    if (inFlightRef.current) return;
    void load({ key, year, month, size }, current.nextPage);
  }, [current.nextPage, key, year, month, size, load]);

  // 화면 포커스 콜백에서 쓰기 좋도록 조회 조건에 의존하지 않는 안정적인 함수로 둡니다
  const refresh = useCallback(() => {
    const query = latestQueryRef.current;
    const inFlight = inFlightRef.current;
    if (inFlight?.key === query.key && inFlight.page === 0) return;
    inFlightRef.current = null; // 진행 중인 추가 로딩이 있으면 그 응답은 버립니다
    void load(query, 0);
  }, [load]);

  return {
    records: current.records,
    hasNext: current.hasNext,
    isLoading: current.isLoading,
    error: current.error,
    loadMore,
    retry,
    refresh,
  };
}
