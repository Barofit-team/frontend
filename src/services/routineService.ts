import { apiFetch } from '@/services/api';
import type {
  AssignWorkoutPlanRequest,
  CreateUserRoutineRequest,
  ExerciseResponse,
  RoutineCategoryCode,
  RoutineDetail,
  RoutineDifficultyCode,
  RoutinePage,
  UpdateUserRoutineRequest,
  WeeklyGoalProgress,
  WorkoutPlanDay,
  WorkoutPlanWeek,
} from '@/types/routine';

/**
 * Routine Service & Workout Plan API 클라이언트
 *
 * 백엔드 마이크로서비스: routine-service (Gateway를 통해 /api/v1/... 로 중계)
 */

// --------------------------------------------------------------------------
// 1. 주간 계획 & 오늘 운동 (Workout Plan)
// --------------------------------------------------------------------------

/**
 * 특정 주의 월~일 7일간의 운동 계획 조회 (Asia/Seoul 기준)
 * @param weekStart 월요일 ISO 날짜 (YYYY-MM-DD)
 */
export async function getWorkoutPlanWeek(
  weekStart: string,
): Promise<WorkoutPlanWeek> {
  return apiFetch<WorkoutPlanWeek>(
    `/api/v1/workout-plans?weekStart=${encodeURIComponent(weekStart)}`,
    { auth: true },
  );
}

/**
 * 특정 날짜에 루틴(템플릿 또는 사용자 루틴)을 배정
 * @param date ISO 날짜 (YYYY-MM-DD)
 * @param routineId 배정할 루틴/템플릿 UUID
 */
export async function assignWorkoutPlan(
  date: string,
  routineId: string,
): Promise<WorkoutPlanDay> {
  const body: AssignWorkoutPlanRequest = { routineId };
  return apiFetch<WorkoutPlanDay>(`/api/v1/workout-plans/${date}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(body),
  });
}

/**
 * 특정 날짜의 운동 배정 해제 (삭제)
 * @param date ISO 날짜 (YYYY-MM-DD)
 */
export async function removeWorkoutPlan(date: string): Promise<void> {
  return apiFetch<void>(`/api/v1/workout-plans/${date}`, {
    method: 'DELETE',
    auth: true,
  });
}

/**
 * 오늘 배정된 운동 조회 (Asia/Seoul 기준)
 */
export async function getTodayWorkoutPlan(): Promise<WorkoutPlanDay> {
  return apiFetch<WorkoutPlanDay>('/api/v1/workout-plans/today', {
    auth: true,
  });
}

/**
 * 주간 운동 목표 진행률 조회
 * @param weekStart 월요일 ISO 날짜 (YYYY-MM-DD)
 */
export async function getWeeklyGoalProgress(
  weekStart: string,
): Promise<WeeklyGoalProgress> {
  return apiFetch<WeeklyGoalProgress>(
    `/api/v1/workout-plans/weekly-progress?weekStart=${encodeURIComponent(weekStart)}`,
    { auth: true },
  );
}

// --------------------------------------------------------------------------
// 2. 루틴 템플릿 (Routine Templates - 공개 및 추천)
// --------------------------------------------------------------------------

export interface RoutineTemplateFilter {
  difficulty?: RoutineDifficultyCode;
  category?: RoutineCategoryCode;
}

/**
 * 기본 루틴 템플릿 목록 조회 (공개 API, 인증 불필요)
 */
export async function getRoutineTemplates(
  filter?: RoutineTemplateFilter,
): Promise<RoutineDetail[]> {
  const params = new URLSearchParams();
  if (filter?.difficulty) params.append('difficulty', filter.difficulty);
  if (filter?.category) params.append('category', filter.category);

  const query = params.toString();
  const path = query
    ? `/api/v1/routine-templates?${query}`
    : '/api/v1/routine-templates';

  return apiFetch<RoutineDetail[]>(path);
}

/**
 * 기본 루틴 템플릿 단건 상세 조회 (공개 API)
 */
export async function getRoutineTemplateDetail(
  templateId: string,
): Promise<RoutineDetail> {
  return apiFetch<RoutineDetail>(`/api/v1/routine-templates/${templateId}`);
}

/**
 * 온보딩 프로필 기반 맞춤형 추천 루틴 템플릿 목록 조회 (로그인 필요)
 */
export async function getRecommendedRoutineTemplates(): Promise<
  RoutineDetail[]
> {
  return apiFetch<RoutineDetail[]>('/api/v1/routine-templates/recommendations', {
    auth: true,
  });
}

// --------------------------------------------------------------------------
// 3. 사용자 루틴 (User Routines - 인증 필요)
// --------------------------------------------------------------------------

/**
 * 내 루틴 목록 조회
 */
export async function getUserRoutines(
  page: number = 0,
  size: number = 20,
): Promise<RoutinePage> {
  return apiFetch<RoutinePage>(`/api/v1/routines?page=${page}&size=${size}`, {
    auth: true,
  });
}

/**
 * 템플릿으로부터 내 루틴 생성
 */
export async function createUserRoutine(
  request: CreateUserRoutineRequest,
): Promise<RoutineDetail> {
  return apiFetch<RoutineDetail>('/api/v1/routines', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(request),
  });
}

/**
 * 내 루틴 단건 상세 조회
 */
export async function getUserRoutineDetail(
  routineId: string,
): Promise<RoutineDetail> {
  return apiFetch<RoutineDetail>(`/api/v1/routines/${routineId}`, {
    auth: true,
  });
}

/**
 * 내 루틴 세트/반복 수정
 */
export async function updateUserRoutine(
  routineId: string,
  request: UpdateUserRoutineRequest,
): Promise<RoutineDetail> {
  return apiFetch<RoutineDetail>(`/api/v1/routines/${routineId}`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify(request),
  });
}

/**
 * 내 루틴 삭제
 */
export async function deleteUserRoutine(routineId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/routines/${routineId}`, {
    method: 'DELETE',
    auth: true,
  });
}

// --------------------------------------------------------------------------
// 4. 운동 종목 (Exercises - 기본 운동 가이드 및 TTS 텍스트)
// --------------------------------------------------------------------------

/**
 * 전체 운동 종목 목록 조회 (공개)
 */
export async function getExercises(): Promise<ExerciseResponse[]> {
  return apiFetch<ExerciseResponse[]>('/api/v1/exercises');
}

/**
 * 운동 종목 상세 조회 (가이드, TTS 문구 포함)
 */
export async function getExerciseDetail(
  exerciseId: string,
): Promise<ExerciseResponse> {
  return apiFetch<ExerciseResponse>(`/api/v1/exercises/${exerciseId}`);
}
