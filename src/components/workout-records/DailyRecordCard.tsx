import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DailyWorkoutRecord } from '@/types/workoutRecord';

import { formatMonthDay } from './calendar';
import { RecordColors } from './palette';
import { RECORD_STATUS_STYLE } from './status';

interface DailyRecordCardProps {
  record: DailyWorkoutRecord;
  onPressReport: (record: DailyWorkoutRecord) => void;
}

export const DailyRecordCard = memo(function DailyRecordCard({ record, onPressReport }: DailyRecordCardProps) {
  const status = RECORD_STATUS_STYLE[record.status];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatMonthDay(record.date)}</Text>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: status.color }]} />
          <Text style={styles.statusLabel}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {record.thumbnailUrl ? (
          <Image source={{ uri: record.thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />
        ) : (
          <View style={styles.thumbnail} />
        )}
        <Text style={styles.routineName} numberOfLines={2}>
          {record.routineName}
        </Text>
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
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 14, fontWeight: '700', color: RecordColors.text },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  statusLabel: { fontSize: 10, fontWeight: '500', color: RecordColors.text },
  body: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  thumbnail: { width: 56, height: 56, borderRadius: 4, backgroundColor: RecordColors.control },
  routineName: { flex: 1, fontSize: 12, fontWeight: '500', color: RecordColors.text },
  reportButton: {
    marginTop: 12,
    height: 30,
    borderRadius: 6,
    backgroundColor: RecordColors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportText: { fontSize: 11, fontWeight: '500', color: RecordColors.text },
  pressed: { opacity: 0.6 },
});
