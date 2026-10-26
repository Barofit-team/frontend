/**
 * F01 자세 점수 변화: 같은 종목의 이전 운동과 오늘 점수를 비교하는 막대 차트 (View 기반).
 * 마지막 막대가 오늘이며 진하게 강조합니다.
 * 점수 기록이 없으면 임의 점수 대신 빈 상태 문구를 보여줍니다.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { PrepColors } from '@/components/workout-preparation/palette';
import type { PostureScoreHistory } from '@/types/workoutResult';

import { formatShortDate } from './format';
import { resultStyles } from './resultStyles';

/** 최근 몇 번까지 보여줄지 (시안: 2회 전 · 직전 · 오늘) */
const MAX_BARS = 3;
/** 100점일 때 막대 높이 */
const BAR_MAX_HEIGHT = 76;

type PostureScoreChartProps = {
  postureScore?: PostureScoreHistory;
};

function clampScore(score: number) {
  return Math.min(100, Math.max(0, score));
}

export function PostureScoreChart({ postureScore }: PostureScoreChartProps) {
  const points = postureScore?.history.slice(-MAX_BARS) ?? [];
  const hasData = points.length > 0;

  const summary = points
    .map((point, index) => `${index === points.length - 1 ? '오늘' : formatShortDate(point.date)} ${point.score}점`)
    .join(', ');

  return (
    <Card style={resultStyles.card}>
      <Text style={resultStyles.cardTitle}>자세 점수 변화</Text>
      {hasData ? (
        <>
          <Text style={[resultStyles.cardBody, styles.caption]}>
            동일 종목의 이전 운동과 비교 · {postureScore?.exerciseName}
          </Text>
          <View
            style={styles.chart}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${postureScore?.exerciseName} 자세 점수 변화: ${summary}`}>
            {points.map((point, index) => {
              const isToday = index === points.length - 1;
              return (
                <View key={`${point.date}-${index}`} style={styles.column}>
                  <Text style={styles.score}>{point.score}</Text>
                  <View
                    style={[
                      styles.bar,
                      { height: (clampScore(point.score) / 100) * BAR_MAX_HEIGHT },
                      isToday && styles.barToday,
                    ]}
                  />
                  <Text style={styles.date}>{isToday ? '오늘' : formatShortDate(point.date)}</Text>
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <Text style={[resultStyles.cardBody, styles.caption]}>
          {'아직 비교할 자세 점수가 없어요.\n운동 기록이 쌓이면 이전 운동과 비교해 보여드릴게요.'}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  caption: { marginTop: 6 },
  chart: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 22,
  },
  column: { flex: 1, alignItems: 'center' },
  score: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: PrepColors.text,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  bar: {
    alignSelf: 'stretch',
    backgroundColor: '#A8A8A8',
  },
  barToday: { backgroundColor: '#2F2F2F' },
  date: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    color: PrepColors.textSecondary,
  },
});
