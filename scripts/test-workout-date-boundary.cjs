/**
 * 08-2: 운동 중도 종료 · 당일 이어하기 · 날짜 경계(Asia/Seoul) 회귀 테스트.
 *  - offlineWorkout.settleStaleWorkout: 이전 날짜 미완료 세션 ABANDONED, endedAt, 큐 보존, 중복 방지, 계정 분리, 기존 데이터 호환
 *  - sessionResume.restoredPosition: 앱을 나갔다 이어할 때 완료 세트 기준 위치와 미완료 세트 초기화
 * 시각은 모두 인자로 고정해 실행 날짜와 무관하다. 기기 시간대를 한국 밖으로 바꿔 시간대 독립성도 확인한다.
 */
process.env.TZ = 'America/Los_Angeles';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');

const SRC = path.join(__dirname, '../src');
function compile(rel) {
  return ts.transpileModule(fs.readFileSync(path.join(SRC, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function loadWith(rel, deps) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compile(rel))((name) => {
    if (!(name in deps)) throw Error(`unexpected dependency ${name}`);
    return deps[name];
  }, module, module.exports);
  return module.exports;
}
const kstDate = loadWith('services/kstDate.ts', {});
const sessionConfig = loadWith('components/workout-session/sessionConfig.ts', {});
const sessionFlow = loadWith('components/workout-session/sessionFlow.ts', { './sessionConfig': sessionConfig });
const resume = loadWith('components/workout-session/sessionResume.ts', { './sessionConfig': sessionConfig, './sessionFlow': sessionFlow });

const disk = new Map();
const storage = { getItem: async (k) => disk.get(k) ?? null, setItem: async (k, v) => { disk.set(k, v); } };
class ApiError extends Error { constructor(status) { super('error'); this.status = status; } }
let online = false;
const calls = [];
const api = {
  syncWorkoutSession: async (id, body) => { calls.push(['session', id, body.status, body.revision]); if (!online) throw new ApiError(0); },
  uploadPoseSetResult: async (id) => { calls.push(['pose', id]); if (!online) throw new ApiError(0); },
  generateWorkoutReport: async (id) => { calls.push(['report', id]); if (!online) throw new ApiError(0); },
};
const offlineDeps = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
  '@/services/api': { ApiError },
  '@/services/poseExerciseIds': { poseSupportForSnapshot: () => ({ status: 'supported', poseId: 'squat' }) },
  '@/services/workoutSessionService': api,
  '@/services/kstDate': kstDate,
};
const loadOffline = () => loadWith('services/offlineWorkout.ts', offlineDeps);
const stored = (owner) => JSON.parse(disk.get(`barofit.workout.v1.${owner}`));

const SQUAT = 'ex-squat';
const snapshot = (overrides = {}) => ({
  id: 'routine-1', type: 'USER', name: '루틴', interExerciseRestSeconds: 40,
  exercises: [
    { id: SQUAT, exerciseId: 'squat', name: '스쿼트', measurementType: 'REPS', sets: [
      { id: 's1', order: 1, targetReps: 10, targetDurationSeconds: null, weightKg: 0, restSeconds: 30, timeLimitSeconds: null },
      { id: 's2', order: 2, targetReps: 20, targetDurationSeconds: null, weightKg: 0, restSeconds: 30, timeLimitSeconds: 90 },
      { id: 's3', order: 3, targetReps: 20, targetDurationSeconds: null, weightKg: 0, restSeconds: 30, timeLimitSeconds: null },
    ] },
    { id: 'ex-plank', exerciseId: 'plank', name: '플랭크', measurementType: 'DURATION', sets: [
      { id: 'p1', order: 1, targetReps: null, targetDurationSeconds: 60, weightKg: 0, restSeconds: 20, timeLimitSeconds: null },
    ] },
  ],
  ...overrides,
});
const setResult = (id, reps, completedAt) => ({ routineSetId: id, actualReps: reps, actualDurationSeconds: null, feedbackCodes: [],
  errorCounts: {}, feedbackText: null, modelVersion: 'm', referenceModelId: null, trackingAvailablePct: null, completedAt });
const draftOf = (sessionId, extra) => ({ sessionId, routineId: 'routine-1', exerciseIndex: 0, totalExercises: 2, exerciseId: 'squat',
  exerciseName: '스쿼트', phase: 'exercising', set: 2, totalSets: 3, reps: null, targetReps: 20, remainingSeconds: 37,
  savedAt: '2026-11-25T02:00:00.000Z', activeDurationSeconds: 300, restDurationSeconds: 60, ...extra });

// 2026-11-25 KST 하루: 2026-11-24T15:00:00Z ~ 2026-11-25T14:59:59.999Z
const STARTED = '2026-11-25T01:00:00.000Z'; // 10:00 KST
const SAME_DAY_LAST = Date.parse('2026-11-25T14:59:59.999Z'); // 23:59:59.999 KST
const NEXT_DAY = Date.parse('2026-11-25T15:00:00.000Z'); // 다음 날 00:00 KST

async function pausedSession(offline, owner, sessionId, { sets = [setResult('s1', 10, '2026-11-25T01:10:00.000Z')], draft } = {}) {
  const base = { routineId: 'routine-1', routineSnapshot: snapshot(), status: 'ACTIVE', revision: 0, startedAt: STARTED,
    endedAt: null, activeDurationSeconds: 0, restDurationSeconds: 0, sets: [] };
  await offline.queueSession(owner, sessionId, base, draftOf(sessionId));
  const withSets = { ...base, revision: 1, sets };
  await offline.queueSession(owner, sessionId, withSets);
  const paused = { ...withSets, revision: 2, status: 'PAUSED', activeDurationSeconds: 280, restDurationSeconds: 50 };
  await offline.queueSession(owner, sessionId, paused, draft ?? draftOf(sessionId));
  return paused;
}

(async () => {
  // 8. KST 날짜 판정: 기기 시간대(LA)와 무관
  assert.equal(new Date(NEXT_DAY).getHours(), 7, 'HARNESS: 기기 시간대가 LA(UTC-8)가 아님'); // 한국은 다음 날 00:00, 기기는 같은 날 07:00
  assert.equal(kstDate.kstDateOf(SAME_DAY_LAST), '2026-11-25');
  assert.equal(kstDate.kstDateOf(NEXT_DAY), '2026-11-26');
  assert.equal(kstDate.kstDateOfIso('2026-11-24T15:00:00Z'), '2026-11-25');
  assert.equal(kstDate.kstDateOfIso('잘못된 값'), null);

  let offline = loadOffline();
  // 1·3. 같은 날 중도 종료: PAUSED 유지, 자정 직전까지 정리하지 않음
  const paused = await pausedSession(offline, 'alice', 'old');
  const queuedBefore = stored('alice').queue.length;
  assert.equal(await offline.settleStaleWorkout('alice', SAME_DAY_LAST), null);
  assert.equal((await offline.getLocalWorkout('alice')).session.status, 'PAUSED');
  assert.equal(stored('alice').queue.length, queuedBefore);

  // 14. 계정 분리: bob의 전날 세션은 alice 정리에 영향 없음
  await pausedSession(offline, 'bob', 'bob-old');

  // 9·12. 다음 날 재접속(앱 재실행, 오프라인): ABANDONED 한 번, 완료 세트·snapshot·session ID 유지, 큐 보존
  offline = loadOffline();
  assert.equal(await offline.settleStaleWorkout('alice', NEXT_DAY), 'old');
  const data = stored('alice');
  assert.equal(data.current, null, '이어하기 정보 정리');
  assert.equal(data.queue.length, queuedBefore + 2, '기존 전송 대기 항목은 그대로 + ABANDONED + Report');
  const abandoned = data.queue.at(-2);
  assert.equal(abandoned.sessionId, 'old');
  assert.equal(abandoned.session.status, 'ABANDONED');
  assert.equal(abandoned.session.revision, paused.revision + 1);
  assert.deepEqual(abandoned.session.routineSnapshot, paused.routineSnapshot);
  assert.deepEqual(abandoned.session.sets, paused.sets, '완료 세트 전체 보존');
  assert.equal(abandoned.session.startedAt, STARTED);
  // 5-3. endedAt = 마지막 실제 활동(진행 위치 저장 시각), 정리 시각(다음 날)이 아님 → 전날 기록으로 집계
  assert.equal(abandoned.session.endedAt, '2026-11-25T02:00:00.000Z');
  assert.equal(kstDate.kstDateOfIso(abandoned.session.endedAt), '2026-11-25');
  assert.ok(Date.parse(abandoned.session.endedAt) >= Date.parse(STARTED));
  assert.equal(abandoned.session.activeDurationSeconds, 300, '더 최근 진행 위치의 운동 시간');
  assert.equal(abandoned.session.restDurationSeconds, 60);
  assert.ok(abandoned.session.restDurationSeconds <= (Date.parse(abandoned.session.endedAt) - Date.parse(STARTED)) / 1000);
  assert.deepEqual(data.queue.at(-1), { kind: 'report', sessionId: 'old' }, '수행 세트가 있어 기존 규칙대로 Report 1회');
  assert.equal((await offline.getLocalWorkout('bob')).session.status, 'PAUSED', 'bob 세션은 그대로');

  // 13. 반복 호출해도 상태 변경·Report 중복 없음
  assert.equal(await offline.settleStaleWorkout('alice', NEXT_DAY), null);
  assert.equal(await offline.settleStaleWorkout('alice', NEXT_DAY + 3600e3), null);
  assert.equal(stored('alice').queue.length, queuedBefore + 2);

  // 10·12. 같은 routine ID라도 다음 날 새 세션 시작 가능(이전 세션 동기화 전, 오프라인)
  const fresh = { routineId: 'routine-1', routineSnapshot: snapshot(), status: 'ACTIVE', revision: 0,
    startedAt: '2026-11-25T23:00:00.000Z', endedAt: null, activeDurationSeconds: 0, restDurationSeconds: 0, sets: [] };
  await offline.queueSession('alice', 'new', fresh, draftOf('new', { phase: 'countdown', set: 1 }));
  assert.equal((await offline.getLocalWorkout('alice')).sessionId, 'new');
  assert.equal(await offline.settleStaleWorkout('alice', Date.parse('2026-11-26T01:00:00Z')), null, '오늘 시작한 세션은 정리하지 않음');
  // 재연결 시 기존 큐 순서대로: 이전 세션 PAUSED → ABANDONED → Report → 새 세션
  await assert.rejects(offline.flushWorkoutQueue('alice', () => true), (e) => e.status === 0);
  online = true; calls.length = 0;
  await offline.flushWorkoutQueue('alice', () => true);
  assert.deepEqual(calls, [
    ['session', 'old', 'ACTIVE', 0], ['session', 'old', 'ACTIVE', 1], ['session', 'old', 'PAUSED', 2],
    ['session', 'old', 'ABANDONED', 3], ['report', 'old'], ['session', 'new', 'ACTIVE', 0],
  ]);
  assert.equal(await offline.pendingCount('alice'), 0);
  online = false;

  // 14. 기존 저장 데이터 호환: 진행 위치에 시간 값이 없고 저장 시각을 읽을 수 없으면 세션 값과 마지막 세트 완료 시각을 쓴다
  await pausedSession(offline, 'carol', 'legacy', {
    draft: draftOf('legacy', { savedAt: undefined, activeDurationSeconds: undefined, restDurationSeconds: undefined }),
    sets: [setResult('s1', 10, '2026-11-25T01:20:00.000Z')],
  });
  await offline.settleStaleWorkout('carol', NEXT_DAY);
  const legacy = stored('carol').queue.at(-2).session;
  assert.equal(legacy.endedAt, '2026-11-25T01:20:00.000Z');
  assert.equal(legacy.activeDurationSeconds, 280);
  assert.equal(legacy.restDurationSeconds, 50, '휴식 50초 ≤ 경과 20분');

  // 휴식 시간이 경과 시간을 넘는 기록은 서버 400을 피하려고 휴식만 보내지 않는다. 수행 세트가 없으면 Report 없음
  await pausedSession(offline, 'dave', 'short', { sets: [], draft: draftOf('short', { savedAt: '2026-11-25T01:00:30.000Z', restDurationSeconds: 45 }) });
  await offline.settleStaleWorkout('dave', NEXT_DAY);
  const short = stored('dave');
  assert.equal(short.queue.at(-1).session.status, 'ABANDONED');
  assert.equal(short.queue.at(-1).session.restDurationSeconds, null);
  assert.ok(!short.queue.some((i) => i.kind === 'report'));

  // 종료된 세션·시작 시각을 읽을 수 없는 세션은 판정하지 않음
  await offline.queueSession('erin', 'done', { ...fresh, startedAt: STARTED, status: 'COMPLETED', endedAt: '2026-11-25T02:00:00.000Z' }, draftOf('done'));
  assert.equal(await offline.settleStaleWorkout('erin', NEXT_DAY), null);
  await offline.queueSession('frank', 'broken', { ...fresh, startedAt: 'broken' }, draftOf('broken'));
  assert.equal(await offline.settleStaleWorkout('frank', NEXT_DAY), null);

  // ---- 4-2. 이어하기 위치 ----
  const session = (sets) => ({ routineId: 'routine-1', routineSnapshot: snapshot(), status: 'PAUSED', revision: 3,
    startedAt: STARTED, endedAt: null, activeDurationSeconds: 0, restDurationSeconds: 0, sets });
  const s1 = setResult('s1', 10, '2026-11-25T01:10:00.000Z');

  // 5. REPS 2세트 8/20회 중 종료 → 2세트 처음부터: 운동 단계, 전체 시간(세트 제한 시간 90초), 측정 없음
  let pos = resume.restoredPosition(draftOf('x', { phase: 'exercising', set: 2, remainingSeconds: 37, reps: 8 }), session([s1]));
  assert.deepEqual([pos.phase, pos.exerciseIndex, pos.set, pos.remainingSeconds, pos.reps, pos.targetReps], ['exercising', 0, 2, 90, null, 20]);
  assert.equal(pos.savedAt, '2026-11-25T02:00:00.000Z', '진행 위치의 나머지 값(시간 기록)은 유지');
  // 세트 제한 시간이 없는 REPS는 기존 기본값 60초
  pos = resume.restoredPosition(draftOf('x', { phase: 'exercising', set: 3, remainingSeconds: 12 }), session([s1, setResult('s2', 20, 'b')]));
  assert.deepEqual([pos.phase, pos.set, pos.remainingSeconds], ['exercising', 3, sessionConfig.EXERCISE_DURATION_SECONDS]);
  // 6. DURATION 25/60초 중 종료 → 목표 시간 전체
  const allSquat = [s1, setResult('s2', 20, 'b'), setResult('s3', 20, 'c')];
  pos = resume.restoredPosition(draftOf('x', { exerciseIndex: 1, exerciseId: 'plank', phase: 'exercising', set: 1, remainingSeconds: 35 }), session(allSquat));
  assert.deepEqual([pos.phase, pos.exerciseIndex, pos.set, pos.remainingSeconds, pos.exerciseId, pos.totalSets], ['exercising', 1, 1, 60, 'plank', 1]);
  // 휴식 중 종료 → 남은 휴식 이어감(측정 없는 단계), 계획보다 길면 계획 시간으로
  pos = resume.restoredPosition(draftOf('x', { phase: 'resting', set: 1, remainingSeconds: 12 }), session([s1]));
  assert.deepEqual([pos.phase, pos.set, pos.remainingSeconds, pos.targetReps], ['resting', 1, 12, 20]);
  pos = resume.restoredPosition(draftOf('x', { phase: 'resting', set: 1, remainingSeconds: 999 }), session([s1]));
  assert.equal(pos.remainingSeconds, 30);
  // 종목 간 안내 카운트다운 중 종료 → 남은 시간 이어감(interExerciseRestSeconds 기준 상한)
  pos = resume.restoredPosition(draftOf('x', { exerciseIndex: 1, phase: 'countdown', set: 1, remainingSeconds: 15 }), session(allSquat));
  assert.deepEqual([pos.phase, pos.exerciseIndex, pos.set, pos.remainingSeconds], ['countdown', 1, 1, 15]);
  // 세트 결과 저장 직후·다음 단계 checkpoint 전 종료(저장 위치가 이미 완료한 1세트) → 1세트 재실행 없이 2세트 시작 카운트다운
  pos = resume.restoredPosition(draftOf('x', { phase: 'exercising', set: 1, remainingSeconds: 3 }), session([s1]));
  assert.deepEqual([pos.phase, pos.set, pos.remainingSeconds], ['countdown', 2, sessionConfig.START_COUNTDOWN_SECONDS]);
  // 저장 위치가 완료 기록보다 앞서 있어도(휴식 위치 불일치) 기록 없는 첫 세트로
  pos = resume.restoredPosition(draftOf('x', { phase: 'resting', set: 2, remainingSeconds: 10 }), session([s1]));
  assert.deepEqual([pos.phase, pos.set], ['countdown', 2]);
  // 모두 완료한 세션은 위치를 바꾸지 않음
  const draftDone = draftOf('x', { exerciseIndex: 1, phase: 'exercising', set: 1 });
  assert.deepEqual(resume.restoredPosition(draftDone, session([...allSquat, setResult('p1', null, 'd')])), draftDone);

  console.log('PASS: 08-2 KST date boundary (device TZ independent), PAUSED → next-day ABANDONED once with last-activity endedAt, sets/snapshot/queue kept, offline new session, account isolation, legacy data, resume position resets unfinished set (REPS/DURATION) without replaying completed sets.');
})().catch((error) => { console.error(error); process.exit(1); });
