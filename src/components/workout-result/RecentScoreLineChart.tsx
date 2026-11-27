import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import type { PostureScorePoint } from '@/types/workoutResult';

import { formatScore, formatShortDate } from './format';
import { resultStyles } from './resultStyles';

const CHART_HEIGHT = 96;
const PAD_X = 24;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export function RecentScoreLineChart({ points }: { points?: PostureScorePoint[] }) {
  const [width, setWidth] = useState(0);
  const items = (points ?? []).slice(-5);
  const hasData = items.length > 0;

  const scores = items.map((p) => Math.min(100, Math.max(0, p.score)));
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 100;
  const span = Math.max(20, maxScore - minScore);
  const plotMin = Math.max(0, minScore - span * 0.25);
  const plotMax = Math.min(100, maxScore + span * 0.2);

  const coords =
    width > PAD_X * 2 && items.length > 0
      ? items.map((_, i) => {
          const usableW = width - PAD_X * 2;
          const x = items.length === 1 ? width / 2 : PAD_X + (usableW * i) / (items.length - 1);
          const ratio = plotMax === plotMin ? 0.5 : (scores[i] - plotMin) / (plotMax - plotMin);
          const usableH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
          const y = PAD_TOP + usableH * (1 - ratio);
          return { x, y, score: scores[i] };
        })
      : [];

  return (
    <Card style={resultStyles.card}>
      <Text style={styles.title}>최근 기록과 비교</Text>
      {hasData ? (
        <View style={styles.chartWrap}>
          <View style={styles.plotArea} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {coords.slice(0, -1).map((from, idx) => {
              const to = coords[idx + 1];
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const length = Math.hypot(dx, dy);
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              return (
                <View
                  key={`seg-${idx}`}
                  style={[
                    styles.segment,
                    {
                      width: length,
                      left: midX - length / 2,
                      top: midY - 1.5,
                      transform: [{ rotate: `${angle}deg` }],
                    },
                  ]}
                />
              );
            })}
            {coords.map((pt, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === coords.length - 1;
              return (
                <View key={`pt-${idx}`}>
                  {(isFirst || isLast) && <View style={[styles.dot, { left: pt.x - 5, top: pt.y - 5 }]} />}
                  {(isFirst || isLast) && (
                    <View
                      style={[
                        styles.badge,
                        isLast ? styles.badgeLast : styles.badgeFirst,
                        { left: Math.max(4, Math.min(width - 48, pt.x - 20)), top: pt.y + 10 },
                      ]}>
                      <Text style={[styles.badgeText, isLast && styles.badgeTextLast]}>{formatScore(pt.score)}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <View style={[styles.datesRow, items.length === 1 && styles.datesRowSingle]}>
            {items.map((item, idx) => {
              const isLast = idx === items.length - 1;
              return (
                <Text key={`${item.date}-${idx}`} style={[styles.dateText, isLast && styles.dateTextLast]}>
                  {formatShortDate(item.date)}
                </Text>
              );
            })}
          </View>
        </View>
      ) : (
        <Text style={styles.emptyText}>운동 기록이 쌓이면 최근 자세 점수 추이를 보여드릴게요.</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  chartWrap: { marginTop: 12 },
  plotArea: { height: CHART_HEIGHT, position: 'relative' },
  segment: { position: 'absolute', height: 3, backgroundColor: '#5B8DEF', borderRadius: 2 },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#4A7DF3' },
  badge: {
    position: 'absolute',
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignItems: 'center',
  },
  badgeFirst: { backgroundColor: '#F3F4F6' },
  badgeLast: { backgroundColor: '#DBEAFE' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  badgeTextLast: { color: '#1D4ED8' },
  datesRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, marginTop: 4 },
  datesRowSingle: { justifyContent: 'center' },
  dateText: { fontSize: 12, color: '#6B7280' },
  dateTextLast: { fontWeight: '700', color: '#111827' },
  emptyText: { marginTop: 10, fontSize: 13, lineHeight: 19, color: '#6B7280' },
});
