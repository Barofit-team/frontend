/**
 * F02 운동은 어땠나요?
 *
 * 질문 1. 오늘 운동의 난이도 — 쉬웠어요 / 적당했어요 / 어려웠어요 (단일 선택)
 * 질문 2. 운동 중 새로 불편해진 부위 — 없음 / 있음, '있음'이면 부위 복수 선택 (constants/workoutFeedback.ts)
 *
 *  - 다음 → F03 (난이도 + 불편 부위 응답이 유효할 때만 활성화)
 *  - 나중에 하기 / 뒤로가기 → F01. 입력하던 값은 버리고 운동 결과는 그대로 둡니다.
 *  - F03에서 '다시 선택하기'로 돌아오면 이 화면이 그대로 남아 있어 선택값이 유지됩니다.
 *    (F01에서 새로 들어올 때만 저장된 피드백 또는 빈 값으로 초기화)
 */
import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { FeedbackOption } from '@/components/workout-result/FeedbackOption';
import { ResultButton } from '@/components/workout-result/ResultButton';
import { RESULT_SCREEN_PADDING, resultStyles } from '@/components/workout-result/resultStyles';
import { useNavigationLock } from '@/components/workout-result/useNavigationLock';
import { DIFFICULTY_OPTIONS, DISCOMFORT_AREA_OPTIONS } from '@/constants/workoutFeedback';
import { createEmptyFeedback, isFeedbackComplete, useWorkoutFeedbackStore } from '@/stores/useWorkoutFeedbackStore';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';

export default function WorkoutFeedbackScreen() {
  const insets = useSafeAreaInsets();
  const sessionId = useWorkoutResultStore(state => state.result?.sessionId);
  const storedDraft = useWorkoutFeedbackStore(state => state.draft);
  const startDraft = useWorkoutFeedbackStore(state => state.startDraft);
  const setDifficulty = useWorkoutFeedbackStore(state => state.setDifficulty);
  const setHasDiscomfort = useWorkoutFeedbackStore(state => state.setHasDiscomfort);
  const toggleDiscomfortArea = useWorkoutFeedbackStore(state => state.toggleDiscomfortArea);
  const navigate = useNavigationLock();

  useEffect(() => {
    if (sessionId) startDraft(sessionId);
  }, [sessionId, startDraft]);

  if (!sessionId) return <Redirect href="/workout-result" />;

  // 다른 세션의 입력값이 보이지 않도록 sessionId가 같을 때만 사용
  const draft = storedDraft?.sessionId === sessionId ? storedDraft : createEmptyFeedback(sessionId);
  const canProceed = isFeedbackComplete(draft);

  const later = () => navigate(() => router.dismissTo('/workout-result'));
  const next = () => {
    if (!canProceed) return;
    navigate(() => router.push('/workout-feedback-confirm', { dangerouslySingular: true }));
  };

  return (
    <View style={[resultStyles.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* 질문 1. 난이도 */}
        <Text style={styles.questionTitle} accessibilityRole="header">
          오늘 운동의 난이도
        </Text>
        <View style={styles.difficultyList} accessibilityRole="radiogroup">
          {DIFFICULTY_OPTIONS.map(option => (
            <FeedbackOption
              key={option.value}
              label={option.label}
              selected={draft.difficulty === option.value}
              onPress={() => setDifficulty(option.value)}
            />
          ))}
        </View>

        {/* 질문 2. 불편 부위 */}
        <Card style={[resultStyles.card, styles.discomfortCard]}>
          <Text style={styles.cardQuestion} accessibilityRole="header">
            운동 중 새로 불편해진 부위가 있나요?
          </Text>
          <View style={styles.yesNoRow} accessibilityRole="radiogroup">
            <FeedbackOption
              label="없음"
              onGray
              selected={draft.hasDiscomfort === false}
              onPress={() => setHasDiscomfort(false)}
              style={styles.yesNoOption}
            />
            <FeedbackOption
              label="있음"
              onGray
              selected={draft.hasDiscomfort === true}
              onPress={() => setHasDiscomfort(true)}
              style={styles.yesNoOption}
            />
          </View>

          {draft.hasDiscomfort === true && (
            <View style={styles.areaSection}>
              <Text style={resultStyles.cardBody}>불편한 부위를 모두 선택해 주세요</Text>
              <View style={styles.areaList}>
                {DISCOMFORT_AREA_OPTIONS.map(area => (
                  <FeedbackOption
                    key={area.id}
                    label={area.label}
                    variant="chip"
                    selection="multiple"
                    onGray
                    selected={draft.discomfortAreas.includes(area.id)}
                    onPress={() => toggleDiscomfortArea(area.id)}
                  />
                ))}
              </View>
            </View>
          )}
        </Card>

        <ResultButton
          variant="secondary"
          title="나중에 하기"
          accessibilityHint="피드백을 남기지 않고 결과 화면으로 돌아갑니다"
          onPress={later}
          style={styles.laterButton}
        />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <ResultButton
          title="다음"
          disabled={!canProceed}
          accessibilityHint={canProceed ? undefined : '난이도와 불편 부위를 선택하면 활성화됩니다'}
          onPress={next}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: RESULT_SCREEN_PADDING, paddingTop: 28, paddingBottom: 24 },
  questionTitle: { ...resultStyles.cardTitle, fontSize: 17, lineHeight: 24 },
  difficultyList: { marginTop: 16, gap: 12 },
  discomfortCard: { marginTop: 28 },
  cardQuestion: { ...resultStyles.cardTitle },
  yesNoRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
  yesNoOption: { flex: 1 },
  areaSection: { marginTop: 18 },
  areaList: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  laterButton: { marginTop: 16 },
  bottomBar: { paddingHorizontal: RESULT_SCREEN_PADDING, paddingTop: 12 },
});
