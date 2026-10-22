/**
 * F01 오늘의 결과
 *
 * 진입: 운동 진행 화면(workout-session) 완료 → 약 1.2초 뒤 replace로 이동 (Fade 전환)
 *       → 스택: 홈(탭) › 오늘의 결과. 뒤로가기 시 운동 진행 화면이 아닌 홈으로 돌아갑니다.
 *  - 오늘 운동 난이도·불편함 남기기 → F02 (workout-feedback)
 *  - 홈으로 → 홈 탭 (dismissTo: 스택에 있는 홈까지 되돌아감)
 *
 * 데이터: useWorkoutResultStore (현재는 Mock 결과, mocks/workoutResult.ts)
 *
 * 개발용 진입: barofit://workout-result (결과가 없으면 빈 상태 표시)
 */
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrepColors } from '@/components/workout-preparation/palette';
import { ExerciseResultCard } from '@/components/workout-result/ExerciseResultCard';
import { NextWorkoutFocusCard } from '@/components/workout-result/NextWorkoutFocusCard';
import { PostureScoreChart } from '@/components/workout-result/PostureScoreChart';
import { ResultButton } from '@/components/workout-result/ResultButton';
import { RESULT_SCREEN_PADDING, resultStyles } from '@/components/workout-result/resultStyles';
import { useNavigationLock } from '@/components/workout-result/useNavigationLock';
import { WorkoutSummaryCard } from '@/components/workout-result/WorkoutSummaryCard';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';

export default function WorkoutResultScreen() {
  const insets = useSafeAreaInsets();
  const result = useWorkoutResultStore(state => state.result);
  const navigate = useNavigationLock();

  const goHome = () => navigate(() => router.dismissTo('/home'));
  const openFeedback = () =>
    navigate(() => router.push('/workout-feedback', { dangerouslySingular: true }));

  // 자세 점수 차트는 해당 종목 카드 바로 아래에 둡니다 (시안: 스쿼트 카드 다음). 못 찾으면 첫 종목 다음
  const chartAfterIndex = result
    ? Math.max(
        0,
        result.exercises.findIndex(exercise => exercise.exerciseId === result.postureScore?.exerciseId)
      )
    : 0;

  return (
    <View style={[resultStyles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ animation: 'fade' }} />
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={resultStyles.pageTitle} accessibilityRole="header">
          오늘 운동을 완료했어요
        </Text>
        {__DEV__ && result?.source === 'mock' && (
          <Text style={styles.mockLabel}>[DEV] Mock 데이터 · 실제 측정·AI 분석 결과가 아닙니다</Text>
        )}

        {result ? (
          <View style={styles.cards}>
            <WorkoutSummaryCard
              completedSets={result.completedSets}
              totalReps={result.totalReps}
              exerciseDurationSeconds={result.exerciseDurationSeconds}
              restDurationSeconds={result.restDurationSeconds}
              totalDurationSeconds={result.totalDurationSeconds}
            />
            {result.exercises.length === 0 && <PostureScoreChart postureScore={result.postureScore} />}
            {result.exercises.map((exercise, index) => (
              <Fragment key={exercise.exerciseId}>
                <ExerciseResultCard result={exercise} />
                {index === chartAfterIndex && <PostureScoreChart postureScore={result.postureScore} />}
              </Fragment>
            ))}
            {result.nextFocus ? <NextWorkoutFocusCard text={result.nextFocus} /> : null}
          </View>
        ) : (
          <View style={[resultStyles.card, styles.empty]}>
            <Text style={resultStyles.cardTitle}>표시할 운동 결과가 없어요</Text>
            <Text style={[resultStyles.cardBody, styles.emptyBody]}>운동을 마치면 이곳에서 결과를 확인할 수 있어요.</Text>
          </View>
        )}

        <View style={styles.actions}>
          {result && (
            <ResultButton
              variant="secondary"
              title="오늘 운동 난이도·불편함 남기기"
              accessibilityHint="운동 피드백 입력 화면으로 이동합니다"
              onPress={openFeedback}
            />
          )}
          <ResultButton title="홈으로" onPress={goHome} style={result ? styles.homeButton : undefined} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: RESULT_SCREEN_PADDING, paddingTop: 28 },
  mockLabel: { marginTop: 4, fontSize: 11, color: PrepColors.line },
  cards: { marginTop: 18, gap: 14 },
  empty: { marginTop: 18 },
  emptyBody: { marginTop: 6 },
  actions: { marginTop: 18 },
  homeButton: { marginTop: 30 },
});
