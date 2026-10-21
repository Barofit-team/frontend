import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useInactivityAlarm } from '@/hooks/useInactivityAlarm';

export default function RootLayout() {
  useInactivityAlarm();

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

