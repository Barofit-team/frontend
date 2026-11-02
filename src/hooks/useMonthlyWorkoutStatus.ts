import { useCallback, useEffect, useRef, useState } from 'react';

import type { YearMonth } from '@/components/workout-records/calendar';
import { fetchMonthlyWorkoutStatus, toWorkoutRecordErrorMessage } from '@/services/workoutRecordService';
import type { MonthlyWorkoutStatusMap } from '@/types/workoutRecord';

const EMPTY_STATUSES: MonthlyWorkoutStatusMap = {};

interface LoadedMonth {
  /** 어느 월의 응답인지 ('YYYY-M') */
  monthKey: string;
  /** 어느 월(+재조회 횟수)의 응답인지 */
  key: string;
  statuses: MonthlyWorkoutStatusMap;
  error: string | null;
}

/**
 * 선택한 월의 날짜별 운동 상태 (GET /api/v1/reports/calendar).
 * 월을 빠르게 바꿔도 마지막으로 선택한 월의 응답만 반영합니다.
 *  - retry: 오류 후 다시 시도
 *  - refresh: 같은 월을 다시 조회 (탭 재진입 등). 이미 요청 중이면 무시하고,
 *    응답이 올 때까지는 기존 달력 상태를 그대로 보여줍니다.
 */
export function useMonthlyWorkoutStatus({ year, month }: YearMonth) {
  const [attempt, setAttempt] = useState(0);
  const monthKey = `${year}-${month}`;
  const key = `${monthKey}#${attempt}`;
  const [loaded, setLoaded] = useState<LoadedMonth>({
    monthKey: '',
    key: '',
    statuses: EMPTY_STATUSES,
    error: null,
  });
  /** 진행 중인 요청 (중복 재조회 방지). 요청마다 새 객체라 같은 key가 두 번 실행돼도 구분됩니다 */
  const inFlightRef = useRef<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    const request = {};
    inFlightRef.current = request;
    fetchMonthlyWorkoutStatus(year, month)
      .then((statuses) => {
        if (!cancelled) setLoaded({ monthKey, key, statuses, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          // 인증·네트워크 오류도 빈 달력이 아니라 오류로 표시합니다
          setLoaded({
            monthKey,
            key,
            statuses: EMPTY_STATUSES,
            error: toWorkoutRecordErrorMessage(error, '운동 달력'),
          });
        }
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [key, monthKey, year, month]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const refresh = useCallback(() => {
    if (inFlightRef.current) return;
    setAttempt((value) => value + 1);
  }, []);

  const isCurrent = loaded.key === key;
  // 같은 월을 다시 불러오는 중에는 이전 응답을 유지 (다른 월로 바뀐 경우에는 비움)
  const isSameMonth = loaded.monthKey === monthKey;
  return {
    statuses: isCurrent || isSameMonth ? loaded.statuses : EMPTY_STATUSES,
    isLoading: !isCurrent,
    error: isCurrent ? loaded.error : null,
    retry,
    refresh,
  };
}
