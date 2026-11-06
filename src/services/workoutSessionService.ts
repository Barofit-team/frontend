import { randomUUID } from 'expo-crypto';

import { apiFetch } from '@/services/api';
import type { BackendRoutineDetail } from '@/types/weeklyPlan';

/** 서버에 저장된 루틴 상세 응답 원본을 운동 시작 시 그대로 보관합니다. */
export type WorkoutStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';

export interface WorkoutSetResult {
  routineSetId: string;
  actualReps: number | null;
  actualDurationSeconds: number | null;
  feedbackCodes: string[];
  errorCounts: Record<string, number>;
  feedbackText: string | null;
  modelVersion: string | null;
  referenceModelId: string | null;
  trackingAvailablePct: number | null;
  completedAt: string;
}

export interface WorkoutSessionSync {
  routineId: string;
  routineSnapshot: BackendRoutineDetail;
  status: WorkoutStatus;
  revision: number;
  startedAt: string;
  endedAt: string | null;
  activeDurationSeconds: number;
  restDurationSeconds?: number | null;
  sets: WorkoutSetResult[];
}

export interface WorkoutSession extends WorkoutSessionSync {
  id: string;
}

/** 같은 revision을 다시 전송할 때는 요청 전체가 같아야 합니다. */
export function syncWorkoutSession(sessionId: string, session: WorkoutSessionSync, ownerGuard?: () => boolean): Promise<WorkoutSession> {
  return apiFetch<WorkoutSession>(`/api/v1/workout-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PUT', auth: true, ownerGuard, body: JSON.stringify(session),
  });
}

export function getWorkoutSession(sessionId: string): Promise<WorkoutSession> {
  return apiFetch<WorkoutSession>(`/api/v1/workout-sessions/${encodeURIComponent(sessionId)}`, { auth: true });
}

/** AI의 원본 set.completed JSON을 변경하지 않고 전송합니다. */
export function uploadPoseSetResult(
  sessionId: string,
  resultId: string,
  routineSetId: string,
  performedAt: string,
  payload: Record<string, unknown>,
  ownerGuard?: () => boolean,
): Promise<{ setId: string; sessionId: string; status: string }> {
  return apiFetch(`/api/v1/reports/sessions/${encodeURIComponent(sessionId)}/sets/${encodeURIComponent(resultId)}`, {
    method: 'POST', auth: true, ownerGuard,
    headers: { 'X-Routine-Set-Id': routineSetId, 'X-Workout-Performed-At': performedAt },
    body: JSON.stringify(payload),
  });
}

export interface TodayWorkoutPlan {
  date: string;
  planId: string | null;
  routine: BackendRoutineDetail | null;
}

/** 일정에 배정된 원본 상세를 사용해야 Workout 서비스의 스냅샷 검증이 통과합니다. */
export function getTodayWorkoutPlan(): Promise<TodayWorkoutPlan> {
  return apiFetch<TodayWorkoutPlan>('/api/v1/workout-plans/today', { auth: true });
}

/** 재전송 전에 기기에서 이 ID와 전체 요청을 보관해야 합니다. */
export function createWorkoutSessionDraft(routine: BackendRoutineDetail, startedAt = new Date().toISOString()): {
  sessionId: string; session: WorkoutSessionSync;
} {
  return {
    sessionId: randomUUID(),
    session: {
      routineId: routine.id, routineSnapshot: routine, status: 'ACTIVE', revision: 0,
      startedAt, endedAt: null, activeDurationSeconds: 0, restDurationSeconds: 0, sets: [],
    },
  };
}

/** Idempotent report generation; called after terminal state and all set uploads. */
export function generateWorkoutReport(sessionId: string, ownerGuard?: () => boolean): Promise<unknown> {
  return apiFetch(`/api/v1/reports/sessions/${encodeURIComponent(sessionId)}/generated`, { method: 'POST', auth: true, ownerGuard });
}
