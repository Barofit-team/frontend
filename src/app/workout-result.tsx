/**
 * F01 오늘의 결과
 *
 * 진입: 운동 진행 화면(workout-session) 완료 → 약 1.2초 뒤 replace로 이동 (Fade 전환)
 *       → 스택: 홈(탭) › 오늘의 결과. 뒤로가기 시 운동 진행 화면이 아닌 홈으로 돌아갑니다.
 *  - 오늘 운동 난이도·불편함 남기기 → F02 (workout-feedback)
 *  - 홈으로 → 홈 탭 (dismissTo: 스택에 있는 홈까지 되돌아감)
 *
 * 데이터: useWorkoutResultStore의 결과로 모드를 정합니다.
 *  - source 'mock' (현재 운동 완료·프로필 개발 진입): 저장소의 Mock 결과를 그대로 표시, API 요청 없음
 *  - source 'api' (실제 Workout 세션, 기록 탭의 '리포트 보기' 포함): 그 sessionId로 Report API 조회 (hooks/useWorkoutResultReport)
 *      GET /result → 요약·종목 카드 / GET /generated → 잘한 점·개선점 / GET /scores → 자세 점수 차트
 *    세 API는 따로 로딩·오류를 표시합니다. /generated 404면 리포트를 생성(POST)하지 않고 "아직 없음"으로 둡니다.
 *    총 소요(elapsedSeconds)·휴식(restSeconds)은 값이 있을 때만, 리포트 전체 피드백은 'AI 리포트' 카드에 표시합니다.
 *    운동 시간(activeDurationSeconds)·다음 운동 집중 문구·주요 오류는 화면 의미가 정해지지 않아 표시하지 않습니다.
 *    /result의 저장된 피드백은 피드백 저장소에 넘겨 F02 재진입 시 초기값으로 씁니다.
 *  - 기록 탭에서 연 지난 세션은 제목을 '운동 결과'로 표시합니다.
 *
 * 개발용 진입: barofit://workout-result (결과가 없으면 빈 상태 표시)
 */
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { PrepColors } from '@/components/workout-preparation/palette';
import { ExerciseResultCard } from '@/components/workout-result/ExerciseResultCard';
import { NextWorkoutFocusCard } from '@/components/workout-result/NextWorkoutFocusCard';
import { PostureScoreChart } from '@/components/workout-result/PostureScoreChart';
import { ResultButton } from '@/components/workout-result/ResultButton';
import { RESULT_SCREEN_PADDING, resultStyles } from '@/components/workout-result/resultStyles';
import { useNavigationLock } from '@/components/workout-result/useNavigationLock';
import { WorkoutSummaryCard } from '@/components/workout-result/WorkoutSummaryCard';
import { useWorkoutResultReport, type WorkoutResultView } from '@/hooks/useWorkoutResultReport';
import { useWorkoutFeedbackStore } from '@/stores/useWorkoutFeedbackStore';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';

/** API 모드의 로딩·빈 상태·오류 안내 카드 (기존 카드 스타일 사용) */
function StatusCard({
  title,
  body,
  loading = false,
  onRetry,
}: {
  title: string;
  body?: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Card style={resultStyles.card} accessible accessibilityLabel={body ? `${title}, ${body}` : title}>
      <View style={styles.statusTitleRow}>
        {loading && <ActivityIndicator size="small" color={PrepColors.text} />}
        <Text style={resultStyles.cardTitle}>{title}</Text>
      </View>
      {body ? <Text style={[resultStyles.cardBody, styles.statusBody]}>{body}</Text> : null}
      {onRetry && <ResultButton variant="secondary" title="다시 시도" onPress={onRetry} style={styles.retry} />}
    </Card>
  );
}

export default function WorkoutResultScreen() {
  const insets = useSafeAreaInsets();
  const storeResult = useWorkoutResultStore(state => state.result);
  const navigate = useNavigationLock();

  // 실제 Workout 결과일 때만 Report API를 조회합니다. Mock 결과의 sessionId로는 요청하지 않습니다
  const apiSessionId = storeResult?.source === 'api' ? storeResult.sessionId : null;
  const isApiMode = apiSessionId !== null;
  const report = useWorkoutResultReport(apiSessionId);
  const mockResult = storeResult?.source === 'mock' ? storeResult : null;
  const result: WorkoutResultView | null = isApiMode ? report.view : mockResult;
  const isRecordSession = storeResult !== null && 'openedFrom' in storeResult && storeResult.openedFrom === 'record';

  // 서버에 저장된 피드백을 sessionId별로 넘깁니다. 같은 응답이면 다시 넘기지 않고, 입력 중인 draft는 바꾸지 않습니다
  const setServerFeedback = useWorkoutFeedbackStore(state => state.setServerFeedback);
  const serverFeedback = report.serverFeedback;
  useEffect(() => {
    if (apiSessionId && serverFeedback !== undefined) setServerFeedback(apiSessionId, serverFeedback);
  }, [apiSessionId, serverFeedback, setServerFeedback]);

  const goHome = () => navigate(() => router.dismissTo('/home'));
  const openFeedback = () =>
    navigate(() => router.push('/workout-feedback', { dangerouslySingular: true }));

  // 자세 점수 차트는 해당 종목 카드 바로 아래에 둡니다 (시안: 스쿼트 카드 다음). 못 찾으면 첫 종목 다음
  const chartExerciseId = isApiMode ? report.scores.exerciseId : result?.postureScore?.exerciseId;
  const chartAfterIndex = result
    ? Math.max(
        0,
        result.exercises.findIndex(exercise => exercise.exerciseId === chartExerciseId)
      )
    : 0;

  // API 모드: /scores 로딩·오류는 차트 자리에 안내. 이번 점수가 있는 종목이 없으면 기존 빈 차트
  let chart: ReactNode = <PostureScoreChart postureScore={result?.postureScore} />;
  if (isApiMode && report.scores.enabled) {
    if (report.scores.isLoading) {
      chart = <StatusCard title="자세 점수 변화" body="자세 점수를 불러오고 있어요." loading />;
    } else if (report.scores.error) {
      chart = <StatusCard title="자세 점수 변화" body={report.scores.error} onRetry={report.scores.retry} />;
    }
  }

  // API 모드: /generated 상태 안내 (404는 생성하지 않고 "아직 없음"으로 표시)
  let generatedNotice: ReactNode = null;
  if (isApiMode) {
    if (report.generated.isLoading) {
      generatedNotice = <StatusCard title="AI 리포트" body="잘한 점과 개선점을 불러오고 있어요." loading />;
    } else if (report.generated.isNotFound) {
      generatedNotice = <StatusCard title="AI 리포트" body="아직 생성된 AI 리포트가 없어요." />;
    } else if (report.generated.error) {
      generatedNotice = (
        <StatusCard title="AI 리포트" body={report.generated.error} onRetry={report.generated.retry} />
      );
    } else if (report.generated.overallFeedback) {
      generatedNotice = <StatusCard title="AI 리포트" body={report.generated.overallFeedback} />;
    }
  }

  // API 모드: /result를 아직 표시할 수 없는 상태
  let resultStatus: ReactNode = null;
  if (isApiMode && !result) {
    if (report.result.isLoading) {
      resultStatus = <StatusCard title="운동 결과를 불러오고 있어요" loading />;
    } else if (report.result.isNotFound) {
      resultStatus = (
        <StatusCard
          title="운동 결과를 찾을 수 없어요"
          body="운동 기록이 아직 저장되지 않았을 수 있어요."
          onRetry={report.result.retry}
        />
      );
    } else if (report.result.error) {
      resultStatus = <StatusCard title={report.result.error} onRetry={report.result.retry} />;
    }
  }

  return (
    <View style={[resultStyles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ animation: 'fade' }} />
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={resultStyles.pageTitle} accessibilityRole="header">
          {isRecordSession ? '운동 결과' : '오늘 운동을 완료했어요'}
        </Text>
        {__DEV__ && storeResult?.source === 'mock' && (
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
            {generatedNotice}
            {result.exercises.length === 0 && chart}
            {result.exercises.map((exercise, index) => (
              // 같은 종목이 루틴에 두 번 있을 수 있어 순번을 함께 씁니다
              <Fragment key={`${exercise.exerciseId}-${index}`}>
                <ExerciseResultCard result={exercise} />
                {index === chartAfterIndex && chart}
              </Fragment>
            ))}
            {result.nextFocus ? <NextWorkoutFocusCard text={result.nextFocus} /> : null}
          </View>
        ) : resultStatus ? (
          <View style={styles.cards}>{resultStatus}</View>
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
  statusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBody: { marginTop: 6 },
  retry: { marginTop: 12 },
});
