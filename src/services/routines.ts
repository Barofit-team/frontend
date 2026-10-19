import { apiFetch } from '@/services/api';
import type { Category, CreateRoutine, Difficulty, RoutineDetail, RoutinePage, UpdateRoutine } from '@/types/routine';
export const routinesApi = {
  templates: (category: Category, difficulty: Difficulty) => apiFetch<RoutineDetail[]>(`/api/v1/routine-templates?category=${category}&difficulty=${difficulty}`),
  list: (page = 0) => apiFetch<RoutinePage>(`/api/v1/routines?page=${page}&size=20`, { auth: true }),
  detail: (id: string) => apiFetch<RoutineDetail>(`/api/v1/routines/${encodeURIComponent(id)}`, { auth: true }),
  create: (body: CreateRoutine) => apiFetch<RoutineDetail>('/api/v1/routines', { auth: true, method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: UpdateRoutine) => apiFetch<RoutineDetail>(`/api/v1/routines/${encodeURIComponent(id)}`, { auth: true, method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => apiFetch<void>(`/api/v1/routines/${encodeURIComponent(id)}`, { auth: true, method: 'DELETE' }),
};
