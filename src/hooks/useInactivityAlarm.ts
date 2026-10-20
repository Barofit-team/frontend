import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { rescheduleInactivityAlarm } from '@/services/inactivityAlarmService';

/**
 * 앱 실행 및 포그라운드 진입 시마다
 * "2일 뒤 오전 9시"로 미접속 알림을 자동 갱신하는 훅
 */
export function useInactivityAlarm() {
  useEffect(() => {
    rescheduleInactivityAlarm();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        rescheduleInactivityAlarm();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
