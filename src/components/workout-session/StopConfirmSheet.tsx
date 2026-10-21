/**
 * 운동 중단 확인 바텀시트 (일시 정지 화면 위). 표시 전용입니다.
 *  - 저장하고 나가기 → onConfirm
 *  - 계속 운동하기 / 배경 탭 / Android 뒤로가기 → onCancel (일시 정지 화면으로 복귀)
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrepColors } from '@/components/workout-preparation/palette';

import { SessionProgressCard } from './SessionProgressCard';

type StopConfirmSheetProps = {
  visible: boolean;
  statusText: string;
  reps: number;
  targetReps: number;
  onConfirm: () => void;
  onCancel: () => void;
  /** 저장·이동 처리 중이면 true → 버튼 비활성화(중복 탭 방지) */
  busy?: boolean;
};

export function StopConfirmSheet({
  visible,
  statusText,
  reps,
  targetReps,
  onConfirm,
  onCancel,
  busy = false,
}: StopConfirmSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="계속 운동하기"
          disabled={busy}
          onPress={onCancel}
        />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">
            운동을 중단할까요?
          </Text>
          <Text style={styles.body}>
            {'지금까지 저장한 상태를 임시 저장합니다.\n오늘이 지나면, 새로운 루틴으로 다시 시작해요.'}
          </Text>
          <SessionProgressCard statusText={statusText} reps={reps} targetReps={targetReps} style={styles.card} />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onConfirm}
            style={({ pressed }) => [styles.confirmButton, (pressed || busy) && styles.pressed]}>
            <Text style={styles.confirmText}>저장하고 나가기</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} hitSlop={8} onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>계속 운동하기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: PrepColors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
  },
  title: { marginTop: 28, fontSize: 18, lineHeight: 24, fontWeight: '800', color: PrepColors.text },
  body: { marginTop: 8, fontSize: 13, lineHeight: 22, color: PrepColors.textSecondary },
  card: { marginTop: 24 },
  confirmButton: {
    marginTop: 40,
    height: 44,
    borderRadius: 999,
    backgroundColor: PrepColors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontSize: 14, fontWeight: '700', color: PrepColors.white },
  cancel: { alignSelf: 'center', marginTop: 20, paddingVertical: 4 },
  cancelText: { fontSize: 13, fontWeight: '600', color: PrepColors.textSecondary },
  pressed: { opacity: 0.7 },
});
