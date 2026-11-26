const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');
function load(file, deps = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/services', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => { if (!(name in deps)) throw Error(name); return deps[name]; }, module, module.exports);
  return module.exports;
}
(async () => {
  const { createPoseCoach } = load('poseCoaching.ts');
  let time = 1000, events = [], speech = [], connected = true;
  const coach = createPoseCoach(event => { events.push(event); return connected; }, text => speech.push(text), () => time, 10000);
  const base = { type: 'frame.result', exercise: 'pushup', ignored: false, tracking: 'tracking', currentCodes: ['HIP_DROP'], lastRepetition: null };
  coach.process({ ...base, ignored: true }); coach.process({ ...base, tracking: 'tracking_unavailable' });
  assert.equal(events.length, 0);
  coach.process(base); coach.process(base); assert.equal(events.length, 1);
  assert.equal(events[0].feedbackCode, 'HIP_DROP');
  time += 10000; connected = false; coach.process(base); assert.equal(speech.length, 1);
  time += 10000; coach.process({ ...base, currentCodes: ['UNKNOWN_CODE'] }); assert.equal(events.length, 2);
  // 07-A 이후 계약: 파이프라인 = ExerciseSessionController 1개 + 분석기 1개. 분석기는 Controller만 호출한다(프레임당 측정 1회)
  const pose = require(path.join(__dirname, '../node_modules/@barofit/pose/runtime/index.js'));
  let queued = [], pauses = [], finishes = 0, analyzerFrames = 0;
  const { createPosePipeline } = load('posePipeline.ts', {
    '@barofit/pose': pose,
    '@/services/poseCoaching': { createPoseCoach },
    '@/services/offlineWorkout': { commitPoseSet: async (...args) => queued.push(args), flushWorkoutQueue: async () => {} },
    '@/services/poseExerciseIds': { poseSupportForSnapshot: () => ({ status: 'supported', poseId: 'pushup' }) },
  });
  const result = { schemaVersion: '2.0', type: 'set.completed', exercise: 'pushup', summary: { exercise: 'pushup', count: 3 } };
  const analyzer = {
    pushFrame: () => { analyzerFrames += 1; return base; },
    breakContinuity: reason => { pauses.push(reason); return []; },
    summary: () => ({ exercise: 'pushup', count: 3 }),
    finish: () => { finishes++; return [result]; },
  };
  const pipeline = createPosePipeline({ analyzer, owner: 'u', sessionId: 's', routineSetId: 'r', resultId: 'id', isOwner: () => true, sendCoach: () => true, speak: () => {} });
  const VISIBLE = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1, 1]);
  const frame = (t) => ({ timestampMs: t, width: 480, height: 640, landmarks: VISIBLE });
  // 신체 인식 안정화(300ms) 전에는 분석기로 보내지 않는다
  let state = pipeline.pushFrame(frame(0));
  assert.equal(state.phase, 'waiting_for_pose');
  assert.equal(state.frameResult, null);
  assert.equal(analyzerFrames, 0);
  for (const t of [100, 200, 300]) state = pipeline.pushFrame(frame(t));
  assert.equal(state.phase, 'active');
  assert.deepEqual(state.frameResult, base, '측정 프레임 결과 = 분석기 결과 그대로(Controller가 JSON 안전 복사)');
  assert.equal(analyzerFrames, 1, 'active 프레임마다 분석기 1회');
  pipeline.pushFrame(frame(400));
  assert.equal(analyzerFrames, 2);
  // 수동 일시정지: Controller가 분석기 연속성을 한 번 끊고, 이후 프레임은 분석기로 가지 않는다(관측은 계속)
  assert.equal(pipeline.pause().phase, 'manually_paused');
  assert.deepEqual(pauses, ['manual_pause']);
  pipeline.pushFrame(frame(500)); pipeline.tick(600);
  assert.equal(analyzerFrames, 2, '일시정지 중 측정 없음');
  // 세트 결과는 한 번만 확정하고, 저장 재시도는 같은 결과·같은 키로 다시 보낸다(멱등)
  assert.deepEqual(await pipeline.finish(), result); await pipeline.finish();
  assert.equal(finishes, 1);
  assert.equal(queued.length, 2);
  assert.deepEqual(queued[0], queued[1]);
  assert.deepEqual(queued[0].slice(0, 1), ['u']);
  assert.equal(queued[0][1].routineSetId, 'r');
  assert.deepEqual(queued[0][1].payload, result);
  assert.throws(() => pipeline.pushFrame(frame(700)), '종료된 세트는 프레임을 받지 않음');
  console.log('PASS: coaching debounce, offline speech, Controller readiness gate and single analyzer call, pause continuity break, result persistence');
})().catch(e => { console.error(e); process.exitCode = 1; });
