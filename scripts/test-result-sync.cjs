const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../node_modules/typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/services/offlineWorkout.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const disk = new Map(), calls = []; let online = false;
const poseIds = { poseExerciseId: id => ({ 'push-up': 'pushup', 'pike-push-up': 'pike_pushup', 'incline-push-up': 'incline_pushup' })[id] ?? null };
// 3-1c: commitPoseSet이 지원 상태(poseSupport)로 검증 → 같은 매핑을 supported로 제공
poseIds.poseSupport = id => { const poseId = poseIds.poseExerciseId(id); return poseId ? { status: 'supported', poseId } : { status: 'unknown', poseId: null }; };
poseIds.poseSupportForSnapshot = id => poseIds.poseSupport(id); // 3-4c: 이 시나리오(push-up REPS)는 계약 지정 종목이 아님
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
  const session = { routineId: 'r', routineSnapshot: { exercises: [{ exerciseId: 'push-up', measurementType: 'REPS', sets: [{ id: 'planned-set' }] }] }, status: 'ACTIVE', revision: 0, sets: [] };
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
})().then(contract31c).then(contract34c).catch(error => { console.error(error); process.exitCode = 1; });

// ---------- 3-1c: 주 측정값(REPS=count, DURATION=holdSeconds) · 보조값 · 원본 보존 · 원자성 ----------
// 실제 poseExerciseIds.ts(23종 지원 상태)를 사용한다. Workout 계약: actualReps·actualDurationSeconds 각각 null 허용,
// 둘 다 null이면 거부, 0 허용(수행 판정은 > 0). Report는 PoseItem 원본의 count·holdSeconds를 각각 선택값으로 받는다.
async function contract31c() {
  const idsJs = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/services/poseExerciseIds.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const realIds = { exports: {} }; new Function('module', 'exports', idsJs)(realIds, realIds.exports);
  const store = new Map(); let failWrite = false;
  const storage2 = { getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { if (failWrite) throw new Error('disk full'); store.set(key, value); } };
  const m = { exports: {} };
  const deps = { '@react-native-async-storage/async-storage': { __esModule: true, default: storage2 }, '@/services/api': { ApiError }, '@/services/poseExerciseIds': realIds.exports, '@/services/workoutSessionService': api };
  new Function('require', 'module', 'exports', js)(name => deps[name], m, m.exports);
  const offline = m.exports;
  const ex = (exerciseId, measurementType) => ({ exerciseId, measurementType, sets: [{ id: `${exerciseId}-1` }, { id: `${exerciseId}-2` }] });
  const snapshot = { exercises: [ex('push-up', 'REPS'), ex('bird-dog', 'REPS'), ex('superman', 'REPS'), ex('plank', 'DURATION'),
    ex('squat', 'REPS'), ex('mountain-climber', 'DURATION'), ex('side-plank', 'DURATION')] };
  await offline.queueSession('c', 's3', { routineId: 'r', routineSnapshot: snapshot, status: 'ACTIVE', revision: 0, sets: [] }, { sessionId: 's3' });
  let n = 0;
  const pose = (setId, exercise, summary, extra = {}) => ({ sessionId: 's3', resultId: `r${++n}`, routineSetId: setId, performedAt: '2026-11-24T00:00:00Z',
    payload: { schemaVersion: '2.0', type: 'set.completed', exercise, engineVersion: 'v2', timestampMs: 1000, summary: { schemaVersion: '2.0', exercise, engineVersion: 'v2', items: {}, ...summary }, ...extra } });
  const setOf = async id => (await offline.getLocalWorkout('c')).session.sets.find(x => x.routineSetId === id);
  const raw = () => store.get('barofit.workout.v1.c');
  /** 거부되면 저장 데이터가 한 글자도 바뀌지 않아야 한다(세트 결과·AI 결과·큐 부분 등록 없음) */
  async function rejectsWithoutChange(item, label) {
    const before = raw();
    await assert.rejects(offline.commitPoseSet('c', item), undefined, label);
    assert.equal(raw(), before, `${label}: 거부 시 저장 데이터 불변`);
  }

  // 1. REPS: count → actualReps
  await offline.commitPoseSet('c', pose('push-up-1', 'pushup', { count: 12, holdSeconds: null }));
  assert.deepEqual([(await setOf('push-up-1')).actualReps, (await setOf('push-up-1')).actualDurationSeconds], [12, null], '1. 푸시업 count → actualReps');
  // 2·3. REPS 보조 holdSeconds는 actualDurationSeconds에 넣지 않고, AI 원본 payload는 그대로 보존
  const birdDog = pose('bird-dog-1', 'bird_dog', { count: 6, holdSeconds: 9.4, observedSeconds: 20.5, details: { sideCounts: { left: 3, right: 3 } } });
  await offline.commitPoseSet('c', birdDog);
  assert.deepEqual([(await setOf('bird-dog-1')).actualReps, (await setOf('bird-dog-1')).actualDurationSeconds], [6, null], '2. 버드독 holdSeconds 혼용 없음');
  const superman = pose('superman-1', 'superman', { count: 8, holdSeconds: 5.5, observedSeconds: 12 });
  await offline.commitPoseSet('c', superman);
  assert.deepEqual([(await setOf('superman-1')).actualReps, (await setOf('superman-1')).actualDurationSeconds], [8, null], '2. 수퍼맨 holdSeconds 혼용 없음');
  const queued = JSON.parse(raw()).queue.filter(i => i.kind === 'pose');
  assert.deepEqual(queued.find(i => i.routineSetId === 'bird-dog-1').payload, birdDog.payload, '3. 버드독 AI 원본(hold·observed·sideCounts) 보존');
  assert.deepEqual(queued.find(i => i.routineSetId === 'superman-1').payload, superman.payload, '3. 수퍼맨 AI 원본 보존');
  // 4·5. DURATION: holdSeconds(초 내림) → actualDurationSeconds, count는 시간으로 저장하지 않음
  await offline.commitPoseSet('c', pose('plank-1', 'plank', { count: 4, holdSeconds: 31.7 }));
  assert.deepEqual([(await setOf('plank-1')).actualReps, (await setOf('plank-1')).actualDurationSeconds], [null, 31], '4·5. 플랭크 hold → 31초, count 미저장');
  // 6. 주 측정값 누락: 보조값으로 대체해 정상 결과를 만들지 않음
  await rejectsWithoutChange(pose('squat-1', 'squat', { count: null, holdSeconds: 9 }), '6. REPS count 누락(hold로 대체 금지)');
  await rejectsWithoutChange(pose('plank-2', 'plank', { count: 25, holdSeconds: null }), '6. DURATION hold 누락(count를 초로 변환 금지)');
  await rejectsWithoutChange(pose('squat-1', 'squat', {}), '6. 두 값 모두 없음');
  // 8. 유효하지 않은 숫자
  for (const [label, summary] of [['count 음수', { count: -1 }], ['count 소수', { count: 1.5 }], ['count 상한 초과', { count: 10001 }],
    ['REPS 보조 hold 음수', { count: 3, holdSeconds: -2 }]]) await rejectsWithoutChange(pose('squat-1', 'squat', summary), `8. ${label}`);
  for (const [label, summary] of [['hold NaN', { holdSeconds: NaN }], ['hold 음수', { holdSeconds: -0.5 }], ['hold Infinity', { holdSeconds: Infinity }]])
    await rejectsWithoutChange(pose('plank-2', 'plank', { count: null, ...summary }), `8. ${label}`);
  // 측정 유형·분석기 불일치, 계약 충돌·미지원
  await rejectsWithoutChange(pose('squat-1', 'plank', { count: null, holdSeconds: 10 }), '측정 유형과 맞지 않는 AI 결과');
  await rejectsWithoutChange(pose('mountain-climber-1', 'mountain_climber', { count: 20, holdSeconds: null }), '11. 마운틴 클라이머(conflict) 결과 저장 차단');
  // 04: 사이드 플랭크 supported(DURATION). 주 측정값 holdSeconds 누락 결과는 count로 대체하지 않고 차단
  await rejectsWithoutChange(pose('side-plank-1', 'side_plank', { count: 20, holdSeconds: null }), '사이드 플랭크 hold 누락(count를 초로 변환 금지)');
  // 7. 유효한 0은 결과로 저장(Workout은 0 허용, 수행 판정만 > 0), 누락과 구분
  await offline.commitPoseSet('c', pose('squat-1', 'squat', { count: 0, holdSeconds: null }));
  assert.deepEqual([(await setOf('squat-1')).actualReps, (await setOf('squat-1')).actualDurationSeconds], [0, null], '7. count 0은 유효한 결과');
  await offline.commitPoseSet('c', pose('plank-2', 'plank', { count: null, holdSeconds: 0.4 }));
  assert.deepEqual([(await setOf('plank-2')).actualReps, (await setOf('plank-2')).actualDurationSeconds], [null, 0], '7. hold 0.4초 → 0초 유효');
  // 9. 저장 실패 시 부분 결과 없음 → 이후 재시도 가능
  const beforeFail = raw();
  failWrite = true;
  await assert.rejects(offline.commitPoseSet('c', pose('push-up-2', 'pushup', { count: 9, holdSeconds: null })), /disk full/);
  failWrite = false;
  assert.equal(raw(), beforeFail, '9. 디스크 저장 실패 시 세트 결과·AI 결과·큐 모두 미등록');
  await offline.commitPoseSet('c', pose('push-up-2', 'pushup', { count: 9, holdSeconds: null }));
  // 10. 이전 완료 세트와 큐 항목 보존
  const final = JSON.parse(raw());
  assert.deepEqual(final.current.session.sets.map(x => [x.routineSetId, x.actualReps, x.actualDurationSeconds]), [
    ['push-up-1', 12, null], ['bird-dog-1', 6, null], ['superman-1', 8, null], ['plank-1', null, 31],
    ['squat-1', 0, null], ['plank-2', null, 0], ['push-up-2', 9, null]], '10. 완료 세트 순서·값 보존');
  assert.deepEqual(final.queue.filter(i => i.kind === 'pose').map(i => i.routineSetId),
    ['push-up-1', 'bird-dog-1', 'superman-1', 'plank-1', 'squat-1', 'plank-2', 'push-up-2'], '10. AI 결과 큐 순서 보존, 거부된 항목 없음');
  assert.equal(final.queue.filter(i => i.kind !== 'pose').length, 1 + 7, '10. 세션 동기화 항목 = 시작 1 + 저장 성공 7');
  // 04: 사이드 플랭크 DURATION 저장 = actualReps null, actualDurationSeconds floor(holdSeconds), AI 원본(sideHoldSeconds) 보존
  const sidePlank = pose('side-plank-1', 'side_plank', { count: null, holdSeconds: 20.7, observedSeconds: 24, details: { sideHoldSeconds: { left: 20.7, right: 0 } } });
  await offline.commitPoseSet('c', sidePlank);
  assert.deepEqual([(await setOf('side-plank-1')).actualReps, (await setOf('side-plank-1')).actualDurationSeconds], [null, 20], '04. 사이드 플랭크 hold 20.7 → 20초');
  assert.deepEqual(JSON.parse(raw()).queue.filter(i => i.kind === 'pose' && i.routineSetId === 'side-plank-1').map(i => i.payload), [sidePlank.payload], '04. AI 원본 보존·1건');
  console.log('PASS: 3-1c primary measure (REPS count / DURATION hold), auxiliary values kept only in AI payload, validation and atomic commit');
}

// ---------- 3-4c: 마운틴 클라이머 V13 REPS 저장 계약 · legacy DURATION·측정 유형 오류 차단 ----------
// 실제 poseExerciseIds.ts 사용. 측정 payload는 실제 MountainClimberAnalyzer set.completed v2 필드 구성(count·holdSeconds null·observedSeconds·items·details.repetitions)을 따른 고정값이며,
// 실제 분석기 통합은 test-auto-pause-session.cjs 3-4c에서 검증한다.
async function contract34c() {
  const idsJs = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/services/poseExerciseIds.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const realIds = { exports: {} }; new Function('module', 'exports', idsJs)(realIds, realIds.exports);
  const store = new Map();
  const storage3 = { getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); } };
  const m = { exports: {} };
  const deps = { '@react-native-async-storage/async-storage': { __esModule: true, default: storage3 }, '@/services/api': { ApiError }, '@/services/poseExerciseIds': realIds.exports, '@/services/workoutSessionService': api };
  new Function('require', 'module', 'exports', js)(name => deps[name], m, m.exports);
  const offline = m.exports;
  const ex = (prefix, measurementType) => ({ exerciseId: 'mountain-climber', measurementType, sets: [1, 2, 3].map(i => ({ id: `${prefix}-${i}` })) });
  const { measurementType: _omit, ...missing } = ex('mc-missing', 'REPS');
  const snapshot = { exercises: [ex('mc-reps', 'REPS'), ex('mc-legacy', 'DURATION'), missing, ex('mc-bad', 'TIME'), ex('mc-null', null)] };
  await offline.queueSession('d', 's4', { routineId: 'r', routineSnapshot: snapshot, status: 'ACTIVE', revision: 0, sets: [] }, { sessionId: 's4' });
  const originalSnapshot = JSON.stringify(snapshot);
  let n = 0;
  const reps = (count) => Array.from({ length: count }, (_, i) => ({ number: i + 1, timestampMs: 1000 + i * 1000, items: { hip_height: 'within_reference' }, codes: [],
    metrics: { side: i % 2 === 0 ? 'left' : 'right', peakKneeForward: 0.42, cycleMs: 500 } }));
  const pose = (setId, summary, exercise = 'mountain_climber') => ({ sessionId: 's4', resultId: `mc${++n}`, routineSetId: setId, performedAt: '2026-11-24T00:00:00Z',
    payload: { schemaVersion: '2.0', type: 'set.completed', exercise, engineVersion: 'mountain-climber-0.5', timestampMs: 17000,
      summary: { schemaVersion: '2.0', exercise, engineVersion: 'mountain-climber-0.5', holdSeconds: null, observedSeconds: 15.9, gapSeconds: 0,
        items: { hip_height: { aggregationBasis: 'repetition', compliancePct: 100 } }, ...summary } } });
  const raw = () => store.get('barofit.workout.v1.d');
  const setOf = async id => (await offline.getLocalWorkout('d')).session.sets.find(x => x.routineSetId === id);
  async function rejectsWithoutChange(item, label) {
    const before = raw();
    await assert.rejects(offline.commitPoseSet('d', item), undefined, label);
    assert.equal(raw(), before, `${label}: 거부 시 저장 데이터 불변`);
  }
  // 1. V13 REPS: actualReps = 실제 count(16, 변환 없음), actualDurationSeconds = null (observedSeconds·경과시간 미사용)
  const first = pose('mc-reps-1', { count: 16, details: { repetitions: reps(16) } });
  await offline.commitPoseSet('d', first);
  assert.deepEqual([(await setOf('mc-reps-1')).actualReps, (await setOf('mc-reps-1')).actualDurationSeconds], [16, null], '1. count 16 → actualReps 16, 시간 null');
  assert.equal((await setOf('mc-reps-1')).modelVersion, 'mountain-climber-0.5');
  // 2. AI 원본 payload(보조값·details·items·engineVersion·반복 기록) 그대로 보존
  const queued = () => JSON.parse(raw()).queue.filter(i => i.kind === 'pose');
  assert.deepEqual(queued()[0].payload, first.payload, '2. AI 원본 보존');
  assert.equal(queued()[0].payload.summary.details.repetitions.filter(r => r.metrics.side === 'left').length, 8, '2. 좌 8 · 우 8 반복 기록 유지');
  // 3. 중복 저장 방지: 같은 요청 재시도는 무시, 같은 세트에 다른 결과는 거부
  const beforeDup = raw();
  await offline.commitPoseSet('d', first);
  assert.equal(raw(), beforeDup, '3. 동일 요청 재시도 → 변경 없음');
  await rejectsWithoutChange({ ...first, resultId: 'other' }, '3. 같은 세트 다른 결과 ID');
  await rejectsWithoutChange(pose('mc-reps-1', { count: 20 }), '3. 같은 세트 다른 count');
  // 4. REPS에 holdSeconds가 있어도 시간으로 저장하지 않음
  await offline.commitPoseSet('d', pose('mc-reps-2', { count: 20, holdSeconds: 12.5 }));
  assert.deepEqual([(await setOf('mc-reps-2')).actualReps, (await setOf('mc-reps-2')).actualDurationSeconds], [20, null], '4. hold 혼용 없음');
  // 5. 주 측정값 누락·무효: count 누락(hold·observed로 대체 금지)·NaN·음수·비정수·상한 초과·문자열
  for (const [label, summary] of [['count 누락', { count: undefined }], ['count null', { count: null, holdSeconds: 20 }], ['NaN', { count: NaN }],
    ['음수', { count: -2 }], ['비정수', { count: 2.5 }], ['상한 초과', { count: 10001 }], ['문자열', { count: '24' }]])
    await rejectsWithoutChange(pose('mc-reps-3', summary), `5. ${label}`);
  // 6. 분석기 불일치(다른 분석기 결과로 대체 금지)
  await rejectsWithoutChange(pose('mc-reps-3', { count: 24 }, 'pushup'), '6. pushup 결과');
  await rejectsWithoutChange(pose('mc-reps-3', { count: 24 }, 'plank'), '6. plank 결과');
  // 7. legacy DURATION snapshot: count·hold 어느 쪽이 있어도 저장 차단 (REPS로 변환하지 않음)
  await rejectsWithoutChange(pose('mc-legacy-1', { count: 20 }), '7. legacy DURATION + count');
  await rejectsWithoutChange(pose('mc-legacy-1', { count: null, holdSeconds: 20 }), '7. legacy DURATION + hold');
  // 8. 측정 유형 누락·잘못된 값
  await rejectsWithoutChange(pose('mc-missing-1', { count: 16 }), '8. measurementType 누락');
  await rejectsWithoutChange(pose('mc-bad-1', { count: 16 }), '8. measurementType TIME');
  await rejectsWithoutChange(pose('mc-null-1', { count: 16 }), '8. measurementType null');
  // 9. count 0은 유효한 측정(누락과 구분)
  await offline.commitPoseSet('d', pose('mc-reps-3', { count: 0 }));
  assert.deepEqual([(await setOf('mc-reps-3')).actualReps, (await setOf('mc-reps-3')).actualDurationSeconds], [0, null], '9. count 0 유효');
  // 10. 최종: 저장 3건만, snapshot(legacy DURATION 포함) 변경 없음
  const final = JSON.parse(raw());
  assert.deepEqual(final.current.session.sets.map(x => [x.routineSetId, x.actualReps, x.actualDurationSeconds]),
    [['mc-reps-1', 16, null], ['mc-reps-2', 20, null], ['mc-reps-3', 0, null]], '10. 저장 결과');
  assert.deepEqual(queued().map(i => i.routineSetId), ['mc-reps-1', 'mc-reps-2', 'mc-reps-3'], '10. AI 결과 큐 = 저장 3건, 거부 항목 없음');
  assert.equal(JSON.stringify(final.current.session.routineSnapshot), originalSnapshot, '10. 기존 snapshot(DURATION 포함) 미변경');
  console.log('PASS: 3-4c mountain-climber REPS commit (actualReps = AI count, duration null, raw payload kept, dedupe) and legacy DURATION / missing·invalid measurementType blocked');
}
