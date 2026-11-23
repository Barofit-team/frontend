/**
 * 운동 완료 전환 화면. 카메라는 꺼진 상태이며 나타날 때 Fade-in 합니다.
 * 결과 화면으로 넘어가는 타이밍은 workout-session이 관리합니다.
 * 1차 시안에 이 화면이 없어 세트 완료 표현(파란 체크)을 맞춰 적용했습니다(docs/F04-design-discussion.md).
 */
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { SessionHud } from './SessionHud';
import { SessionColors } from './sessionPalette';

const FADE_IN_MS = 250;

export function WorkoutCompleteView() {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <SessionHud tone="accent" content={{ kind: 'check', title: '운동 완료!' }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SessionColors.base },
});
