/**
 * 세로 그라데이션 배경. 그라데이션 패키지(네이티브 재빌드 필요) 없이 얇은 띠를 겹쳐 근사합니다.
 * 부모를 꽉 채우며 터치를 가로채지 않습니다.
 */
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Rgba = [number, number, number, number];

function parseColor(color: string): Rgba {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map(v => v.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  return [0, 0, 0, 0];
}

type GradientFillProps = {
  /** 위 → 아래 색. hex(#RRGGBB) 또는 rgb/rgba */
  from: string;
  to: string;
  /** 띠 개수. 클수록 부드럽지만 View가 늘어남 */
  bands?: number;
  style?: StyleProp<ViewStyle>;
};

export const GradientFill = memo(function GradientFill({ from, to, bands = 28, style }: GradientFillProps) {
  const a = parseColor(from);
  const b = parseColor(to);
  const rows = [];
  for (let i = 0; i < bands; i++) {
    const t = bands === 1 ? 0 : i / (bands - 1);
    const mix = a.map((v, k) => v + (b[k] - v) * t);
    rows.push(
      <View
        key={i}
        style={{
          flex: 1,
          backgroundColor: `rgba(${Math.round(mix[0])},${Math.round(mix[1])},${Math.round(mix[2])},${mix[3].toFixed(3)})`,
        }}
      />
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {rows}
    </View>
  );
});
