/** F03 선택 결과 요약 카드: 제목 + "● 값" */
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { PrepColors } from '@/components/workout-preparation/palette';

import { resultStyles } from './resultStyles';

type FeedbackSummaryCardProps = {
  title: string;
  value: string;
};

export function FeedbackSummaryCard({ title, value }: FeedbackSummaryCardProps) {
  return (
    <Card style={resultStyles.card} accessible accessibilityLabel={`${title}, ${value}`}>
      <Text style={resultStyles.cardTitle}>{title}</Text>
      <View style={styles.valueRow}>
        <View style={styles.dot} />
        <Text style={resultStyles.cardBody}>{value}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  valueRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PrepColors.text },
});
