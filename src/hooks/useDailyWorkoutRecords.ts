import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchDailyWorkoutRecords } from '@/services/workoutRecordService';
import type { DailyWorkoutRecord } from '@/types/workoutRecord';

interface DailyRecordsState {
  /** 이 상태가 어느 날짜의 것인지 (다른 날짜 데이터 혼합 방지) */
  date: string;
  records: DailyWorkoutRecord[];
  nextPage: number;
  hasNext: boolean;
  isLoading: boolean;
  error: string | null;
}

function initialStateOf(date: string): DailyRecordsState {
  return { date, records: [], nextPage: 0, hasNext: true, isLoading: true, error: null };
}

/**
 * 선택 날짜의 일일 운동일지 (4개씩 추가 로딩).
 *  - 날짜가 바뀌면 목록을 비우고 첫 페이지부터 다시 불러옵니다.
 *  - 요청 중에는 추가 로딩을 막고(중복 방지), 마지막 페이지 이후에는 더 요청하지 않습니다.
 *  - 날짜가 바뀐 뒤 도착한 이전 날짜의 응답은 버립니다.
 */
export function useDailyWorkoutRecords(date: string) {
  const [state, setState] = useState<DailyRecordsState>(() => initialStateOf(date));
  const latestDateRef = useRef(date);
  /** 진행 중인 요청 (렌더링 전에도 바로 확인할 수 있도록 ref로 관리) */
  const inFlightRef = useRef<{ date: string; page: number } | null>(null);

  const load = useCallback(async (targetDate: string, page: number) => {
    if (inFlightRef.current?.date === targetDate) return;
    const request = { date: targetDate, page };
    inFlightRef.current = request;
    setState((prev) => (prev.date === targetDate ? { ...prev, isLoading: true, error: null } : prev));

    try {
      const result = await fetchDailyWorkoutRecords(targetDate, page);
      if (latestDateRef.current !== targetDate) return;
      setState((prev) =>
        prev.date !== targetDate
          ? prev
          : {
              ...prev,
              records: page === 0 ? result.items : [...prev.records, ...result.items],
              nextPage: page + 1,
              hasNext: result.hasNext,
              isLoading: false,
            }
      );
    } catch {
      if (latestDateRef.current !== targetDate) return;
      setState((prev) =>
        prev.date !== targetDate
          ? prev
          : { ...prev, isLoading: false, error: '운동기록을 불러오지 못했어요.' }
      );
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    latestDateRef.current = date;
    inFlightRef.current = null;
    setState(initialStateOf(date));
    void load(date, 0);
  }, [date, load]);

  // 날짜가 막 바뀐 렌더에서는 이전 날짜 목록 대신 초기 상태를 보여줍니다
  const current = state.date === date ? state : initialStateOf(date);

  const loadMore = useCallback(() => {
    if (current.date !== date || !current.hasNext || current.isLoading || current.error) return;
    if (inFlightRef.current) return;
    void load(date, current.nextPage);
  }, [current, date, load]);

  const retry = useCallback(() => {
    if (inFlightRef.current) return;
    void load(date, current.nextPage);
  }, [current.nextPage, date, load]);

  return {
    records: current.records,
    hasNext: current.hasNext,
    isLoading: current.isLoading,
    error: current.error,
    loadMore,
    retry,
  };
}
