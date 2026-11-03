import { create } from 'zustand';

import type { ExerciseId } from '@/components/workout-session/sessionConfig';
import { getTodayWorkoutPlan } from '@/services/routineService';
import type { RoutineDetail, RoutineExerciseDetail } from '@/types/routine';

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
  currentRoutine: RoutineDetail | null;
  isLoading: boolean;

  setRoutineTitle: (title: string) => void;
  loadFromRoutineDetail: (routine: RoutineDetail) => void;
  loadTodayRoutine: () => Promise<void>;
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

function normalizeExerciseId(rawId: string): ExerciseId {
  const lower = rawId.toLowerCase().replace(/_/g, '-');
  if (lower.includes('push')) return 'push-up';
  return 'squat';
}

function mapBackendExerciseToSession(
  item: RoutineExerciseDetail,
  level: string = '초급',
): TodayRoutineSession {
  const setsCount = item.sets.length > 0 ? item.sets.length : 3;
  const firstSet = item.sets[0];
  const targetReps = firstSet?.targetReps ?? 20;
  const restSeconds = firstSet?.restSeconds ?? 30;

  return {
    id: item.id || `session-${item.exerciseId}`,
    exerciseId: normalizeExerciseId(item.exerciseId),
    name: item.name,
    partAndLevel: `${item.name} · ${level}`,
    sets: setsCount,
    defaultSets: setsCount,
    reps: targetReps,
    defaultReps: targetReps,
    restSeconds,
  };
}

export const useTodayRoutineStore = create<TodayRoutineState>((set) => ({
  routineTitle: '가볍게 시작할 수 있는 기초 루틴',
  tags: ['초보자 추천', '근력', '코어'],
  interExerciseRestSeconds: 30,
  sessions: cloneDefaultSessions(),
  currentRoutine: null,
  isLoading: false,

  setRoutineTitle: (title) =>
    set({
      routineTitle: title.trim() || '가볍게 시작할 수 있는 기초 루틴',
    }),

  loadFromRoutineDetail: (routine: RoutineDetail) => {
    if (!routine || !routine.exercises || routine.exercises.length === 0) {
      return;
    }
    const difficultyLabel =
      routine.difficulty === 'ADVANCED'
        ? '고급'
        : routine.difficulty === 'INTERMEDIATE'
          ? '중급'
          : '초급';

    const sessions = routine.exercises.map((ex) =>
      mapBackendExerciseToSession(ex, difficultyLabel),
    );

    set({
      routineTitle: routine.name,
      currentRoutine: routine,
      sessions,
    });
  },

  loadTodayRoutine: async () => {
    set({ isLoading: true });
    try {
      const todayPlan = await getTodayWorkoutPlan();
      if (todayPlan && todayPlan.routine) {
        const routine = todayPlan.routine;
        const difficultyLabel =
          routine.difficulty === 'ADVANCED'
            ? '고급'
            : routine.difficulty === 'INTERMEDIATE'
              ? '중급'
              : '초급';

        const sessions = routine.exercises.map((ex) =>
          mapBackendExerciseToSession(ex, difficultyLabel),
        );

        set({
          routineTitle: routine.name,
          currentRoutine: routine,
          sessions,
          isLoading: false,
        });
        return;
      }
    } catch {
      // 오프라인이거나 미인증/미배정 시 기본값 유지
    }
    set({ isLoading: false });
  },

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
      currentRoutine: null,
    }),
}));
