/**
 * Place device 일러스트: 방 모서리(벽·바닥 선) 앞에 세워 둔 스마트폰.
 * 컨테이너 크기를 측정해 비율로 배치하므로 화면 크기가 달라도 형태가 유지됩니다.
 * 1차 디자인(Figma 캡처): 연한 회색 투시선 + 파란 외곽선 스마트폰. 원본 에셋을 받으면 교체합니다.
 */
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { F03Colors } from './palette';

type Point = { x: number; y: number };

function Line({
  from,
  to,
  color = F03Colors.illustrationLine,
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
  // 캡처 비율: 벽 세로선 x 19%·80%, 벽은 영역 위쪽 끝까지, 바닥선은 영역 72% 높이
  const wallLeft = w * 0.19;
  const wallRight = w * 0.81;
  const wallTop = 0;
  const floor = h * 0.72;
  const floorEdge = h * 0.86;

  const phoneWidth = Math.max(48, Math.min(w * 0.22, 88));
  const phoneHeight = phoneWidth * 2.1;
  const phoneBottom = h * 0.98;

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
    borderWidth: 2.5,
    borderColor: F03Colors.illustrationDevice,
    backgroundColor: F03Colors.illustrationDeviceFill,
    alignItems: 'center',
  },
  camera: {
    marginTop: 7,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: F03Colors.illustrationDevice,
  },
});
