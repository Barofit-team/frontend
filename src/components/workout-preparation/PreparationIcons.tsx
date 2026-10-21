/**
 * 운동 준비 화면용 단순 아이콘 (아이콘/SVG 라이브러리 없이 View로 구성).
 */
import { StyleSheet, View } from 'react-native';

import { PrepColors } from './palette';

type IconProps = { color?: string; size?: number };

/** 스피커(음성 안내) 아이콘 */
export function SpeakerIcon({ color = PrepColors.text, size = 18 }: IconProps) {
  const u = size / 18;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center' }}>
      {/* 몸통 */}
      <View
        style={{
          position: 'absolute',
          left: 1 * u,
          width: 4 * u,
          height: 6 * u,
          borderRadius: 1 * u,
          backgroundColor: color,
        }}
      />
      {/* 나팔 (삼각형) */}
      <View
        style={{
          position: 'absolute',
          left: 3 * u,
          width: 0,
          height: 0,
          borderTopWidth: 6 * u,
          borderBottomWidth: 6 * u,
          borderRightWidth: 6 * u,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderRightColor: color,
        }}
      />
      {/* 음파 */}
      <View
        style={{
          position: 'absolute',
          left: 7 * u,
          width: 7 * u,
          height: 7 * u,
          borderRadius: 3.5 * u,
          borderWidth: 1.5 * u,
          borderColor: 'transparent',
          borderRightColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 7 * u,
          width: 11 * u,
          height: 11 * u,
          borderRadius: 5.5 * u,
          borderWidth: 1.5 * u,
          borderColor: 'transparent',
          borderRightColor: color,
        }}
      />
    </View>
  );
}

/** 닫기(X) 아이콘 */
export function CloseIcon({ color = PrepColors.text, size = 14 }: IconProps) {
  const bar = { width: size * 1.2, height: Math.max(1.5, size / 9), backgroundColor: color, borderRadius: 1 };
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View style={[bar, { position: 'absolute', transform: [{ rotate: '45deg' }] }]} />
      <View style={[bar, { position: 'absolute', transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

/** 체크 표시 */
export function CheckMark({ color = PrepColors.white, size = 14 }: IconProps) {
  const stroke = Math.max(2, size / 6);
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.9,
          height: size * 0.48,
          marginTop: -size * 0.18,
          borderLeftWidth: stroke,
          borderBottomWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

/** 검은 원 안의 체크 (완료 표시) */
export function CheckCircle({
  size = 40,
  background = PrepColors.black,
}: {
  size?: number;
  background?: string;
}) {
  return (
    <View
      style={[
        styles.center,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
      ]}>
      <CheckMark size={size * 0.38} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
