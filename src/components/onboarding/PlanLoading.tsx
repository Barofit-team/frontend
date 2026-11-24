import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

/** 처리 중의 시각적 진행 표시. 서버 응답 전에는 완료 상태에 도달하지 않는다. */
export function PlanLoading() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setProgress((value) => Math.min(90, value + 3)), 80);
    return () => clearInterval(timer);
  }, []);
  const circumference = 2 * Math.PI * 54;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="54" fill="none" stroke="#F0F5FF" stroke-width="12"/><circle cx="64" cy="64" r="54" fill="none" stroke="#3473F8" stroke-width="12" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - progress / 100)}" transform="rotate(-90 64 64)"/></svg>`;
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel="맞춤 운동 플랜 준비 중"
      accessibilityValue={{ text: '온보딩 정보를 저장하고 있어요' }}>
      <View style={styles.ring}>
        <Image source={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }} style={StyleSheet.absoluteFill} />
        <Text style={styles.percent}>{progress}%</Text>
      </View>
      <Text style={styles.heading}>{'맞춤 운동 플랜을\n생성하고 있어요'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40 },
  ring: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center' },
  percent: { color: '#245FE5', fontSize: 32, fontWeight: '600' },
  heading: { marginTop: 36, fontSize: 22, lineHeight: 30, fontWeight: '700', textAlign: 'center', color: '#222222' },
});
