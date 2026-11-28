import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';

import { formatScore, formatShortDate } from './format';
import { resultStyles } from './resultStyles';

type BarItem = {
  label: string;
  date?: string;
  score: number;
  isToday?: boolean;
};

export function ExerciseDetailBarChart({
  todayScore,
  todayDate,
  previousScore,
  previousDate,
}: {
  todayScore?: number;
  todayDate: string;
  previousScore?: number;
  previousDate?: string;
}) {
  const rows: BarItem[] = [];
  if (previousScore !== undefined) {
    rows.push({ label: '이전', date: previousDate, score: previousScore, isToday: false });
  }
  if (todayScore !== undefined) {
    rows.push({ label: '오늘', date: todayDate, score: todayScore, isToday: true });
  }

  return (
    <Card style={resultStyles.card}>
      <Text style={styles.title}>최근 기록과 비교</Text>
      {rows.length > 0 ? (
        <View style={styles.body}>
          {rows.map((row) => {
            const pct = Math.min(100, Math.max(0, row.score));
            return (
              <View key={row.label} style={styles.row}>
                <View style={styles.labelCol}>
                  <Text style={[styles.rowLabel, row.isToday && styles.rowLabelToday]}>{row.label}</Text>
                  {row.date ? <Text style={styles.rowDate}>{formatShortDate(row.date)}</Text> : null}
                </View>
                <View style={styles.trackWrap}>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${Math.max(8, pct)}%` },
                        row.isToday ? styles.fillToday : styles.fillPrev,
                      ]}
                    />
                  </View>
                  <View style={[styles.pill, row.isToday ? styles.pillToday : styles.pillPrev]}>
                    <Text style={[styles.pillText, row.isToday && styles.pillTextToday]}>
                      {formatScore(row.score)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={styles.axisRow}>
            <View style={styles.labelCol} />
            <View style={styles.axisTicks}>
              {['0', '25', '50', '75', '100'].map((tick) => (
                <Text key={tick} style={styles.axisText}>
                  {tick}
                </Text>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <Text style={styles.empty}>비교할 자세 점수 기록이 아직 없어요.</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  body: { marginTop: 16, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  labelCol: { width: 44 },
  rowLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  rowLabelToday: { color: '#111827' },
  rowDate: { marginTop: 2, fontSize: 11, color: '#9CA3AF' },
  trackWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 18, borderRadius: 4, backgroundColor: '#F9FAFB', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  fillPrev: { backgroundColor: '#B5B8BD' },
  fillToday: { backgroundColor: '#5B93F7' },
  pill: { minWidth: 36, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignItems: 'center' },
  pillPrev: { backgroundColor: '#F3F4F6' },
  pillToday: { backgroundColor: '#DBEAFE' },
  pillText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  pillTextToday: { color: '#1D4ED8' },
  axisRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -4 },
  axisTicks: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingRight: 44 },
  axisText: { fontSize: 11, color: '#9CA3AF' },
  empty: { marginTop: 10, fontSize: 13, color: '#6B7280' },
});
