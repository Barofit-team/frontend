import { Alert, Platform } from 'react-native';
export function confirmAction(
  title: string,
  message: string,
  action = '확인',
): Promise<boolean> {
  if (Platform.OS === 'web')
    return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: action, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
