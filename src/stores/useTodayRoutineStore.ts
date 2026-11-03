import { create } from 'zustand';

import type { ExerciseId } from '@/components/workout-session/sessionConfig';
import {
  getRoutineTemplateDetail,
  getTodayWorkoutPlan,
  getUserRoutineDetail,
} from '@/services/routineService';
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
  prepareRoutine: (options?: {
    title?: string;
    routineId?: string;
    isTemplate?: boolean;
  }) => Promise<void>;
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
  const sets = Array.isArray(item?.sets) ? item.sets : [];
  const setsCount = sets.length > 0 ? sets.length : 3;
  const firstSet = sets[0];
  const targetReps =
    firstSet?.targetReps ??
    (firstSet?.targetDurationSeconds
      ? Math.round(firstSet.targetDurationSeconds / 3)
      : 20);
  const restSeconds = firstSet?.restSeconds ?? 30;

  return {
    id: item.id || `session-${item.exerciseId ?? 'exercise'}`,
    exerciseId: normalizeExerciseId(item.exerciseId ?? ''),
    name: item.name || '운동',
    partAndLevel: `${item.name || '운동'} · ${level}`,
    sets: setsCount,
    defaultSets: setsCount,
    reps: targetReps,
    defaultReps: targetReps,
    restSeconds,
  };
}

export const useTodayRoutineStore = create<TodayRoutineState>((set, get) => ({
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

  prepareRoutine: async (options) => {
    const { title, routineId, isTemplate = false } = options ?? {};
    set({
      isLoading: true,
      routineTitle: title?.trim() || '가볍게 시작할 수 있는 기초 루틴',
    });

    const isUuid =
      Boolean(routineId) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        routineId!,
      );

    if (isUuid && routineId) {
      try {
        const detail = isTemplate
          ? await getRoutineTemplateDetail(routineId)
          : await getUserRoutineDetail(routineId).catch(() =>
              getRoutineTemplateDetail(routineId),
            );
        if (
          detail &&
          Array.isArray(detail.exercises) &&
          detail.exercises.length > 0
        ) {
          get().loadFromRoutineDetail(detail);
          set({ isLoading: false });
          return;
        }
      } catch {
        // 비정상 응답 시 기본 세션으로 안전하게 대체
      }
    } else if (!routineId) {
      try {
        const todayPlan = await getTodayWorkoutPlan();
        if (
          todayPlan?.routine &&
          Array.isArray(todayPlan.routine.exercises) &&
          todayPlan.routine.exercises.length > 0
        ) {
          get().loadFromRoutineDetail(todayPlan.routine);
          set({ isLoading: false });
          return;
        }
      } catch {
        // 미배정/오류 시 기본 세션 유지
      }
    }

    set({
      currentRoutine: null,
      sessions: cloneDefaultSessions(),
      isLoading: false,
    });
  },

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
    await get().prepareRoutine();
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
      isLoading: false,
    }),
}));
