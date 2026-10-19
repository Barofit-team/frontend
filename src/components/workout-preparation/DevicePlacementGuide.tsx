/**
 * Place device 일러스트: 방 모서리(벽·바닥 선) 앞에 세워 둔 스마트폰.
 * 컨테이너 크기를 측정해 비율로 배치하므로 화면 크기가 달라도 형태가 유지됩니다.
 */
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { PrepColors } from './palette';

type Point = { x: number; y: number };

function Line({
  from,
  to,
  color = PrepColors.line,
  width = 1,
}: {
  from: Point;
  to: Point;
  color?: string;
  width?: number;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (from.x + to.x) / 2 - length / 2,
        top: (from.y + to.y) / 2 - width / 2,
        width: length,
        height: width,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

export function DevicePlacementGuide() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const { width: w, height: h } = size;
  const wallLeft = w * 0.13;
  const wallRight = w * 0.87;
  const wallTop = h * 0.18;
  const floor = h * 0.68;
  const floorEdge = h * 0.82;

  const phoneWidth = Math.max(44, Math.min(w * 0.17, 72));
  const phoneHeight = phoneWidth * 2;
  const phoneBottom = h * 0.76;

  return (
    <View
      style={styles.container}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {w > 0 && (
        <>
          <Line from={{ x: wallLeft, y: wallTop }} to={{ x: wallLeft, y: floor }} />
          <Line from={{ x: wallRight, y: wallTop }} to={{ x: wallRight, y: floor }} />
          <Line from={{ x: wallLeft, y: floor }} to={{ x: wallRight, y: floor }} />
          <Line from={{ x: wallLeft, y: floor }} to={{ x: 0, y: floorEdge }} />
          <Line from={{ x: wallRight, y: floor }} to={{ x: w, y: floorEdge }} />
          <View
            style={[
              styles.phone,
              {
                width: phoneWidth,
                height: phoneHeight,
                borderRadius: phoneWidth * 0.2,
                left: (w - phoneWidth) / 2,
                top: phoneBottom - phoneHeight,
              },
            ]}>
            <View style={styles.camera} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignSelf: 'stretch' },
  phone: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: PrepColors.device,
    backgroundColor: PrepColors.deviceScreen,
    alignItems: 'center',
  },
  camera: {
    marginTop: 6,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: PrepColors.device,
  },
});
