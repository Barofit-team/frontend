import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoutineExerciseDetail } from '@/types/routine';
import { confirmAction } from './confirmAction';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import {
  formatDuration,
  MAX_PREVIEW_SETS,
  parseDuration,
} from './routineEditing';

type Props = {
  exercise: RoutineExerciseDetail;
  canDelete: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (exercise: RoutineExerciseDetail) => Promise<void>;
  onDelete: () => Promise<void>;
};
export function ExerciseSetSheet({
  exercise,
  canDelete,
  busy,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const timed = exercise.measurementType === 'DURATION';
  const [rows, setRows] = useState(() =>
    exercise.sets.map((s) => ({
      ...s,
      reps: String(s.targetReps ?? 20),
      duration: formatDuration(s.targetDurationSeconds ?? 60),
      limit: formatDuration(s.timeLimitSeconds ?? 60),
    })),
  );
  const [rest, setRest] = useState(exercise.sets[0]?.restSeconds ?? 60);
  const [restChanged, setRestChanged] = useState(false);
  const save = async () => {
    const sets = rows.map((row, i) => ({
      id: row.id,
      order: i + 1,
      weightKg: row.weightKg,
      restSeconds: restChanged ? rest : row.restSeconds,
      targetReps: timed
        ? null
        : /^\d+$/.test(row.reps)
          ? Number(row.reps)
          : null,
      targetDurationSeconds: timed ? parseDuration(row.duration) : null,
      timeLimitSeconds: timed ? null : parseDuration(row.limit),
    }));
    if (
      sets.some((s) =>
        timed
          ? s.targetDurationSeconds == null
          : s.targetReps == null ||
            s.targetReps < 1 ||
            s.targetReps > 1000 ||
            s.timeLimitSeconds == null,
      )
    ) {
      Alert.alert(
        '입력값을 확인해 주세요',
        '횟수는 1~1000회, 시간은 분:초로 최소 00:10~최대 60:00까지 입력해 주세요. 초는 00~59예요.',
      );
      return;
    }
    await onSave({ ...exercise, sets });
  };
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityLabel="편집 닫기"
          style={StyleSheet.absoluteFill}
          disabled={busy}
          onPress={onClose}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <ExerciseThumbnail exerciseId={exercise.exerciseId} size={40} />
            <Text style={styles.title}>{exercise.name}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy || !canDelete}
              onPress={async () => {
                if (
                  await confirmAction(
                    '종목 삭제',
                    `${exercise.name}을 선택한 날짜의 루틴에서 제외할까요?`,
                    '삭제',
                  )
                )
                  await onDelete();
              }}
              style={[styles.delete, !canDelete && styles.disabled]}
            >
              <Text style={styles.deleteText}>▢ 종목 삭제</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scroll}
          >
            <View style={styles.setCard}>
              {rows.map((row, i) => (
                <View key={row.id} style={styles.setRow}>
                  <Text style={styles.setLabel}>{i + 1}세트</Text>
                  {!timed && (
                    <>
                      <TextInput
                        accessibilityLabel={`${exercise.name} ${i + 1}세트 횟수`}
                        value={row.reps}
                        keyboardType="number-pad"
                        editable={!busy}
                        maxLength={4}
                        onChangeText={(text) =>
                          setRows((prev) =>
                            prev.map((r, n) =>
                              n === i ? { ...r, reps: text } : r,
                            ),
                          )
                        }
                        style={[styles.input, styles.repsInput]}
                      />
                      <Text style={styles.unit}>회</Text>
                    </>
                  )}
                  <View style={styles.timeInput}>
                    {(['분', '초'] as const).map((unit, part) => (
                      <React.Fragment key={unit}>
                        {part === 1 && <Text style={styles.timeColon}>:</Text>}
                        <TextInput
                          accessibilityLabel={`${exercise.name} ${i + 1}세트 ${timed ? '운동 시간' : '제한 시간'} (${unit})`}
                          value={(timed ? row.duration : row.limit).split(':')[part]}
                          placeholder="00"
                          editable={!busy}
                          keyboardType="number-pad"
                          maxLength={2}
                          selectTextOnFocus
                          onChangeText={(text) => {
                            if (!/^\d{0,2}$/.test(text)) return;
                            setRows((prev) => prev.map((r, n) => {
                              if (n !== i) return r;
                              const key = timed ? 'duration' : 'limit';
                              const parts = r[key].split(':');
                              parts[part] = text;
                              return { ...r, [key]: parts.join(':') };
                            }));
                          }}
                          onBlur={() => setRows((prev) => prev.map((r, n) => {
                            if (n !== i) return r;
                            const key = timed ? 'duration' : 'limit';
                            return { ...r, [key]: r[key].split(':').map((p) => p.padStart(2, '0')).join(':') };
                          }))}
                          style={styles.timePart}
                        />
                      </React.Fragment>
                    ))}
                  </View>
                  <Text style={styles.unit}>분:초</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${i + 1}세트 삭제`}
                    disabled={rows.length <= 1 || busy}
                    onPress={() =>
                      setRows((prev) => prev.filter((_, n) => n !== i))
                    }
                    style={[styles.remove, rows.length <= 1 && styles.disabled]}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                disabled={busy || rows.length >= MAX_PREVIEW_SETS}
                onPress={() =>
                  setRows((prev) => [
                    ...prev,
                    { ...prev[prev.length - 1], id: `draft-${Date.now()}` },
                  ])
                }
                style={[
                  styles.add,
                  rows.length >= MAX_PREVIEW_SETS && styles.addDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.addText,
                    rows.length >= MAX_PREVIEW_SETS && styles.muted,
                  ]}
                >
                  세트 추가
                </Text>
              </Pressable>
            </View>
            <View style={styles.restRow}>
              <Text style={styles.restLabel}>세트 간 휴식</Text>
              <View style={styles.restControls}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="세트 간 휴식 줄이기"
                  disabled={busy || rest <= 0}
                  onPress={() => {
                    setRestChanged(true);
                    setRest((x) => Math.max(0, x - 10));
                  }}
                  style={styles.step}
                >
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={styles.restValue}>{formatDuration(rest)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="세트 간 휴식 늘리기"
                  disabled={busy || rest >= 600}
                  onPress={() => {
                    setRestChanged(true);
                    setRest((x) => Math.min(600, x + 10));
                  }}
                  style={styles.step}
                >
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void save()}
              style={[styles.save, busy && styles.disabled]}
            >
              <Text style={styles.saveText}>
                {busy ? '저장 중…' : '변경사항 저장'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onClose}
              style={styles.back}
            >
              <Text style={styles.backText}>돌아가기</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    height: '86%',
    borderTopLeftRadius: 17,
    borderTopRightRadius: 17,
    backgroundColor: '#FAFAFA',
    paddingTop: 18,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  title: { fontSize: 19, color: '#222222', fontWeight: '700', flex: 1 },
  delete: {
    paddingVertical: 10,
    paddingHorizontal: 9,
    borderRadius: 5,
    backgroundColor: '#FFF0F3',
  },
  deleteText: { color: '#F33C66', fontSize: 12, fontWeight: '500' },
  scroll: { paddingBottom: 20 },
  setCard: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  setLabel: { width: 34, flexShrink: 0, fontSize: 11, color: '#777777' },
  input: {
    backgroundColor: '#F0F5FF',
    minWidth: 59,
    width: 76,
    flexShrink: 1,
    minHeight: 40,
    paddingHorizontal: 5,
    borderRadius: 5,
    textAlign: 'center',
    color: '#222222',
    fontWeight: '600',
    fontSize: 14,
  },
  repsInput: { minWidth: 42, width: 56 },
  timeInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F5FF', borderRadius: 5, paddingHorizontal: 4, height: 40 },
  timePart: { width: 28, height: 40, padding: 0, textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#222222' },
  timeColon: { fontSize: 14, fontWeight: '600', color: '#222222' },
  unit: { flexShrink: 0, color: '#888888', fontSize: 10 },
  remove: {
    marginLeft: 'auto',
    backgroundColor: '#F2F2F2',
    width: 36,
    height: 40,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { fontSize: 23, color: '#777777' },
  add: {
    borderWidth: 1,
    borderColor: '#3972FF',
    borderRadius: 5,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 7,
  },
  addText: { fontSize: 12, color: '#2460E8' },
  addDisabled: { borderColor: '#E5E5E5' },
  muted: { color: '#BBBBBB' },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    marginTop: 16,
  },
  restLabel: { color: '#777777', fontSize: 13 },
  restControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  restValue: { fontSize: 16, fontWeight: '600', color: '#222222' },
  step: {
    width: 36,
    height: 39,
    backgroundColor: '#F0F5FF',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 25, color: '#2460E8' },
  footer: { marginTop: 'auto', paddingTop: 12 },
  save: {
    minHeight: 47,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#245EE5',
  },
  saveText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  back: { minHeight: 43, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 12, color: '#555555' },
  disabled: { opacity: 0.4 },
});
