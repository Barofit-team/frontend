/** F01 운동 요약 카드: 완료 세트 · 총 횟수 / 운동 · 휴식 · 총 소요 시간 (시간 값이 없으면 그 항목은 표시하지 않음) */
import { Text } from 'react-native';

import { Card } from '@/components/ui/Card';

import { formatDuration } from './format';
import { resultStyles } from './resultStyles';

type WorkoutSummaryCardProps = {
  completedSets: number;
  totalReps: number;
  exerciseDurationSeconds?: number;
  restDurationSeconds?: number;
  totalDurationSeconds?: number;
};

export function WorkoutSummaryCard({
  completedSets,
  totalReps,
  exerciseDurationSeconds,
  restDurationSeconds,
  totalDurationSeconds,
}: WorkoutSummaryCardProps) {
  const timeParts = [
    exerciseDurationSeconds !== undefined ? `운동 ${formatDuration(exerciseDurationSeconds)}` : null,
    restDurationSeconds !== undefined ? `휴식 ${formatDuration(restDurationSeconds)}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <Card style={resultStyles.card} accessible>
      <Text style={resultStyles.cardTitle}>
        완료 {completedSets}세트 · 총 {totalReps}회
      </Text>
      {timeParts.length > 0 && (
        <Text style={[resultStyles.cardBody, { marginTop: 8 }]}>{timeParts.join('  /  ')}</Text>
      )}
      {totalDurationSeconds !== undefined && (
        <Text style={resultStyles.cardBody}>총 소요 {formatDuration(totalDurationSeconds)}</Text>
      )}
    </Card>
  );
}
