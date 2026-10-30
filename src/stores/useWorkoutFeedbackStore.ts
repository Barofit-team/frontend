import { create } from 'zustand';

import type { DiscomfortAreaId } from '@/constants/workoutFeedback';
import { saveWorkoutFeedback } from '@/services/workoutFeedbackService';
import type { SavedWorkoutFeedback, WorkoutDifficulty, WorkoutFeedback } from '@/types/workoutResult';

/**
 * 운동 후 피드백 상태 (F02 입력 · F03 확인).
 *
 *  - draft: 지금 입력 중인 피드백. F02 ↔ F03을 오가는 동안 유지됩니다.
 *  - savedBySession: 확정된 피드백을 sessionId별로 보관 → 세션 간 데이터가 섞이지 않습니다.
 *
 * [Mock] 저장은 서버가 아닌 메모리 보관입니다(앱 종료 시 사라짐). workoutFeedbackService 참고.
 */
interface WorkoutFeedbackState {
  draft: WorkoutFeedback | null;
  savedBySession: Record<string, SavedWorkoutFeedback>;

  /** F02 진입 시 호출. 저장된 피드백이 있으면 그 값으로, 없으면 빈 값으로 입력을 시작합니다 */
  startDraft: (sessionId: string) => void;
  setDifficulty: (difficulty: WorkoutDifficulty) => void;
  setHasDiscomfort: (hasDiscomfort: boolean) => void;
  toggleDiscomfortArea: (area: DiscomfortAreaId) => void;
  /** 입력이 완료된 draft를 확정 저장합니다. 미완성이면 예외 */
  submitDraft: () => Promise<SavedWorkoutFeedback>;
  reset: () => void;
}

export function createEmptyFeedback(sessionId: string): WorkoutFeedback {
  return { sessionId, difficulty: null, hasDiscomfort: null, discomfortAreas: [] };
}

/** 난이도와 불편 부위 응답이 모두 유효한지 ('있음'이면 부위를 1개 이상 선택해야 함) */
export function isFeedbackComplete(
  feedback: WorkoutFeedback | null | undefined
): feedback is WorkoutFeedback & { difficulty: WorkoutDifficulty; hasDiscomfort: boolean } {
  if (!feedback || feedback.difficulty === null || feedback.hasDiscomfort === null) return false;
  return !feedback.hasDiscomfort || feedback.discomfortAreas.length > 0;
}

export const useWorkoutFeedbackStore = create<WorkoutFeedbackState>((set, get) => ({
  draft: null,
  savedBySession: {},

  startDraft: (sessionId) => {
    const saved = get().savedBySession[sessionId];
    set({
      draft: saved
        ? {
            sessionId,
            difficulty: saved.difficulty,
            hasDiscomfort: saved.hasDiscomfort,
            discomfortAreas: [...saved.discomfortAreas],
          }
        : createEmptyFeedback(sessionId),
    });
  },

  setDifficulty: (difficulty) =>
    set(({ draft }) => (draft ? { draft: { ...draft, difficulty } } : {})),

  setHasDiscomfort: (hasDiscomfort) =>
    set(({ draft }) =>
      draft
        ? {
            draft: {
              ...draft,
              hasDiscomfort,
              // '없음'을 고르면 선택했던 부위를 비웁니다
              discomfortAreas: hasDiscomfort ? draft.discomfortAreas : [],
            },
          }
        : {}
    ),

  toggleDiscomfortArea: (area) =>
    set(({ draft }) => {
      if (!draft || draft.hasDiscomfort !== true) return {};
      const selected = draft.discomfortAreas.includes(area);
      return {
        draft: {
          ...draft,
          discomfortAreas: selected
            ? draft.discomfortAreas.filter(item => item !== area)
            : [...draft.discomfortAreas, area],
        },
      };
    }),

  submitDraft: async () => {
    const { draft } = get();
    if (!isFeedbackComplete(draft)) {
      throw new Error('피드백 입력이 완료되지 않았습니다.');
    }
    const saved = await saveWorkoutFeedback(draft);
    set(state => ({ savedBySession: { ...state.savedBySession, [saved.sessionId]: saved } }));
    return saved;
  },

  reset: () => set({ draft: null, savedBySession: {} }),
}));
