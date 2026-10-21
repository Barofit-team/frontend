/**
 * "N초 뒤 시작" 카운트다운 화면 (흰 배경). 표시 전용입니다.
 *  - 세트 시작:  "세션 1" / "스쿼트" / 10 / "초 뒤 시작"
 *  - 휴식:      "세트 1 완료" / "휴식" / 30 / "초 뒤 시작"
 *  - 재개:      "세트 1 진행 중" / "스쿼트" / 5 / "초 뒤 시작"
 *  - 숫자 없이(remainingSeconds 생략) 보조 문구·제목만 표시할 수도 있습니다. (예: 운동 종료)
 * 카메라는 사용하지 않습니다. 보조 문구·제목(SessionHeading)은 일시 정지 화면과 공용입니다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PreparationHeader } from '@/components/workout-preparation/PreparationHeader';
import { PrepColors } from '@/components/workout-preparation/palette';

type CountdownViewProps = {
  /** 회색 보조 문구 (예: "세션 1", "세트 1 완료") */
  subtitle: string;
  /** 굵은 제목 (예: "스쿼트", "휴식") */
  title: string;
  /** 생략하면 숫자와 "초 뒤 시작"을 표시하지 않음 */
  remainingSeconds?: number;
  onPressClose: () => void;
  onPressVoice?: () => void;
};

/** 회색 보조 문구 + 굵은 제목. 카운트다운·일시 정지 화면 공용 */
export function SessionHeading({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

export function CountdownView({ subtitle, title, remainingSeconds, onPressClose, onPressVoice }: CountdownViewProps) {
  const insets = useSafeAreaInsets();
  const hasSeconds = remainingSeconds !== undefined;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <PreparationHeader onPressClose={onPressClose} onPressVoice={onPressVoice} />
      <View
        style={styles.content}
        accessible
        accessibilityLabel={
          hasSeconds ? `${subtitle}, ${title}, ${remainingSeconds}초 뒤 시작` : `${subtitle}, ${title}`
        }
        accessibilityLiveRegion="polite">
        <SessionHeading subtitle={subtitle} title={title} />
        {hasSeconds && (
          <>
            <Text style={styles.seconds}>{Math.max(0, remainingSeconds)}</Text>
            <Text style={styles.caption}>초 뒤 시작</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PrepColors.white },
  content: { alignItems: 'center' },
  heading: { alignItems: 'center', marginTop: 78 },
  subtitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '600',
    color: PrepColors.line,
  },
  title: {
    marginTop: 17,
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '800',
    color: PrepColors.text,
  },
  seconds: {
    marginTop: 36,
    fontSize: 128,
    lineHeight: 140,
    fontWeight: '800',
    color: PrepColors.black,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    marginTop: 15,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600',
    color: PrepColors.line,
  },
});
