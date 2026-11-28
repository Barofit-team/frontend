import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { ExerciseDetailBarChart } from '@/components/workout-result/ExerciseDetailBarChart';
import { formatScore } from '@/components/workout-result/format';
import { resultStyles } from '@/components/workout-result/resultStyles';
import { useExerciseScoreHistory } from '@/hooks/useExerciseScoreHistory';

function parseStringArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
  } catch {
    return [];
  }
}

export default function WorkoutResultDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    exerciseId?: string;
    exerciseName?: string;
    completedSets?: string;
    completedReps?: string;
    durationSeconds?: string;
    score?: string;
    feedbackMessages?: string;
    goodFeedback?: string;
    improvementFeedback?: string;
    nextGoal?: string;
    isApiMode?: string;
  }>();

  const exerciseId = params.exerciseId ?? '';
  const exerciseName = params.exerciseName ?? '운동 상세';
  const completedSets = Number(params.completedSets ?? 0) || 0;
  const completedReps = Number(params.completedReps ?? 0) || 0;
  const durationSeconds = Number(params.durationSeconds ?? 0) || 0;
  const parsedScore = params.score !== undefined && params.score !== '' ? Number(params.score) : undefined;
  const todayScore = parsedScore !== undefined && Number.isFinite(parsedScore) ? parsedScore : undefined;
  const isApiMode = params.isApiMode === '1';

  const { postureScore } = useExerciseScoreHistory(isApiMode && exerciseId ? exerciseId : null, exerciseName);
  const history = postureScore?.history ?? [];
  const previousPoint = history.length >= 2 ? history[history.length - 2] : undefined;
  const delta =
    todayScore !== undefined && previousPoint !== undefined
      ? Math.round(todayScore) - Math.round(previousPoint.score)
      : undefined;

  const feedbackList = parseStringArray(params.feedbackMessages);
  const fallbackMessages = [params.improvementFeedback, params.goodFeedback, params.nextGoal].filter(
    (msg): msg is string => typeof msg === 'string' && msg.trim().length > 0
  );
  const messages = feedbackList.length > 0 ? feedbackList : fallbackMessages;

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayFormatted = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  const volumeText =
    completedReps > 0 ? `${completedReps}회` : durationSeconds > 0 ? `${durationSeconds}초` : '0회';

  return (
    <View style={[resultStyles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기">
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        <Text style={styles.title}>{exerciseName}</Text>
        <Text style={styles.subtitle}>
          {completedSets}세트 · {volumeText} · {todayFormatted} 수행
        </Text>

        <View style={styles.cards}>
          <Card style={resultStyles.card}>
            <Text style={styles.cardLabel}>종목 자세 점수</Text>
            <View style={styles.scoreRow}>
              <View style={styles.scoreValueWrap}>
                <Text style={styles.scoreValue}>{todayScore !== undefined ? formatScore(todayScore) : '-'}</Text>
                <Text style={styles.scoreMax}>/100</Text>
              </View>
              {delta !== undefined && (
                <View style={[styles.deltaBadge, delta < 0 && styles.deltaBadgeDown]}>
                  <Text style={[styles.deltaText, delta < 0 && styles.deltaTextDown]}>
                    {delta >= 0 ? `이전보다 +${delta}점 성장` : `이전보다 ${delta}점`}
                  </Text>
                </View>
              )}
            </View>
          </Card>

          <ExerciseDetailBarChart
            todayScore={todayScore}
            todayDate={todayIso}
            previousScore={previousPoint?.score}
            previousDate={previousPoint?.date}
          />

          <View style={styles.feedbackCard}>
            <View style={styles.feedbackHeader}>
              <Text style={styles.feedbackIcon}>✦</Text>
              <Text style={styles.feedbackTitle}>AI 자세 피드백</Text>
            </View>
            {messages.length > 0 ? (
              <View style={styles.bubbleList}>
                {messages.map((msg, idx) => (
                  <View key={`${idx}-${msg}`} style={styles.bubble}>
                    <Text style={styles.bubbleText}>{msg}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>기록된 자세 교정 피드백이 아직 없어요.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 12 },
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
  title: { marginTop: 18, fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.4 },
  subtitle: { marginTop: 6, fontSize: 13, color: '#6B7280' },
  cards: { marginTop: 18, gap: 14 },
  cardLabel: { fontSize: 14, fontWeight: '600', color: '#4B5563' },
  scoreRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  scoreValue: { fontSize: 40, fontWeight: '800', color: '#111827', letterSpacing: -1 },
  scoreMax: { fontSize: 18, fontWeight: '600', color: '#9CA3AF' },
  deltaBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  deltaBadgeDown: { backgroundColor: '#F3F4F6' },
  deltaText: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },
  deltaTextDown: { color: '#4B5563' },
  feedbackCard: {
    borderRadius: 20,
    backgroundColor: '#EFF5FF',
    padding: 18,
    borderWidth: 1,
    borderColor: '#DCE8FF',
  },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  feedbackIcon: { fontSize: 16, color: '#2563EB', fontWeight: '700' },
  feedbackTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  bubbleList: { gap: 10, alignItems: 'flex-start' },
  bubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#E5ECF6',
  },
  bubbleText: { fontSize: 14, lineHeight: 20, color: '#1F2937', fontWeight: '500' },
});
