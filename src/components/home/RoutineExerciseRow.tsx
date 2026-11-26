import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RoutineExerciseDetail } from '@/types/routine';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import { CATEGORY_LABELS, summarizeExercise } from './routineEditing';

type Props = {
  exercise: RoutineExerciseDetail;
  reorder: boolean;
  disabled: boolean;
  onPress: () => void;
  onMove: (id: string, direction: number) => void;
  onDragging: (value: boolean) => void;
};
export function RoutineExerciseRow({
  exercise,
  reorder,
  disabled,
  onPress,
  onMove,
  onDragging,
}: Props) {
  const latest = useRef({ onMove, onDragging });
  latest.current = { onMove, onDragging };
  const offset = useRef(0);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
        onPanResponderGrant: () => {
          offset.current = 0;
          latest.current.onDragging(true);
        },
        onPanResponderMove: (_, g) => {
          const delta = g.dy - offset.current;
          if (Math.abs(delta) > 42) {
            const direction = delta > 0 ? 1 : -1;
            latest.current.onMove(exercise.id, direction);
            offset.current += direction * 85;
          }
        },
        onPanResponderRelease: () => latest.current.onDragging(false),
        onPanResponderTerminate: () => latest.current.onDragging(false),
      }),
    [exercise.id],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${summarizeExercise(exercise)}, 설정 편집`}
      disabled={disabled}
      onPress={reorder ? undefined : onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.thumbnail} accessible={false}>
        <ExerciseThumbnail exerciseId={exercise.exerciseId} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{exercise.name}</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>
            {CATEGORY_LABELS[exercise.category ?? ''] ??
              (exercise.measurementType === 'DURATION'
                ? '시간 운동'
                : '횟수 운동')}
          </Text>
        </View>
      </View>
      {reorder ? (
        <View
          {...responder.panHandlers}
          accessible
          accessibilityLabel={`${exercise.name} 순서 변경`}
          accessibilityActions={[
            { name: 'increment', label: '아래로 이동' },
            { name: 'decrement', label: '위로 이동' },
          ]}
          onAccessibilityAction={(e) =>
            onMove(
              exercise.id,
              e.nativeEvent.actionName === 'increment' ? 1 : -1,
            )
          }
          style={styles.handle}
        >
          <Text style={styles.handleText}>≡</Text>
        </View>
      ) : (
        <Text style={styles.volume}>{summarizeExercise(exercise)}</Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    minHeight: 77,
    paddingHorizontal: 13,
    paddingVertical: 13,
    gap: 10,
  },
  thumbnail: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  info: { flex: 1, gap: 7 },
  name: {
    color: '#222222',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: -0.35,
  },
  tag: {
    backgroundColor: '#E5EDFF',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  tagText: { color: '#3972FF', fontWeight: '600', fontSize: 11 },
  volume: { color: '#666666', fontSize: 12, maxWidth: 103, textAlign: 'right' },
  handle: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleText: { color: '#999999', fontSize: 26 },
  pressed: { opacity: 0.7 },
});
