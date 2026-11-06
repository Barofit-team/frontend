import { create } from 'zustand';

import type { ExerciseId } from '@/components/workout-session/sessionConfig';
import type { AssessmentStatus, BackendRoutineDetail } from '@/types/weeklyPlan';

export interface TodayRoutineSession {
  id: string;
  exerciseId: ExerciseId;
  name: string;
  partAndLevel: string;
  sets: number;
  defaultSets: number;
  reps: number;
  defaultReps: number;
  restSeconds: number;
  measurementType: 'REPS' | 'DURATION';
  assessmentStatus?: AssessmentStatus;
}

interface TodayRoutineState {
  routineTitle: string;
  tags: string[];
  interExerciseRestSeconds: number;
  sessions: TodayRoutineSession[];
  routineSnapshot: BackendRoutineDetail | null;
  planDate: string | null;
  setPlan: (routine: BackendRoutineDetail | null, date: string) => void;

  setRoutineTitle: (title: string) => void;
  updateSession: (
    sessionId: string,
    params: { sets: number; reps: number },
  ) => void;
  resetSession: (sessionId: string) => void;
  resetAllSessions: () => void;
}

export const useTodayRoutineStore = create<TodayRoutineState>((set) => ({
  routineTitle: '오늘 배정된 운동이 없어요',
  tags: ['초보자 추천', '근력', '코어'],
  interExerciseRestSeconds: 30,
  sessions: [],
  routineSnapshot: null,
  planDate: null,
  setPlan: (routine, date) => set({
    routineSnapshot: routine,
    planDate: date,
    routineTitle: routine?.name ?? '오늘 배정된 운동이 없어요',
    sessions: routine?.exercises.map((exercise) => {
      const first = exercise.sets[0];
      const target = exercise.measurementType === 'DURATION' ? first?.targetDurationSeconds : first?.targetReps;
      return { id: exercise.id, exerciseId: exercise.exerciseId, name: exercise.name,
        partAndLevel: exercise.measurementType === 'DURATION' ? '시간 기반' : '횟수 기반',
        sets: exercise.sets.length, defaultSets: exercise.sets.length,
        reps: target ?? 0, defaultReps: target ?? 0,
        restSeconds: first?.restSeconds ?? 0, measurementType: exercise.measurementType,
        assessmentStatus: exercise.assessmentStatus };
    }) ?? [],
  }),

  setRoutineTitle: (title) =>
    set({
      routineTitle: title.trim() || '가볍게 시작할 수 있는 기초 루틴',
    }),

  updateSession: (sessionId, { sets, reps }) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              sets: Math.max(1, sets),
              reps: Math.max(1, reps),
            }
          : session,
      ),
    })),

  resetSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              sets: session.defaultSets,
              reps: session.defaultReps,
            }
          : session,
      ),
    })),

  resetAllSessions: () =>
    set({
      routineTitle: '오늘 배정된 운동이 없어요',
      sessions: [],
      routineSnapshot: null,
      planDate: null,
    }),
}));
