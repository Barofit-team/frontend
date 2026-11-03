import {
  assignWorkoutPlan,
  getRecommendedRoutineTemplates,
  getRoutineTemplates,
  getUserRoutines,
  getUserRoutineDetail,
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
 * 기준 날짜가 속한 주의 월요일 Date를 반환합니다.
 */
export function getMondayOfWeek(baseDate: Date = new Date()): Date {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0(일) ~ 6(토)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

/**
 * 기준 날짜의 'M월 N주차' 타이틀을 계산합니다.
 * 대한민국 국가표준(KS X ISO 8601)에 따라 한 주(월~일)의 기준 월과 주차는
 * 해당 주의 '목요일'이 속한 달의 몇 번째 목요일인지로 산정합니다.
 */
export function formatWeekTitle(baseDate: Date = new Date()): string {
  const monday = getMondayOfWeek(baseDate);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);

  const month = thursday.getMonth() + 1;
  const weekOfMonth = Math.floor((thursday.getDate() - 1) / 7) + 1;
  return `${month}월 ${weekOfMonth}주차`;
}

/**
 * 이번 주 월~일 7일간의 캘린더 메타 정보를 생성합니다.
 */
export function buildWeekCalendarDays(
  planItems: WeeklyPlanDayItem[],
  baseDate: Date = new Date(),
): WeeklyCalendarDay[] {
  const monday = getMondayOfWeek(baseDate);
  const plannedDateSet = new Set(planItems.map((item) => item.date));

  return DAY_LABELS.map((dayLabel, index) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + index);

    const month = padTwo(current.getMonth() + 1);
    const dateNumber = current.getDate();
    const isoDate = toIsoDateString(current);

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
 * 백엔드 루틴 상세의 세트 구성으로부터 예상 소요 시간(분)과 칼로리(kcal)를 계산합니다.
 */
export function estimateRoutineMetrics(routine: BackendRoutineDetail): {
  durationMinutes: number;
  calories: number;
} {
  let totalSeconds = 0;

  for (const exercise of routine.exercises) {
    for (const set of exercise.sets) {
      const activeSeconds =
        set.targetDurationSeconds ?? (set.targetReps ?? 10) * 3;
      totalSeconds += activeSeconds + (set.restSeconds ?? 60);
    }
  }

  const durationMinutes = Math.max(5, Math.round(totalSeconds / 60));
  const calories = Math.max(30, Math.round(durationMinutes * 6.5));

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
    exerciseCount: template.exercises.length,
    durationMinutes,
    calories,
  };
}

/**
 * 사용자의 이번 주 운동 계획 목록을 서버에서 조회합니다.
 * 1. 백엔드 Workout Plan API (`GET /api/v1/workout-plans?weekStart=...`) 우선 조회
 * 2. 계획이 배정되지 않은 경우 내 루틴 목록(/api/v1/routines) 조회 후 매핑
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

  // 1차: 실제 workout-plans 주간 계획 조회
  try {
    const weekPlan: WorkoutPlanWeek = await getWorkoutPlanWeek(weekStartIso);
    if (weekPlan && Array.isArray(weekPlan.days)) {
      const assignedDays = weekPlan.days.filter((day) => day.routine !== null);
      if (assignedDays.length > 0) {
        return assignedDays.map((day) => {
          const routine = day.routine!;
          const targetDate = new Date(`${day.date}T00:00:00`);
          const item = mapRoutineToWeeklyPlanDayItem(routine, targetDate);
          if (day.estimatedMinutes != null) {
            item.durationMinutes = day.estimatedMinutes;
          }
          if (day.estimatedKcal != null) {
            item.calories = day.estimatedKcal;
          }
          return item;
        });
      }
    }
  } catch {
    // workout-plans 조회 실패 시 내 루틴 fallback 시도
  }

  // 2차: 등록된 사용자 루틴 목록 조회
  try {
    const page = await getUserRoutines(0, 20);
    if (!page.content || page.content.length === 0) {
      return [];
    }

    const details = await Promise.all(
      page.content.slice(0, 7).map((summary) => getUserRoutineDetail(summary.id)),
    );

    const defaultOffsets = [0, 2, 4, 1, 3, 5, 6]; // 월, 수, 금 우선 배치
    return details
      .map((detail, idx) => {
        const targetDate = new Date(monday);
        targetDate.setDate(
          monday.getDate() + defaultOffsets[idx % defaultOffsets.length],
        );
        return mapRoutineToWeeklyPlanDayItem(detail, targetDate);
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
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

  if (accessToken) {
    try {
      const recommended = await getRecommendedRoutineTemplates();
      if (Array.isArray(recommended) && recommended.length > 0) {
        return recommended.map(mapTemplateToRecommendedRoutine);
      }
    } catch {
      // 추천 API 409(온보딩 미완료) 등 발생 시 기본 템플릿 조회로 진행
    }
  }

  const templates = await getRoutineTemplates();
  if (!Array.isArray(templates) || templates.length === 0) {
    return [];
  }
  return templates.map(mapTemplateToRecommendedRoutine);
}

/**
 * 특정 요일들의 운동 배정 상태를 서버와 동기화합니다.
 * - UUID 형식이 아닌 클라이언트 로컬 프리셋('preset-basic' 등)은 백엔드로 전송하지 않습니다.
 * - 비정상 응답이나 네트워크 단절 시에도 에러를 안전하게 격리하여 Uncaught Promise 에러를 방지합니다.
 */
export async function syncWeeklyPlanAssignment(
  dateIso: string,
  routineId: string | null,
): Promise<void> {
  try {
    if (routineId) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          routineId,
        );
      if (!isUuid) {
        return;
      }
      await assignWorkoutPlan(dateIso, routineId);
    } else {
      await removeWorkoutPlan(dateIso);
    }
  } catch (error) {
    console.warn(
      `[weeklyPlanService] 운동 계획 동기화 실패 (${dateIso}):`,
      error,
    );
  }
}
