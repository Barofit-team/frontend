const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../node_modules/typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/services/offlineWorkout.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const disk = new Map();
const poseIds = { poseExerciseId: id => ({ 'push-up': 'pushup', 'pike-push-up': 'pike_pushup', 'incline-push-up': 'incline_pushup' })[id] ?? null };
const storage = { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value); } };
let online = false, rejected = false, calls = [], poseCalls = [], reportCalls = [];
class ApiError extends Error { constructor(status) { super('error'); this.status = status; } }
const service = { syncWorkoutSession: async (id, body) => { calls.push({ id, body: JSON.parse(JSON.stringify(body)) }); if (!online) throw new ApiError(0); if (rejected) throw new ApiError(409); }, uploadPoseSetResult: async (...args) => { poseCalls.push(args.slice(0, 5)); if (!online) throw new ApiError(0); if (rejected) throw new ApiError(409); }, generateWorkoutReport: async id => { reportCalls.push(id); if (!online) throw new ApiError(0); if (rejected) throw new ApiError(409); } };
function load() {
  const module = { exports: {} };
  const deps = { '@react-native-async-storage/async-storage': { __esModule: true, default: storage }, '@/services/api': { ApiError }, '@/services/poseExerciseIds': poseIds, '@/services/workoutSessionService': service };
  new Function('require', 'module', 'exports', compiled)(name => { if (!(name in deps)) throw Error(name); return deps[name]; }, module, module.exports);
  return module.exports;
}
(async () => {
  let offline = load();
  const session = { revision: 0, status: 'ACTIVE', routineSnapshot: { id: 'routine' } };
  const position = { sessionId: 'session', exerciseIndex: 0, remainingSeconds: 8 };
  await offline.queueSession('alice', 'session', session, position);
  await assert.rejects(offline.flushWorkoutQueue('alice', () => true), e => e.status === 0);
  assert.equal(await offline.pendingCount('alice'), 1);
  await offline.savePosition('alice', 'session', { ...position, remainingSeconds: 4 });
  const next = { ...session, revision: 1, status: 'PAUSED' };
  await offline.queueSession('alice', 'session', next);
  offline = load(); // Simulate a fresh app process with the same durable storage.
  assert.equal((await offline.getLocalWorkout('alice')).draft.remainingSeconds, 4);
  assert.equal(await offline.getLocalWorkout('bob'), null);
  online = true; rejected = true;
  await assert.rejects(offline.flushWorkoutQueue('alice', () => true), e => e.status === 409);
  assert.equal(await offline.pendingCount('alice'), 2);
  rejected = false; calls = [];
  await Promise.all([offline.flushWorkoutQueue('alice', () => true), offline.flushWorkoutQueue('alice', () => true)]);
  assert.deepEqual(calls.map(c => c.body.revision), [0, 1]);
  assert.deepEqual(calls[0].body, session);
  assert.equal(await offline.pendingCount('alice'), 0);
  assert.equal((await offline.getLocalWorkout('alice')).session.status, 'PAUSED');
  // A response lost after a server commit must replay the identical request.
  const again = { ...next, revision: 2 };
  await offline.queueSession('alice', 'session', again);
  online = false; calls = [];
  await assert.rejects(offline.flushWorkoutQueue('alice', () => true));
  online = true;
  await offline.flushWorkoutQueue('alice', () => true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  const pose = { sessionId: 'session', resultId: 'result', routineSetId: 'set', performedAt: '2026-11-05T00:00:00Z', payload: { type: 'set.completed', schemaVersion: '2.0', summary: { count: 3 } } };
  await offline.queuePoseSetResult('alice', pose);
  await offline.queuePoseSetResult('alice', pose);
  assert.equal(await offline.pendingCount('alice'), 1);
  await assert.rejects(offline.queuePoseSetResult('alice', { ...pose, performedAt: 'different' }));
  online = false;
  await assert.rejects(offline.flushWorkoutQueue('alice', () => true));
  assert.equal(await offline.pendingCount('alice'), 1);
  online = true;
  await offline.flushWorkoutQueue('alice', () => true);
  assert.deepEqual(poseCalls[0], poseCalls[1]);
  assert.deepEqual(poseCalls[0].slice(0, 4), ['session', 'result', 'set', pose.performedAt]);
  assert.deepEqual(poseCalls[0][4], pose.payload);
  await offline.clearLocalWorkout('alice', 'another-session');
  assert.ok(await offline.getLocalWorkout('alice'));
  await offline.clearLocalWorkout('alice', 'session');
  assert.equal(await offline.getLocalWorkout('alice'), null);
  // A session started before local midnight expires atomically, including after a crash
  // that left its durable status ACTIVE. Results and upload ordering remain intact.
  const now = new Date('2026-11-27T00:00:00+09:00');
  const old = { revision: 3, status: 'PAUSED', startedAt: '2026-11-26T23:58:00+09:00',
    endedAt: null, routineId: 'old', routineSnapshot: { id: 'old' },
    activeDurationSeconds: 10, restDurationSeconds: 2,
    sets: [{ routineSetId: 'set', actualReps: 5, actualDurationSeconds: null }] };
  const oldPosition = { sessionId: 'old-session', savedAt: '2026-11-26T23:59:00+09:00',
    activeDurationSeconds: 30, restDurationSeconds: 5 };
  await offline.queueSession('expiry', 'old-session', old, oldPosition);
  await offline.cachePlan('expiry', { date: '2026-11-26', routine: old.routineSnapshot });
  online = false;
  const beforeMidnight = new Date('2026-11-26T23:59:59+09:00');
  assert.ok(await offline.getResumableWorkout('expiry', beforeMidnight));
  assert.deepEqual(await Promise.all([offline.getResumableWorkout('expiry', now), offline.getResumableWorkout('expiry', now)]), [null, null]);
  assert.equal(await offline.getLocalWorkout('expiry'), null);
  assert.equal(await offline.getCachedPlan('expiry'), null);
  assert.equal(await offline.pendingCount('expiry'), 3); // original, terminal, report
  await assert.rejects(offline.flushWorkoutQueue('expiry', () => true));
  assert.equal(await offline.pendingCount('expiry'), 3);
  offline = load(); // Durable expiry survives an app restart.
  assert.equal(await offline.getResumableWorkout('expiry', now), null);
  const fresh = { ...old, revision: 0, status: 'ACTIVE', sets: [], startedAt: now.toISOString() };
  await offline.queueSession('expiry', 'new-session', fresh, { ...oldPosition, sessionId: 'new-session', savedAt: now.toISOString() });
  assert.equal((await offline.getResumableWorkout('expiry', now)).sessionId, 'new-session');
  online = true; calls = []; reportCalls = [];
  await offline.flushWorkoutQueue('expiry', () => true);
  assert.deepEqual(calls.map(c => [c.id, c.body.status, c.body.revision]), [
    ['old-session', 'PAUSED', 3], ['old-session', 'ABANDONED', 4], ['new-session', 'ACTIVE', 0],
  ]);
  assert.deepEqual(calls[1].body.sets, old.sets);
  assert.equal(calls[1].body.activeDurationSeconds, 30);
  assert.equal(calls[1].body.endedAt, new Date(oldPosition.savedAt).toISOString());
  assert.deepEqual(reportCalls, ['old-session']);
  await offline.queueSession('crashed', 'old-active', { ...old, status: 'ACTIVE', sets: [] }, oldPosition);
  assert.equal(await offline.getResumableWorkout('crashed', now), null);
  assert.equal(await offline.pendingCount('crashed'), 2); // No fabricated report without results.
  assert.ok(await offline.getLocalWorkout('expiry')); // Other account is unaffected.
  const switchSession = { ...old, status: 'PAUSED', startedAt: now.toISOString() };
  await offline.queueSession('switch', 'routine-a', switchSession, oldPosition);
  await assert.rejects(offline.abandonLocalWorkout('switch', 'wrong-session'));
  assert.ok(await offline.getLocalWorkout('switch')); // Cancel/stale selection leaves it intact.
  await offline.abandonLocalWorkout('switch', 'routine-a');
  assert.equal(await offline.getLocalWorkout('switch'), null);
  await assert.rejects(offline.abandonLocalWorkout('switch', 'routine-a')); // No duplicate terminal revision.
  await offline.queueSession('switch', 'routine-b', fresh, oldPosition);
  calls = []; reportCalls = [];
  await offline.flushWorkoutQueue('switch', () => true);
  assert.deepEqual(calls.map(c => [c.id, c.body.status]), [
    ['routine-a', 'PAUSED'], ['routine-a', 'ABANDONED'], ['routine-b', 'ACTIVE'],
  ]);
  assert.deepEqual(reportCalls, ['routine-a']);
  const terminal = { ...fresh, status: 'ABANDONED', revision: 1, endedAt: now.toISOString() };
  await offline.queueSession('switch', 'routine-b', terminal);
  await assert.rejects(offline.queueSession('switch', 'routine-b', { ...fresh, revision: 2 }));
  console.log('PASS: midnight expiry, concurrent recovery, offline/restart, new session, preserved results');
  console.log('PASS: offline queue, restart, account isolation, retry ordering and conflicts');
})().catch(error => { console.error(error); process.exitCode = 1; });
