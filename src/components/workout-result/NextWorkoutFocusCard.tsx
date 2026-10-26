/** F01 "다음 운동에서 집중할 한 가지" 카드 */
import { Text } from 'react-native';

import { Card } from '@/components/ui/Card';

import { resultStyles } from './resultStyles';

export function NextWorkoutFocusCard({ text }: { text: string }) {
  return (
    <Card style={resultStyles.card} accessible>
      <Text style={resultStyles.cardTitle}>다음 운동에서 집중할 한 가지</Text>
      <Text style={[resultStyles.cardBody, { marginTop: 8 }]}>{text}</Text>
    </Card>
  );
}
