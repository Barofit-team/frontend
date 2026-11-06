import { create } from 'zustand';

/** 화면 진행 위치는 앱 메모리에 보관합니다. 서버 세션은 별도로 저장됩니다. */
export type WorkoutDraft = {
  sessionId: string;
  routineId: string;
  /** 루틴 안의 종목 순서(0부터) */
  exerciseIndex: number;
  totalExercises: number;
  exerciseId: string;
  exerciseName: string;
  /** 중단 시점의 단계 */
  phase: 'countdown' | 'exercising' | 'resting';
  /** 진행 중(또는 직전에 완료한) 세트 번호 */
  set: number;
  /** 현재 종목의 세트 수 */
  totalSets: number;
  reps: number | null;
  targetReps: number;
  /** 중단 시점 단계의 남은 시간(초) */
  remainingSeconds: number;
  /** ISO 시각 */
  savedAt: string;
  activeDurationSeconds?: number;
  restDurationSeconds?: number;
};

interface WorkoutDraftState {
  draft: WorkoutDraft | null;
  saveDraft: (draft: WorkoutDraft) => void;
  clearDraft: () => void;
}

export const useWorkoutDraftStore = create<WorkoutDraftState>((set) => ({
  draft: null,
  saveDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
