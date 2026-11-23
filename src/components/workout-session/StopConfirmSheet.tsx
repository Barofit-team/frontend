/**
 * 운동 종료 확인 바텀시트 (일시정지 화면 위). 표시 전용입니다.
 *  - 운동 종료 → onConfirm (기존 '저장하고 나가기': 진행 상태를 임시저장하고 나감, 오늘 이어하기 가능)
 *  - 돌아가기 / 배경 탭 / Android 뒤로가기 → onCancel (일시정지 화면으로 복귀)
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionColors } from './sessionPalette';

type StopConfirmSheetProps = {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 저장·이동 처리 중이면 true → 버튼 비활성화(중복 탭 방지) */
  busy?: boolean;
};

export function StopConfirmSheet({ visible, onConfirm, onCancel, busy = false }: StopConfirmSheetProps) {
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
          accessibilityLabel="돌아가기"
          disabled={busy}
          onPress={onCancel}
        />
        <View style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            운동을 종료할까요?
          </Text>
          <Text style={styles.body}>
            {'지금까지 운동한 기록은 임시저장됩니다.\n오늘 언제든 다시 시작할 수 있어요.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onConfirm}
            style={({ pressed }) => [styles.confirmButton, (pressed || busy) && styles.pressed]}>
            <Text style={styles.confirmText}>운동 종료</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} hitSlop={8} onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>돌아가기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: SessionColors.sheet,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: SessionColors.sheetText },
  body: { marginTop: 8, fontSize: 13, lineHeight: 20, color: SessionColors.sheetSubText },
  confirmButton: {
    marginTop: 32,
    height: 48,
    borderRadius: 8,
    backgroundColor: SessionColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontSize: 15, fontWeight: '700', color: SessionColors.onCamera },
  cancel: { alignSelf: 'center', marginTop: 18, paddingVertical: 6 },
  cancelText: { fontSize: 14, fontWeight: '600', color: SessionColors.sheetSubText },
  pressed: { opacity: 0.7 },
});
