/**
 * 운동 진행 화면 상단 영역 (표시 전용). 카메라 위 어두운 상단 그라데이션 + 상태별 제목·타이머.
 *
 *  - title-timer: '준비 00:10', '휴식 00:30', '복귀 00:05'
 *  - title:       '운동 시작'
 *  - reps:        파란 원형 횟수 카운터 + 남은 시간 (횟수 운동)
 *  - duration:    중앙 남은 시간 + 진행 바 (시간 운동)
 *  - check:       파란 체크 + '세트 N 완료!'
 * tone 'accent'는 상단을 네이비 그라데이션으로 그립니다(운동 시작·복귀·세트 완료).
 */
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientFill } from '@/components/workout-preparation/GradientFill';
import { CheckCircle } from '@/components/workout-preparation/PreparationIcons';

import { ProgressRing } from './ProgressRing';
import { SessionColors } from './sessionPalette';
import { formatTime } from './sessionProgress';

export type SessionHudContent =
  | { kind: 'title-timer'; title: string; seconds: number }
  | { kind: 'title'; title: string }
  | { kind: 'reps'; reps: number | null; target: number; seconds: number }
  /** holdSeconds: AI가 판정한 유효 자세 유지 시간(초). 없으면 표시하지 않음 */
  | { kind: 'duration'; seconds: number; progress: number; holdSeconds?: number | null }
  | { kind: 'check'; title: string };

type SessionHudProps = {
  content: SessionHudContent;
  tone?: 'dark' | 'accent';
};

/** 실기기 검증 후 시안 비율에 맞춰 축소(상단 영역이 화면을 과하게 차지하던 문제) */
const SOLID_HEIGHT = 116;
const FADE_HEIGHT = 120;
const RING_SIZE = 96;

export function SessionHud({ content, tone = 'dark' }: SessionHudProps) {
  const insets = useSafeAreaInsets();
  const solidHeight = insets.top + SOLID_HEIGHT;

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={{ height: solidHeight }}>
        {tone === 'accent' ? (
          <GradientFill from={SessionColors.accentTop} to={SessionColors.base} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: SessionColors.base }]} />
        )}
      </View>
      <View style={{ height: FADE_HEIGHT }}>
        <GradientFill from={SessionColors.base} to={SessionColors.baseTransparent} />
      </View>

      <View
        style={[styles.content, { paddingTop: insets.top + 12, height: solidHeight }]}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={describe(content)}>
        <HudBody content={content} />
      </View>
    </View>
  );
}

function HudBody({ content }: { content: SessionHudContent }) {
  switch (content.kind) {
    case 'title-timer':
      return (
        <View style={styles.row}>
          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.timer}>{formatTime(content.seconds)}</Text>
        </View>
      );
    case 'title':
      return <Text style={styles.title}>{content.title}</Text>;
    case 'reps': {
      const progress = content.reps !== null && content.target > 0 ? content.reps / content.target : 0;
      return (
        <View style={styles.row}>
          <ProgressRing
            size={RING_SIZE}
            stroke={8}
            progress={progress}
            color={SessionColors.primary}
            trackColor={SessionColors.track}>
            <Text style={styles.reps}>{content.reps ?? '–'}</Text>
          </ProgressRing>
          <Text style={styles.timer}>{formatTime(content.seconds)}</Text>
        </View>
      );
    }
    case 'duration':
      return (
        <View style={styles.column}>
          <Text style={styles.timer}>{formatTime(content.seconds)}</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round(Math.min(1, Math.max(0, content.progress)) * 100)}%` },
              ]}
            />
          </View>
          {typeof content.holdSeconds === 'number' && (
            <Text style={styles.hold}>유효 자세 유지 {formatTime(content.holdSeconds)}</Text>
          )}
        </View>
      );
    case 'check':
      return (
        <View style={styles.column}>
          <CheckCircle size={36} background={SessionColors.primary} />
          <Text style={styles.checkTitle}>{content.title}</Text>
        </View>
      );
  }
}

function describe(content: SessionHudContent) {
  switch (content.kind) {
    case 'title-timer':
      return `${content.title}, ${content.seconds}초`;
    case 'title':
    case 'check':
      return content.title;
    case 'reps':
      return content.reps === null
        ? `자세 측정 연결 대기 중, 남은 시간 ${content.seconds}초`
        : `${content.target}회 중 ${content.reps}회, 남은 시간 ${content.seconds}초`;
    case 'duration':
      return typeof content.holdSeconds === 'number'
        ? `남은 시간 ${content.seconds}초, 유효 자세 유지 ${content.holdSeconds}초`
        : `남은 시간 ${content.seconds}초`;
  }
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  column: { alignItems: 'center', gap: 12 },
  title: {
    fontSize: 40,
    lineHeight: 50,
    fontWeight: '800',
    color: SessionColors.onCamera,
    letterSpacing: -0.5,
  },
  timer: {
    fontSize: 40,
    lineHeight: 50,
    fontWeight: '700',
    color: SessionColors.timer,
    fontVariant: ['tabular-nums'],
  },
  reps: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '800',
    color: SessionColors.onCamera,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    width: 160,
    height: 6,
    borderRadius: 3,
    backgroundColor: SessionColors.track,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: SessionColors.primary },
  hold: { fontSize: 12, fontWeight: '600', color: SessionColors.timer, fontVariant: ['tabular-nums'] },
  checkTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: SessionColors.onCamera,
    letterSpacing: -0.3,
  },
});
