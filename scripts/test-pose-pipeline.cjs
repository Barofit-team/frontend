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
  let queued = [], pauses = 0, finishes = 0;
  const { createPosePipeline } = load('posePipeline.ts', {
    '@/services/poseCoaching': { createPoseCoach },
    '@/services/offlineWorkout': { commitPoseSet: async (...args) => queued.push(args), flushWorkoutQueue: async () => {} },
  });
  const result = { schemaVersion: '2.0', type: 'set.completed', exercise: 'pushup', summary: { count: 3 } };
  const pipeline = createPosePipeline({ analyzer: { pushFrame: () => base, breakContinuity: reason => { assert.equal(reason, 'pause'); pauses++; }, finish: () => { finishes++; return [result]; } }, owner: 'u', sessionId: 's', routineSetId: 'r', resultId: 'id', isOwner: () => true, sendCoach: () => true, speak: () => {} });
  assert.equal(pipeline.pushFrame({}), base); pipeline.pause();
  assert.equal(await pipeline.finish(), result); await pipeline.finish();
  assert.equal(finishes, 1); assert.equal(pauses, 1);
  assert.deepEqual(queued[0], queued[1]);
  assert.throws(() => pipeline.pushFrame({}));
  console.log('PASS: coaching debounce, offline speech, analyzer pause and result persistence');
})().catch(e => { console.error(e); process.exitCode = 1; });
