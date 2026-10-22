/**
 * "현재 진행 상태" 카드 (일시 정지 화면 · 중단 확인 모달 공용). 표시 전용입니다.
 *   현재 진행 상태
 *   스쿼트 · 2세트 진행 중
 *   수행 1회 / 목표 20회
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PrepColors } from '@/components/workout-preparation/palette';

type SessionProgressCardProps = {
  /** 예: "스쿼트 · 2세트 진행 중" */
  statusText: string;
  reps: number;
  targetReps: number;
  style?: StyleProp<ViewStyle>;
};

export function SessionProgressCard({ statusText, reps, targetReps, style }: SessionProgressCardProps) {
  return (
    <View style={[styles.card, style]} accessible>
      <Text style={styles.title}>현재 진행 상태</Text>
      <Text style={styles.line}>{statusText}</Text>
      <Text style={styles.line}>
        수행 {reps}회 / 목표 {targetReps}회
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PrepColors.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  title: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: PrepColors.text, marginBottom: 6 },
  line: { fontSize: 11, lineHeight: 16, color: PrepColors.textSecondary },
});
