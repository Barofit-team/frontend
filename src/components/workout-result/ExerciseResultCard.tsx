/** F01 운동별 결과 카드: 종목명 · 세트/횟수 + 잘한 점 / 개선점 / 주요 오류 */
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import type { ExerciseResult } from '@/types/workoutResult';

import { resultStyles } from './resultStyles';

type ExerciseResultCardProps = {
  result: ExerciseResult;
};

function FeedbackLine({ label, text }: { label: string; text: string }) {
  return (
    <Text style={resultStyles.cardBody}>
      <Text style={resultStyles.cardLabel}>{label}</Text>
      {'  '}
      {text}
    </Text>
  );
}

export function ExerciseResultCard({ result }: ExerciseResultCardProps) {
  const errorText =
    result.mainError !== undefined
      ? result.errorCount !== undefined
        ? `${result.mainError} · ${result.errorCount}회`
        : result.mainError
      : null;

  return (
    <Card style={resultStyles.card} accessible>
      <Text style={resultStyles.cardTitle}>
        {result.exerciseName} · {result.completedSets}세트 / {result.completedReps}회
      </Text>
      <View style={styles.lines}>
        <FeedbackLine label="잘한 점" text={result.goodFeedback} />
        <FeedbackLine label="개선점" text={result.improvementFeedback} />
        {errorText !== null && <FeedbackLine label="주요 오류" text={errorText} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  lines: { marginTop: 8 },
});
