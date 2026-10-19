export type Category = 'FULL_BODY' | 'LOWER_BODY' | 'CORE';
export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export interface RoutineExercise {
  id: string; exerciseId: string; name: string; measurementType: 'REPS' | 'DURATION';
  order: number; preparation: string; instructions: string; precautions: string; introTtsText: string;
  sets: { id: string; order: number; targetReps: number | null; targetDurationSeconds: number | null; weightKg: number; restSeconds: number }[];
}
export interface RoutineSummary {
  id: string; name: string; difficulty: Difficulty; category: Category | null;
  templateId: string | null; exerciseCount: number; totalSetCount: number;
}
export interface RoutineDetail {
  id: string; name: string; description: string; difficulty: Difficulty; category: Category | null;
  templateId: string | null; type: 'TEMPLATE' | 'USER'; exercises: RoutineExercise[];
}
export interface RoutinePage { content: RoutineSummary[]; page: number; size: number; totalPages: number; totalElements: number }
export interface Goal { setCount: number; targetReps?: number; targetDurationSeconds?: number }
export interface CreateRoutine { templateId: string; exercises: (Goal & { templateExerciseId: string })[] }
export interface UpdateRoutine { exercises: (Goal & { routineExerciseId: string })[] }
