import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

type Props = {
  /** 서버 응답(또는 로컬 완료 처리)이 끝났는지. true가 되기 전까지는 90%에서 대기한다. */
  done?: boolean;
  /** done이 true가 된 뒤 게이지가 100%에 도달했을 때 1회 호출된다. */
  onFinished?: () => void;
};

/** 처리 중의 시각적 진행 표시. 서버 응답 전에는 90%에서 대기하고, done이 되어야 100%까지 채운다. */
export function PlanLoading({ done = false, onFinished }: Props) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setProgress((value) => Math.min(done ? 100 : 90, value + 3)),
      80,
    );
    return () => clearInterval(timer);
  }, [done]);
  const finishedRef = useRef(false);
  useEffect(() => {
    if (done && progress >= 100 && !finishedRef.current) {
      finishedRef.current = true;
      onFinished?.();
    }
  }, [done, progress, onFinished]);
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
