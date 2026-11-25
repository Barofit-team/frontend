const fs = require('node:fs'), path = require('node:path'), ts = require('../node_modules/typescript'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../src/services/poseExerciseIds.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const m = { exports: {} }; new Function('module', 'exports', compiled)(m, m.exports);
const { POSE_EXERCISE_IDS: ids, poseExerciseId } = m.exports;
assert.equal(Object.keys(ids).length, 23, '06: 플러터킥 매핑 추가로 최종 23종');
assert.equal(new Set(Object.values(ids)).size, 23);
assert.deepEqual(['jump-squat', 'reverse-crunch', 'burpee', 'sit-up'].map(poseExerciseId), ['jump_squat', 'reverse_crunch', 'burpee', 'situp'], '05: Routine V5 ID → AI ID');
assert.equal(poseExerciseId('flutter-kick'), 'flutter_kicks', '06: Routine V15 REPS → AI flutter_kicks');
assert.equal(poseExerciseId('push-up'), 'pushup');
assert.equal(poseExerciseId('pike-push-up'), 'pike_pushup');
assert.equal(poseExerciseId('incline-push-up'), 'incline_pushup');
assert.equal(poseExerciseId('forward-lunge'), null);
assert.equal(poseExerciseId('toString'), null);
console.log('PASS: 23 explicit routine-to-pose IDs; unsupported variants rejected');

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
// 3-4c: 마운틴 클라이머 정적 ID는 supported, 실제 snapshot 측정 유형 계약은 poseSupportForSnapshot으로 별도 검증
assert.deepEqual(poseSupport('mountain-climber'), { status: 'supported', poseId: 'mountain_climber' }, '정적 ID 지원');
const { poseSupportForSnapshot } = m.exports;
assert.deepEqual(poseSupportForSnapshot('mountain-climber', 'REPS'), { status: 'supported', poseId: 'mountain_climber' }, 'V13 REPS snapshot');
assert.deepEqual(poseSupportForSnapshot('mountain-climber', 'DURATION'), { status: 'conflict', poseId: 'mountain_climber' }, 'legacy DURATION snapshot');
for (const bad of [undefined, null, '', 'reps', 'TIME', 20, {}]) {
  assert.deepEqual(poseSupportForSnapshot('mountain-climber', bad), { status: 'conflict', poseId: 'mountain_climber' }, `측정 유형 누락·잘못된 값 ${JSON.stringify(bad)}`);
}
// 다른 종목의 지원 상태는 snapshot 계약 함수에서도 바뀌지 않음
for (const [routineId, poseId] of Object.entries(SUPPORTED_16)) {
  for (const type of ['REPS', 'DURATION']) assert.deepEqual(poseSupportForSnapshot(routineId, type), { status: 'supported', poseId }, `${routineId} ${type}`);
}
// 04: 사이드 플랭크 supported. DURATION snapshot만 supported, 그 외(REPS·누락·잘못된 값)는 conflict
assert.deepEqual(poseSupportForSnapshot('side-plank', 'DURATION'), { status: 'supported', poseId: 'side_plank' }, 'side-plank DURATION snapshot');
for (const bad of ['REPS', undefined, null, '', 'duration', 'TIME', 20, {}]) {
  assert.deepEqual(poseSupportForSnapshot('side-plank', bad), { status: 'conflict', poseId: 'side_plank' }, `side-plank 측정 유형 ${JSON.stringify(bad)}`);
}
// 05: 실험 카운터 4종은 REPS snapshot만 supported, 그 외 conflict
const PILOTS = { 'jump-squat': 'jump_squat', 'reverse-crunch': 'reverse_crunch', burpee: 'burpee', 'sit-up': 'situp', 'flutter-kick': 'flutter_kicks' };
for (const [id, poseId] of Object.entries(PILOTS)) {
  assert.deepEqual(poseSupportForSnapshot(id, 'REPS'), { status: 'supported', poseId }, `${id} REPS`);
  for (const bad of ['DURATION', undefined, null, '', 'reps', 'TIME', 20, {}]) {
    assert.deepEqual(poseSupportForSnapshot(id, bad), { status: 'conflict', poseId }, `${id} 측정 유형 ${JSON.stringify(bad)}`);
  }
}
assert.deepEqual(poseSupportForSnapshot('flutter-kick', 'duration'), { status: 'conflict', poseId: 'flutter_kicks' }, '06: 소문자 duration도 conflict');
for (const type of ['REPS', 'DURATION']) {
  for (const id of ['forward-lunge', 'pushup', 'toString']) assert.deepEqual(poseSupportForSnapshot(id, type), { status: 'unknown', poseId: null }, id);
}
assert.equal(poseExerciseId('mountain-climber'), 'mountain_climber', '기존 17종 매핑(결과 검증용)은 유지');
assert.deepEqual(poseSupport('side-plank'), { status: 'supported', poseId: 'side_plank' }, '04: 사이드 플랭크 정적 지원');
assert.equal(poseExerciseId('side-plank'), 'side_plank', '3-4d: 사이드 플랭크 정적 매핑');
for (const [id, poseId] of Object.entries(PILOTS)) assert.deepEqual(poseSupport(id), { status: 'supported', poseId }, `05: ${id} 정적 지원`);
// 06 이후 23종 모두 supported. 지원 목록 밖 ID는 계속 unknown(분석기·readiness 미연결)
assert.deepEqual(Object.keys(ids).filter((id) => poseSupport(id).status === 'supported').length, 23, '06: 실제 supported 23종');
for (const id of ['forward-lunge', 'reverse-lunge', 'jumping-lunge', 'march-in-place', 'pushup', 'side_plank', 'toString', '']) {
  assert.deepEqual(poseSupport(id), { status: 'unknown', poseId: null }, `미확인 ID ${JSON.stringify(id)}`);
}
// 상태 분류는 23종 + 미확인 ID로 완결 (assessmentStatus를 입력으로 받지 않음)
assert.equal(poseSupport.length, 1, 'poseSupport는 Routine exerciseId만 입력으로 받는다');

const { READINESS_PROFILES } = require('../node_modules/@barofit/pose/runtime/index.js');
const hasProfile = (poseId) => Object.prototype.hasOwnProperty.call(READINESS_PROFILES, poseId);
assert.deepEqual(readinessAvailability('squat', hasProfile), { availability: 'available', poseId: 'squat' });
assert.deepEqual(readinessAvailability('push-up', hasProfile), { availability: 'available', poseId: 'pushup' });
assert.deepEqual(readinessAvailability('mountain-climber', hasProfile, 'REPS'), { availability: 'available', poseId: 'mountain_climber' }, 'V13 REPS: 자기 AI 프로필');
assert.deepEqual(readinessAvailability('mountain-climber', hasProfile, 'DURATION'), { availability: 'contract_conflict', poseId: 'mountain_climber' }, 'legacy DURATION');
assert.deepEqual(readinessAvailability('mountain-climber', hasProfile), { availability: 'contract_conflict', poseId: 'mountain_climber' }, '측정 유형 누락');
assert.deepEqual(readinessAvailability('mountain-climber', hasProfile, 'TIME'), { availability: 'contract_conflict', poseId: 'mountain_climber' }, '잘못된 측정 유형');
assert.deepEqual(readinessAvailability('mountain-climber', () => false, 'REPS'), { availability: 'profile_unsupported', poseId: null }, '프로필 없으면 다른 프로필로 대체하지 않음');
assert.ok(hasProfile('mountain_climber'), '현재 AI readiness 프로필 존재 mountain_climber');
// 3-4d: Pose 49762dd부터 AI READINESS_PROFILES.side_plank가 존재한다(either·full 6관절 + 반대쪽 어깨 검사).
// 04: FE 지원 전환 후 DURATION snapshot은 AI side_plank 프로필로 readiness 실행, 그 외 snapshot은 contract_conflict
assert.equal(hasProfile('side_plank'), true, 'AI side_plank readiness 프로필 존재(49762dd)');
assert.deepEqual(JSON.parse(JSON.stringify(READINESS_PROFILES.side_plank)), { mode: 'either', joints: ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'] });
assert.deepEqual(readinessAvailability('side-plank', hasProfile, 'DURATION'), { availability: 'available', poseId: 'side_plank' }, 'side-plank DURATION readiness');
for (const type of ['REPS', 'TIME']) {
  assert.deepEqual(readinessAvailability('side-plank', hasProfile, type), { availability: 'contract_conflict', poseId: 'side_plank' }, `side-plank readiness ${type}`);
}
assert.deepEqual(readinessAvailability('side-plank', hasProfile), { availability: 'contract_conflict', poseId: 'side_plank' }, '측정 유형 누락');
assert.deepEqual(readinessAvailability('side-plank', () => false, 'DURATION'), { availability: 'profile_unsupported', poseId: null }, '프로필 없으면 다른 프로필로 대체하지 않음');
for (const [id, poseId] of Object.entries(PILOTS)) {
  assert.deepEqual(readinessAvailability(id, hasProfile, 'REPS'), { availability: 'available', poseId }, `${id} readiness`);
  assert.deepEqual(readinessAvailability(id, hasProfile, 'DURATION'), { availability: 'contract_conflict', poseId }, `${id} DURATION snapshot`);
  assert.ok(hasProfile(poseId), `AI readiness 프로필 존재 ${poseId}`);
}
for (const type of ['REPS', 'DURATION', undefined]) {
  assert.deepEqual(readinessAvailability('scissor-kick', hasProfile, type), { availability: 'analyzer_unsupported', poseId: null }, '지원 목록 밖 ID는 readiness 미연결');
}
assert.deepEqual(readinessAvailability('forward-lunge', hasProfile), { availability: 'analyzer_unsupported', poseId: null });
assert.deepEqual(readinessAvailability(undefined, hasProfile), { availability: 'analyzer_unsupported', poseId: null });
assert.deepEqual(readinessAvailability('squat', () => false), { availability: 'profile_unsupported', poseId: null }, '분석기는 있어도 프로필이 없으면 다른 프로필을 쓰지 않음');
for (const poseId of Object.values(SUPPORTED_16)) assert.ok(hasProfile(poseId), `현재 AI readiness 프로필 존재 ${poseId}`);
console.log('PASS: 3-1a/3-4c/04/05/06 support states (23 static supported, mountain-climber·5 pilots REPS-only / side-plank DURATION-only snapshot contract / unknown) and readiness availability');

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
// 3-4a: 글루트 브리지 측면(AI 문서)
assert.equal(poseBodyView('glute-bridge'), 'side', 'AI 문서: 글루트 브리지 측면·전신');
assert.equal(poseBodyView('mountain-climber'), 'side', 'AI 문서: 마운틴 클라이머 전신 측면(MOUNTAIN_CLIMBER_V01)');
// 05: AI 문서(FIVE_EXERCISE_RUNTIME) 점프 스쿼트·리버스 크런치·싯업 "측면·사선", 버피 "전신 측면. 정면 미지원"
for (const id of ['jump-squat', 'reverse-crunch', 'burpee', 'sit-up']) assert.equal(poseBodyView(id), 'side', `AI 문서: ${id} 측면`);
assert.equal(poseBodyView('flutter-kick'), 'side', 'AI 문서: 플러터킥 양측 관절이 보이는 측면·사선');
for (const id of ['push-up', 'side-plank', 'unknown', 'toString',
  'split-squat', 'bulgarian-split-squat', 'standing-calf-raise', 'side-lying-leg-raise', 'dead-bug']) {
  assert.equal(poseBodyView(id), null, `근거 없는 종목은 미확정: ${id}`);
}
console.log('PASS: 3-2~3-4c body view (squat/plank/leg-raise/pike/incline/bird-dog/superman/lunge/glute-bridge/mountain-climber side, jumping-jack front, others undecided)');
