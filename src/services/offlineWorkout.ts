import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@/services/api';
import { kstDateOf } from '@/services/kstDate';
import { poseSupportForSnapshot } from '@/services/poseExerciseIds';
import { syncWorkoutSession, uploadPoseSetResult, generateWorkoutReport, type TodayWorkoutPlan, type WorkoutSessionSync } from '@/services/workoutSessionService';
import type { WorkoutDraft } from '@/stores/useWorkoutDraftStore';

type SyncItem = { kind?: 'session'; sessionId: string; session: WorkoutSessionSync };
type PoseItem = { kind: 'pose'; sessionId: string; resultId: string; routineSetId: string; performedAt: string; payload: Record<string, unknown> };
type ReportItem = { kind: 'report'; sessionId: string };
type QueueItem = SyncItem | PoseItem | ReportItem;
/** 같은 요청을 다시 보내도 결과가 바뀌지 않는 서버 응답을 받은 세션. 기록은 큐에 그대로 두고 원인만 남긴다(기존 저장 데이터에는 없을 수 있다) */
type BlockedSync = { status: number; code: string; message: string; kind: 'session' | 'pose' | 'report'; at: string };
type Stored = { version: 1; queue: QueueItem[]; current: (SyncItem & { draft: WorkoutDraft }) | null; plan: TodayWorkoutPlan | null;
  completed?: Record<string, PoseItem>; blocked?: Record<string, BlockedSync> };
const key = (owner: string) => `barofit.workout.v1.${owner}`;
const empty = (): Stored => ({ version: 1, queue: [], current: null, plan: null });
const locks = new Map<string, Promise<unknown>>();
const flushes = new Map<string, Promise<void>>();
/** 이번 앱 실행에서 영구 오류를 받아 건너뛰는 세션(사용자별). 앱을 다시 실행하면 한 번 더 보내 본다(서버 수정 후 복구 가능) */
const skipped = new Map<string, Set<string>>();
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
    pushSession(data, sessionId, session);
  });
}
/** 세션 요청을 큐에 넣고, 수행 세트가 있는 종료 세션이면 Report 생성을 한 번만 뒤에 넣는다 */
function pushSession(data: Stored, sessionId: string, session: WorkoutSessionSync) {
  data.queue.push({ sessionId, session });
  if ((session.status === 'COMPLETED' || session.status === 'ABANDONED') &&
      session.sets.some(set => (set.actualReps ?? 0) > 0 || (set.actualDurationSeconds ?? 0) > 0) &&
      !data.queue.some(item => item.kind === 'report' && item.sessionId === sessionId))
    data.queue.push({ kind: 'report', sessionId });
}
const timeOf = (value: unknown) => (typeof value === 'string' ? Date.parse(value) : NaN);
/**
 * 날짜 경계(Asia/Seoul): 시작한 날짜(startedAt)가 오늘보다 이전인 미완료 세션(ACTIVE·PAUSED)은 더 이어할 수 없어 ABANDONED로 끝낸다.
 *  - 같은 session ID·routineSnapshot, revision +1, 완료 세트 전체를 그대로 보낸다(기존 큐 경로, 수행 세트가 있으면 기존 규칙대로 Report 1회)
 *  - endedAt = 기기에 남은 마지막 실제 활동 시각(진행 위치 저장 시각 savedAt·마지막 세트 완료 시각) 중 가장 늦은 값, 최소 startedAt.
 *    정리 시각(다음 날)을 쓰지 않아 전날 운동이 다음 날 기록으로 집계되지 않는다
 *  - 운동·휴식 시간은 같은 진행 위치에 저장된 값(세션 값보다 작지 않게). 휴식이 경과 시간을 넘는 기록은 서버 검증(400)을 피하려고 휴식만 보내지 않는다(null)
 *  - 이어하기 정보(current)만 지우고 전송 대기 큐는 그대로 둔다. 한 번 처리하면 current가 없어 다시 호출해도 아무것도 하지 않는다
 * 운동 화면에서 진행 중인 세션에는 호출하지 않는다(진입·이어하기·새 운동 시작 경로에서만 호출). 시작 시각을 읽을 수 없으면 판정하지 않는다.
 * @returns ABANDONED로 끝낸 session ID, 없으면 null
 */
export function settleStaleWorkout(owner: string, nowMs: number = Date.now()): Promise<string | null> {
  return locked(owner, async () => {
    const data = await read(owner);
    const current = data.current;
    if (!current || current.session.status === 'COMPLETED' || current.session.status === 'ABANDONED') return null;
    const startedDay = kstDateOf(timeOf(current.session.startedAt)), today = kstDateOf(nowMs);
    if (!startedDay || !today || startedDay >= today) return null;
    abandonCurrent(data);
    await AsyncStorage.setItem(key(owner), JSON.stringify(data));
    return current.sessionId;
  });
}
/**
 * 사용자가 진행 중인 운동을 명시적으로 초기화할 때(주간 계획 변경 등). 날짜와 무관하게 해당 세션의 미완료 상태를 ABANDONED로 끝낸다.
 * 종료 요청을 큐에 기록한 같은 저장에서 이어하기 정보를 지운다(settleStaleWorkout과 같은 종료 규칙). 이미 종료된 세션이면 이어하기 정보만 지운다.
 * 해당 세션이 아니거나 이미 정리됐으면 아무것도 하지 않는다(중복 초기화 요청 안전).
 * @returns ABANDONED 요청을 기록했으면 true
 */
export function abandonLocalWorkout(owner: string, sessionId: string): Promise<boolean> {
  return locked(owner, async () => {
    const data = await read(owner);
    const current = data.current;
    if (!current || current.sessionId !== sessionId) return false;
    const open = current.session.status !== 'COMPLETED' && current.session.status !== 'ABANDONED';
    if (open) abandonCurrent(data);
    else data.current = null;
    await AsyncStorage.setItem(key(owner), JSON.stringify(data));
    return open;
  });
}
/** 현재 미완료 세션을 ABANDONED로 큐에 넣고 이어하기 정보를 지운다(저장은 호출한 쪽에서). 종료 규칙은 settleStaleWorkout 설명 참고 */
function abandonCurrent(data: Stored) {
  const current = data.current!;
  const started = timeOf(current.session.startedAt);
  const draft = current.draft.sessionId === current.sessionId ? current.draft : null;
  const lastActivity = Math.max(started, timeOf(draft?.savedAt) || started,
    ...current.session.sets.map(set => timeOf(set.completedAt) || started));
  const active = Math.max(current.session.activeDurationSeconds, draft?.activeDurationSeconds ?? 0);
  const rest = Math.max(current.session.restDurationSeconds ?? 0, draft?.restDurationSeconds ?? 0);
  const elapsed = Math.floor((lastActivity - started) / 1000);
  const session: WorkoutSessionSync = { ...current.session, status: 'ABANDONED', revision: current.session.revision + 1,
    endedAt: new Date(lastActivity).toISOString(), activeDurationSeconds: active,
    restDurationSeconds: rest <= elapsed ? rest : null };
  pushSession(data, current.sessionId, session);
  data.current = null;
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
/**
 * Atomically persist the measured Workout set and its unmodified report payload.
 * 주 측정값만 Workout 세트에 저장한다: REPS = summary.count, DURATION = floor(summary.holdSeconds).
 * 보조 측정값(REPS의 holdSeconds·observedSeconds·sideCounts 등)은 Workout 세트에 넣지 않고 AI 원본 payload에만 남긴다.
 * 주 측정값이 없거나(다른 값으로 대체하지 않음) 세션 snapshot 기준 지원 상태가 supported가 아니면 아무것도 저장하지 않는다(change는 예외 시 미기록).
 * (예: V13 이전 DURATION 마운틴 클라이머 snapshot = conflict → 저장 차단. 기존 snapshot·큐 항목은 변환하지 않는다)
 */
export function commitPoseSet(owner: string, item: Omit<PoseItem, 'kind'>) {
  return change(owner, data => {
    const current = data.current;
    if (!current || current.sessionId !== item.sessionId) throw new Error('진행 중인 세션이 아닙니다.');
    if (current.session.status === 'COMPLETED' || current.session.status === 'ABANDONED') throw new Error('종료된 세션입니다.');
    const payload = item.payload;
    const summary = payload.summary as Record<string, unknown> | undefined;
    const exercise = current.session.routineSnapshot.exercises.find(e => e.sets.some(set => set.id === item.routineSetId));
    const support = exercise ? poseSupportForSnapshot(exercise.exerciseId, exercise.measurementType) : null;
    if (payload.schemaVersion !== '2.0' || payload.type !== 'set.completed' || !summary ||
        typeof payload.exercise !== 'string' || !exercise || support?.status !== 'supported' || support.poseId !== payload.exercise)
      throw new Error('계획된 운동과 모델 결과가 일치하지 않습니다.');
    // 원본 payload도 Report로 그대로 전송되므로 보조값까지 형식을 검증한다(Report: count 0 이상 정수, holdSeconds 0 이상 유한수)
    const count = summary.count;
    const hold = summary.holdSeconds;
    if (count != null && (!Number.isInteger(count) || (count as number) < 0 || (count as number) > 10000)) throw new Error('횟수가 올바르지 않습니다.');
    if (hold != null && (typeof hold !== 'number' || !Number.isFinite(hold) || hold < 0)) throw new Error('유지 시간이 올바르지 않습니다.');
    // Workout 계약: 0은 유효한 측정값(수행 판정은 백엔드에서 > 0), 측정값 누락과 구분한다
    let actualReps: number | null;
    let actualDurationSeconds: number | null;
    if (exercise.measurementType === 'REPS') {
      if (count == null) throw new Error('횟수 측정값이 없습니다.');
      actualReps = count as number;
      actualDurationSeconds = null;
    } else if (exercise.measurementType === 'DURATION') {
      if (hold == null) throw new Error('유지 시간 측정값이 없습니다.');
      actualReps = null;
      actualDurationSeconds = Math.floor(hold as number);
    } else {
      throw new Error('운동 측정 방식이 올바르지 않습니다.');
    }
    const request: PoseItem = { kind: 'pose', ...item };
    const key = `${item.sessionId}:${item.routineSetId}`;
    const old = data.completed?.[key];
    if (old) {
      if (JSON.stringify(old) !== JSON.stringify(request)) throw new Error('동일 세트에 다른 결과가 있습니다.');
      return;
    }
    if (current.session.sets.some(set => set.routineSetId === item.routineSetId)) throw new Error('이미 수행한 세트입니다.');
    const set = { routineSetId: item.routineSetId, actualReps,
      actualDurationSeconds, feedbackCodes: [], errorCounts: {},
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
/** 전송 대기 요청 수. sessionId를 주면 그 세션의 요청만 센다(다른 세션의 대기 기록과 구분) */
export async function pendingCount(owner: string, sessionId?: string) {
  return locked(owner, async () => (await read(owner)).queue.filter(item => sessionId === undefined || item.sessionId === sessionId).length);
}
/** 영구 오류로 보존 중인 세션과 마지막 오류(진단·안내용) */
export async function blockedSessions(owner: string) { return locked(owner, async () => ({ ...((await read(owner)).blocked ?? {}) })); }
/**
 * 같은 요청을 다시 보내도 결과가 바뀌지 않는 응답: 요청 내용·계약 문제(400 잘못된 요청, 404 원본 루틴·세션 없음, 409 계약 충돌).
 * 409는 Workout의 revision 충돌·동일 revision 다른 내용·종료된 세션 수정·Routine snapshot 불일치, Report의 결과 ID·세트 바인딩 충돌을 모두 포함하며
 * 어느 쪽이든 같은 요청 재전송으로 해결되지 않는다(같은 요청의 멱등 재전송은 서버가 200으로 답한다). 원인 구분은 서버 detail을 기록해 진단에 쓴다.
 * 네트워크 오류(0)·인증(401·403)·일시 서버 오류(408·429·5xx)는 해당하지 않으며 기존처럼 전체 전송을 멈추고 나중에 다시 보낸다.
 */
export function isPermanentSyncError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422);
}
/** 영구 오류로 전송하지 못한 세션이 있음. 기록은 큐에 남아 있다 */
export class WorkoutSyncBlockedError extends Error {
  constructor(readonly sessionIds: string[]) {
    super('일부 운동 기록을 서버에 반영하지 못했어요. 기록은 기기에 보관돼요.');
    this.name = 'WorkoutSyncBlockedError';
  }
}
/**
 * One worker per user. Remove only the exact request acknowledged by the server.
 * 같은 세션의 요청은 큐 순서대로만 보낸다(세션 저장 → AI 결과 → Report). 한 요청이 영구 오류를 받으면 그 세션의 이후 요청도 보내지 않고
 * 큐에 그대로 두며(삭제·성공 처리·revision 변경 없음) 다른 세션은 계속 보낸다. 일시 오류는 기존처럼 전체를 멈추고 오류를 던진다.
 * 영구 오류를 받은 세션은 이번 실행 동안 건너뛰고 앱을 다시 실행하면 한 번 더 보낸다. 성공하면 오류 기록을 지운다.
 * 이번 실행에서 영구 오류를 받은 세션이 있으면 나머지를 모두 보낸 뒤 WorkoutSyncBlockedError를 던진다.
 */
export function flushWorkoutQueue(owner: string, isOwner: () => boolean): Promise<void> {
  const existing = flushes.get(owner);
  if (existing) return existing;
  const worker = (async () => {
    const skip = skipped.get(owner) ?? new Set<string>();
    skipped.set(owner, skip);
    const newlyBlocked: string[] = [];
    while (isOwner()) {
      const item = await locked(owner, async () => (await read(owner)).queue.find(next => !skip.has(next.sessionId)));
      if (!item || !isOwner()) break;
      try {
        if (item.kind === 'report') {
          await generateWorkoutReport(item.sessionId, isOwner);
        } else if (item.kind === 'pose') {
          await uploadPoseSetResult(item.sessionId, item.resultId, item.routineSetId, item.performedAt, item.payload, isOwner);
        } else {
          await syncWorkoutSession(item.sessionId, item.session, isOwner);
        }
      } catch (error) {
        if (!isPermanentSyncError(error) || !isOwner()) throw error;
        skip.add(item.sessionId);
        newlyBlocked.push(item.sessionId);
        await change(owner, data => {
          data.blocked ??= {};
          data.blocked[item.sessionId] = { status: error.status, code: error.code, message: error.message,
            kind: item.kind ?? 'session', at: new Date().toISOString() };
        });
        continue;
      }
      await change(owner, data => {
        const index = data.queue.findIndex(queued => JSON.stringify(queued) === JSON.stringify(item));
        if (index >= 0) data.queue.splice(index, 1);
        if (data.blocked?.[item.sessionId]) delete data.blocked[item.sessionId];
      });
    }
    if (newlyBlocked.length) throw new WorkoutSyncBlockedError(newlyBlocked);
  })();
  flushes.set(owner, worker);
  void worker.finally(() => { if (flushes.get(owner) === worker) flushes.delete(owner); }).catch(() => {});
  return worker;
}
export function isOffline(error: unknown) { return error instanceof ApiError && error.status === 0; }
