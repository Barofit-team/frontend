// F04 자동 일시정지 1단계: 상태 모델 + 신호 어댑터 순수 로직 테스트 (가짜 tracking 이벤트만 사용)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');
function load(file) {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`));
    throw Error(`unexpected import: ${name}`);
  }, module, module.exports);
  return module.exports;
}
const src = path.join(__dirname, '../src');
const M = load(path.join(src, 'components/workout-session/autoPauseMachine.ts'));
const A = load(path.join(src, 'services/trackingSignalAdapter.ts'));
const ev = type => ({ type });
const run = (state, ...types) => types.reduce((s, t) => M.transitionAutoPause(s, ev(t)).state, state);

let r;
// 1. 정상 추적 → 인식 이탈
r = M.transitionAutoPause('TRACKING', ev('TRACKING_LOST'));
assert.deepEqual(r, { state: 'LOST', changed: true });
assert.equal(M.isAutoPaused(r.state), true);

// 2. 인식 이탈 → 재인식 → 복귀 완료
r = M.transitionAutoPause('LOST', ev('TRACKING_RECOVERED'));
assert.deepEqual(r, { state: 'RECOVERING', changed: true });
assert.equal(M.isAutoPaused('RECOVERING'), true);
r = M.transitionAutoPause('RECOVERING', ev('RECOVERY_COMPLETED'));
assert.deepEqual(r, { state: 'TRACKING', changed: true });
assert.equal(M.isAutoPaused('TRACKING'), false);

// 3. 복귀 중 다시 인식 이탈 / 복귀 취소
assert.deepEqual(M.transitionAutoPause('RECOVERING', ev('TRACKING_LOST')), { state: 'LOST', changed: true });
assert.deepEqual(M.transitionAutoPause('RECOVERING', ev('RECOVERY_CANCELLED')), { state: 'LOST', changed: true });

// 4. 동일 이벤트 중복 입력 → 변화 없음
assert.deepEqual(M.transitionAutoPause('LOST', ev('TRACKING_LOST')), { state: 'LOST', changed: false });
assert.deepEqual(M.transitionAutoPause('RECOVERING', ev('TRACKING_RECOVERED')), { state: 'RECOVERING', changed: false });
assert.deepEqual(M.transitionAutoPause('TRACKING', ev('TRACKING_RECOVERED')), { state: 'TRACKING', changed: false });
assert.equal(run('TRACKING', 'TRACKING_LOST', 'TRACKING_LOST', 'TRACKING_LOST'), 'LOST');

// 5. 잘못된 순서의 이벤트 → 무시
assert.deepEqual(M.transitionAutoPause('TRACKING', ev('RECOVERY_COMPLETED')), { state: 'TRACKING', changed: false });
assert.deepEqual(M.transitionAutoPause('LOST', ev('RECOVERY_COMPLETED')), { state: 'LOST', changed: false });
assert.deepEqual(M.transitionAutoPause('TRACKING', ev('RECOVERY_CANCELLED')), { state: 'TRACKING', changed: false });
assert.deepEqual(M.transitionAutoPause('LOST', ev('RECOVERY_CANCELLED')), { state: 'LOST', changed: false });

// 6. reset 후 초기화
for (const s of ['TRACKING', 'LOST', 'RECOVERING']) assert.equal(M.transitionAutoPause(s, ev('RESET')).state, M.INITIAL_AUTO_PAUSE_STATE);
assert.equal(M.INITIAL_AUTO_PAUSE_STATE, 'TRACKING');

// 어댑터: 기본 해석기는 실제 AI 신호가 없으므로 항상 unknown (존재하지 않는 신호를 성공으로 간주하지 않음)
const real = A.createTrackingSignalAdapter({ analyzerSupported: true });
for (const t of ['tracking', 'selecting_side', 'tracking_unavailable']) {
  const sig = real.fromFrameResult({ schemaVersion: '2.0', type: 'frame.result', tracking: t });
  assert.deepEqual(sig, { user: 'unknown', camera: 'available', analyzer: 'supported' });
  assert.equal(M.eventFromSignal(sig), null);
}

// 가짜 해석기로 신호 → 이벤트 → 상태 흐름
const fake = A.createTrackingSignalAdapter({ analyzerSupported: true, interpretUser: f => f.fakeUser });
assert.deepEqual(M.eventFromSignal(fake.fromFrameResult({ fakeUser: 'lost' })), ev('TRACKING_LOST'));
assert.deepEqual(M.eventFromSignal(fake.fromFrameResult({ fakeUser: 'present' })), ev('TRACKING_RECOVERED'));

// 7. 카메라 미가용 ≠ tracking lost
const noFrame = fake.noFrames();
assert.deepEqual(noFrame, { user: 'unknown', camera: 'no_frames', analyzer: 'supported' });
assert.equal(M.eventFromSignal(noFrame), null);
assert.equal(M.eventFromSignal({ user: 'present', camera: 'no_frames', analyzer: 'supported' }), null); // 프레임 없이는 복귀로도 보지 않음

// 8. 분석기 미지원 ≠ tracking lost, LOST에 갇히지 않음
const unsupported = A.createTrackingSignalAdapter({ analyzerSupported: false, interpretUser: () => 'lost' });
const us = unsupported.fromFrameResult({});
assert.deepEqual(us, { user: 'unknown', camera: 'available', analyzer: 'unsupported' });
assert.deepEqual(M.eventFromSignal(us), ev('RESET'));
assert.deepEqual(M.eventFromSignal(unsupported.noFrames()), ev('RESET'));
assert.deepEqual(M.transitionAutoPause('LOST', M.eventFromSignal(us)), { state: 'TRACKING', changed: true });
assert.deepEqual(M.transitionAutoPause('TRACKING', M.eventFromSignal(us)), { state: 'TRACKING', changed: false });

console.log('auto-pause machine: all tests passed');
