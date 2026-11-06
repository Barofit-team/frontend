/**
 * 백엔드 Routine Service (/api/v1/routines, /api/v1/routine-templates, /api/v1/workout-plans, /api/v1/exercises)
 * 전체 데이터 규격 정의
 */

export type RoutineDifficultyCode = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type RoutineCategoryCode =
  | 'FULL_BODY'
  | 'LOWER_BODY'
  | 'UPPER_BODY'
  | 'BACK'
  | 'CORE'
  | 'CARDIO';

export type MeasurementTypeCode = 'REPS' | 'DURATION';

export type AssessmentStatus = 'READY' | 'IN_PROGRESS' | 'PLANNED';

export interface ExerciseResponse {
  id: string;
  name: string;
  measurementType: MeasurementTypeCode;
  category: RoutineCategoryCode;
  equipment: string;
  guideReady: boolean;
  preparation: string;
  instructions: string;
  precautions: string;
  introTtsText: string;
  active: boolean;
}

export interface RoutineSetDetail {
  id: string;
  order: number;
  targetReps: number | null;
  targetDurationSeconds: number | null;
  weightKg: number;
  restSeconds: number;
}

export interface RoutineExerciseDetail {
  id: string;
  exerciseId: string;
  name: string;
  measurementType: MeasurementTypeCode;
  assessmentStatus?: AssessmentStatus;
  order: number;
  preparation: string;
  instructions: string;
  precautions: string;
  introTtsText: string;
  sets: RoutineSetDetail[];
}

export interface RoutineDetail {
  id: string;
  name: string;
  description: string | null;
  difficulty: RoutineDifficultyCode;
  type: 'USER' | 'TEMPLATE';
  templateId: string | null;
  category: RoutineCategoryCode | null;
  exercises: RoutineExerciseDetail[];
  createdAt: string;
  updatedAt: string;
}

export interface RoutineSummary {
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

export interface RoutinePage {
  content: RoutineSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface WorkoutPlanStep {
  type: 'EXERCISE' | 'REST';
  exercise: RoutineExerciseDetail | null;
  restSeconds: number | null;
}

export interface WorkoutPlanDay {
  date: string; // YYYY-MM-DD (Asia/Seoul)
  planId: string | null;
  routine: RoutineDetail | null;
  steps: WorkoutPlanStep[];
  estimatedMinutes: number | null;
  estimatedKcal: number | null;
}

export interface WorkoutPlanWeek {
  weekStart: string; // YYYY-MM-DD (월요일)
  days: WorkoutPlanDay[];
}

export interface WeeklyGoalProgress {
  weekStart: string;
  weeklyGoal: number;
  completedCount: number;
  goalProgress: number;
  completedDates: string[];
}

export interface AssignWorkoutPlanRequest {
  routineId: string;
}

export interface CreateRoutineExerciseInput {
  templateExerciseId: string;
  sets?: number;
  targetReps?: number;
  targetDurationSeconds?: number;
  restSeconds?: number;
}

export interface CreateUserRoutineRequest {
  templateId: string;
  exercises?: CreateRoutineExerciseInput[];
}

export interface UpdateRoutineExerciseInput {
  routineExerciseId: string;
  sets?: number;
  targetReps?: number;
  targetDurationSeconds?: number;
  restSeconds?: number;
}

export interface UpdateUserRoutineRequest {
  exercises: UpdateRoutineExerciseInput[];
}
