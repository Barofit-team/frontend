/**
 * 일시 정지 화면 (흰 배경). 표시 전용입니다. 카메라는 사용하지 않습니다.
 *   세트 2 진행 중 / 일시 정지 / [현재 진행 상태 카드] / (운동 중단하기) / [운동 이어하기]
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PreparationHeader } from '@/components/workout-preparation/PreparationHeader';
import { PrepColors } from '@/components/workout-preparation/palette';

import { SessionHeading } from './CountdownView';
import { SessionProgressCard } from './SessionProgressCard';

type PauseViewProps = {
  /** 예: "세트 2 진행 중" */
  subtitle: string;
  /** 예: "스쿼트 · 2세트 진행 중" */
  statusText: string;
  reps: number;
  targetReps: number;
  onPressStop: () => void;
  onPressResume: () => void;
  /** 상단 X */
  onPressClose: () => void;
  onPressVoice?: () => void;
};

export function PauseView({
  subtitle,
  statusText,
  reps,
  targetReps,
  onPressStop,
  onPressResume,
  onPressClose,
  onPressVoice,
}: PauseViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <PreparationHeader onPressClose={onPressClose} onPressVoice={onPressVoice} />
      <SessionHeading subtitle={subtitle} title="일시 정지" />
      <SessionProgressCard statusText={statusText} reps={reps} targetReps={targetReps} style={styles.card} />
      <Pressable
        accessibilityRole="button"
        onPress={onPressStop}
        style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}>
        <Text style={styles.stopText}>운동 중단하기</Text>
      </Pressable>
      <View style={styles.spacer} />
      <Pressable
        accessibilityRole="button"
        onPress={onPressResume}
        style={({ pressed }) => [styles.resumeButton, pressed && styles.pressed]}>
        <Text style={styles.resumeText}>운동 이어하기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PrepColors.white },
  card: { marginTop: 25, marginHorizontal: 18 },
  stopButton: {
    marginTop: 22,
    marginHorizontal: 32,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopText: { fontSize: 13, fontWeight: '700', color: PrepColors.text },
  spacer: { flex: 1 },
  resumeButton: {
    marginHorizontal: 18,
    marginBottom: 16,
    height: 44,
    borderRadius: 999,
    backgroundColor: PrepColors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeText: { fontSize: 14, fontWeight: '700', color: PrepColors.white },
  pressed: { opacity: 0.7 },
});
