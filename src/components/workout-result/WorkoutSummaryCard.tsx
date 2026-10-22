/** F01 운동 요약 카드: 완료 세트 · 총 횟수 / 운동 · 휴식 · 총 소요 시간 */
import { Text } from 'react-native';

import { Card } from '@/components/ui/Card';

import { formatDuration } from './format';
import { resultStyles } from './resultStyles';

type WorkoutSummaryCardProps = {
  completedSets: number;
  totalReps: number;
  exerciseDurationSeconds: number;
  restDurationSeconds: number;
  totalDurationSeconds: number;
};

export function WorkoutSummaryCard({
  completedSets,
  totalReps,
  exerciseDurationSeconds,
  restDurationSeconds,
  totalDurationSeconds,
}: WorkoutSummaryCardProps) {
  return (
    <Card style={resultStyles.card} accessible>
      <Text style={resultStyles.cardTitle}>
        완료 {completedSets}세트 · 총 {totalReps}회
      </Text>
      <Text style={[resultStyles.cardBody, { marginTop: 8 }]}>
        운동 {formatDuration(exerciseDurationSeconds)}
        {'  /  '}
        휴식 {formatDuration(restDurationSeconds)}
      </Text>
      <Text style={resultStyles.cardBody}>총 소요 {formatDuration(totalDurationSeconds)}</Text>
    </Card>
  );
}
