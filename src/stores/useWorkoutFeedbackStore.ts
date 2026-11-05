import { create } from 'zustand';

import type { DiscomfortAreaId } from '@/constants/workoutFeedback';
import { saveWorkoutFeedback, toReportFeedback, type FeedbackSaveTarget } from '@/services/workoutFeedbackService';
import type { ReportDifficulty, ReportFeedback } from '@/types/report';
import type { SavedWorkoutFeedback, WorkoutDifficulty, WorkoutFeedback } from '@/types/workoutResult';

/**
 * 운동 후 피드백 상태 (F02 입력 · F03 확인).
 *
 *  - draft: 지금 입력 중인 피드백. F02 ↔ F03을 오가는 동안 유지됩니다.
 *  - savedBySession: 확정된 피드백을 sessionId별로 보관 → 세션 간 데이터가 섞이지 않습니다.
 *  - serverBySession: 실제 세션의 서버 저장 피드백(F01의 GET /result feedback, 저장 성공 시 그 값)을 sessionId별로 보관.
 *    F02 진입 시(startDraft)에만 draft 초기값으로 쓰고, 이미 입력 중인 draft는 바꾸지 않습니다.
 *
 * 저장: Mock 결과는 메모리 보관만(앱 종료 시 사라짐), 실제 Workout 세션은 Report API에 저장한 뒤 성공하면 보관합니다.
 * 실패하면 보관하지 않고 예외를 그대로 던집니다(draft 유지). workoutFeedbackService 참고.
 */
interface WorkoutFeedbackState {
  draft: WorkoutFeedback | null;
  savedBySession: Record<string, SavedWorkoutFeedback>;
  /** 키가 있으면 서버 조회 완료. 값 null은 서버에 저장된 피드백이 없음 */
  serverBySession: Record<string, ReportFeedback | null>;

  /** 실제 세션의 서버 저장 피드백을 기록합니다 (draft는 바꾸지 않음) */
  setServerFeedback: (sessionId: string, feedback: ReportFeedback | null) => void;
  /** F02 진입 시 호출. 서버 피드백 → 이 앱에서 저장한 피드백 → 빈 값 순서로 입력을 시작합니다 */
  startDraft: (sessionId: string) => void;
  setDifficulty: (difficulty: WorkoutDifficulty) => void;
  setHasDiscomfort: (hasDiscomfort: boolean) => void;
  toggleDiscomfortArea: (area: DiscomfortAreaId) => void;
  /** 입력이 완료된 draft를 확정 저장합니다(기본 'mock'). 미완성이거나 저장에 실패하면 예외 */
  submitDraft: (target?: FeedbackSaveTarget) => Promise<SavedWorkoutFeedback>;
  reset: () => void;
}

export function createEmptyFeedback(sessionId: string): WorkoutFeedback {
  return { sessionId, difficulty: null, hasDiscomfort: null, discomfortAreas: [] };
}

/** Report 난이도 → 화면 난이도 (workoutFeedbackService의 EASY·MODERATE·HARD 매핑의 역) */
const SCREEN_DIFFICULTY: Record<ReportDifficulty, WorkoutDifficulty> = {
  EASY: 'easy',
  MODERATE: 'normal',
  HARD: 'hard',
};

/**
 * 서버 피드백 → 입력 초기값.
 *  - 불편 부위 [] → '없음'
 *  - 불편 부위 코드가 있으면 화면 선택지와 대응 규칙이 없어 표시하지 않고 미선택으로 둡니다('없음'으로 바꾸지 않음).
 *    이 경우 hasUnrepresentableServerDiscomfort가 true이며, F03에서 저장을 막아 서버 값을 덮어쓰지 않습니다.
 */
export function feedbackFromServer(sessionId: string, server: ReportFeedback): WorkoutFeedback {
  const representable = server.discomfortAreas.length === 0;
  return {
    sessionId,
    difficulty: SCREEN_DIFFICULTY[server.difficulty] ?? null,
    hasDiscomfort: representable ? false : null,
    discomfortAreas: [],
  };
}

/** 서버에 화면에서 표현할 수 없는 불편 부위가 저장되어 있는지 */
export function hasUnrepresentableServerDiscomfort(server: ReportFeedback | null | undefined): boolean {
  return server !== null && server !== undefined && server.discomfortAreas.length > 0;
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
  serverBySession: {},

  setServerFeedback: (sessionId, feedback) =>
    set(state => ({ serverBySession: { ...state.serverBySession, [sessionId]: feedback } })),

  startDraft: (sessionId) => {
    const { serverBySession, savedBySession } = get();
    const server = serverBySession[sessionId];
    if (server) {
      set({ draft: feedbackFromServer(sessionId, server) });
      return;
    }
    const saved = savedBySession[sessionId];
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

  submitDraft: async (target = 'mock') => {
    const { draft } = get();
    if (!isFeedbackComplete(draft)) {
      throw new Error('피드백 입력이 완료되지 않았습니다.');
    }
    const saved = await saveWorkoutFeedback(draft, target);
    set(state => ({
      savedBySession: { ...state.savedBySession, [saved.sessionId]: saved },
      // 서버에 저장이 확인된 값이 최신 서버 피드백입니다 (저장과 같은 매핑, Mock 저장은 서버 값이 아님)
      ...(saved.savedTo === 'api'
        ? { serverBySession: { ...state.serverBySession, [saved.sessionId]: toReportFeedback(saved) } }
        : {}),
    }));
    return saved;
  },

  reset: () => set({ draft: null, savedBySession: {}, serverBySession: {} }),
}));
