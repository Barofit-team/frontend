const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../node_modules/typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/services/offlineWorkout.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const disk = new Map(), calls = []; let online = false;
const poseIds = { poseExerciseId: id => ({ 'push-up': 'pushup', 'pike-push-up': 'pike_pushup', 'incline-push-up': 'incline_pushup' })[id] ?? null };
const storage = { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => disk.set(key, value) };
class ApiError extends Error { constructor(status) { super('offline'); this.status = status; } }
const api = {
  syncWorkoutSession: async (id, session) => { if (!online) throw new ApiError(0); calls.push(`session:${session.status}:${session.revision}:${session.sets.length}`); },
  uploadPoseSetResult: async (id, rid, sid, at, body) => { if (!online) throw new ApiError(0); calls.push(`pose:${sid}:${body.summary.count}`); },
  generateWorkoutReport: async id => { if (!online) throw new ApiError(0); calls.push(`report:${id}`); },
};
function load() { const m = { exports: {} }; const deps = { '@react-native-async-storage/async-storage': { __esModule: true, default: storage }, '@/services/api': { ApiError }, '@/services/poseExerciseIds': poseIds, '@/services/workoutSessionService': api }; new Function('require', 'module', 'exports', js)(name => deps[name], m, m.exports); return m.exports; }
(async () => {
  let offline = load();
  const session = { routineId: 'r', routineSnapshot: { exercises: [{ exerciseId: 'push-up', sets: [{ id: 'planned-set' }] }] }, status: 'ACTIVE', revision: 0, sets: [] };
  const draft = { sessionId: 's' };
  await offline.queueSession('u', 's', session, draft);
  const pose = { sessionId: 's', resultId: 'result', routineSetId: 'planned-set', performedAt: '2026-11-05T00:00:00Z', payload: { schemaVersion: '2.0', type: 'set.completed', exercise: 'pushup', engineVersion: 'v2', summary: { count: 3, holdSeconds: null, items: {} } } };
  await offline.commitPoseSet('u', pose);
  await offline.commitPoseSet('u', pose);
  assert.equal((await offline.getLocalWorkout('u')).session.sets[0].actualReps, 3);
  await assert.rejects(offline.commitPoseSet('u', { ...pose, resultId: 'other' }));
  const current = (await offline.getLocalWorkout('u')).session;
  await offline.queueSession('u', 's', { ...current, revision: 2, status: 'COMPLETED' });
  await offline.queueReportGeneration('u', 's');
  await assert.rejects(offline.flushWorkoutQueue('u', () => true));
  offline = load();
  online = true;
  await offline.flushWorkoutQueue('u', () => true);
  assert.deepEqual(calls, ['session:ACTIVE:0:0', 'session:ACTIVE:1:1', 'pose:planned-set:3', 'session:COMPLETED:2:1', 'report:s']);
  assert.equal(await offline.pendingCount('u'), 0);
  console.log('PASS: measured set, offline restart and report generation ordering');
})().catch(error => { console.error(error); process.exitCode = 1; });
