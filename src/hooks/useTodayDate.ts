import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { kstDateOf } from '@/services/kstDate';

/** Refresh at Korean midnight and after returning from the background, independent of device timezone. */
export function useTodayDate() {
  const [today, setToday] = useState(() => kstDateOf(Date.now())!);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = Date.now();
      const day = kstDateOf(now)!;
      setToday(day);
      const nextMidnight = Date.parse(`${day}T00:00:00+09:00`) + 24 * 60 * 60 * 1000;
      timer = setTimeout(refresh, nextMidnight - now + 50);
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  return today;
}
