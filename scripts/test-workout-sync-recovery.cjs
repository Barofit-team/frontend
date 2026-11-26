/**
 * 08-3: 오프라인 큐 영구 오류 대응 · 주간 계획 초기화 ABANDONED · 운동 완료 → Workout → Report 순서 회귀 테스트.
 * 실제 offlineWorkout.ts를 메모리 AsyncStorage와 가짜 API로 실행한다(네트워크 요청 없음, 실제 서버 미검증).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');

const SRC = path.join(__dirname, '../src');
function loadWith(rel, deps) {
  const js = ts.transpileModule(fs.readFileSync(path.join(SRC, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)((name) => {
    if (!(name in deps)) throw Error(`unexpected dependency ${name}`);
    return deps[name];
  }, module, module.exports);
  return module.exports;
}
class ApiError extends Error {
  constructor(status, code = 'UNKNOWN', detail = 'error') { super(detail); this.status = status; this.code = code; }
}
const kstDate = loadWith('services/kstDate.ts', {});
const disk = new Map();
const storage = { getItem: async (k) => disk.get(k) ?? null, setItem: async (k, v) => { disk.set(k, v); } };
/** 요청별 응답: (kind, sessionId, body) → 던질 오류 또는 undefined(성공) */
let respond = () => undefined;
const calls = [];
const hit = (kind, id, extra) => { calls.push([kind, id, extra].filter((v) => v !== undefined)); const error = respond(kind, id, extra); if (error) throw error; };
const api = {
  syncWorkoutSession: async (id, body) => hit('session', id, `${body.status}#${body.revision}`),
  uploadPoseSetResult: async (id, resultId) => hit('pose', id, resultId),
  generateWorkoutReport: async (id) => hit('report', id),
};
const deps = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
  '@/services/api': { ApiError },
  '@/services/poseExerciseIds': { poseSupportForSnapshot: (id) => ({ status: 'supported', poseId: id }) },
  '@/services/workoutSessionService': api,
  '@/services/kstDate': kstDate,
};
const load = () => loadWith('services/offlineWorkout.ts', deps);
const stored = (owner) => JSON.parse(disk.get(`barofit.workout.v1.${owner}`));
const guard = () => true;

const snapshot = { id: 'routine', type: 'USER', interExerciseRestSeconds: 30, exercises: [
  { id: 'e1', exerciseId: 'squat', name: '스쿼트', measurementType: 'REPS', sets: [{ id: 's1' }, { id: 's2' }] },
  { id: 'e2', exerciseId: 'plank', name: '플랭크', measurementType: 'DURATION', sets: [{ id: 'p1' }] },
] };
const startAt = '2026-11-26T01:00:00.000Z';
const session = (extra = {}) => ({ routineId: 'routine', routineSnapshot: snapshot, status: 'ACTIVE', revision: 0, startedAt: startAt,
  endedAt: null, activeDurationSeconds: 0, restDurationSeconds: 0, sets: [], ...extra });
const draft = (sessionId, extra = {}) => ({ sessionId, routineId: 'routine', exerciseIndex: 0, totalExercises: 2, exerciseId: 'squat',
  exerciseName: '스쿼트', phase: 'exercising', set: 1, totalSets: 2, reps: null, targetReps: 10, remainingSeconds: 30,
  savedAt: '2026-11-26T01:05:00.000Z', activeDurationSeconds: 200, restDurationSeconds: 30, ...extra });
const result = (exercise, routineSetId, summary, resultId, performedAt) => ({ sessionId: 'S', resultId, routineSetId, performedAt,
  payload: { schemaVersion: '2.0', type: 'set.completed', exercise, engineVersion: 'v1', summary } });

/** 운동 1건을 처음부터 끝까지 로컬에 기록(세션 생성 → 세트 3개 → COMPLETED). 실제 화면과 같은 함수 순서 */
async function completeWorkout(offline, owner, sessionId) {
  await offline.queueSession(owner, sessionId, session(), draft(sessionId));
  const sets = [['squat', 's1', { count: 10 }], ['squat', 's2', { count: 8 }], ['plank', 'p1', { holdSeconds: 41.6 }]];
  for (const [i, [exercise, setId, summary]] of sets.entries()) {
    await offline.commitPoseSet(owner, { ...result(exercise, setId, summary, `${sessionId}-r${i}`, `2026-11-26T01:0${i + 1}:00.000Z`), sessionId });
  }
  const local = await offline.getLocalWorkout(owner);
  const done = { ...local.session, status: 'COMPLETED', revision: local.session.revision + 1, endedAt: '2026-11-26T01:10:00.000Z',
    activeDurationSeconds: 400, restDurationSeconds: 60 };
  await offline.queueSession(owner, sessionId, done);
  await offline.clearLocalWorkout(owner, sessionId);
  return done;
}

(async () => {
  let offline = load();

  // ---- 운동 완료 → Workout 저장 → AI 결과 → COMPLETED → Report: 순서·session ID·마지막 세트 포함 ----
  const done = await completeWorkout(offline, 'u1', 'W');
  assert.deepEqual(done.sets.map((s) => [s.routineSetId, s.actualReps, s.actualDurationSeconds]),
    [['s1', 10, null], ['s2', 8, null], ['p1', null, 41]], '마지막 세트까지 COMPLETED에 포함, DURATION = floor(AI holdSeconds)');
  assert.deepEqual(done.routineSnapshot, snapshot, '완료 세션 snapshot 유지');
  respond = (kind) => (kind === 'report' ? new ApiError(503) : undefined); // Report 일시 오류
  await assert.rejects(offline.flushWorkoutQueue('u1', guard), (e) => e.status === 503);
  assert.deepEqual(calls.map((c) => c.join(':')), [
    'session:W:ACTIVE#0', 'session:W:ACTIVE#1', 'pose:W:W-r0', 'session:W:ACTIVE#2', 'pose:W:W-r1', 'session:W:ACTIVE#3', 'pose:W:W-r2',
    'session:W:COMPLETED#4', 'report:W',
  ], '세션 저장 → AI 결과 → … → COMPLETED → Report (모두 같은 session ID)');
  assert.equal(await offline.pendingCount('u1', 'W'), 1, 'Report 실패: 운동 기록은 이미 전송, Report 요청만 보존');
  await offline.queueReportGeneration('u1', 'W').catch(() => {}); // 이어하기 정보가 없어 거절 → 중복 Report 요청 없음
  assert.equal(stored('u1').queue.filter((i) => i.kind === 'report').length, 1, 'Report 요청 중복 없음');
  respond = () => undefined; calls.length = 0;
  await offline.flushWorkoutQueue('u1', guard);
  assert.deepEqual(calls.map((c) => c.join(':')), ['report:W'], 'Report 일시 오류 후 재시도 1회');
  assert.equal(await offline.pendingCount('u1'), 0);

  // ---- 영구 오류 세션 A가 독립 세션 B·C를 막지 않음, A의 의존 요청은 보내지 않음 ----
  offline = load(); calls.length = 0;
  await completeWorkout(offline, 'u2', 'A');
  await completeWorkout(offline, 'u2', 'B');
  await completeWorkout(offline, 'u2', 'C');
  const aBefore = stored('u2').queue.filter((i) => i.sessionId === 'A');
  respond = (kind, id, extra) => (kind === 'session' && id === 'A' && extra === 'ACTIVE#1'
    ? new ApiError(409, 'WORKOUT_CONFLICT', '루틴 원본이 변경되었습니다. 최신 루틴을 다시 조회해 주세요.') : undefined);
  await assert.rejects(offline.flushWorkoutQueue('u2', guard), (e) => e.name === 'WorkoutSyncBlockedError' && e.sessionIds.join() === 'A');
  const sentA = calls.filter((c) => c[1] === 'A').map((c) => c.join(':'));
  assert.deepEqual(sentA, ['session:A:ACTIVE#0', 'session:A:ACTIVE#1'], 'A: 실패한 요청 뒤의 AI 결과·COMPLETED·Report는 보내지 않음');
  assert.ok(calls.some((c) => c.join(':') === 'report:B') && calls.some((c) => c.join(':') === 'report:C'), 'B·C는 끝까지 전송');
  assert.equal(await offline.pendingCount('u2', 'B'), 0);
  assert.equal(await offline.pendingCount('u2', 'C'), 0);
  const aAfter = stored('u2').queue.filter((i) => i.sessionId === 'A');
  assert.deepEqual(aAfter, aBefore.slice(1), 'A 기록 보존: 성공한 첫 요청만 빠지고 나머지는 삭제·변경(revision·snapshot) 없음');
  const blocked = (await offline.blockedSessions('u2')).A;
  assert.deepEqual([blocked.status, blocked.code, blocked.kind], [409, 'WORKOUT_CONFLICT', 'session']);
  assert.match(blocked.message, /루틴 원본이 변경/, 'snapshot 충돌 원인을 진단용으로 보존');
  assert.deepEqual(await offline.blockedSessions('u1'), {}, '계정별 큐 분리');
  // 같은 실행에서는 A를 다시 보내지 않음, 앱 재실행 후 한 번 더(서버 측 해결 시 복구)
  calls.length = 0;
  await offline.flushWorkoutQueue('u2', guard);
  assert.equal(calls.length, 0);
  offline = load(); respond = () => undefined;
  await offline.flushWorkoutQueue('u2', guard);
  assert.deepEqual(calls.map((c) => c[0] + ':' + (c[2] ?? '')).slice(-2), ['session:COMPLETED#4', 'report:']);
  assert.equal(await offline.pendingCount('u2'), 0);
  assert.deepEqual(await offline.blockedSessions('u2'), {}, '성공하면 오류 기록 정리');

  // ---- 오류 구분: 일시 오류(네트워크·5xx)·인증은 전체를 멈추고 기록 유지, 400·404는 해당 세션만 보존 ----
  for (const [error, permanent] of [[new ApiError(0, 'NETWORK_ERROR'), false], [new ApiError(503), false], [new ApiError(429), false],
    [new ApiError(401, 'AUTH_TOKEN_INVALID'), false], [new ApiError(400, 'INVALID_WORKOUT'), true], [new ApiError(404, 'ROUTINE_NOT_FOUND'), true],
    [new ApiError(409, 'UNKNOWN', 'Routine set already has a result'), true]]) {
    assert.equal(offline.isPermanentSyncError(error), permanent, `${error.status} ${error.code}`);
  }
  offline = load(); calls.length = 0;
  await completeWorkout(offline, 'u3', 'X');
  await completeWorkout(offline, 'u3', 'Y');
  respond = (kind, id) => (id === 'X' ? new ApiError(503) : undefined);
  await assert.rejects(offline.flushWorkoutQueue('u3', guard), (e) => e.status === 503);
  assert.ok(!calls.some((c) => c[1] === 'Y'), '일시 오류는 기존처럼 전송을 멈추고 나중에 재시도');
  assert.deepEqual(await offline.blockedSessions('u3'), {}, '일시 오류는 영구 보존 대상 아님');
  respond = (kind, id) => (kind === 'pose' && id === 'X' ? new ApiError(400, 'UNKNOWN', 'Invalid posture items') : undefined);
  await assert.rejects(offline.flushWorkoutQueue('u3', guard), (e) => e.name === 'WorkoutSyncBlockedError');
  assert.ok(!calls.some((c) => c.join(':') === 'report:X'), 'AI 결과 업로드가 막힌 세션의 Report는 보내지 않음');
  assert.ok(calls.some((c) => c.join(':') === 'report:Y'));
  assert.equal((await offline.blockedSessions('u3')).X.kind, 'pose');

  // ---- 주간 계획 화면의 진행 중인 운동 초기화 → ABANDONED (오프라인 보존, 중복 방지, 이후 새 운동) ----
  offline = load(); calls.length = 0;
  respond = () => new ApiError(0, 'NETWORK_ERROR');
  await offline.queueSession('u4', 'P', session(), draft('P'));
  await offline.commitPoseSet('u4', { ...result('squat', 's1', { count: 10 }, 'P-r0', '2026-11-26T01:02:00.000Z'), sessionId: 'P' });
  const local = await offline.getLocalWorkout('u4');
  await offline.queueSession('u4', 'P', { ...local.session, status: 'PAUSED', revision: local.session.revision + 1,
    activeDurationSeconds: 150, restDurationSeconds: 20 }, draft('P', { savedAt: '2026-11-26T01:06:00.000Z' }));
  const queued = stored('u4').queue.length;
  assert.equal(await offline.abandonLocalWorkout('u4', 'other'), false, '다른 세션 ID면 아무것도 하지 않음');
  assert.equal(await offline.abandonLocalWorkout('u4', 'P'), true);
  assert.equal(await offline.abandonLocalWorkout('u4', 'P'), false, '중복 초기화 요청은 무시');
  const data = stored('u4');
  assert.equal(data.current, null, '종료 요청을 기록한 같은 저장에서 이어하기 정보 정리');
  assert.equal(data.queue.length, queued + 2, '기존 전송 대기 + ABANDONED + Report(수행 세트 있음)');
  const abandoned = data.queue.at(-2).session;
  assert.deepEqual([abandoned.status, abandoned.revision], ['ABANDONED', 3]);
  assert.deepEqual(abandoned.sets.map((s) => s.routineSetId), ['s1'], '완료 세트 보존');
  assert.deepEqual(abandoned.routineSnapshot, snapshot);
  assert.equal(abandoned.endedAt, '2026-11-26T01:06:00.000Z', '08-2와 같은 종료 시각 규칙(마지막 실제 활동)');
  assert.deepEqual([abandoned.activeDurationSeconds, abandoned.restDurationSeconds], [200, 30]);
  assert.ok(data.queue.some((i) => i.kind === 'pose' && i.resultId === 'P-r0'), 'AI 결과 업로드 요청 보존');
  await assert.rejects(offline.flushWorkoutQueue('u4', guard), (e) => e.status === 0);
  await offline.queueSession('u4', 'N', session({ startedAt: '2026-11-26T02:00:00.000Z' }), draft('N'));
  assert.equal((await offline.getLocalWorkout('u4')).sessionId, 'N', '초기화 후 새 운동 시작 가능(이전 기록 동기화 전)');
  respond = () => undefined; calls.length = 0;
  await offline.flushWorkoutQueue('u4', guard);
  assert.deepEqual(calls.map((c) => c.join(':')), ['session:P:ACTIVE#0', 'session:P:ACTIVE#1', 'pose:P:P-r0',
    'session:P:PAUSED#2', 'session:P:ABANDONED#3', 'report:P', 'session:N:ACTIVE#0'], '재연결 후 기존 큐 순서대로 동기화');
  // 이미 종료된 세션이면 종료 요청 없이 이어하기 정보만 정리
  await offline.queueSession('u5', 'D', session({ status: 'COMPLETED', endedAt: '2026-11-26T01:10:00.000Z' }), draft('D'));
  const before5 = stored('u5').queue.length;
  assert.equal(await offline.abandonLocalWorkout('u5', 'D'), false);
  assert.equal(stored('u5').current, null);
  assert.equal(stored('u5').queue.length, before5);

  console.log('PASS: 08-3 permanent sync errors keep the failed session and its dependent requests while other sessions sync, transient/auth errors keep retry policy, report retry without duplicates, completion order with last set, weekly-plan reset → ABANDONED (offline, idempotent).');
})().catch((error) => { console.error(error); process.exit(1); });
