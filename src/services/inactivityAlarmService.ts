import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const INACTIVITY_ALARM_ID = 'barofit-inactivity-2days';
export const ANDROID_CHANNEL_ID = 'barofit-inactivity-channel';

const INACTIVITY_ALARM_CONTENT = {
  title: '👟 회원님, 이틀 동안 운동 기록이 없어요!',
  body: '오늘 몸 컨디션은 어떠신가요? 가벼운 10분 운동으로 상쾌하게 하루를 시작해 봐요!',
};

let isHandlerInitialized = false;

function ensureNotificationHandler(): void {
  if (isHandlerInitialized || Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  isHandlerInitialized = true;
}

/**
 * iOS & Android 통합 알림 권한 요청 및 Android 채널 초기화
 */
export async function initCrossPlatformAlarm(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    ensureNotificationHandler();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: '운동 미접속 리마인드 알림',
        description: '2일 이상 미접속 시 오전 9시에 발송되는 운동 독려 알림',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

/**
 * 앱 접속/포그라운드 진입 시 호출:
 * 기존 미접속 알림을 취소하고 오늘 기준 +2일 뒤 오전 9시(09:00)로 재예약
 */
export async function rescheduleInactivityAlarm(): Promise<void> {
  if (Platform.OS === 'web') return;

  const hasPermission = await initCrossPlatformAlarm();
  if (!hasPermission) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(INACTIVITY_ALARM_ID);
  } catch {
    // 기존 예약 알림이 없는 경우 무시
  }

  const triggerDate = new Date();
  triggerDate.setDate(triggerDate.getDate() + 2);
  triggerDate.setHours(9, 0, 0, 0);

  await Notifications.scheduleNotificationAsync({
    identifier: INACTIVITY_ALARM_ID,
    content: {
      title: INACTIVITY_ALARM_CONTENT.title,
      body: INACTIVITY_ALARM_CONTENT.body,
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: ANDROID_CHANNEL_ID }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      ...(Platform.OS === 'android' && { channelId: ANDROID_CHANNEL_ID }),
    },
  });
}

/**
 * 알람 수동 즉시 발송
 */
export async function triggerManualInactivityAlarm(): Promise<void> {
  if (Platform.OS === 'web') return;

  const hasPermission = await initCrossPlatformAlarm();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: INACTIVITY_ALARM_CONTENT.title,
      body: INACTIVITY_ALARM_CONTENT.body,
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: ANDROID_CHANNEL_ID }),
    },
    trigger: null,
  });
}

/**
 * 로그아웃·회원 탈퇴 시 예약되어 있는 미접속 로컬 알림을 취소합니다.
 */
export async function cancelInactivityAlarm(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.cancelScheduledNotificationAsync(INACTIVITY_ALARM_ID);
  } catch {
    // 예약된 알림이 없거나 권한이 없는 경우 무시
  }
}
