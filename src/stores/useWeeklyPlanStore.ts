import { create } from 'zustand';

import { ApiError } from '@/services/api';
import {
  buildWeekCalendarDays,
  fetchRecommendedRoutineItems,
  fetchWeeklyPlanItems,
  formatWeekTitle,
  toIsoDateString,
} from '@/services/weeklyPlanService';
import type {
  RecommendedRoutineItem,
  WeeklyCalendarDay,
  WeeklyPlanDayItem,
} from '@/types/weeklyPlan';

interface WeeklyPlanState {
  weekTitle: string;
  weekDays: WeeklyCalendarDay[];
  selectedDate: string;
  planItems: WeeklyPlanDayItem[];
  recommendedRoutines: RecommendedRoutineItem[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;

  loadWeeklyPlan: () => Promise<void>;
  setSelectedDate: (date: string) => void;
  setPlanItems: (items: WeeklyPlanDayItem[]) => void;
  reset: () => void;
}

const initialNow = new Date();
const initialWeekDays = buildWeekCalendarDays([], initialNow);
const todayIso = toIsoDateString(initialNow);
const initialSelectedDate =
  initialWeekDays.find((d) => d.date === todayIso)?.date ??
  initialWeekDays[0].date;

export const useWeeklyPlanStore = create<WeeklyPlanState>((set, get) => ({
  weekTitle: formatWeekTitle(initialNow),
  weekDays: initialWeekDays,
  selectedDate: initialSelectedDate,
  planItems: [],
  recommendedRoutines: [],
  isLoading: false,
  hasLoaded: false,
  error: null,

  loadWeeklyPlan: async () => {
    if (get().isLoading) return;

    const now = new Date();
    set({ isLoading: true, error: null });

    try {
      const [planResult, recommendResult] = await Promise.allSettled([
        fetchWeeklyPlanItems(now),
        fetchRecommendedRoutineItems(),
      ]);

      const planItems =
        planResult.status === 'fulfilled' ? planResult.value : [];
      const recommendedRoutines =
        recommendResult.status === 'fulfilled' ? recommendResult.value : [];

      const weekDays = buildWeekCalendarDays(planItems, now);
      const currentSelected = get().selectedDate;
      const stillInWeek = weekDays.some((day) => day.date === currentSelected);

      let errorMessage: string | null = null;
      if (planResult.status === 'rejected') {
        const reason = planResult.reason;
        // 서버 미연결이나 미인증 상태에서도 빈 데이터 상태(데이터 없음)로 자연스럽게 표기하고 에러 메시지를 보관
        errorMessage =
          reason instanceof ApiError
            ? reason.message
            : '운동 계획 데이터를 불러오지 못했습니다.';
      }

      set({
        weekTitle: formatWeekTitle(now),
        weekDays,
        selectedDate: stillInWeek ? currentSelected : weekDays[0].date,
        planItems,
        recommendedRoutines,
        isLoading: false,
        hasLoaded: true,
        error: errorMessage,
      });
    } catch {
      const fallbackDays = buildWeekCalendarDays([], now);
      set({
        weekTitle: formatWeekTitle(now),
        weekDays: fallbackDays,
        planItems: [],
        recommendedRoutines: [],
        isLoading: false,
        hasLoaded: true,
        error: '운동 계획 데이터를 불러오지 못했습니다.',
      });
    }
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  setPlanItems: (items) => {
    const now = new Date();
    set({
      planItems: items,
      weekDays: buildWeekCalendarDays(items, now),
      hasLoaded: true,
      error: null,
    });
  },

  reset: () => {
    const now = new Date();
    const days = buildWeekCalendarDays([], now);
    set({
      weekTitle: formatWeekTitle(now),
      weekDays: days,
      selectedDate:
        days.find((d) => d.date === toIsoDateString(now))?.date ??
        days[0].date,
      planItems: [],
      recommendedRoutines: [],
      isLoading: false,
      hasLoaded: false,
      error: null,
    });
  },
}));
