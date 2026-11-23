/**
 * 세트 수정 시트 (Figma '횟수 운동 수정' / '시간 운동 수정'). 표시와 초안 편집만 담당합니다.
 *  - 값은 내부 초안에서만 바뀌고, '변경사항 저장'을 눌렀을 때만 onSave로 전달합니다.
 *  - '돌아가기' / Android 뒤로가기 → onCancel (변경 버림)
 *  - 횟수(또는 시간)를 누르면 숫자 키패드와 ±5회(시간은 ±10초) 조절이 나타납니다.
 *  - 끝났거나 진행 중인 세트는 잠금 표시하고 수정할 수 없습니다.
 * 편집 규칙은 routineEdit.ts(단위 테스트 대상)에 있습니다.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EDIT_LIMITS,
  adjustRest,
  adjustSet,
  bufferToValue,
  isDraftChanged,
  pressKey,
  setSetValue,
  type EditField,
  type ExerciseEditDraft,
} from './routineEdit';
import { SessionColors } from './sessionPalette';
import { formatTime } from './sessionProgress';

type SetEditSheetProps = {
  exerciseName: string;
  initialDraft: ExerciseEditDraft;
  onCancel: () => void;
  onSave: (draft: ExerciseEditDraft) => void;
};

type ActiveField = { setIndex: number; field: EditField } | null;

const KEY_LETTERS: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
};
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'done', '0', 'back'];

function Sign({ minus = false, disabled = false }: { minus?: boolean; disabled?: boolean }) {
  const color = disabled ? '#C4C7CE' : SessionColors.primary;
  return (
    <View style={styles.signBox}>
      <View style={[styles.signBar, { backgroundColor: color }]} />
      {!minus && <View style={[styles.signBar, styles.signBarVertical, { backgroundColor: color }]} />}
    </View>
  );
}

function StepButton({ minus, disabled, onPress, label }: { minus?: boolean; disabled?: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}>
      <Sign minus={minus} disabled={disabled} />
    </Pressable>
  );
}

export function SetEditSheet({ exerciseName, initialDraft, onCancel, onSave }: SetEditSheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(initialDraft);
  const [active, setActive] = useState<ActiveField>(null);
  const [buffer, setBuffer] = useState('');
  const isReps = draft.measurementType === 'REPS';
  const changed = useMemo(() => isDraftChanged(initialDraft, draft), [initialDraft, draft]);
  const hasLocked = draft.sets.some(set => set.locked);
  const restLocked = draft.sets.length > 0 && draft.sets.every(set => set.locked);

  /** 키패드 입력을 확정해 초안에 반영 (범위 보정) */
  const commit = (base = draft) => {
    if (!active) return base;
    const value = bufferToValue(buffer, active.field);
    const next = value === null ? base : setSetValue(base, active.setIndex, active.field, value);
    setDraft(next);
    setBuffer('');
    return next;
  };

  const openField = (setIndex: number, field: EditField) => {
    const next = commit();
    if (next.sets[setIndex]?.locked) return;
    setActive(active && active.setIndex === setIndex && active.field === field ? null : { setIndex, field });
  };

  const closeKeypad = () => {
    commit();
    setActive(null);
  };

  const onKey = (key: string) => {
    if (!active) return;
    if (key === 'done') return closeKeypad();
    setBuffer(prev => pressKey(prev, key, active.field));
  };

  const bigStep = active?.field === 'seconds' ? EDIT_LIMITS.secondsStep : EDIT_LIMITS.repsBigStep;
  const stepActive = (delta: number) => {
    if (!active) return;
    const base = commit();
    setDraft(adjustSet(base, active.setIndex, active.field, delta));
  };

  const fieldText = (setIndex: number, field: EditField) => {
    const set = draft.sets[setIndex];
    if (active && active.setIndex === setIndex && active.field === field && buffer) {
      const typed = bufferToValue(buffer, field) ?? 0;
      return field === 'reps' ? String(typed) : formatTime(typed);
    }
    return field === 'reps' ? String(set?.reps ?? '-') : formatTime(set?.seconds ?? 0);
  };

  const isActive = (setIndex: number, field: EditField) =>
    active !== null && active.setIndex === setIndex && active.field === field;

  const rangeHint =
    active?.field === 'reps'
      ? `입력 범위 ${EDIT_LIMITS.repsMin}~${EDIT_LIMITS.repsMax}회`
      : `입력 범위 ${formatTime(EDIT_LIMITS.secondsMin)}~${formatTime(EDIT_LIMITS.secondsMax)} (예: 130 → 01:30)`;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.panel} accessibilityViewIsModal accessibilityLabel={`${exerciseName} 세트 수정`}>
          <Text style={styles.title} accessibilityRole="header">
            세트 수정
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Pressable onPress={active ? closeKeypad : undefined} accessible={false}>
              <View style={styles.card}>
                {draft.sets.map((set, index) => (
                  <View key={index} style={[styles.row, set.locked && styles.rowLocked]}>
                    <View style={styles.setLabelBox}>
                      <Text style={styles.setLabel}>{index + 1}세트</Text>
                      {set.locked && <Text style={styles.lockedTag}>완료</Text>}
                    </View>
                    {isReps && (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${index + 1}세트 목표 횟수 ${set.reps}회 직접 입력`}
                          disabled={set.locked}
                          onPress={() => openField(index, 'reps')}
                          style={[styles.valueBox, isActive(index, 'reps') && styles.valueBoxActive]}>
                          <Text style={styles.valueBoxText}>{fieldText(index, 'reps')}</Text>
                        </Pressable>
                        <Text style={styles.unit}>회</Text>
                      </>
                    )}
                    <View style={styles.flex} />
                    <StepButton
                      minus
                      label={`${index + 1}세트 시간 감소`}
                      disabled={set.locked || set.seconds <= EDIT_LIMITS.secondsMin}
                      onPress={() => setDraft(adjustSet(commit(), index, 'seconds', -EDIT_LIMITS.secondsStep))}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${index + 1}세트 운동 시간 ${formatTime(set.seconds)} 직접 입력`}
                      disabled={set.locked}
                      onPress={() => openField(index, 'seconds')}
                      style={[styles.timeBox, isActive(index, 'seconds') && styles.valueBoxActive]}>
                      <Text style={styles.timeText}>{fieldText(index, 'seconds')}</Text>
                    </Pressable>
                    <StepButton
                      label={`${index + 1}세트 시간 증가`}
                      disabled={set.locked || set.seconds >= EDIT_LIMITS.secondsMax}
                      onPress={() => setDraft(adjustSet(commit(), index, 'seconds', EDIT_LIMITS.secondsStep))}
                    />
                  </View>
                ))}
              </View>

              <View style={[styles.card, styles.restCard]}>
                <View style={[styles.row, restLocked && styles.rowLocked]}>
                  <Text style={styles.setLabel}>휴식</Text>
                  <View style={styles.flex} />
                  <StepButton
                    minus
                    label="휴식 시간 감소"
                    disabled={restLocked || draft.restSeconds <= EDIT_LIMITS.restMin}
                    onPress={() => setDraft(adjustRest(commit(), -EDIT_LIMITS.restStep))}
                  />
                  <View style={styles.timeBox}>
                    <Text style={styles.timeText}>{formatTime(draft.restSeconds)}</Text>
                  </View>
                  <StepButton
                    label="휴식 시간 증가"
                    disabled={restLocked || draft.restSeconds >= EDIT_LIMITS.restMax}
                    onPress={() => setDraft(adjustRest(commit(), EDIT_LIMITS.restStep))}
                  />
                </View>
              </View>

              {hasLocked && (
                <Text style={styles.caption}>
                  {'완료·진행 중인 세트는 수정할 수 없어요.\n변경 내용은 다음 세트부터 적용돼요.'}
                </Text>
              )}
            </Pressable>
          </ScrollView>

          {active ? (
            <View style={[styles.keypadArea, { paddingBottom: insets.bottom + 6 }]}>
              <Text style={styles.rangeHint}>{rangeHint}</Text>
              <View style={styles.quickRow}>
                <Pressable accessibilityRole="button" onPress={() => stepActive(-bigStep)} style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}>
                  <Text style={styles.quickText}>{active.field === 'reps' ? `− ${bigStep}회 감소` : `− ${bigStep}초`}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => stepActive(bigStep)} style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}>
                  <Text style={styles.quickText}>{active.field === 'reps' ? `+ ${bigStep}회 추가` : `+ ${bigStep}초`}</Text>
                </Pressable>
              </View>
              <View style={styles.keypad}>
                {KEYS.map(key => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={key === 'back' ? '지우기' : key === 'done' ? '입력 완료' : key}
                    onPress={() => onKey(key)}
                    style={({ pressed }) => [
                      styles.key,
                      key === 'done' || key === 'back' ? styles.keyPlain : null,
                      pressed && styles.keyPressed,
                    ]}>
                    {key === 'back' ? (
                      <Text style={styles.keyText}>⌫</Text>
                    ) : key === 'done' ? (
                      <Text style={styles.keyDone}>완료</Text>
                    ) : (
                      <>
                        <Text style={styles.keyText}>{key}</Text>
                        {KEY_LETTERS[key] && <Text style={styles.keyLetters}>{KEY_LETTERS[key]}</Text>}
                      </>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
              <Pressable
                accessibilityRole="button"
                disabled={!changed}
                onPress={() => onSave(draft)}
                style={({ pressed }) => [styles.saveButton, !changed && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.saveText}>변경사항 저장</Text>
              </Pressable>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={onCancel} style={styles.cancel}>
                <Text style={styles.cancelText}>돌아가기</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: {
    flex: 1,
    backgroundColor: '#F5F6F8',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  title: {
    textAlign: 'center',
    paddingTop: 22,
    paddingBottom: 14,
    fontSize: 16,
    fontWeight: '700',
    color: SessionColors.sheetText,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingBottom: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  restCard: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', height: 50, gap: 6 },
  rowLocked: { opacity: 0.4 },
  flex: { flex: 1 },
  setLabelBox: { width: 46 },
  setLabel: { fontSize: 13, color: '#4B4F57' },
  lockedTag: { fontSize: 10, color: SessionColors.primary, marginTop: 1 },
  valueBox: {
    minWidth: 42,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E3E5E9',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  valueBoxActive: { borderColor: SessionColors.primary, borderWidth: 1.5 },
  valueBoxText: { fontSize: 15, fontWeight: '700', color: SessionColors.sheetText, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, color: '#6B6F76' },
  stepButton: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#EEF3FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signBox: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  signBar: { position: 'absolute', width: 12, height: 2, borderRadius: 1 },
  signBarVertical: { transform: [{ rotate: '90deg' }] },
  timeBox: { minWidth: 58, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  timeText: { fontSize: 15, fontWeight: '600', color: SessionColors.sheetText, fontVariant: ['tabular-nums'] },
  caption: { marginTop: 12, marginHorizontal: 4, fontSize: 12, lineHeight: 18, color: '#7A7E86' },
  footer: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: '#F5F6F8' },
  saveButton: {
    height: 50,
    borderRadius: 8,
    backgroundColor: SessionColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  cancel: { alignSelf: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#4B4F57' },
  disabled: { opacity: 0.4 },
  keypadArea: { backgroundColor: '#D5D8DE', paddingHorizontal: 6, paddingTop: 6 },
  rangeHint: { textAlign: 'center', fontSize: 11, color: '#5E626A', marginBottom: 6 },
  quickRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  quickButton: {
    flex: 1,
    height: 34,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: { fontSize: 13, fontWeight: '600', color: SessionColors.primary },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  key: {
    width: '31.9%',
    height: 46,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPlain: { backgroundColor: 'transparent' },
  keyPressed: { backgroundColor: '#BFC3CA' },
  keyText: { fontSize: 22, color: '#111111' },
  keyLetters: { fontSize: 9, letterSpacing: 1.5, color: '#111111', marginTop: -2 },
  keyDone: { fontSize: 15, fontWeight: '700', color: SessionColors.primary },
  pressed: { opacity: 0.7 },
});
