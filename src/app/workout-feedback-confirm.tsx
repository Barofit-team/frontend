/**
 * F03 피드백 · 선택됨
 *
 * F02에서 고른 난이도·불편 부위를 확인합니다.
 *  - 다시 선택하기 → F02 (스택에 남아 있는 F02로 돌아가므로 선택값 유지)
 *  - 완료 → 피드백 확정 저장 후 F01로 (저장 중에는 버튼 비활성화 → 중복 제출 방지)
 *    저장에 실패하면 이동하지 않고 오류를 보여주며, 입력값은 그대로 두어 다시 시도할 수 있습니다.
 *
 * 저장 위치 (services/workoutFeedbackService.ts)
 *  - Mock 운동 결과(source 'mock'): 앱 메모리 보관 (API 요청 없음)
 *  - 실제 Workout 세션(source 'api'): Report API PUT /feedback.
 *    불편 부위 '있음'은 대응하는 API 코드가 정해지지 않아 저장할 수 없으며, 완료를 막고 사유를 안내합니다.
 */
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrepColors } from '@/components/workout-preparation/palette';
import { FeedbackSummaryCard } from '@/components/workout-result/FeedbackSummaryCard';
import { ResultButton } from '@/components/workout-result/ResultButton';
import { RESULT_SCREEN_PADDING, resultStyles } from '@/components/workout-result/resultStyles';
import { useNavigationLock } from '@/components/workout-result/useNavigationLock';
import { difficultyLabel, discomfortAreaLabel } from '@/constants/workoutFeedback';
import { toReportActionErrorMessage } from '@/services/reportFeedbackService';
import { canSaveToReport, type FeedbackSaveTarget } from '@/services/workoutFeedbackService';
import { isFeedbackComplete, useWorkoutFeedbackStore } from '@/stores/useWorkoutFeedbackStore';
import { useWorkoutResultStore } from '@/stores/useWorkoutResultStore';

const NOT_SELECTED = '선택하지 않았어요';
const DISCOMFORT_NOT_SUPPORTED =
  "불편 부위는 아직 서버에 저장할 수 없어요. 지금은 불편 부위가 '없음'인 피드백만 저장돼요.";

export default function WorkoutFeedbackConfirmScreen() {
  const insets = useSafeAreaInsets();
  const sessionId = useWorkoutResultStore(state => state.result?.sessionId);
  // 실제 Workout 결과일 때만 서버에 저장합니다 (F01과 같은 기준)
  const saveTarget: FeedbackSaveTarget = useWorkoutResultStore(state =>
    state.result?.source === 'api' ? 'api' : 'mock'
  );
  const storedDraft = useWorkoutFeedbackStore(state => state.draft);
  const submitDraft = useWorkoutFeedbackStore(state => state.submitDraft);
  const navigate = useNavigationLock();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // 현재 결과 세션의 입력값만 사용 (직접 진입 등으로 없으면 '선택하지 않았어요' + 완료 비활성화)
  const draft = sessionId && storedDraft?.sessionId === sessionId ? storedDraft : null;
  const complete = isFeedbackComplete(draft);
  // 실제 세션 + 불편 부위 '있음': 현재 API 계약으로 저장 불가
  const unsupported = saveTarget === 'api' && draft !== null && complete && !canSaveToReport(draft);

  const difficultyText = draft?.difficulty ? difficultyLabel(draft.difficulty) : NOT_SELECTED;
  const discomfortText =
    draft?.hasDiscomfort === false
      ? '없음'
      : draft?.hasDiscomfort === true && draft.discomfortAreas.length > 0
        ? draft.discomfortAreas.map(discomfortAreaLabel).join(', ')
        : NOT_SELECTED;

  const reselect = () => {
    if (submittingRef.current) return;
    navigate(() => router.dismissTo('/workout-feedback'));
  };

  const finish = async () => {
    if (submittingRef.current || !complete || unsupported) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await submitDraft(saveTarget);
      navigate(() => router.dismissTo('/workout-result'));
    } catch (saveError: unknown) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(
        saveTarget === 'api'
          ? toReportActionErrorMessage(saveError, '피드백 저장')
          : '피드백을 저장하지 못했어요. 다시 시도해 주세요.'
      );
    }
  };

  return (
    <View style={[resultStyles.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Text style={resultStyles.pageTitle} accessibilityRole="header">
          피드백 · 선택됨
        </Text>
        <View style={styles.cards}>
          <FeedbackSummaryCard title="오늘 운동의 난이도" value={difficultyText} />
          <FeedbackSummaryCard title="새로 불편해진 부위" value={discomfortText} />
        </View>
        <ResultButton
          variant="secondary"
          title="다시 선택하기"
          disabled={submitting}
          onPress={reselect}
          style={styles.reselectButton}
        />
        {unsupported && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {DISCOMFORT_NOT_SUPPORTED}
          </Text>
        )}
        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <ResultButton title="완료" disabled={!complete || unsupported} loading={submitting} onPress={finish} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: RESULT_SCREEN_PADDING, paddingTop: 28, paddingBottom: 24 },
  cards: { marginTop: 18, gap: 14 },
  reselectButton: { marginTop: 14 },
  error: { marginTop: 12, fontSize: 12, color: PrepColors.text, textAlign: 'center' },
  bottomBar: { paddingHorizontal: RESULT_SCREEN_PADDING, paddingTop: 12 },
});
