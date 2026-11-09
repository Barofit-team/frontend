import { create } from 'zustand';

import {
  getRoutineTemplateDetail,
  getTodayWorkoutPlan,
  getUserRoutineDetail,
} from '@/services/routineService';
import { toIsoDateString } from '@/services/weeklyPlanService';
import type { RoutineDetail } from '@/types/routine';
import type { AssessmentStatus, BackendRoutineDetail } from '@/types/weeklyPlan';

export interface TodayRoutineSession {
  id: string;
  exerciseId: string;
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
  prepareRoutine: (options?: {
    title?: string;
    routineId?: string;
    isTemplate?: boolean;
    snapshot?: BackendRoutineDetail;
    date?: string;
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

export const useTodayRoutineStore = create<TodayRoutineState>((set, get) => ({
  routineTitle: '오늘 배정된 운동이 없어요',
  tags: ['초보자 추천', '근력', '코어'],
  interExerciseRestSeconds: 30,
  sessions: [],
  routineSnapshot: null,
  planDate: null,

  setPlan: (routine, date) =>
    set({
      routineSnapshot: routine,
      planDate: date,
      routineTitle: routine?.name ?? '오늘 배정된 운동이 없어요',
      sessions:
        routine?.exercises.map((exercise) => {
          const first = exercise.sets[0];
          const target =
            exercise.measurementType === 'DURATION'
              ? first?.targetDurationSeconds
              : first?.targetReps;
          return {
            id: exercise.id,
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            partAndLevel:
              exercise.measurementType === 'DURATION'
                ? '시간 기반'
                : '횟수 기반',
            sets: exercise.sets.length,
            defaultSets: exercise.sets.length,
            reps: target ?? 0,
            defaultReps: target ?? 0,
            restSeconds: first?.restSeconds ?? 0,
            measurementType: exercise.measurementType,
            assessmentStatus: exercise.assessmentStatus,
          };
        }) ?? [],
    }),

  setRoutineTitle: (title) =>
    set({
      routineTitle: title.trim() || '오늘 배정된 운동이 없어요',
    }),

  prepareRoutine: async (options) => {
    const { title, routineId, isTemplate = false, snapshot, date } = options ?? {};
    const targetDate = date ?? toIsoDateString(new Date());

    if (snapshot) {
      get().setPlan(snapshot, targetDate);
      return;
    }

    if (title) {
      set({ routineTitle: title });
    }

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
          get().setPlan(detail, targetDate);
          return;
        }
      } catch (e) {
        console.warn('[prepareRoutine] 루틴 상세 조회 실패:', e);
      }
    } else if (!routineId) {
      try {
        const todayPlan = await getTodayWorkoutPlan();
        if (todayPlan?.routine) {
          get().setPlan(todayPlan.routine, todayPlan.date);
          return;
        }
      } catch (e) {
        console.warn('[prepareRoutine] 오늘 운동 계획 조회 실패:', e);
      }
    }
  },

  loadFromRoutineDetail: (routine: RoutineDetail) => {
    get().setPlan(routine, toIsoDateString(new Date()));
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
      routineTitle: '오늘 배정된 운동이 없어요',
      sessions: [],
      routineSnapshot: null,
      planDate: null,
    }),
}));
