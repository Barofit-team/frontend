export type RoutineCategoryCode = 'FULL_BODY' | 'LOWER_BODY' | 'CORE';
export type RoutineDifficultyCode = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type MeasurementTypeCode = 'REPS' | 'DURATION';

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
  calories: number;
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
  category: string;
  title: string;
  exerciseCount: number;
  durationMinutes: number;
  calories: number;
}

/**
 * 백엔드 Routine Service (/api/v1/routines, /api/v1/routine-templates) 응답 규격
 */
export interface BackendRoutineSetDetail {
  id: string;
  order: number;
  targetReps: number | null;
  targetDurationSeconds: number | null;
  weightKg: number;
  restSeconds: number;
}

export interface BackendRoutineExerciseDetail {
  id: string;
  exerciseId: string;
  name: string;
  measurementType: MeasurementTypeCode;
  order: number;
  preparation: string;
  instructions: string;
  precautions: string;
  introTtsText: string;
  sets: BackendRoutineSetDetail[];
}

export interface BackendRoutineDetail {
  id: string;
  name: string;
  description: string | null;
  difficulty: RoutineDifficultyCode;
  type: 'USER' | 'TEMPLATE';
  templateId: string | null;
  category: RoutineCategoryCode | null;
  exercises: BackendRoutineExerciseDetail[];
  createdAt: string;
  updatedAt: string;
}

export interface BackendRoutineSummary {
  id: string;
  name: string;
  difficulty: RoutineDifficultyCode;
  templateId: string | null;
  category: RoutineCategoryCode | null;
  exerciseCount: number;
  totalSetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackendRoutinePage {
  content: BackendRoutineSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
