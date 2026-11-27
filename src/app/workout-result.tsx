/**
 * F01 오늘의 결과 (Daily Report 시안 기반)
 *
 * 진입: 운동 진행 화면(workout-session) 완료 → Fade 전환
 *  - 종목 행 탭 → workout-result-detail (종목 상세 리포트)
 *  - 오늘 운동 난이도·불편함 남기기 → F02 (workout-feedback)
 *  - 홈으로 → 홈 탭
 */
import { router, Stack, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { PrepColors } from '@/components/workout-preparation/palette';
import { formatDuration, formatScore } from '@/components/workout-result/format';
import { RecentScoreLineChart } from '@/components/workout-result/RecentScoreLineChart';
import { ResultButton } from '@/components/workout-result/ResultButton';
import { RESULT_SCREEN_PADDING, resultStyles } from '@/components/workout-result/resultStyles';
import { useNavigationLock } from '@/components/workout-result/useNavigationLock';
import { useWorkoutResultReport, type WorkoutResultView } from '@/hooks/useWorkoutResultReport';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';
import type { ExerciseResult } from '@/types/workoutResult';

const WEEKLY_GOAL_STEPS = 4;

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

function computeRoutineScore(result: WorkoutResultView): number | undefined {
  if (typeof result.routineScore === 'number' && Number.isFinite(result.routineScore)) return result.routineScore;
  const scored = result.exercises.map((e) => e.score).filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
  if (scored.length === 0) return undefined;
  return scored.reduce((a, b) => a + b, 0) / scored.length;
}

export default function WorkoutResultScreen() {
  const insets = useSafeAreaInsets();
  const storeResult = useWorkoutResultStore((state) => state.result);
  const navigate = useNavigationLock();

  const apiSessionId = storeResult?.source === 'api' ? storeResult.sessionId : null;
  const isApiMode = apiSessionId !== null;
  const report = useWorkoutResultReport(apiSessionId);
  const mockResult = storeResult?.source === 'mock' ? storeResult : null;
  const result: WorkoutResultView | null = isApiMode ? report.view : mockResult;
  const isRecordSession = storeResult !== null && 'openedFrom' in storeResult && storeResult.openedFrom === 'record';

  const handleBack = () =>
    navigate(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.dismissTo('/home');
      }
    });
  const openDetail = (exercise: ExerciseResult) =>
    navigate(() =>
      router.push({
        pathname: '/workout-result-detail',
        params: {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          completedSets: String(exercise.completedSets),
          completedReps: String(exercise.completedReps),
          durationSeconds: String(exercise.durationSeconds ?? 0),
          score: exercise.score !== undefined ? String(exercise.score) : '',
          feedbackMessages: JSON.stringify(exercise.feedbackMessages ?? []),
          goodFeedback: exercise.goodFeedback ?? '',
          improvementFeedback: exercise.improvementFeedback ?? '',
          nextGoal: exercise.nextGoal ?? '',
          isApiMode: isApiMode ? '1' : '0',
        },
      } as unknown as Href)
    );

  const now = new Date();
  const headerTitle = isRecordSession
    ? '운동 결과'
    : `${now.getMonth() + 1}월 ${now.getDate()}일 운동 리포트`;

  const routineScore = result ? computeRoutineScore(result) : undefined;
  const rawWeeklyCount = result?.weeklyWorkoutCount;
  const weeklyCount = typeof rawWeeklyCount === 'number' && Number.isFinite(rawWeeklyCount) ? rawWeeklyCount : 1;
  const progressRatio = Math.min(1, Math.max(0.15, weeklyCount / WEEKLY_GOAL_STEPS));

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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}>
        <Pressable
          style={styles.backButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기">
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.pageTitle} accessibilityRole="header">
          {headerTitle}
        </Text>
        {result && (
          <Text style={styles.summarySubtitle}>
            {result.exercises.length}종목 · {result.completedSets}세트
            {result.totalDurationSeconds !== undefined
              ? ` · ${formatDuration(result.totalDurationSeconds)} 소요`
              : ''}
          </Text>
        )}
        {__DEV__ && storeResult?.source === 'mock' && (
          <Text style={styles.mockLabel}>[DEV] Mock 데이터 · 실제 측정·AI 분석 결과가 아닙니다</Text>
        )}

        {result ? (
          <View style={styles.cards}>
            <Card style={styles.weeklyCard}>
              <Text style={styles.weeklyLabel}>
                이번 주 <Text style={styles.weeklyHighlight}>{weeklyCount}번째</Text>
              </Text>
              <View style={styles.weeklyBarTrack}>
                <View style={[styles.weeklyBarFill, { width: `${Math.round(progressRatio * 100)}%` }]} />
                <View style={styles.weeklyDotsOverlay}>
                  {Array.from({ length: WEEKLY_GOAL_STEPS }).map((_, idx) => (
                    <View
                      key={idx}
                      style={[styles.weeklyDot, idx + 1 <= weeklyCount && styles.weeklyDotActive]}
                    />
                  ))}
                </View>
              </View>
            </Card>

            <View style={styles.scoreHeroCard}>
              <Text style={styles.scoreHeroLabel}>오늘의 자세 점수</Text>
              <View style={styles.scoreHeroRow}>
                <Text style={styles.scoreHeroValue}>
                  {routineScore !== undefined ? formatScore(routineScore) : '-'}
                </Text>
                <Text style={styles.scoreHeroMax}>/100</Text>
              </View>
            </View>

            <RecentScoreLineChart points={result.recentScores ?? result.postureScore?.history} />
            {isApiMode && report.recent.error ? (
              <StatusCard title="최근 기록을 불러오지 못했어요" body={report.recent.error} onRetry={report.recent.retry} />
            ) : null}

            <Card style={resultStyles.card}>
              <Text style={styles.sectionTitle}>종목별 점수</Text>
              <View style={styles.exerciseList}>
                {result.exercises.map((exercise, index) => (
                  <Pressable
                    key={`${exercise.exerciseId}-${index}`}
                    style={({ pressed }) => [
                      styles.exerciseRow,
                      index > 0 && styles.exerciseRowBorder,
                      pressed && styles.exerciseRowPressed,
                    ]}
                    onPress={() => openDetail(exercise)}
                    accessibilityRole="button"
                    accessibilityLabel={`${exercise.exerciseName} 상세 리포트 보기`}>
                    <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
                    <View style={styles.exerciseRight}>
                      <Text style={styles.exerciseScore}>
                        {exercise.score !== undefined ? formatScore(exercise.score) : '-'}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </Card>
          </View>
        ) : resultStatus ? (
          <View style={styles.cards}>{resultStatus}</View>
        ) : (
          <View style={[resultStyles.card, styles.empty]}>
            <Text style={resultStyles.cardTitle}>표시할 운동 결과가 없어요</Text>
            <Text style={[resultStyles.cardBody, styles.emptyBody]}>운동을 마치면 이곳에서 결과를 확인할 수 있어요.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: RESULT_SCREEN_PADDING, paddingTop: 12 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  backArrow: { fontSize: 18, fontWeight: '600', color: '#111827' },
  pageTitle: { marginTop: 18, fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.4 },
  summarySubtitle: { marginTop: 6, fontSize: 13, color: '#6B7280' },
  mockLabel: { marginTop: 4, fontSize: 11, color: PrepColors.line },
  cards: { marginTop: 16, gap: 12 },
  weeklyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  weeklyLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  weeklyHighlight: { color: '#2563EB' },
  weeklyBarTrack: {
    width: '54%',
    height: 10,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    overflow: 'visible',
  },
  weeklyBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#5B93F7',
  },
  weeklyDotsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  weeklyDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#D1D5DB' },
  weeklyDotActive: { backgroundColor: '#2563EB' },
  scoreHeroCard: {
    borderRadius: 20,
    backgroundColor: '#2563EB',
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  scoreHeroLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.88)' },
  scoreHeroRow: { marginTop: 12, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  scoreHeroValue: { fontSize: 44, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 },
  scoreHeroMax: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.72)' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  exerciseList: { marginTop: 4 },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  exerciseRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  exerciseRowPressed: { opacity: 0.6 },
  exerciseName: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  exerciseRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exerciseScore: { fontSize: 16, fontWeight: '700', color: '#111827' },
  chevron: { fontSize: 18, color: '#9CA3AF', fontWeight: '600' },
  empty: { marginTop: 18 },
  emptyBody: { marginTop: 6 },
  actions: { marginTop: 18 },
  homeButton: { marginTop: 10 },
  statusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBody: { marginTop: 6 },
  retry: { marginTop: 12 },
});
