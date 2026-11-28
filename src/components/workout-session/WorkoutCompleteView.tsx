/**
 * 운동 완료 전환 화면 (Figma 'Workout Complete'). 카메라는 꺼진 상태이며 나타날 때 Fade-in 합니다.
 *  - 밝은 파란 배경 · 브랜드 파랑 원형 아이콘(기존 FlameIcon) · '오늘의 운동을 완료했어요!'
 *  - 시안의 컨페티는 전달받은 애니메이션 자산이 없어 넣지 않았습니다(신규 애니메이션 라이브러리 추가 금지).
 * 결과 화면으로 넘어가는 타이밍과 COMPLETED 저장·Report 연동은 workout-session이 관리합니다.
 */
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { FlameIcon } from '@/components/home/HomeIcons';

import { SessionColors } from './sessionPalette';

const FADE_IN_MS = 250;
/** 시안 배경(옅은 파랑). 주간 계획 편집 화면의 입력 배경과 같은 값 */
const COMPLETE_BACKGROUND = '#F0F5FF';
const ICON_SIZE = 64;

export function WorkoutCompleteView() {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.container, { opacity }]} accessibilityLiveRegion="polite">
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <FlameIcon color={SessionColors.onCamera} size={30} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        오늘의 운동을 완료했어요!
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: COMPLETE_BACKGROUND },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SessionColors.primary,
  },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: SessionColors.sheetText },
});
