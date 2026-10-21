import { create } from 'zustand';

/**
 * [Mock] 운동 중단 시 진행 상태 임시 보관소 (메모리, 앱 종료 시 사라짐).
 * 백엔드 저장 API가 정해지면 saveDraft에서 API를 호출하도록 교체합니다.
 * 현재는 보관만 하며, 이어하기(복원) 기능은 구현하지 않았습니다.
 */
export type WorkoutDraft = {
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
  reps: number;
  targetReps: number;
  /** 중단 시점 단계의 남은 시간(초) */
  remainingSeconds: number;
  /** ISO 시각 */
  savedAt: string;
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
