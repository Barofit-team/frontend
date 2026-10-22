/**
 * 운동 진행 화면 하단 흰색 패널: 횟수(현재/목표) · 운동명 · 남은 시간(mm:ss).
 * 표시 전용 컴포넌트입니다. 값은 부모가 전달합니다.
 */
import { StyleSheet, Text, View } from 'react-native';

import { PrepColors } from '@/components/workout-preparation/palette';

/** 하단 Safe Area를 제외한 패널 높이 (디자인 360×800 기준) */
const PANEL_HEIGHT = 258;

type ExerciseStatusPanelProps = {
  exerciseName: string;
  currentReps: number;
  targetReps: number;
  remainingSeconds: number;
  /** 하단 Safe Area(Android 내비게이션 바) 높이 */
  bottomInset: number;
};

/** 60 → "01:00", 57 → "00:57" */
export function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function ExerciseStatusPanel({
  exerciseName,
  currentReps,
  targetReps,
  remainingSeconds,
  bottomInset,
}: ExerciseStatusPanelProps) {
  return (
    <View style={[styles.panel, { height: PANEL_HEIGHT + bottomInset, paddingBottom: bottomInset }]}>
      <View
        style={styles.repsRow}
        accessible
        accessibilityLabel={`${targetReps}회 중 ${currentReps}회 완료`}>
        <Text style={styles.repsCurrent}>{currentReps}</Text>
        <Text style={styles.repsTarget}>/{targetReps}</Text>
      </View>

      <View style={styles.divider} />

      <Text style={styles.exerciseName} accessibilityRole="header">
        {exerciseName}
      </Text>
      <Text
        style={styles.timer}
        accessibilityLabel={`남은 시간 ${remainingSeconds}초`}
        accessibilityLiveRegion="polite">
        {formatTime(remainingSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: PrepColors.white,
    paddingTop: 16,
  },
  repsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    height: 104,
  },
  repsCurrent: {
    fontSize: 96,
    lineHeight: 104,
    fontWeight: '800',
    color: PrepColors.black,
    fontVariant: ['tabular-nums'],
  },
  repsTarget: {
    marginLeft: 4,
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700',
    color: PrepColors.line,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E6E6E6',
    marginHorizontal: 14,
    marginTop: 20,
  },
  exerciseName: {
    marginTop: 16,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: PrepColors.text,
    textAlign: 'center',
  },
  timer: {
    marginTop: 8,
    fontSize: 52,
    lineHeight: 60,
    fontWeight: '800',
    color: PrepColors.black,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
