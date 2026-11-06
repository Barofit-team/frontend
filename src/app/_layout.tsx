import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { flushWorkoutQueue, isOffline } from '@/services/offlineWorkout';
import { useAuthStore } from '@/stores/useAuthStore';
import { StatusBar } from 'expo-status-bar';

import { useInactivityAlarm } from '@/hooks/useInactivityAlarm';

export default function RootLayout() {
  useInactivityAlarm();
  const owner = useAuthStore(state => state.user?.id);
  const warned = useRef(false);
  useEffect(() => {
    if (!owner || owner === 'dev-user') return;
    const flush = () => void flushWorkoutQueue(owner, () => useAuthStore.getState().user?.id === owner)
      .then(() => { warned.current = false; })
      .catch(error => {
        if (!isOffline(error) && !warned.current) {
          warned.current = true;
          Alert.alert('운동 동기화 대기', '저장된 기록을 서버에 반영하지 못했어요. 기록은 기기에 보관돼요. 연결 상태나 원본 루틴 변경 여부를 확인해 주세요.');
        }
      });
    flush();
    const interval = setInterval(flush, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') flush(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [owner]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

