/**
 * 두 점을 잇는 점선. Android에서 한쪽 테두리만 dashed로 그리면 실선으로 보이는 문제가 있어
 * 작은 점(View)을 일정 간격으로 배치하는 방식으로 그립니다.
 * 부모는 position: 'relative'(기본값)이고, 좌표는 부모 기준 px입니다.
 */
import { View } from 'react-native';

import { PrepColors } from './palette';

type Point = { x: number; y: number };

type DottedLineProps = {
  from: Point;
  to: Point;
  color?: string;
  dotSize?: number;
  gap?: number;
};

export function DottedLine({ from, to, color = PrepColors.black, dotSize = 2, gap = 4 }: DottedLineProps) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const count = Math.max(2, Math.floor(length / (dotSize + gap)) + 1);
  const dots = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    dots.push(
      <View
        key={i}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: from.x + dx * t - dotSize / 2,
          top: from.y + dy * t - dotSize / 2,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color,
        }}
      />
    );
  }
  return <>{dots}</>;
}
