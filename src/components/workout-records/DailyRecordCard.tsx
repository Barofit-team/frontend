import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DailyWorkoutRecord } from '@/types/workoutRecord';

import { formatMonthDay } from './calendar';
import { RecordColors } from './palette';

interface DailyRecordCardProps {
  record: DailyWorkoutRecord;
  onPressReport: (record: DailyWorkoutRecord) => void;
}

function formatMinutes(durationSeconds?: number): string {
  if (durationSeconds === undefined || durationSeconds <= 0) return '0 분';
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  return `${minutes} 분`;
}

export const DailyRecordCard = memo(function DailyRecordCard({ record, onPressReport }: DailyRecordCardProps) {
  const isMissed = record.status === 'missed';
  const exerciseLabel = `${record.exerciseCount ?? 0} 종목`;
  const durationLabel = formatMinutes(record.durationSeconds);
  const kcalLabel = record.estimatedKcal != null ? `${record.estimatedKcal} Kcal` : '- Kcal';

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatMonthDay(record.date)} ${record.routineName} 리포트 보기`}
        onPress={() => onPressReport(record)}
        style={({ pressed }) => [styles.headerRow, pressed && styles.pressed]}>
        <Text style={styles.routineName} numberOfLines={2}>
          {record.routineName}
        </Text>
        <View style={styles.headerRight}>
          {isMissed && <Text style={styles.missedBadge}>미실행</Text>}
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>

      <View style={styles.metaBar}>
        <Text style={styles.metaItem}>{exerciseLabel}</Text>
        <View style={styles.metaDivider} />
        <Text style={styles.metaItem}>{durationLabel}</Text>
        <View style={styles.metaDivider} />
        <Text style={styles.metaItem}>{kcalLabel}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatMonthDay(record.date)} ${record.routineName} 리포트 보기`}
        onPress={() => onPressReport(record)}
        style={({ pressed }) => [styles.reportButton, pressed && styles.pressed]}>
        <Text style={styles.reportText}>리포트 보기</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: RecordColors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  routineName: { flex: 1, fontSize: 16, fontWeight: '700', color: RecordColors.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  missedBadge: { fontSize: 11, fontWeight: '600', color: RecordColors.missedText },
  chevron: { fontSize: 20, fontWeight: '600', color: '#4B5563', lineHeight: 22 },
  metaBar: {
    marginTop: 14,
    backgroundColor: RecordColors.control,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  metaItem: { fontSize: 13, fontWeight: '500', color: '#4B5563' },
  metaDivider: { width: 1, height: 14, backgroundColor: '#D1D5DB' },
  reportButton: {
    marginTop: 14,
    height: 40,
    borderRadius: 10,
    backgroundColor: RecordColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportText: { fontSize: 14, fontWeight: '600', color: RecordColors.accent },
  pressed: { opacity: 0.65 },
});
