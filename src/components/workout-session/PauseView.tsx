/**
 * 일시정지 화면 "오늘의 운동 루틴" (카메라 위 어두운 오버레이). 표시 전용입니다.
 *   [진행도 링 · 완료 세트 · 운동 시간 · 남은 시간] / 종목 목록(현재 종목 파란색) / [운동 종료] [운동 재개]
 *
 * 종목 행 '›'(세트 수정 진입)는 onPressExercise가 있고 항목이 editable일 때만 표시합니다.
 * (실제 운동 화면은 저장 정책 협의 전이라 넘기지 않음 → docs/F04-design-discussion.md)
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressRing } from './ProgressRing';
import { SessionColors } from './sessionPalette';
import { formatTime } from './sessionProgress';

export type PauseExerciseItem = {
  key: string;
  name: string;
  /** 예: '3세트 · 20개' */
  detail: string;
  current: boolean;
  /** 세트 수정 가능 여부(남은 세트가 있을 때) */
  editable?: boolean;
};

type PauseViewProps = {
  completedSets: number;
  totalSets: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  exercises: PauseExerciseItem[];
  onPressStop: () => void;
  onPressResume: () => void;
  /** 종목 행 탭 → 세트 수정. 없으면 행은 표시만 합니다 */
  onPressExercise?: (index: number) => void;
};

export function PauseView({
  completedSets,
  totalSets,
  elapsedSeconds,
  remainingSeconds,
  exercises,
  onPressStop,
  onPressResume,
  onPressExercise,
}: PauseViewProps) {
  const insets = useSafeAreaInsets();
  const progress = totalSets > 0 ? completedSets / totalSets : 0;
  const percent = Math.round(progress * 100);
  const remainingMinutes = Math.ceil(Math.max(0, remainingSeconds) / 60);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <Text style={styles.title} accessibilityRole="header">
        오늘의 운동 루틴
      </Text>

      <View style={styles.summary} accessible accessibilityLabel={`진행도 ${percent}퍼센트`}>
        <ProgressRing size={64} stroke={5} progress={progress} color={SessionColors.primary} trackColor={SessionColors.track}>
          <Text style={styles.ringLabel}>진행도</Text>
          <Text style={styles.ringValue}>{percent}%</Text>
        </ProgressRing>
        <View style={styles.summaryRows}>
          <SummaryRow label="완료 세트" value={`${completedSets} / ${totalSets}`} />
          <SummaryRow label="운동 시간" value={formatTime(elapsedSeconds)} />
          <SummaryRow label="남은 시간" value={`약 ${remainingMinutes}분`} />
        </View>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {exercises.map((item, index) => {
          const editable = Boolean(onPressExercise && item.editable);
          return (
            <Pressable
              key={item.key}
              accessibilityRole={editable ? 'button' : undefined}
              accessibilityLabel={editable ? `${item.name} 세트 수정` : undefined}
              disabled={!editable}
              onPress={() => onPressExercise?.(index)}
              style={({ pressed }) => [styles.item, item.current && styles.itemCurrent, pressed && styles.pressed]}>
              <View style={styles.itemTexts}>
                <Text style={[styles.itemName, item.current && styles.itemNameCurrent]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemDetail}>{item.detail}</Text>
              </View>
              {editable && <Text style={styles.chevron}>›</Text>}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onPressStop}
          style={({ pressed }) => [styles.action, styles.stop, pressed && styles.pressed]}>
          <Text style={[styles.actionText, styles.stopText]}>운동 종료</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onPressResume}
          style={({ pressed }) => [styles.action, styles.resume, pressed && styles.pressed]}>
          <Text style={[styles.actionText, styles.resumeText]}>운동 재개</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: SessionColors.dim,
    paddingHorizontal: 16,
  },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: SessionColors.onCamera },
  summary: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    padding: 16,
    borderRadius: 10,
    backgroundColor: SessionColors.card,
  },
  ringLabel: { fontSize: 8, lineHeight: 10, color: SessionColors.textMuted },
  ringValue: { fontSize: 15, lineHeight: 19, fontWeight: '800', color: SessionColors.onCamera },
  summaryRows: { flex: 1, gap: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 12, color: SessionColors.textMuted },
  summaryValue: { fontSize: 13, fontWeight: '700', color: SessionColors.onCamera, fontVariant: ['tabular-nums'] },
  list: { marginTop: 16, flex: 1 },
  listContent: { paddingBottom: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SessionColors.divider,
  },
  itemTexts: { flex: 1, gap: 4 },
  chevron: { fontSize: 22, lineHeight: 24, color: SessionColors.textMuted, marginLeft: 8 },
  itemCurrent: { backgroundColor: SessionColors.card, borderRadius: 8, borderBottomColor: 'transparent' },
  itemName: { fontSize: 14, fontWeight: '700', color: SessionColors.onCamera },
  itemNameCurrent: { color: SessionColors.primaryText },
  itemDetail: { fontSize: 12, color: SessionColors.textMuted },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 12 },
  action: { flex: 1, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stop: { backgroundColor: SessionColors.onCamera },
  resume: { backgroundColor: SessionColors.primary },
  actionText: { fontSize: 15, fontWeight: '700' },
  stopText: { color: SessionColors.primary },
  resumeText: { color: SessionColors.onCamera },
  pressed: { opacity: 0.75 },
});
