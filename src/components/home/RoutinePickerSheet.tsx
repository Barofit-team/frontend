import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RecommendedRoutineItem } from '@/types/weeklyPlan';
import { ChevronRightIcon } from './HomeIcons';
import { RoutineMetrics } from './RoutineMetrics';

const FILTERS = [
  '전체',
  '상체',
  '하체',
  '유산소',
  '코어',
  '초급',
  '중급',
  '전신',
  '등',
] as const;
type Props = {
  visible: boolean;
  routines: RecommendedRoutineItem[];
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onSelect: (routine: RecommendedRoutineItem) => void;
};

export function RoutinePickerSheet({
  visible,
  routines,
  loading,
  busy,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<string>('전체');
  const list = useMemo(
    () =>
      routines.filter(
        (r) =>
          filter === '전체' ||
          (filter === '초급'
            ? r.difficulty === 'BEGINNER'
            : filter === '중급'
              ? r.difficulty === 'INTERMEDIATE'
              : r.category === (filter === '유산소' ? '심폐' : filter)),
      ),
    [routines, filter],
  );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="루틴 목록 닫기"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <Text style={styles.title}>바로핏 운동 루틴</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={onClose}
              style={styles.close}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            style={styles.filterScroll}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {FILTERS.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === item }}
                onPress={() => setFilter(item)}
                style={[styles.chip, filter === item && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipText,
                    filter === item && styles.chipTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
          >
            {loading ? (
              <ActivityIndicator color="#2460E8" style={styles.empty} />
            ) : list.length === 0 ? (
              <Text style={styles.empty}>
                이 분류에 공개된 루틴이 아직 없어요.
              </Text>
            ) : (
              list.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} 루틴 보기`}
                  disabled={busy}
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [
                    styles.card,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.info}>
                    <Text style={styles.name}>{item.title}</Text>
                    <RoutineMetrics
                      count={item.exerciseCount}
                      minutes={item.durationMinutes}
                      calories={item.calories}
                      compact
                    />
                  </View>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>
                      {item.category === '심폐' ? '유산소' : item.category}
                    </Text>
                  </View>
                  <ChevronRightIcon size={13} color="#777777" />
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '91%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  title: { fontSize: 19, fontWeight: '700', color: '#222222' },
  close: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F4F4F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#777777', fontSize: 25, lineHeight: 28 },
  filterScroll: { height: 54, maxHeight: 54, flexGrow: 0, flexShrink: 0 },
  filters: {
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 16,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 20,
    backgroundColor: '#FAFAFA',
  },
  chipActive: { backgroundColor: '#222222', borderColor: '#222222' },
  chipText: { color: '#666666', fontSize: 12, fontWeight: '500' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 16, gap: 9 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 15,
    minHeight: 76,
  },
  info: { flex: 1, gap: 7 },
  name: { fontSize: 14, fontWeight: '600', color: '#222222' },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: '#EAF0FF',
    borderRadius: 6,
  },
  tagText: { fontSize: 11, fontWeight: '600', color: '#3972FF' },
  pressed: { opacity: 0.65 },
  empty: {
    paddingVertical: 50,
    textAlign: 'center',
    color: '#888888',
    fontSize: 14,
  },
});
