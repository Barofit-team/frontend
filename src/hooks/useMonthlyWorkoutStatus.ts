import { useEffect, useState } from 'react';

import type { YearMonth } from '@/components/workout-records/calendar';
import { fetchMonthlyWorkoutStatus } from '@/services/workoutRecordService';
import type { MonthlyWorkoutStatusMap } from '@/types/workoutRecord';

const EMPTY_STATUSES: MonthlyWorkoutStatusMap = {};

/**
 * 선택한 월의 날짜별 운동 상태.
 * 월을 빠르게 바꿔도 마지막으로 선택한 월의 응답만 반영합니다.
 */
export function useMonthlyWorkoutStatus({ year, month }: YearMonth) {
  const key = `${year}-${month}`;
  const [loaded, setLoaded] = useState<{ key: string; statuses: MonthlyWorkoutStatusMap }>({
    key: '',
    statuses: EMPTY_STATUSES,
  });

  useEffect(() => {
    let cancelled = false;
    fetchMonthlyWorkoutStatus(year, month)
      .then((statuses) => {
        if (!cancelled) setLoaded({ key, statuses });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, statuses: EMPTY_STATUSES });
      });
    return () => {
      cancelled = true;
    };
  }, [key, year, month]);

  const isCurrent = loaded.key === key;
  return {
    statuses: isCurrent ? loaded.statuses : EMPTY_STATUSES,
    isLoading: !isCurrent,
  };
}
