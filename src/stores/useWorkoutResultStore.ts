import { create } from 'zustand';

import type { WorkoutSessionResult } from '@/types/workoutResult';

/**
 * 실제 Workout 세션을 sessionId로만 가리키는 결과 참조. F01이 이 sessionId로 Report API를 조회합니다.
 *  - openedFrom 'record': 운동 기록 탭에서 지난 기록을 연 경우 (F01 제목을 중립적인 '운동 결과'로 표시)
 */
export interface ApiSessionReference {
  source: 'api';
  sessionId: string;
  openedFrom: 'record' | 'workout';
}

export type StoredWorkoutResult = WorkoutSessionResult | ApiSessionReference;

/**
 * 가장 최근에 F01에서 보여줄 운동 세션 결과.
 *  - setResult: 운동 완료 시 결과 저장 (현재는 Mock 결과)
 *  - openApiSession: 운동 기록 탭의 실제 세션을 sessionId로 엽니다. F02·F03 피드백도 같은 sessionId를 씁니다.
 * 메모리 보관이며 앱 종료 시 사라집니다.
 */
interface WorkoutResultState {
  result: StoredWorkoutResult | null;
  setResult: (result: WorkoutSessionResult) => void;
  openApiSession: (sessionId: string, openedFrom?: 'record' | 'workout') => void;
  clearResult: () => void;
}

export const useWorkoutResultStore = create<WorkoutResultState>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  openApiSession: (sessionId, openedFrom = 'record') => set({ result: { source: 'api', sessionId, openedFrom } }),
  clearResult: () => set({ result: null }),
}));
