export type {
  RoutineDifficultyCode,
  RoutineCategoryCode,
  MeasurementTypeCode,
  AssessmentStatus,
  RoutineSetDetail,
  RoutineExerciseDetail,
  RoutineDetail,
  RoutineSummary,
  RoutinePage,
  RoutineTemplateRecommendationItem,
  RoutineTemplateRecommendationResponse,
  WorkoutPlanStep,
  WorkoutPlanDay,
  WorkoutPlanWeek,
  WeeklyGoalProgress,
  AssignWorkoutPlanRequest,
  CreateRoutineExerciseInput,
  CreateUserRoutineRequest,
  UpdateRoutineExerciseInput,
  UpdateUserRoutineRequest,
} from './routine';

import type {
  RoutineSetDetail,
  RoutineExerciseDetail,
  RoutineDetail,
  RoutineSummary,
  RoutinePage,
} from './routine';

export interface PlannedExerciseItem {
  id: string;
  exerciseId?: string;
  name: string;
  thumbnailUrl?: string;
}

export interface WeeklyPlanDayItem {
  id: string;
  /** ISO 날짜 (YYYY-MM-DD) */
  date: string;
  /** 일자 숫자 (예: 19) */
  dateNumber: number;
  /** 요일 라벨 (월 ~ 일) */
  dayLabel: string;
  /** 화면 표시용 날짜 라벨 (예: '10.19(월)') */
  dateLabel: string;
  routineId?: string;
  title: string;
  exerciseCount: number;
  durationMinutes: number;
  calories: number | null;
  exercises: PlannedExerciseItem[];
}

export interface WeeklyCalendarDay {
  /** ISO 날짜 (YYYY-MM-DD) */
  date: string;
  /** 일자 숫자 (예: 19) */
  dateNumber: number;
  /** 요일 라벨 (월 ~ 일) */
  dayLabel: string;
  /** 화면 표시용 날짜 라벨 (예: '10.19(월)') */
  dateLabel: string;
  /** 해당 날짜에 배정된 운동 계획 존재 여부 */
  hasWorkout: boolean;
}

export interface RecommendedRoutineItem {
  id: string;
  templateId?: string;
  exercises?: PlannedExerciseItem[];
  category: string;
  title: string;
  exerciseCount: number;
  durationMinutes: number;
  calories: number | null;
}

/**
 * 하위 호환성을 위한 기존 백엔드 Routine Service 응답 규격 별칭
 */
export type BackendRoutineSetDetail = RoutineSetDetail;
export type BackendRoutineExerciseDetail = RoutineExerciseDetail;
export type BackendRoutineDetail = RoutineDetail;
export type BackendRoutineSummary = RoutineSummary;
export type BackendRoutinePage = RoutinePage;
