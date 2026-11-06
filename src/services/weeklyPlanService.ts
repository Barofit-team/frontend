import {
  assignWorkoutPlan,
  getRecommendedRoutineTemplates,
  getRoutineTemplates,
  getWorkoutPlanWeek,
  removeWorkoutPlan,
} from '@/services/routineService';
import { tokenStorage } from '@/services/tokenStorage';
import type {
  BackendRoutineDetail,
  RecommendedRoutineItem,
  RoutineCategoryCode,
  WeeklyCalendarDay,
  WeeklyPlanDayItem,
  WorkoutPlanWeek,
} from '@/types/weeklyPlan';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

const CATEGORY_LABEL_MAP: Record<RoutineCategoryCode, string> = {
  FULL_BODY: '전신',
  LOWER_BODY: '하체',
  UPPER_BODY: '상체',
  BACK: '등',
  CORE: '코어',
  CARDIO: '심폐',
};

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

export function toIsoDateString(date: Date): string {
  const year = date.getFullYear();
  const month = padTwo(date.getMonth() + 1);
  const day = padTwo(date.getDate());
  return `${year}-${month}-${day}`;
}

/**
 * 주어진 날짜가 포함된 주의 월요일 Date 객체를 계산합니다. (Asia/Seoul 기준 날짜 기반)
 */
export function getMondayOfWeek(baseDate: Date): Date {
  const date = new Date(baseDate);
  const day = date.getDay(); // 0(일) ~ 6(토)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * 'YYYY년 M월 N주차' 형식의 주차 타이틀 문자열을 생성합니다.
 */
export function formatWeekTitle(baseDate: Date): string {
  const monday = getMondayOfWeek(baseDate);
  const year = monday.getFullYear();
  const month = monday.getMonth() + 1;
  const weekNumber = Math.ceil(monday.getDate() / 7);
  return `${year}년 ${month}월 ${weekNumber}주차`;
}

/**
 * 월요일부터 일요일까지 7일간의 주간 캘린더 요일 배열을 구성합니다.
 */
export function buildWeekCalendarDays(
  planItems: WeeklyPlanDayItem[],
  baseDate: Date = new Date(),
): WeeklyCalendarDay[] {
  const monday = getMondayOfWeek(baseDate);
  const plannedDateSet = new Set(planItems.map((item) => item.date));

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + index);

    const isoDate = toIsoDateString(current);
    const month = padTwo(current.getMonth() + 1);
    const dateNumber = current.getDate();
    const dayLabel = DAY_LABELS[index];

    return {
      date: isoDate,
      dateNumber,
      dayLabel,
      dateLabel: `${month}.${padTwo(dateNumber)}(${dayLabel})`,
      hasWorkout: plannedDateSet.has(isoDate),
    };
  });
}

/**
 * 템플릿 세트 목표로 예상 소요 시간을 계산합니다. 칼로리 근거가 없으면 null입니다.
 */
export function estimateRoutineMetrics(routine: BackendRoutineDetail): {
  durationMinutes: number;
  calories: number | null;
} {
  let totalSeconds = 0;

  for (const exercise of routine?.exercises ?? []) {
    for (const set of exercise?.sets ?? []) {
      const activeSeconds =
        set?.targetDurationSeconds ?? (set?.targetReps ?? 10) * 3;
      totalSeconds += activeSeconds + (set?.restSeconds ?? 60);
    }
  }

  const durationMinutes = Math.max(5, Math.round(totalSeconds / 60));
  const calories = null;

  return { durationMinutes, calories };
}

/**
 * 백엔드 루틴 상세 데이터를 주간 계획 아이템 형태로 변환합니다.
 */
export function mapRoutineToWeeklyPlanDayItem(
  routine: BackendRoutineDetail,
  targetDate: Date,
): WeeklyPlanDayItem {
  const month = padTwo(targetDate.getMonth() + 1);
  const dateNumber = targetDate.getDate();
  const dayIndex = (targetDate.getDay() + 6) % 7;
  const dayLabel = DAY_LABELS[dayIndex];
  const { durationMinutes, calories } = estimateRoutineMetrics(routine);

  return {
    id: `plan-${toIsoDateString(targetDate)}-${routine.id}`,
    date: toIsoDateString(targetDate),
    dateNumber,
    dayLabel,
    dateLabel: `${month}.${padTwo(dateNumber)}(${dayLabel})`,
    routineId: routine.id,
    title: routine.name,
    exerciseCount: routine.exercises.length,
    durationMinutes,
    calories,
    exercises: routine.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
    })),
  };
}

/**
 * 백엔드 템플릿 상세 데이터를 홈 화면 추천 루틴 아이템으로 변환합니다.
 */
export function mapTemplateToRecommendedRoutine(
  template: BackendRoutineDetail,
): RecommendedRoutineItem {
  const { durationMinutes, calories } = estimateRoutineMetrics(template);
  const categoryLabel = template.category
    ? CATEGORY_LABEL_MAP[template.category] ?? '전신'
    : '전신';

  return {
    id: template.id,
    templateId: template.id,
    category: categoryLabel,
    title: template.name,
    exerciseCount: template.exercises?.length ?? 0,
    durationMinutes,
    calories,
    exercises:
      template.exercises?.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        name: exercise.name,
      })) ?? [],
  };
}

/**
 * 사용자의 이번 주 날짜별 운동 계획을 서버에서 조회합니다.
 */
export async function fetchWeeklyPlanItems(
  baseDate: Date = new Date(),
): Promise<WeeklyPlanDayItem[]> {
  const accessToken = await tokenStorage.getAccessToken();
  if (!accessToken) {
    return [];
  }

  const monday = getMondayOfWeek(baseDate);
  const weekStartIso = toIsoDateString(monday);

  const weekPlan: WorkoutPlanWeek = await getWorkoutPlanWeek(weekStartIso);
  if (weekPlan && Array.isArray(weekPlan.days)) {
    const assignedDays = weekPlan.days.filter((day) => day.routine !== null);
    return assignedDays.map((day) => {
      const routine = day.routine!;
      const item = mapRoutineToWeeklyPlanDayItem(
        routine,
        new Date(`${day.date}T12:00:00`),
      );
      if (day.estimatedMinutes != null) {
        item.durationMinutes = day.estimatedMinutes;
      }
      if (day.estimatedKcal != null) {
        item.calories = day.estimatedKcal;
      }
      return item;
    });
  }

  return [];
}

/**
 * 맞춤형 추천 루틴 템플릿 목록을 서버에서 조회합니다.
 * - 로그인된 경우 프로필 기반 개인화 추천(/recommendations)을 우선 시도하고,
 * - 온보딩 미완료(409)나 미인증 시 전체 기본 템플릿 목록으로 fallback합니다.
 */
export async function fetchRecommendedRoutineItems(): Promise<
  RecommendedRoutineItem[]
> {
  const accessToken = await tokenStorage.getAccessToken();
  let recommendedList: BackendRoutineDetail[] = [];

  if (accessToken) {
    try {
      const recommended = await getRecommendedRoutineTemplates();
      if (Array.isArray(recommended)) {
        recommendedList = recommended;
      }
    } catch {
      // 추천 API 409(온보딩 미완료) 등 발생 시 기본 템플릿 조회로 진행
    }
  }

  // 전체 유효 템플릿 목록 조회 (레거시 Mock 제외된 정규 템플릿 목록)
  const allTemplates = await getRoutineTemplates().catch(() => []);

  // 추천 루틴을 우선 배치하고, 나머지 템플릿을 중복 없이 병합
  const seenIds = new Set<string>();
  const combined: BackendRoutineDetail[] = [];

  for (const item of recommendedList) {
    if (item && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      combined.push(item);
    }
  }

  for (const item of allTemplates) {
    if (item && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      combined.push(item);
    }
  }

  return combined.map(mapTemplateToRecommendedRoutine);
}

/**
 * 변경된 날짜만 동기화합니다.
 */
export async function saveWeeklyPlanChanges(
  previous: WeeklyPlanDayItem[],
  next: WeeklyPlanDayItem[],
): Promise<void> {
  const oldByDate = new Map(previous.map((item) => [item.date, item.routineId]));
  const newByDate = new Map(next.map((item) => [item.date, item.routineId]));
  const dates = new Set([...oldByDate.keys(), ...newByDate.keys()]);
  for (const date of dates) {
    const before = oldByDate.get(date);
    const after = newByDate.get(date);
    if (before === after) continue;
    if (after) {
      await assignWorkoutPlan(date, after);
    } else {
      await removeWorkoutPlan(date);
    }
  }
}
