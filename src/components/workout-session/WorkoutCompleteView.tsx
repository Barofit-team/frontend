/**
 * 운동 완료 전환 화면 ("오늘의 루틴 / 운동 완료!").
 * 기존 CountdownView 디자인을 그대로 쓰고, 나타날 때 Fade-in 합니다.
 * 결과 화면으로 넘어가는 타이밍은 workout-session이 관리합니다.
 */
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { CountdownView } from './CountdownView';

const FADE_IN_MS = 250;

type WorkoutCompleteViewProps = {
  onPressClose: () => void;
};

export function WorkoutCompleteView({ onPressClose }: WorkoutCompleteViewProps) {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <CountdownView subtitle="오늘의 루틴" title="운동 완료!" onPressClose={onPressClose} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
