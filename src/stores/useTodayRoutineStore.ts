import { create } from 'zustand';

import type { ExerciseId } from '@/components/workout-session/sessionConfig';

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
}

interface TodayRoutineState {
  routineTitle: string;
  tags: string[];
  interExerciseRestSeconds: number;
  sessions: TodayRoutineSession[];

  setRoutineTitle: (title: string) => void;
  updateSession: (
    sessionId: string,
    params: { sets: number; reps: number },
  ) => void;
  resetSession: (sessionId: string) => void;
  resetAllSessions: () => void;
}

const DEFAULT_SESSIONS: TodayRoutineSession[] = [
  {
    id: 'session-squat',
    exerciseId: 'squat',
    name: '스쿼트',
    partAndLevel: '하체 · 초급',
    sets: 3,
    defaultSets: 3,
    reps: 20,
    defaultReps: 20,
    restSeconds: 30,
  },
  {
    id: 'session-pushup',
    exerciseId: 'push-up',
    name: '푸쉬업',
    partAndLevel: '상체 · 초급',
    sets: 2,
    defaultSets: 2,
    reps: 20,
    defaultReps: 20,
    restSeconds: 30,
  },
];

function cloneDefaultSessions(): TodayRoutineSession[] {
  return DEFAULT_SESSIONS.map((item) => ({ ...item }));
}

export const useTodayRoutineStore = create<TodayRoutineState>((set) => ({
  routineTitle: '가볍게 시작할 수 있는 기초 루틴',
  tags: ['초보자 추천', '근력', '코어'],
  interExerciseRestSeconds: 30,
  sessions: cloneDefaultSessions(),

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
      routineTitle: '가볍게 시작할 수 있는 기초 루틴',
      sessions: cloneDefaultSessions(),
    }),
}));
