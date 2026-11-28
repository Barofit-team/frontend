const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../node_modules/typescript');
let completed = false, owner = 'u', server = { date: '2026-11-27', completed: false, activeSessionId: null }, failure = null;
const deps = {
  '@/stores/useAuthStore': { useAuthStore: { getState: () => ({ user: { id: owner } }) } },
  '@/services/offlineWorkout': { hasCompletedWorkout: async () => completed, flushWorkoutQueue: async () => { if (failure) throw failure; }, isOffline: e => e.status === 0 },
  '@/services/workoutSessionService': { getDailyWorkoutState: async () => server },
};
const js = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/services/dailyWorkoutPolicy.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = { exports: {} };
new Function('require', 'module', 'exports', js)(name => deps[name], m, m.exports);
const check = m.exports.assertDailyWorkoutAvailable;
(async () => {
  await check('u', '2026-11-27');
  completed = true;
  await assert.rejects(check('u', '2026-11-27'), /이미 완료/);
  completed = false; server.completed = true;
  await assert.rejects(check('u', '2026-11-27', 'old'), /이미 완료/);
  server.completed = false; server.activeSessionId = 'a';
  await check('u', '2026-11-27', 'a');
  await assert.rejects(check('u', '2026-11-27', 'b'), /먼저 종료/);
  await assert.rejects(check('u', '2026-11-27'), /먼저 종료/);
  server.activeSessionId = null; failure = { status: 0 };
  await assert.rejects(check('u', '2026-11-27'));
  await check('u', '2026-11-27', 'a'); // Only an existing session resumes offline.
  failure = null; server.date = '2026-11-28';
  await assert.rejects(check('u', '2026-11-27'), /날짜/);
  await check('u', '2026-11-28');
  owner = 'other';
  await assert.rejects(check('u', '2026-11-28'), /계정/);
  console.log('PASS: one completion per day, existing-session resume, cross-device conflict, offline start blocked, date and owner checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
