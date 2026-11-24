const fs = require('node:fs'), path = require('node:path'), ts = require('../node_modules/typescript'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../src/services/poseExerciseIds.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const m = { exports: {} }; new Function('module', 'exports', compiled)(m, m.exports);
const { POSE_EXERCISE_IDS: ids, poseExerciseId } = m.exports;
assert.equal(Object.keys(ids).length, 17);
assert.equal(new Set(Object.values(ids)).size, 17);
assert.equal(poseExerciseId('push-up'), 'pushup');
assert.equal(poseExerciseId('pike-push-up'), 'pike_pushup');
assert.equal(poseExerciseId('incline-push-up'), 'incline_pushup');
assert.equal(poseExerciseId('forward-lunge'), null);
assert.equal(poseExerciseId('toString'), null);
console.log('PASS: 17 explicit routine-to-pose IDs; unsupported variants rejected');

// ---------- 3-1a: 23종 지원 상태 · readiness 가능 여부 ----------
// (구현 전에는 poseSupport/readinessAvailability가 없어 실패해야 한다)
const { poseSupport, readinessAvailability } = m.exports;
assert.equal(typeof poseSupport, 'function', '3-1a: poseSupport가 있어야 합니다');
const SUPPORTED_16 = {
  'push-up': 'pushup', plank: 'plank', squat: 'squat', 'bird-dog': 'bird_dog', 'jumping-jack': 'jumping_jack',
  'leg-raise': 'leg_raise', 'glute-bridge': 'glute_bridge', 'pike-push-up': 'pike_pushup', superman: 'superman',
  lunge: 'lunge', 'split-squat': 'split_squat', 'bulgarian-split-squat': 'bulgarian_split_squat',
  'incline-push-up': 'incline_pushup', 'side-lying-leg-raise': 'side_lying_leg_raise',
  'standing-calf-raise': 'standing_calf_raise', 'dead-bug': 'dead_bug',
};
for (const [routineId, poseId] of Object.entries(SUPPORTED_16)) {
  assert.deepEqual(poseSupport(routineId), { status: 'supported', poseId }, routineId);
  assert.equal(poseExerciseId(routineId), poseId, `기존 매핑 보존 ${routineId}`);
}
assert.deepEqual(poseSupport('mountain-climber'), { status: 'conflict', poseId: 'mountain_climber' });
assert.equal(poseExerciseId('mountain-climber'), 'mountain_climber', '기존 17종 매핑(결과 검증용)은 유지');
assert.deepEqual(poseSupport('side-plank'), { status: 'incomplete', poseId: 'side_plank' });
assert.equal(poseExerciseId('side-plank'), null, '사이드 플랭크는 FE 매핑에 추가하지 않음');
for (const id of ['jump-squat', 'reverse-crunch', 'flutter-kick', 'burpee', 'sit-up']) {
  assert.deepEqual(poseSupport(id), { status: 'not_implemented', poseId: null }, id);
}
for (const id of ['forward-lunge', 'reverse-lunge', 'jumping-lunge', 'march-in-place', 'pushup', 'side_plank', 'toString', '']) {
  assert.deepEqual(poseSupport(id), { status: 'unknown', poseId: null }, `미확인 ID ${JSON.stringify(id)}`);
}
// 상태 분류는 23종 + 미확인 ID로 완결 (assessmentStatus를 입력으로 받지 않음)
assert.equal(poseSupport.length, 1, 'poseSupport는 Routine exerciseId만 입력으로 받는다');

const { READINESS_PROFILES } = require('../node_modules/@barofit/pose/runtime/index.js');
const hasProfile = (poseId) => Object.prototype.hasOwnProperty.call(READINESS_PROFILES, poseId);
assert.deepEqual(readinessAvailability('squat', hasProfile), { availability: 'available', poseId: 'squat' });
assert.deepEqual(readinessAvailability('push-up', hasProfile), { availability: 'available', poseId: 'pushup' });
assert.deepEqual(readinessAvailability('mountain-climber', hasProfile), { availability: 'contract_conflict', poseId: 'mountain_climber' });
assert.deepEqual(readinessAvailability('side-plank', hasProfile), { availability: 'profile_unsupported', poseId: null });
assert.deepEqual(readinessAvailability('burpee', hasProfile), { availability: 'analyzer_unsupported', poseId: null });
assert.deepEqual(readinessAvailability('forward-lunge', hasProfile), { availability: 'analyzer_unsupported', poseId: null });
assert.deepEqual(readinessAvailability(undefined, hasProfile), { availability: 'analyzer_unsupported', poseId: null });
assert.deepEqual(readinessAvailability('squat', () => false), { availability: 'profile_unsupported', poseId: null }, '분석기는 있어도 프로필이 없으면 다른 프로필을 쓰지 않음');
for (const poseId of Object.values(SUPPORTED_16)) assert.ok(hasProfile(poseId), `현재 AI readiness 프로필 존재 ${poseId}`);
console.log('PASS: 3-1a support states (16 supported / conflict / incomplete / 5 not_implemented / unknown) and readiness availability');
