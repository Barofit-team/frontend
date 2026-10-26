import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatYearMonth, isSameYearMonth, type YearMonth } from './calendar';
import { RecordColors } from './palette';

interface MonthPickerModalProps {
  visible: boolean;
  value: YearMonth;
  options: YearMonth[];
  onConfirm: (value: YearMonth) => void;
  onClose: () => void;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const SIDE_ITEMS = (VISIBLE_ITEMS - 1) / 2;

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), length - 1);
}

/** 가운데 항목이 선택되는 연도·월 휠 (Figma: 가운데 굵게, 멀어질수록 흐리게) */
export function MonthPickerModal({ visible, value, options, onConfirm, onClose }: MonthPickerModalProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const valueIndex = Math.max(
    0,
    options.findIndex((option) => isSameYearMonth(option, value))
  );
  const [centerIndex, setCenterIndex] = useState(valueIndex);

  // 열 때마다 현재 선택된 월에서 시작
  useEffect(() => {
    if (visible) setCenterIndex(valueIndex);
  }, [visible, valueIndex]);

  const indexOf = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    clampIndex(Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT), options.length);

  const scrollToIndex = (index: number, animated: boolean) => {
    scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated });
    setCenterIndex(index);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel="닫기" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title} accessibilityRole="header">
          연도·월 선택
        </Text>

        <View style={styles.wheel}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            scrollEventThrottle={16}
            contentContainerStyle={styles.wheelContent}
            onLayout={() => scrollRef.current?.scrollTo({ y: valueIndex * ITEM_HEIGHT, animated: false })}
            onScroll={(event) => setCenterIndex(indexOf(event))}
            onMomentumScrollEnd={(event) => setCenterIndex(indexOf(event))}>
            {options.map((option, index) => {
              const distance = Math.abs(index - centerIndex);
              return (
                <Pressable
                  key={`${option.year}-${option.month}`}
                  accessibilityRole="button"
                  accessibilityLabel={formatYearMonth(option)}
                  accessibilityState={{ selected: distance === 0 }}
                  style={styles.item}
                  onPress={() => scrollToIndex(index, true)}>
                  <Text
                    style={[
                      styles.itemText,
                      distance === 0 ? styles.itemCenter : distance === 1 ? styles.itemNear : styles.itemFar,
                    ]}>
                    {formatYearMonth(option)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onConfirm(options[centerIndex])}
            style={({ pressed }) => [styles.action, styles.confirm, pressed && styles.pressed]}>
            <Text style={styles.confirmText}>확인</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: {
    backgroundColor: RecordColors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  title: { fontSize: 15, fontWeight: '700', color: RecordColors.text, textAlign: 'center' },
  wheel: { height: ITEM_HEIGHT * VISIBLE_ITEMS, marginTop: 12 },
  wheelContent: { paddingVertical: ITEM_HEIGHT * SIDE_ITEMS },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 14, fontWeight: '600' },
  itemCenter: { fontSize: 20, fontWeight: '700', color: RecordColors.text },
  itemNear: { fontSize: 15, color: RecordColors.textSecondary },
  itemFar: { color: RecordColors.dayTextFuture },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  action: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: RecordColors.control },
  confirm: { backgroundColor: RecordColors.selected },
  cancelText: { fontSize: 15, fontWeight: '600', color: RecordColors.text },
  confirmText: { fontSize: 15, fontWeight: '600', color: RecordColors.white },
  pressed: { opacity: 0.7 },
});
