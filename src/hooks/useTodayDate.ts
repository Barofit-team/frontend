import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { toIsoDateString } from '@/services/weeklyPlanService';

/** Refresh at local midnight and after returning from the background. */
export function useTodayDate() {
  const [today, setToday] = useState(() => toIsoDateString(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setToday(toIsoDateString(now));
      timer = setTimeout(refresh, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 50);
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  return today;
}
