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

// ---------- 3-2: 촬영 방향(PD 구상도 근거 종목만) ----------
const { poseBodyView } = m.exports;
assert.equal(poseBodyView('squat'), 'side', 'PD 구상도: 스쿼트 측면');
assert.equal(poseBodyView('plank'), 'side', 'PD 구상도: 플랭크 측면');
// 3-3a: AI팀 기술 문서 근거 (이전에는 jumping-jack도 미확정 목록에 있었음)
assert.equal(poseBodyView('jumping-jack'), 'front', 'AI 문서: 점핑잭 정면');
assert.equal(poseBodyView('leg-raise'), 'side', 'AI 문서: 레그 레이즈 측면');
assert.equal(poseBodyView('pike-push-up'), 'side', 'AI 문서: 파이크 푸시업 측면');
// 3-3b: 인클라인 푸시업만 AI 근거(프로토타입 촬영 안내), 나머지 실험 4종은 근거 없음 → 미확정
assert.equal(poseBodyView('incline-push-up'), 'side', 'AI 프로토타입: 인클라인 푸시업 측면');
// 3-3c: 버드독은 AI 문서 근거(측면에 가까운 구도), 데드버그는 근거 없음 → 미확정
assert.equal(poseBodyView('bird-dog'), 'side', 'AI 문서: 버드독 측면에 가까운 구도');
// 3-3d: 수퍼맨(AI 문서)·런지(AI 프로토타입) 측면. 별개 카탈로그 항목(forward-lunge 등)은 미확정 유지
assert.equal(poseBodyView('superman'), 'side', 'AI 문서: 수퍼맨 측면·사선');
assert.equal(poseBodyView('lunge'), 'side', 'AI 프로토타입: 런지 측면');
for (const id of ['forward-lunge', 'reverse-lunge', 'jumping-lunge']) assert.equal(poseBodyView(id), null, `별개 항목 ${id}`);
for (const id of ['push-up', 'mountain-climber', 'side-plank', 'unknown', 'toString',
  'split-squat', 'bulgarian-split-squat', 'standing-calf-raise', 'side-lying-leg-raise', 'dead-bug']) {
  assert.equal(poseBodyView(id), null, `근거 없는 종목은 미확정: ${id}`);
}
console.log('PASS: 3-2~3-3d body view (squat/plank/leg-raise/pike/incline/bird-dog/superman/lunge side, jumping-jack front, others undecided)');
