import { create } from 'zustand';

import type { WorkoutSessionResult } from '@/types/workoutResult';

/**
 * 가장 최근에 끝난 운동 세션의 결과 (F01에서 표시).
 * 현재는 운동 완료 시 Mock 결과를 넣습니다. (실제 기록·AI 분석 연동 전)
 * 메모리 보관이며 앱 종료 시 사라집니다.
 */
interface WorkoutResultState {
  result: WorkoutSessionResult | null;
  setResult: (result: WorkoutSessionResult) => void;
  clearResult: () => void;
}

export const useWorkoutResultStore = create<WorkoutResultState>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  clearResult: () => set({ result: null }),
}));
