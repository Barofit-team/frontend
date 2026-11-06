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
  console.log('PASS: offline queue, restart, account isolation, retry ordering and conflicts');
})().catch(error => { console.error(error); process.exitCode = 1; });
