/**
 * 자동 일시정지 화면 (Figma '자동 일시정지'). 표시 전용 UI입니다.
 *  - 상단: '자동 일시정지'와 운동 상태(alternate, 예: 횟수 링·남은 시간)를 2초 간격으로 번갈아 표시
 *  - 중앙: '전신이 보이게 뒤로 물러나 주세요' + 흰 점선 인식 박스
 *  - 하단: 운동 정보 pill (메뉴 → 오늘의 운동 루틴)
 *
 * ⚠️ 자동 일시정지·복귀 판정(전신 이탈/재인식)은 정책 미확정이라 실제 운동 화면에 연결하지 않았습니다.
 *    현재는 DEV 미리보기에서만 수동으로 띄워 볼 수 있습니다(docs/F04-design-discussion.md).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { DottedLine } from '@/components/workout-preparation/DottedLine';

import { SessionHud, type SessionHudContent } from './SessionHud';
import { SessionStatusPill } from './SessionStatusPill';
import { SessionColors } from './sessionPalette';

/** 시안 주석: 2초 간격 전환 */
const ALTERNATE_MS = 2000;
const BOX_WIDTH_RATIO = 0.42;
const BOX_TOP_RATIO = 0.36;
const BOX_BOTTOM_RATIO = 0.84;

type AutoPauseOverlayProps = {
  alternate: SessionHudContent;
  exerciseName: string;
  subtitle: string;
  onPressMenu: () => void;
};

export function AutoPauseOverlay({ alternate, exerciseName, subtitle, onPressMenu }: AutoPauseOverlayProps) {
  const [showTitle, setShowTitle] = useState(true);
  const [area, setArea] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const timer = setInterval(() => setShowTitle(prev => !prev), ALTERNATE_MS);
    return () => clearInterval(timer);
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  };

  const boxWidth = area.width * BOX_WIDTH_RATIO;
  const left = (area.width - boxWidth) / 2;
  const top = area.height * BOX_TOP_RATIO;
  const bottom = area.height * BOX_BOTTOM_RATIO;
  const corners = [
    { x: left, y: top },
    { x: left + boxWidth, y: top },
    { x: left + boxWidth, y: bottom },
    { x: left, y: bottom },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onLayout}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {area.width > 0 &&
          corners.map((c, i) => (
            <DottedLine key={i} from={c} to={corners[(i + 1) % 4]} dotSize={2} gap={4} color={SessionColors.onCamera} />
          ))}
        {area.width > 0 &&
          corners.map((c, i) => <View key={`dot-${i}`} style={[styles.corner, { left: c.x - 3, top: c.y - 3 }]} />)}
      </View>
      <SessionHud
        tone={showTitle ? 'accent' : 'dark'}
        content={showTitle ? { kind: 'title', title: '자동 일시정지' } : alternate}
      />
      {area.height > 0 && (
        <Text
          style={[styles.headline, { top: area.height * 0.22 }]}
          accessibilityRole="header"
          accessibilityLiveRegion="polite">
          {'전신이 보이게\n뒤로 물러나 주세요'}
        </Text>
      )}
      <SessionStatusPill exerciseName={exerciseName} subtitle={subtitle} onPressMenu={onPressMenu} />
    </View>
  );
}

const styles = StyleSheet.create({
  headline: {
    position: 'absolute',
    left: 24,
    right: 24,
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    color: SessionColors.onCamera,
  },
  corner: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: SessionColors.onCamera },
});
