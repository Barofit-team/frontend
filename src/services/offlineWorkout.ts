import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@/services/api';
import { poseExerciseId } from '@/services/poseExerciseIds';
import { syncWorkoutSession, uploadPoseSetResult, generateWorkoutReport, type TodayWorkoutPlan, type WorkoutSessionSync } from '@/services/workoutSessionService';
import type { WorkoutDraft } from '@/stores/useWorkoutDraftStore';

type SyncItem = { kind?: 'session'; sessionId: string; session: WorkoutSessionSync };
type PoseItem = { kind: 'pose'; sessionId: string; resultId: string; routineSetId: string; performedAt: string; payload: Record<string, unknown> };
type ReportItem = { kind: 'report'; sessionId: string };
type QueueItem = SyncItem | PoseItem | ReportItem;
type Stored = { version: 1; queue: QueueItem[]; current: (SyncItem & { draft: WorkoutDraft }) | null; plan: TodayWorkoutPlan | null; completed?: Record<string, PoseItem> };
const key = (owner: string) => `barofit.workout.v1.${owner}`;
const empty = (): Stored => ({ version: 1, queue: [], current: null, plan: null });
const locks = new Map<string, Promise<unknown>>();
const flushes = new Map<string, Promise<void>>();
async function read(owner: string): Promise<Stored> {
  const raw = await AsyncStorage.getItem(key(owner));
  if (!raw) return empty();
  const value = JSON.parse(raw) as Stored;
  if (value.version !== 1 || !Array.isArray(value.queue)) throw new Error('저장된 운동 데이터를 읽을 수 없어요.');
  return value;
}
function locked<T>(owner: string, fn: () => Promise<T>): Promise<T> {
  const result = (locks.get(owner) ?? Promise.resolve()).catch(() => {}).then(fn);
  locks.set(owner, result);
  void result.finally(() => { if (locks.get(owner) === result) locks.delete(owner); }).catch(() => {});
  return result;
}
async function change(owner: string, fn: (data: Stored) => void): Promise<void> {
  return locked(owner, async () => { const data = await read(owner); fn(data); await AsyncStorage.setItem(key(owner), JSON.stringify(data)); });
}
export function getLocalWorkout(owner: string) { return locked(owner, async () => (await read(owner)).current); }
export function getCachedPlan(owner: string) { return locked(owner, async () => (await read(owner)).plan); }
export function cachePlan(owner: string, plan: TodayWorkoutPlan) { return change(owner, data => { data.plan = plan; }); }
export function clearLocalWorkout(owner: string, sessionId: string) {
  return change(owner, data => { if (data.current?.sessionId === sessionId) data.current = null; });
}
/** Persist the exact request before attempting it. Never mutate an already queued revision. */
export function queueSession(owner: string, sessionId: string, session: WorkoutSessionSync, draft?: WorkoutDraft) {
  return change(owner, data => {
    const current = data.current;
    if (current && current.sessionId !== sessionId) throw new Error('이어할 운동이 이미 있어요.');
    const position = draft ?? current?.draft;
    if (!position) throw new Error('운동 진행 위치가 없어요.');
    if (current && session.revision <= current.session.revision) throw new Error('운동 버전이 올바르지 않아요.');
    data.current = { sessionId, session, draft: position };
    data.queue.push({ sessionId, session });
    if ((session.status === 'COMPLETED' || session.status === 'ABANDONED') &&
        session.sets.some(set => (set.actualReps ?? 0) > 0 || (set.actualDurationSeconds ?? 0) > 0) &&
        !data.queue.some(item => item.kind === 'report' && item.sessionId === sessionId))
      data.queue.push({ kind: 'report', sessionId });
  });
}
export function savePosition(owner: string, sessionId: string, draft: WorkoutDraft) {
  return change(owner, data => { if (data.current?.sessionId === sessionId) data.current.draft = draft; });
}
/** Save the exact AI result and idempotency key before any network request. */
export function queuePoseSetResult(owner: string, item: Omit<PoseItem, 'kind'>) {
  return change(owner, data => {
    if (data.current?.sessionId !== item.sessionId) throw new Error('진행 중인 운동 세션이 아닙니다.');
    if (item.payload.type !== 'set.completed' || item.payload.schemaVersion !== '2.0') throw new Error('올바른 세트 결과가 아닙니다.');
    const existing = data.queue.find(value => value.kind === 'pose' && value.resultId === item.resultId);
    const request: PoseItem = { kind: 'pose', ...item };
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(request)) throw new Error('세트 결과 ID가 다른 내용으로 재사용됐어요.');
      return;
    }
    data.queue.push(request);
  });
}
/** Atomically persist the measured Workout set and its unmodified report payload. */
export function commitPoseSet(owner: string, item: Omit<PoseItem, 'kind'>) {
  return change(owner, data => {
    const current = data.current;
    if (!current || current.sessionId !== item.sessionId) throw new Error('진행 중인 세션이 아닙니다.');
    if (current.session.status === 'COMPLETED' || current.session.status === 'ABANDONED') throw new Error('종료된 세션입니다.');
    const payload = item.payload;
    const summary = payload.summary as Record<string, unknown> | undefined;
    const exercise = current.session.routineSnapshot.exercises.find(e => e.sets.some(set => set.id === item.routineSetId));
    if (payload.schemaVersion !== '2.0' || payload.type !== 'set.completed' || !summary ||
        typeof payload.exercise !== 'string' || !exercise || poseExerciseId(exercise.exerciseId) !== payload.exercise)
      throw new Error('계획된 운동과 모델 결과가 일치하지 않습니다.');
    const count = summary.count;
    const hold = summary.holdSeconds;
    if (count !== null && (!Number.isInteger(count) || (count as number) < 0 || (count as number) > 10000)) throw new Error('횟수가 올바르지 않습니다.');
    if (hold !== null && (typeof hold !== 'number' || !Number.isFinite(hold) || hold < 0)) throw new Error('유지 시간이 올바르지 않습니다.');
    if (count == null && hold == null) throw new Error('실제 운동 측정값이 없습니다.');
    const request: PoseItem = { kind: 'pose', ...item };
    const key = `${item.sessionId}:${item.routineSetId}`;
    const old = data.completed?.[key];
    if (old) {
      if (JSON.stringify(old) !== JSON.stringify(request)) throw new Error('동일 세트에 다른 결과가 있습니다.');
      return;
    }
    if (current.session.sets.some(set => set.routineSetId === item.routineSetId)) throw new Error('이미 수행한 세트입니다.');
    const set = { routineSetId: item.routineSetId, actualReps: count as number | null,
      actualDurationSeconds: hold === null ? null : Math.floor(hold as number), feedbackCodes: [], errorCounts: {},
      feedbackText: null, modelVersion: typeof payload.engineVersion === 'string' ? payload.engineVersion : null,
      referenceModelId: null, trackingAvailablePct: null, completedAt: item.performedAt };
    const next = { ...current.session, revision: current.session.revision + 1, sets: [...current.session.sets, set] };
    data.current = { ...current, session: next };
    data.queue.push({ sessionId: item.sessionId, session: next }, request);
    data.completed ??= {};
    data.completed[key] = request;
  });
}
/** Report generation runs only after the terminal session and every queued set upload. */
export function queueReportGeneration(owner: string, sessionId: string) {
  return change(owner, data => {
    if (!data.current || data.current.sessionId !== sessionId ||
        !['COMPLETED', 'ABANDONED'].includes(data.current.session.status)) throw new Error('종료된 운동만 리포트를 생성할 수 있어요.');
    if (!data.current.session.sets.some(set => (set.actualReps ?? 0) > 0 || (set.actualDurationSeconds ?? 0) > 0))
      throw new Error('리포트를 생성할 수행 세트가 없어요.');
    if (!data.queue.some(item => item.kind === 'report' && item.sessionId === sessionId))
      data.queue.push({ kind: 'report', sessionId });
  });
}
export async function pendingCount(owner: string) { return locked(owner, async () => (await read(owner)).queue.length); }
/** One worker per user. Remove only the exact request acknowledged by the server. */
export function flushWorkoutQueue(owner: string, isOwner: () => boolean): Promise<void> {
  const existing = flushes.get(owner);
  if (existing) return existing;
  const worker = (async () => {
    while (isOwner()) {
      const item = await locked(owner, async () => (await read(owner)).queue[0]);
      if (!item || !isOwner()) return;
      if (item.kind === 'report') {
        await generateWorkoutReport(item.sessionId, isOwner);
      } else if (item.kind === 'pose') {
        await uploadPoseSetResult(item.sessionId, item.resultId, item.routineSetId, item.performedAt, item.payload, isOwner);
      } else {
        await syncWorkoutSession(item.sessionId, item.session, isOwner);
      }
      await change(owner, data => {
        const first = data.queue[0];
        if (first && JSON.stringify(first) === JSON.stringify(item)) data.queue.shift();
      });
    }
  })();
  flushes.set(owner, worker);
  void worker.finally(() => { if (flushes.get(owner) === worker) flushes.delete(owner); }).catch(() => {});
  return worker;
}
export function isOffline(error: unknown) { return error instanceof ApiError && error.status === 0; }
