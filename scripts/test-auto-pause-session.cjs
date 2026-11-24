/**
 * F04 자동 일시정지 2·3단계 통합 테스트
 *  - 2단계: 인식 이탈(LOST) 시 실제 세션 타이머 정지·남은 시간 보존
 *  - 3단계: Figma 자동 일시정지 화면(AutoPauseOverlay) → 재인식 → 복귀 5초(실제 SessionStage PhaseTimer) → 재개
 *
 * 하니스는 test-m10-session-stall.cjs 기반. 실제 코드로 실행:
 *  - workout-session.tsx, SessionStage.tsx(복귀 카운트다운 포함), PhaseTimer.tsx, useCountdown.ts, sessionFlow.ts,
 *    autoPauseMachine.ts, trackingSignalAdapter.ts, posePipeline.ts + @barofit/pose 실제 Squat/Plank 분석기, offlineWorkout.ts
 * 표시 전용 stub(props 기록): AutoPauseOverlay, SessionHud, SessionStatusPill, PauseView, StopConfirmSheet
 * 테스트 전용:
 *  - trackingSignalAdapter의 해석기만 testTracking.user 값을 돌려주도록 주입. 실제 AI 신호가 아니며,
 *    상태 전환·타이머·복귀 카운트다운은 하니스에서 구현하지 않는다.
 *  - AppState 리스너 수집(백그라운드), AsyncStorage.setItem 대기 게이트(세트 완료 저장 경합 재현)
 */
'use strict';
const { describe, test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const nm = (p) => path.join(ROOT, 'node_modules', p);
const ts = require(nm('typescript'));

// ---------- 네트워크 차단 ----------
const network = { attempts: [] };
global.fetch = async (url) => { network.attempts.push(String(url)); throw new Error('NETWORK_BLOCKED'); };
global.WebSocket = class { constructor(url) { network.attempts.push(String(url)); throw new Error('NETWORK_BLOCKED'); } };
global.__DEV__ = false;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require(nm('react'));
const { createRoot } = require(nm('react-dom/client'));
const { create } = require(nm('zustand'));
const { act } = React;

// ---------- 호스트 요소 없는 최소 DOM 컨테이너 ----------
const fakeWindow = { HTMLIFrameElement: class {}, addEventListener() {}, removeEventListener() {} };
const fakeDocument = {
  nodeType: 9, defaultView: fakeWindow, activeElement: null, documentElement: {},
  addEventListener() {}, removeEventListener() {},
  createElement() { throw new Error('HARNESS: 호스트 요소가 생성되면 안 됩니다'); },
  createTextNode() { throw new Error('HARNESS: 텍스트 노드가 생성되면 안 됩니다'); },
};
// react-dom이 이벤트 우선순위 계산에 window.event를 읽는다. document는 넣지 않아 canUseDOM=false 유지
global.window = fakeWindow;
function makeContainer() {
  return { nodeType: 1, tagName: 'DIV', nodeName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: fakeDocument, textContent: '', firstChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {} };
}

// ---------- 기록용 mock ----------
const ui = { stage: null, camera: null, completeRenders: 0, view: null, overlay: null, hud: null };
const alerts = [];
const nav = [];
let routeParams = {};
const disk = new Map();
const appStateListeners = new Set();
/** 테스트 전용 tracking 신호. null이면 실제 기본 해석기('unknown')를 그대로 사용 */
const testTracking = { user: null };
/** 설정되면 AsyncStorage.setItem이 해제될 때까지 대기 (세트 완료 저장 경합 재현용) */
let diskGate = null;

const passthrough = ({ children }) => children ?? null;
const nothing = () => null;
const mocks = {
  'react-native': {
    View: passthrough, Text: nothing, Pressable: nothing,
    StyleSheet: { create: (s) => s, absoluteFill: {} },
    Alert: { alert: (title, message, buttons) => { alerts.push({ title, message, buttons }); } },
    AppState: { addEventListener: (type, fn) => { appStateListeners.add(fn); return { remove() { appStateListeners.delete(fn); } }; } },
    BackHandler: { addEventListener: () => ({ remove() {} }) },
  },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
  'expo-router': {
    router: { canGoBack: () => true, back: () => nav.push('back'), replace: (to) => nav.push(`replace:${to}`) },
    useLocalSearchParams: () => routeParams,
  },
  'expo-status-bar': { StatusBar: nothing },
  'expo-crypto': { randomUUID: () => nodeCrypto.randomUUID() },
  '@react-native-async-storage/async-storage': {
    __esModule: true,
    default: { getItem: async (k) => disk.get(k) ?? null, setItem: async (k, v) => { if (diskGate) await diskGate.promise; disk.set(k, v); } },
  },
};

class ApiError extends Error {
  constructor(status, code = 'NETWORK_ERROR', detail = 'offline') { super(detail); this.status = status; this.code = code; }
}
const stores = {
  auth: create(() => ({ user: { id: 'user-0' } })),
  tts: create(() => ({ socketStatus: 'disconnected', sendCoachEvent: () => false, playSpeech: () => {} })),
  today: create(() => ({ sessions: [], routineSnapshot: null })),
  result: create(() => ({ openApiSession: () => {} })),
};
const sourceMocks = {
  'components/workout-preparation/palette': { PrepColors: { cameraBackground: '#000' } },
  'components/workout-session/sessionPalette': { SessionColors: { base: '#000' } },
  // 실제 SessionStage(복귀 5초 PhaseTimer 포함)를 실행하고 props만 기록. 표시 전용 하위 컴포넌트만 기록용 stub
  'components/workout-session/SessionStage': {
    SessionStage: (props) => {
      ui.stage = props; ui.view = 'stage';
      return load(path.join(SRC, 'components/workout-session/SessionStage.tsx')).SessionStage(props);
    },
  },
  'components/workout-session/AutoPauseOverlay': { AutoPauseOverlay: (props) => { ui.overlay = props; ui.view = 'overlay'; return null; } },
  'components/workout-session/SessionHud': { SessionHud: (props) => { ui.hud = props.content; return null; } },
  'components/workout-session/SessionStatusPill': { SessionStatusPill: () => null },
  'components/workout-session/PauseView': { PauseView: () => null },
  'components/workout-session/StopConfirmSheet': { StopConfirmSheet: () => null },
  'components/workout-session/ExerciseCameraArea': { ExerciseCameraArea: (props) => { ui.camera = props; return null; } },
  'components/workout-session/WorkoutCompleteView': { WorkoutCompleteView: () => { ui.completeRenders += 1; return null; } },
  'services/api': { ApiError, apiFetch: async (p) => { network.attempts.push(`apiFetch:${p}`); throw new ApiError(0); } },
  'services/ttsService': { connectSessionCoach: async () => { throw new Error('offline'); } },
  'stores/useAuthStore': { useAuthStore: stores.auth },
  'stores/useTtsStore': { useTtsStore: stores.tts },
  'stores/useTodayRoutineStore': { useTodayRoutineStore: stores.today },
  'stores/useWorkoutResultStore': { useWorkoutResultStore: stores.result },
  // 실제 어댑터 모듈을 쓰되, 테스트에서만 해석기를 가짜로 주입한다 (실제 AI 신호로 간주하지 않음)
  'services/trackingSignalAdapter': {
    get createTrackingSignalAdapter() {
      const real = load(path.join(SRC, 'services/trackingSignalAdapter.ts'));
      return (options) => {
        if (testTracking.user === null) return real.createTrackingSignalAdapter(options);
        const fake = () => testTracking.user;
        return real.createTrackingSignalAdapter({ ...options, interpretUser: fake, interpretPausedFrame: fake });
      };
    },
  },
};
const realSources = new Set([
  'app/workout-session',
  'components/workout-session/PhaseTimer', 'components/workout-session/useCountdown',
  'components/workout-session/sessionFlow', 'components/workout-session/sessionConfig',
  'components/workout-session/sessionProgress',
  'services/offlineWorkout', 'services/workoutSessionService', 'services/posePipeline',
  'services/poseCoaching', 'services/poseExerciseIds', 'stores/useWorkoutDraftStore',
  // 자동 일시정지 2단계에서 화면이 import (기본 어댑터는 'unknown'만 반환 → M10 시나리오 동작 불변)
  'components/workout-session/autoPauseMachine', 'services/trackingSignalAdapter',
]);
const realPackages = {
  react: () => require(nm('react')),
  'react/jsx-runtime': () => require(nm('react/jsx-runtime')),
  zustand: () => require(nm('zustand')),
  '@barofit/pose': () => poseModule,
};

// 실제 분석기. breakContinuity 호출 횟수만 기록하고 원래 동작을 그대로 실행
const poseModule = require(nm('@barofit/pose/runtime/index.js'));
const breakCalls = [];
for (const name of ['SquatAnalyzer', 'PlankAnalyzer']) {
  const proto = poseModule[name].prototype;
  const original = proto.breakContinuity;
  proto.breakContinuity = function (...args) { breakCalls.push(`${name}:${args[0]}`); return original.apply(this, args); };
}
/**
 * 3-1b 테스트 전용: 실제 분석기 출력의 count/holdSeconds만 지정한 값으로 덮어쓴다(null이면 실제 출력 그대로).
 * 측정 알고리즘을 흉내 내지 않으며, 화면·세트 종료가 두 값을 어떻게 쓰는지만 검증한다.
 */
const testMeasure = { value: null };
for (const name of ['SquatAnalyzer', 'PlankAnalyzer', 'MountainClimberAnalyzer']) {
  const proto = poseModule[name].prototype;
  const original = proto.pushFrame;
  proto.pushFrame = function (...args) {
    const output = original.apply(this, args);
    return testMeasure.value ? { ...output, ...testMeasure.value } : output;
  };
}

// ---------- TypeScript 소스 로더 ----------
const cache = new Map();
function resolveSource(spec, from) {
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) if (fs.existsSync(base + ext)) return base + ext;
  throw new Error(`HARNESS: 소스를 찾을 수 없음 ${spec}`);
}
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  cache.set(file, module);
  const localRequire = (spec) => {
    if (Object.prototype.hasOwnProperty.call(mocks, spec)) return mocks[spec];
    if (Object.prototype.hasOwnProperty.call(realPackages, spec)) return realPackages[spec]();
    const resolved = resolveSource(spec, file);
    if (!resolved) throw new Error(`HARNESS: 예상하지 못한 의존성 ${spec}`);
    const key = path.relative(SRC, resolved).replace(/\.(tsx|ts)$/, '').split(path.sep).join('/');
    if (Object.prototype.hasOwnProperty.call(sourceMocks, key)) return sourceMocks[key];
    if (!realSources.has(key)) throw new Error(`HARNESS: 허용하지 않은 소스 의존성 ${key}`);
    return load(resolved);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
}
const src = (rel) => load(path.join(SRC, rel));
const WorkoutSessionScreen = src('app/workout-session.tsx').default;
const offline = src('services/offlineWorkout.ts');
const { createExerciseAnalyzer } = src('services/posePipeline.ts');
const { useWorkoutDraftStore } = src('stores/useWorkoutDraftStore.ts');
const { START_COUNTDOWN_SECONDS, EXERCISE_DURATION_SECONDS, RESUME_COUNTDOWN_SECONDS } = src('components/workout-session/sessionConfig.ts');

// ---------- 시나리오 도구 ----------
let owner = 'user-0';
let ownerSeq = 0;
let frameClock = 0;
let feedFrames = false;

function routine({ exerciseId, measurementType, sets }) {
  const exercise = {
    id: nodeCrypto.randomUUID(), exerciseId, name: exerciseId, measurementType, order: 1,
    preparation: '', instructions: '', precautions: '', introTtsText: '',
    sets: sets.map((s, i) => ({ id: nodeCrypto.randomUUID(), order: i + 1, targetReps: s.reps ?? null,
      targetDurationSeconds: s.seconds ?? null, weightKg: 0, restSeconds: s.rest ?? 10 })),
  };
  const snapshot = { id: nodeCrypto.randomUUID(), name: 'M10', description: null, difficulty: 'BEGINNER', type: 'USER',
    templateId: null, category: null, exercises: [exercise], createdAt: '2026-11-23T00:00:00Z', updatedAt: '2026-11-23T00:00:00Z' };
  const first = exercise.sets[0];
  const sessions = [{ id: exercise.id, exerciseId, name: exerciseId, partAndLevel: '', sets: exercise.sets.length,
    defaultSets: exercise.sets.length, reps: (measurementType === 'DURATION' ? first.targetDurationSeconds : first.targetReps) ?? 0,
    defaultReps: 0, restSeconds: first.restSeconds, measurementType }];
  return { snapshot, sessions, exercise };
}

async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((r) => setImmediate(r)); });
}
function pushEmptyFrame() {
  if (!feedFrames || !ui.camera?.onPoseFrame) return;
  frameClock += 100;
  ui.camera.onPoseFrame({ timestampMs: frameClock, width: 480, height: 640, landmarks: [] }, { frameId: frameClock, inferenceMs: 1 });
}
/** 가짜 시계를 250ms씩 진행. feedFrames면 단계마다 빈 관절 프레임(사람 미검출)을 넣는다. */
async function advance(ms) {
  for (let t = 0; t < ms; t += 250) {
    await act(async () => { pushEmptyFrame(); pushEmptyFrame(); mock.timers.tick(250); });
    await settle();
  }
}
async function mount(params = {}) {
  routeParams = params;
  ui.stage = null; ui.camera = null;
  const root = createRoot(makeContainer());
  liveRoots.add(root);
  await act(async () => { root.render(React.createElement(WorkoutSessionScreen)); });
  await settle();
  assert.ok(ui.stage, 'HARNESS: 세션 화면(SessionStage)이 준비되지 않았습니다');
  return root;
}
const liveRoots = new Set();
async function unmount(root) { liveRoots.delete(root); await act(async () => { root.unmount(); }); await settle(); }
async function startWith(fixture) {
  stores.today.setState({ sessions: fixture.sessions, routineSnapshot: fixture.snapshot });
  const root = await mount();
  assert.equal(ui.stage.phase.kind, 'countdown', 'HARNESS: 시작 카운트다운이 아닙니다');
  await advance(START_COUNTDOWN_SECONDS * 1000 + 250);
  assert.equal(ui.stage.phase.kind, 'exercising', 'HARNESS: 운동 단계로 넘어가지 않았습니다');
  return root;
}
const stallAlerts = () => alerts.filter((a) => a.title === '자세 측정 연결 대기');
/** 실제 SessionStage처럼: 탭 잠금(400ms) 이후 재개 → 5초 카운트다운 → onFinishResume */
async function resumeLikeUser() {
  await advance(500);
  await act(async () => { ui.stage.onPressResume(); });
  await settle();
  assert.equal(ui.stage.pause, 'resuming', 'HARNESS: 재개 카운트다운 상태가 아닙니다');
  await advance(RESUME_COUNTDOWN_SECONDS * 1000 + 250); // 실제 SessionStage의 복귀 PhaseTimer가 onFinishResume 호출
  assert.ok(!(ui.view === 'stage' && ui.stage.pause === 'resuming'), 'HARNESS: 재개 카운트다운이 끝나지 않았습니다');
}
async function localSession() { return (await offline.getLocalWorkout(owner))?.session ?? null; }
async function storedQueue() { return JSON.parse(disk.get(`barofit.workout.v1.${owner}`) ?? '{"queue":[]}').queue; }


beforeEach(() => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: Date.parse('2026-11-23T03:00:00Z') });
  ownerSeq += 1; owner = `ap-user-${ownerSeq}`;
  stores.auth.setState({ user: { id: owner } });
  useWorkoutDraftStore.setState({ draft: null });
  alerts.length = 0; nav.length = 0; ui.completeRenders = 0; feedFrames = false; frameClock = 0;
  ui.view = null; ui.overlay = null; ui.hud = null;
  testTracking.user = null; breakCalls.length = 0; diskGate = null;
});
// 실패한 테스트가 화면을 남겨 다음 테스트에 영향 주지 않도록 정리
afterEach(async () => { for (const root of [...liveRoots]) await unmount(root); diskGate = null; mock.timers.reset(); });

const SQUAT_60 = () => routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 12 }, { reps: 12 }] });
const PLANK_60 = () => routine({ exerciseId: 'plank', measurementType: 'DURATION', sets: [{ seconds: 60 }, { seconds: 60 }] });
const PLANK_20 = () => routine({ exerciseId: 'plank', measurementType: 'DURATION', sets: [{ seconds: 20 }, { seconds: 20 }] });
const UNSUPPORTED = () => routine({ exerciseId: 'side-plank', measurementType: 'DURATION', sets: [{ seconds: 20 }] });

/** 현재 화면에 표시된 운동 타이머 남은 시간 (자동 일시정지 화면이면 그 화면의 운동 상태 값) */
const remaining = () => (ui.view === 'overlay' ? ui.overlay.alternate.seconds : ui.stage.remainingSeconds);
const isAutoPauseScreen = () => ui.view === 'overlay';
const isAutoResumeScreen = () => ui.view === 'stage' && ui.stage.pause === 'resuming' && ui.hud?.title === '복귀';
const position = () => ({ id: ui.stage.phase.id, kind: ui.stage.phase.kind, exerciseIndex: ui.stage.phase.exerciseIndex, set: ui.stage.phase.set });
/** 프레임 1개 주입 (시계는 진행하지 않음) */
async function pushOneFrame() { await act(async () => { const f = feedFrames; feedFrames = true; pushEmptyFrame(); feedFrames = f; }); await settle(); }
async function signal(user) { testTracking.user = user; await pushOneFrame(); }
async function emitAppState(state) { await act(async () => { for (const fn of [...appStateListeners]) fn(state); }); await settle(); }
async function draftRemaining() { return (await offline.getLocalWorkout(owner)).draft.remainingSeconds; }

/** 60초 운동 시작 → 23초 진행(present) → LOST */
async function loseAt23s(fixture = SQUAT_60()) {
  const root = await startWith(fixture);
  testTracking.user = 'present'; feedFrames = true;
  await advance(23 * 1000);
  feedFrames = false;
  assert.equal(remaining(), 37, 'HARNESS: 23초 진행 후 37초여야 합니다');
  assert.equal(breakCalls.length, 0, 'HARNESS: present 신호에서 일시정지되면 안 됩니다');
  const before = position();
  const revision = (await localSession()).revision;
  await signal('lost');
  return { root, before, revision };
}

// ---------------------------------------------------------------------
describe('어댑터 — 자동 일시정지 중 프레임 해석 기본값', () => {
  test('fromPausedFrame 기본 해석기는 unknown (실제 AI 재인식 신호를 가정하지 않음)', () => {
    const A = load(path.join(SRC, 'services/trackingSignalAdapter.ts'));
    const adapter = A.createTrackingSignalAdapter({ analyzerSupported: true });
    assert.deepEqual(adapter.fromPausedFrame({ landmarks: [] }), { user: 'unknown', camera: 'available', analyzer: 'supported' });
    const unsupported = A.createTrackingSignalAdapter({ analyzerSupported: false, interpretPausedFrame: () => 'present' });
    assert.equal(unsupported.fromPausedFrame({}).user, 'unknown');
  });
});

describe('2단계 — LOST 시 타이머 정지와 남은 시간 보존 (3단계 화면 반영)', () => {
  test('LOST: 타이머 정지, 37초 보존, 30초 경과에도 유지, 운동·세트·phase 유지, 체크포인트 37초', async () => {
    const { root, before } = await loseAt23s();
    assert.deepEqual(breakCalls, ['SquatAnalyzer:pause'], 'LOST 진입 시 AI 연속성 끊기 1회');
    assert.ok(isAutoPauseScreen(), 'Figma 자동 일시정지 화면(AutoPauseOverlay)');
    assert.equal(remaining(), 37);
    feedFrames = true; // 계속 lost
    await advance(30 * 1000);
    assert.equal(remaining(), 37, '30초가 지나도 37초 유지');
    assert.deepEqual(position(), before);
    assert.equal(breakCalls.length, 1, '중복 LOST로 일시정지가 다시 생성되지 않음');
    const local = await offline.getLocalWorkout(owner);
    assert.equal(local.sessionId, local.draft.sessionId);
    assert.deepEqual([local.draft.phase, local.draft.exerciseIndex, local.draft.set, local.draft.remainingSeconds], ['exercising', 0, 1, 37]);
    assert.equal(alerts.length, 0);
    await unmount(root);
  });

  test('AI 결과·세트 결과를 만들지 않고, 서버 상태·revision을 바꾸지 않는다', async () => {
    const { root, revision } = await loseAt23s();
    feedFrames = true;
    await advance(60 * 1000);
    const session = await localSession();
    assert.equal(session.sets.length, 0);
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 0);
    assert.equal(session.status, 'ACTIVE');
    assert.equal(session.revision, revision);
    await unmount(root);
  });

  test('카메라 프레임 없음은 LOST가 아니다: 타이머 계속 진행', async () => {
    const root = await startWith(SQUAT_60());
    testTracking.user = 'lost';
    await advance(30 * 1000);
    assert.equal(breakCalls.length, 0);
    assert.equal(remaining(), 30);
    assert.ok(!isAutoPauseScreen());
    await unmount(root);
  });

  test('분석기 미지원 종목: lost 신호가 있어도 자동 일시정지 대상이 아니다 (M10 기존 동작 유지)', async () => {
    const root = await startWith(UNSUPPORTED());
    testTracking.user = 'lost'; feedFrames = true;
    await advance(10 * 1000);
    assert.equal(remaining(), 10);
    assert.ok(!isAutoPauseScreen());
    await unmount(root);
  });
});

// ---------------------------------------------------------------------
describe('3단계 — Figma 자동 일시정지 화면 · 5초 복귀 · 재개', () => {
  test('1~5, 10. 횟수 운동: LOST 화면 → 20초 대기 → RECOVERED 5초 복귀 화면 → 37초부터 재개', async () => {
    const { root, before } = await loseAt23s();
    assert.ok(isAutoPauseScreen(), '1. LOST → 자동 일시정지 화면');
    assert.equal(ui.overlay.subtitle, '세트 1 진행 중');
    assert.deepEqual(ui.overlay.alternate, { kind: 'reps', reps: ui.overlay.alternate.reps, target: 12, seconds: 37 });
    testTracking.user = 'lost'; feedFrames = true;
    await advance(20 * 1000);
    assert.equal(remaining(), 37);

    await signal('present');
    assert.ok(isAutoResumeScreen(), '2. RECOVERED → 복귀 화면');
    assert.equal(ui.hud.seconds, 5, '복귀 카운트다운 5초에서 시작');
    assert.equal(remaining(), 37, '3. 복귀 카운트다운 중 운동 시간 유지');
    feedFrames = true; // present 신호 계속 (중복 RECOVERED)
    await advance(4 * 1000);
    assert.ok(isAutoResumeScreen());
    assert.equal(ui.hud.seconds, 1);
    assert.equal(remaining(), 37);
    assert.equal(await draftRemaining(), 37, '체크포인트와 화면 일치');

    await advance(1000);
    assert.equal(ui.view, 'stage');
    assert.equal(ui.stage.pause, 'none', '4. 카운트다운 종료 후 운동 재개');
    assert.equal(remaining(), 37, '5. 재개 시점 남은 시간 37초');
    assert.deepEqual(position(), before, '10. 세트·운동 인덱스·phase 유지');
    await advance(2 * 1000);
    assert.equal(remaining(), 35, '재개 후 정상 속도로 감소');
    assert.equal(await draftRemaining(), 35, '체크포인트와 화면 일치');
    assert.equal(breakCalls.length, 1);
    assert.equal((await localSession()).sets.length, 0, '복귀만으로 세트 결과 없음');
    await unmount(root);
  });

  test('시간 운동(플랭크): LOST → 복귀 → 37초부터 재개, 이후 정상 세트 완료 1회', async () => {
    const { root, before } = await loseAt23s(PLANK_60());
    assert.ok(isAutoPauseScreen());
    assert.equal(ui.overlay.alternate.kind, 'duration');
    assert.equal(ui.overlay.alternate.seconds, 37);
    await advance(20 * 1000);
    await signal('present');
    assert.ok(isAutoResumeScreen());
    feedFrames = true;
    await advance(5 * 1000);
    assert.equal(ui.stage.pause, 'none');
    assert.equal(remaining(), 37);
    assert.deepEqual(position(), before);
    await advance(37 * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'resting', '남은 37초 후 세트 완료');
    assert.equal((await localSession()).sets.length, 1, '세트 결과 1회');
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 1, 'AI 결과 1회');
    await unmount(root);
  });

  test('6. 복귀 카운트다운 중 재이탈 → LOST 화면, 다시 복구 시 5초부터 새로 시작', async () => {
    const { root } = await loseAt23s();
    await signal('present');
    assert.ok(isAutoResumeScreen());
    await advance(3 * 1000);
    assert.equal(ui.hud.seconds, 2);
    await signal('lost');
    assert.ok(isAutoPauseScreen(), '복귀 중 이탈 → LOST');
    await advance(10 * 1000);
    assert.ok(isAutoPauseScreen(), '이전 복귀 카운트다운이 남아 재개시키지 않음');
    assert.equal(remaining(), 37);
    await signal('present');
    assert.ok(isAutoResumeScreen());
    assert.equal(ui.hud.seconds, 5, '복귀 카운트다운 새로 5초');
    await advance(5 * 1000);
    assert.equal(ui.stage.pause, 'none');
    assert.equal(remaining(), 37);
    assert.equal(breakCalls.length, 1, '복귀 중 재이탈은 이미 일시정지 상태라 연속성 끊기 추가 없음');
    await unmount(root);
  });

  test('7, 11. 이탈·복귀 3회 반복: 중복 타이머 없음, 시간 정확, 세트 완료·AI 결과 1회', async () => {
    const root = await startWith(SQUAT_60());
    testTracking.user = 'present'; feedFrames = true;
    for (let i = 0; i < 3; i += 1) {
      await advance(10 * 1000);
      await signal('lost');
      feedFrames = true;
      await advance(7 * 1000); // lost 프레임 계속
      await signal('present');
      await advance(5 * 1000); // 복귀 카운트다운이 정확히 끝나는 시점까지
      assert.equal(ui.stage.pause, 'none', `${i + 1}회차 복귀 완료`);
    }
    assert.equal(remaining(), 30, '운동 진행 30초 (일시정지·복귀 시간 제외)');
    assert.equal(breakCalls.length, 3, 'LOST 3회 = 연속성 끊기 3회');
    await advance(10 * 1000);
    assert.equal(remaining(), 20, '10초 후 정확히 10초 감소 (중복 타이머 없음)');
    await advance(20 * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'resting');
    assert.equal((await localSession()).sets.length, 1, '세트 완료 1회');
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 1, 'AI 결과 1회');
    await unmount(root);
  });

  test('8. 자동 일시정지 중 수동 일시정지: 수동 화면 우선, 자동 재개 없음, 수동 재개만으로 복구로 보지 않음', async () => {
    const { root } = await loseAt23s();
    const rev0 = (await localSession()).revision;
    await act(async () => { ui.overlay.onPressMenu(); }); await settle();
    assert.equal(ui.view, 'stage');
    assert.equal(ui.stage.pause, 'paused', '메뉴 → 수동 일시정지 화면');
    await signal('present'); // 수동 일시정지 중 재인식 신호
    assert.equal(ui.stage.pause, 'paused', '수동 일시정지 화면이 자동 복귀 화면에 덮이지 않음');
    feedFrames = true;
    await advance(15 * 1000);
    assert.equal(ui.stage.pause, 'paused', '수동 일시정지 중 자동 재개 없음');
    assert.equal(remaining(), 37);
    assert.equal((await localSession()).revision, rev0 + 1, '수동 PAUSED 1회');

    testTracking.user = 'lost';
    await resumeLikeUser();
    assert.ok(isAutoPauseScreen(), '수동 재개 후에도 재인식 전까지 자동 일시정지 화면');
    assert.equal(remaining(), 37);
    await signal('present');
    assert.ok(isAutoResumeScreen());
    await advance(5 * 1000 + 250);
    assert.equal(ui.stage.pause, 'none');
    assert.equal(remaining(), 37);
    await unmount(root);
  });

  test('8b. 복귀 카운트다운 중 수동 일시정지 → 카운트다운 취소, 재개 후 새 재인식 필요', async () => {
    const { root } = await loseAt23s();
    await signal('present');
    assert.ok(isAutoResumeScreen());
    await advance(2 * 1000);
    await act(async () => { ui.stage.onPressMenu(); }); await settle();
    assert.equal(ui.stage.pause, 'paused');
    await advance(10 * 1000);
    assert.equal(ui.stage.pause, 'paused', '이전 복귀 카운트다운이 끝나도 재개되지 않음');
    assert.equal(remaining(), 37);
    testTracking.user = 'unknown';
    await resumeLikeUser();
    assert.ok(isAutoPauseScreen(), '복귀가 취소되어 LOST 화면');
    await advance(10 * 1000);
    assert.ok(isAutoPauseScreen(), 'unknown 신호로는 복구되지 않음');
    assert.equal(remaining(), 37);
    await unmount(root);
  });

  test('9. 복귀 카운트다운 중 백그라운드 → 카운트다운 중단, 포그라운드 복귀 후에도 자동 재개 없음', async () => {
    const { root, before } = await loseAt23s();
    await signal('present');
    assert.ok(isAutoResumeScreen());
    await advance(2 * 1000);
    await emitAppState('background');
    assert.equal(ui.stage.pause, 'paused');
    await emitAppState('active');
    feedFrames = true;
    await advance(20 * 1000);
    assert.equal(ui.stage.pause, 'paused', '자동 재개 없음');
    assert.equal(remaining(), 37);
    assert.deepEqual(position(), before);
    assert.equal(await draftRemaining(), 37);
    await unmount(root);
  });

  test('9b. LOST 중 백그라운드 → 포그라운드: 자동 재개 없음', async () => {
    const { root } = await loseAt23s();
    await emitAppState('background');
    await emitAppState('active');
    await signal('present');
    await advance(20 * 1000);
    assert.equal(ui.stage.pause, 'paused');
    assert.equal(remaining(), 37);
    await unmount(root);
  });

  test('12, 14. 기본 어댑터(unknown): 자동 일시정지 없이 정상 횟수 운동 세트 완료', async () => {
    const root = await startWith(SQUAT_60());
    feedFrames = true;
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 500);
    assert.equal(breakCalls.length, 0);
    assert.ok(!isAutoPauseScreen());
    assert.equal(ui.stage.phase.kind, 'resting');
    assert.equal((await localSession()).sets.length, 1);
    await unmount(root);
  });

  test('13. 기본 어댑터(unknown): 정상 시간 운동 세트 완료', async () => {
    const root = await startWith(PLANK_20());
    feedFrames = true;
    await advance(20 * 1000 + 500);
    assert.equal(breakCalls.length, 0);
    assert.equal(ui.stage.phase.kind, 'resting');
    assert.equal((await localSession()).sets.length, 1);
    await unmount(root);
  });

  test('present 신호만 오는 경우 정상 세트 완료 후 휴식 타이머 진행', async () => {
    const root = await startWith(SQUAT_60());
    testTracking.user = 'present'; feedFrames = true;
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'resting');
    const rest = remaining();
    await advance(3 * 1000);
    assert.ok(remaining() < rest);
    await unmount(root);
  });

  test('경합: 세트 완료 저장 중 들어온 LOST는 무시되고, 다음 단계(휴식)는 자동 일시정지를 이어받지 않는다', async () => {
    const root = await startWith(SQUAT_60());
    const firstId = ui.stage.phase.id;
    testTracking.user = 'present'; feedFrames = true;
    await advance(EXERCISE_DURATION_SECONDS * 1000 - 1000);
    feedFrames = false;
    let release; diskGate = { promise: new Promise((r) => { release = r; }) };
    await advance(1250); // 타이머 0초 → finishCurrentPoseSet → 저장 대기
    assert.equal(ui.stage.phase.id, firstId, 'HARNESS: 저장이 막혀 아직 같은 단계여야 합니다');
    assert.equal(remaining(), 0);
    await signal('lost');
    assert.ok(!isAutoPauseScreen(), '세트 완료 처리 중 LOST는 무시');
    assert.equal(breakCalls.length, 0);
    diskGate = null; release();
    await settle(); await advance(250);
    assert.equal(ui.stage.phase.kind, 'resting', '저장 완료 후 휴식으로 전환');
    assert.ok(!isAutoPauseScreen());
    const rest = remaining();
    await advance(3 * 1000);
    assert.ok(remaining() < rest, '휴식 타이머 정상 진행');
    assert.equal((await localSession()).sets.length, 1);
    await unmount(root);
  });

  test('4단계 공존: 프레임 0개로 0초 → 운동 재개(재시도) → 새 세트에서 LOST·5초 복귀가 남은 시간 보존으로 동작', async () => {
    const root = await startWith(SQUAT_60());
    const stuck = ui.stage.phase;
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 250); // 프레임 없음 → 0초 정지
    assert.equal(ui.stage.pause, 'paused');
    assert.equal(remaining(), 0);
    assert.ok(!isAutoPauseScreen(), '0초 정지는 자동 일시정지 화면이 아님');
    await advance(500);
    await act(async () => { ui.stage.onPressResume(); }); await settle();
    assert.equal(ui.stage.phase.id, stuck.id + 1, '재시도');
    assert.equal(ui.stage.pause, 'resuming');
    assert.equal(ui.hud.title, '복귀', '기존 수동 재개 카운트다운(자동 복귀와 별개 상태)');
    await advance(5 * 1000);
    assert.equal(ui.stage.pause, 'none');
    assert.equal(remaining(), 60);
    testTracking.user = 'present'; feedFrames = true;
    await advance(23 * 1000);
    feedFrames = false;
    await signal('lost');
    assert.ok(isAutoPauseScreen());
    assert.equal(remaining(), 37);
    await advance(10 * 1000);
    await signal('present');
    assert.ok(isAutoResumeScreen());
    await advance(5 * 1000);
    assert.equal(ui.stage.pause, 'none');
    assert.equal(remaining(), 37, '재시도 세트에서도 남은 시간 보존·복원');
    assert.equal(ui.stage.phase.id, stuck.id + 1);
    feedFrames = true;
    await advance(37 * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'resting');
    assert.equal((await localSession()).sets.length, 1, '재시도 세트 결과 1회');
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 1);
    await unmount(root);
  });

  test('네트워크 요청이 실제로 나가지 않는다', () => {
    assert.ok(network.attempts.every((a) => a.startsWith('apiFetch:')));
  });
});

// ---------------------------------------------------------------------
// 3-1b: 측정값(횟수·유효 자세 유지 시간) 분리 · 현재 세트 목표 · DURATION 횟수 종료 제거
// ---------------------------------------------------------------------
describe('3-1b — 측정값 분리와 현재 세트 목표값', () => {
  beforeEach(() => { testMeasure.value = null; });
  afterEach(() => { testMeasure.value = null; });

  /** 지정한 측정값으로 프레임 1개 주입 (시계는 진행하지 않음) */
  async function measure(value) { testMeasure.value = value; await pushOneFrame(); await settle(); }
  /** 측정값·프레임을 멈추고 n세트 운동 단계가 될 때까지 시계를 진행 */
  async function untilExercising(set) {
    testMeasure.value = null; feedFrames = false;
    for (let i = 0; i < 400; i += 1) {
      if (ui.stage?.phase.kind === 'exercising' && ui.stage.phase.set === set) return;
      await advance(250);
    }
    assert.fail(`HARNESS: ${set}세트 운동 단계에 도달하지 않았습니다`);
  }
  const poseCount = async () => (await storedQueue()).filter((i) => i.kind === 'pose').length;
  /** 저장 큐에 마지막으로 기록된 세션의 세트 결과 수 (운동 완료로 로컬 세션이 지워진 뒤에도 확인 가능) */
  const queuedSetCount = async () => (await storedQueue()).filter((i) => i.kind !== 'pose').at(-1)?.session.sets.length;
  const REPS_10_12_15 = () => routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 10 }, { reps: 12 }, { reps: 15 }] });

  test('N1. 세트별 목표 10·12·15회: 각 세트가 자기 목표 횟수에서만 종료', async () => {
    const root = await startWith(REPS_10_12_15());
    assert.equal(ui.stage.targetReps, 10);
    await measure({ count: 9 });
    assert.equal(ui.stage.phase.kind, 'exercising', '9회는 1세트 미완료');
    await measure({ count: 10 });
    assert.equal(ui.stage.phase.kind, 'resting', '10회 → 1세트 완료');

    await untilExercising(2);
    assert.equal(ui.stage.targetReps, 12, '2세트 목표 12회');
    await measure({ count: 10 });
    assert.equal(ui.stage.phase.kind, 'exercising', '첫 세트 목표(10회)로 2세트를 끝내지 않음');
    await measure({ count: 11 });
    assert.equal(ui.stage.phase.kind, 'exercising');
    await measure({ count: 12 });
    assert.equal(ui.stage.phase.kind, 'resting', '12회 → 2세트 완료');

    await untilExercising(3);
    assert.equal(ui.stage.targetReps, 15, '3세트 목표 15회');
    await measure({ count: 12 });
    assert.equal(ui.stage.phase.kind, 'exercising', '12회는 3세트 미완료');
    await measure({ count: 15 });
    assert.ok(ui.completeRenders > 0, '15회 → 마지막 세트 완료 → 운동 완료');
    assert.equal(await queuedSetCount(), 3, '세트 결과 3회');
    assert.equal(await poseCount(), 3, 'AI 결과 3회');
    await unmount(root);
  });

  test('N2. DURATION(마운틴 클라이머): count가 목표 초를 넘어도 횟수로 종료하지 않고 시간으로 표시하지 않음', async () => {
    const root = await startWith(routine({ exerciseId: 'mountain-climber', measurementType: 'DURATION', sets: [{ seconds: 30 }, { seconds: 30 }] }));
    testMeasure.value = { count: 31, holdSeconds: null }; feedFrames = true;
    await advance(1000);
    assert.equal(ui.stage.phase.kind, 'exercising', 'count 31 ≥ 목표 30초여도 세트 진행');
    assert.equal(ui.hud.kind, 'duration');
    assert.equal(ui.hud.seconds, 29, '타이머 잔여 시간');
    assert.equal(ui.hud.holdSeconds, null, '횟수를 유효 자세 유지 시간으로 표시하지 않음');
    assert.equal(ui.stage.currentReps, null);
    await advance(29 * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'resting', '기존 PhaseTimer 만료로만 종료');
    assert.equal((await localSession()).sets.length, 1);
    await unmount(root);
  });

  test('N3. REPS: holdSeconds가 있어도 횟수로 쓰지 않음 (표시·종료 모두)', async () => {
    const root = await startWith(routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 12 }, { reps: 12 }] }));
    testMeasure.value = { count: 3, holdSeconds: 7 }; feedFrames = true;
    await advance(1000);
    assert.equal(ui.hud.kind, 'reps');
    assert.equal(ui.hud.reps, 3, '횟수 UI = count');
    testMeasure.value = { count: null, holdSeconds: 20 };
    await advance(1000);
    assert.equal(ui.hud.reps, 3, 'count가 없을 때 holdSeconds(20)를 횟수로 표시하지 않음');
    assert.equal(ui.stage.phase.kind, 'exercising', 'holdSeconds 20 ≥ 목표 12여도 종료하지 않음');
    await unmount(root);
  });

  test('N4. DURATION(플랭크): AI 유효 자세 시간과 PhaseTimer 시간을 서로 대체하지 않음', async () => {
    const root = await startWith(routine({ exerciseId: 'plank', measurementType: 'DURATION', sets: [{ seconds: 60 }, { seconds: 60 }] }));
    testMeasure.value = { count: 4, holdSeconds: 5.7 }; feedFrames = true;
    await advance(10 * 1000);
    assert.equal(ui.hud.kind, 'duration');
    assert.equal(ui.hud.seconds, 50, '타이머 잔여 = 60 - 경과 10초');
    assert.equal(ui.hud.holdSeconds, 5, '유효 자세 시간 = floor(holdSeconds), count(4) 아님');
    testMeasure.value = { count: null, holdSeconds: 61 };
    await advance(1000);
    assert.equal(ui.hud.holdSeconds, 61);
    assert.equal(ui.hud.seconds, 49, '유효 자세 시간이 타이머를 바꾸지 않음');
    assert.equal(ui.stage.phase.kind, 'exercising', 'holdSeconds 도달은 종료 조건이 아님');
    await unmount(root);
  });

  test('N5. 명시적 로컬 세트 증가(세트 수 > 서버 세트 수): 마지막 세트 설정 복사 정책과 일치', async () => {
    const fixture = routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 10 }, { reps: 12 }] });
    fixture.sessions[0].sets = 3; // defaultSets = 2 (서버 세트 수) → 사용자가 로컬에서 1세트 추가한 상태
    const root = await startWith(fixture);
    await measure({ count: 10 });
    await untilExercising(2);
    await measure({ count: 12 });
    await untilExercising(3);
    assert.equal(ui.stage.targetReps, 12, '추가 세트 = 마지막 세트(12회) 복사');
    await unmount(root);
  });

  test('N6. 잘못된 서버 snapshot 목표는 다른 세트 값으로 조용히 대체하지 않음', async () => {
    // a) 세트 수와 서버 세트 배열 길이 불일치 (로컬 증가 아님)
    const short = routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 10 }, { reps: 12 }] });
    short.sessions[0].sets = 3; short.sessions[0].defaultSets = 3;
    let root = await startWith(short);
    await measure({ count: 10 });
    await untilExercising(2);
    await measure({ count: 12 });
    await untilExercising(3);
    assert.equal(ui.stage.targetReps, 0, '목표 미결정: 12회(마지막 세트)나 10회(첫 세트)로 대체하지 않음');
    await unmount(root);

    // b) REPS 세트의 targetReps 누락
    const missing = routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 10 }, {}] });
    root = await startWith(missing);
    await measure({ count: 10 });
    await untilExercising(2);
    assert.equal(ui.stage.targetReps, 0, '누락된 목표를 첫 세트(10회)로 대체하지 않음');
    await measure({ count: 10 });
    await measure({ count: 50 });
    assert.equal(ui.stage.phase.kind, 'exercising', '목표를 알 수 없으면 횟수로 완료 처리하지 않음');
    await unmount(root);
  });

  /** 저장 큐 전체에서 해당 서버 세트의 결과(세션 세트 결과 또는 AI 결과)가 있는지 */
  async function queuedFor(routineSetId) {
    const queue = await storedQueue();
    return {
      setResult: queue.some((i) => i.kind !== 'pose' && i.session.sets.some((s) => s.routineSetId === routineSetId)),
      aiResult: queue.some((i) => i.kind === 'pose' && i.routineSetId === routineSetId),
    };
  }

  test('N6c. targetReps 누락 REPS 세트: count가 늘어도 타이머 만료 시 정상 완료·결과 저장 없이 M10 정지, 재시도 없음', async () => {
    const fx = routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 10 }, {}] });
    const [set1, set2] = fx.exercise.sets.map((s) => s.id);
    const root = await startWith(fx);
    await measure({ count: 10 });
    await untilExercising(2);
    assert.equal(ui.stage.targetReps, 0);
    const before = { pose: await poseCount(), sets: await queuedSetCount() };
    assert.deepEqual(before, { pose: 1, sets: 1 }, 'HARNESS: 1세트 결과 저장');
    testMeasure.value = { count: 5, holdSeconds: null }; feedFrames = true;
    await advance(20 * 1000);
    testMeasure.value = { count: 30, holdSeconds: null };
    await advance(20 * 1000);
    assert.equal(ui.stage.phase.kind, 'exercising', 'count 30이어도 횟수 종료 없음');
    assert.equal(ui.stage.currentReps, 30, 'AI count는 정상 표시');
    const stuck = ui.stage.phase;
    await advance(20 * 1000 + 500); // 60초 타이머 만료

    assert.equal(ui.completeRenders, 0, '정상 완료(운동 완료 화면) 없음');
    assert.equal(ui.stage.phase.id, stuck.id, '다음 단계로 넘어가지 않음');
    assert.equal(stallAlerts().length, 1, '기존 M10 정지 경로');
    assert.equal(ui.stage.pause, 'paused');
    assert.equal(remaining(), 0);
    assert.equal(await poseCount(), before.pose, 'AI 결과 추가 없음');
    assert.equal(await queuedSetCount(), before.sets, 'Workout 세트 결과 추가 없음');
    assert.deepEqual(await queuedFor(set2), { setResult: false, aiResult: false }, '목표 무효 세트는 동기화 큐에 결과 없음');
    assert.deepEqual(await queuedFor(set1), { setResult: true, aiResult: true }, '이전 완료 세트·큐 항목 보존');

    // 재개를 눌러도 같은 무효 목표로 재시도하지 않는다 (무한 재시도 방지)
    await advance(500);
    await act(async () => { ui.stage.onPressResume(); }); await settle();
    assert.equal(ui.stage.phase.id, stuck.id, '재시도(새 phase) 없음');
    await advance(20 * 1000);
    assert.equal(stallAlerts().length, 1, '정지 경고 반복 없음');
    assert.equal(ui.completeRenders, 0);
    assert.equal(await poseCount(), before.pose);
    assert.equal(await queuedSetCount(), before.sets);
    await unmount(root);
  });

  test('N6d. 서버 세트 배열 길이 불일치(서버 세트 없음): 분석기 없이 M10 정지, 결과 없음, 재시도 없음', async () => {
    const fx = routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 10 }, { reps: 12 }] });
    fx.sessions[0].sets = 3; fx.sessions[0].defaultSets = 3;
    const root = await startWith(fx);
    await measure({ count: 10 }); await untilExercising(2); await measure({ count: 12 }); await untilExercising(3);
    const before = { pose: await poseCount(), sets: await queuedSetCount() };
    assert.deepEqual(before, { pose: 2, sets: 2 }, 'HARNESS: 1·2세트 결과 저장');
    testMeasure.value = { count: 30, holdSeconds: null }; feedFrames = true;
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 500);
    assert.equal(ui.stage.currentReps, null, '서버 세트가 없어 분석기를 만들지 않음');
    assert.equal(stallAlerts().length, 1, '기존 M10 정지');
    assert.equal(ui.stage.pause, 'paused');
    assert.equal(ui.completeRenders, 0);
    assert.equal(await poseCount(), before.pose);
    assert.equal(await queuedSetCount(), before.sets);
    const stuck = ui.stage.phase;
    await advance(500);
    await act(async () => { ui.stage.onPressResume(); }); await settle();
    assert.equal(ui.stage.phase.id, stuck.id, '같은 무효 세트로 재시도하지 않음');
    await advance(EXERCISE_DURATION_SECONDS * 1000);
    assert.equal(stallAlerts().length, 1, '정지 경고 반복 없음');
    assert.equal(await poseCount(), before.pose);
    await unmount(root);
  });

  test('N7. 이어하기 후 같은 세트의 목표값 사용', async () => {
    let root = await startWith(REPS_10_12_15());
    await measure({ count: 10 });
    await untilExercising(2);
    await measure({ count: 4 });
    await act(async () => { ui.stage.onPressMenu(); }); await settle();
    assert.equal(ui.stage.pause, 'paused');
    await advance(500);
    await act(async () => { ui.stage.onPressStop(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onConfirmStop(); }); await settle();
    const draft = useWorkoutDraftStore.getState().draft;
    assert.deepEqual([draft.phase, draft.set, draft.targetReps], ['exercising', 2, 12], '임시저장 목표 = 현재 세트 12회');
    await unmount(root);

    root = await mount({ resume: '1' });
    assert.equal(ui.stage.phase.set, 2);
    assert.equal(ui.stage.targetReps, 12, '이어하기 후 2세트 목표 12회');
    await resumeLikeUser();
    await measure({ count: 10 });
    assert.equal(ui.stage.phase.kind, 'exercising', '첫 세트 목표로 끝내지 않음');
    await measure({ count: 12 });
    assert.equal(ui.stage.phase.kind, 'resting');
    assert.equal((await localSession()).sets.length, 2);
    await unmount(root);
  });

  test('N8. 자동 일시정지·복귀·수동 일시정지 후에도 현재 세트 목표와 누적 측정값 유지', async () => {
    const root = await startWith(routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 10 }, { reps: 12 }] }));
    await measure({ count: 10 });
    await untilExercising(2);
    testTracking.user = 'present';
    testMeasure.value = { count: 5, holdSeconds: null }; feedFrames = true;
    await advance(3 * 1000);
    feedFrames = false;
    await signal('lost');
    assert.ok(isAutoPauseScreen());
    assert.deepEqual(ui.overlay.alternate, { kind: 'reps', reps: 5, target: 12, seconds: remaining() }, 'LOST 화면 = 누적 5회 / 현재 세트 12회');
    await signal('present');
    await advance(5 * 1000);
    assert.equal(ui.stage.pause, 'none');
    assert.equal(ui.stage.currentReps, 5, '복귀 후 누적 횟수 유지');
    assert.equal(ui.stage.targetReps, 12);
    await act(async () => { ui.stage.onPressMenu(); }); await settle();
    assert.equal(ui.stage.pause, 'paused');
    assert.equal(ui.stage.currentReps, 5, '수동 일시정지 중 누적 횟수 유지');
    await resumeLikeUser();
    assert.equal(ui.stage.currentReps, 5, '수동 재개 후 누적 횟수 유지');
    await measure({ count: 12 });
    assert.ok(ui.completeRenders > 0, '12회 → 마지막 세트 완료');
    assert.equal(await queuedSetCount(), 2);
    assert.equal(await poseCount(), 2, '일시정지·복귀로 AI 결과가 중복되지 않음');
    await unmount(root);
  });

  test('N9. M10 재시도: 같은 세트 목표 유지, 측정값 초기화, 세트 결과 중복 없음', async () => {
    const root = await startWith(routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 10 }, { reps: 12 }] }));
    await measure({ count: 10 });
    await untilExercising(2);
    const stuck = ui.stage.phase;
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 250); // 프레임 없음 → 0초 정지
    assert.equal(stallAlerts().length, 1);
    assert.equal(ui.stage.pause, 'paused');
    await advance(500);
    await act(async () => { ui.stage.onPressResume(); }); await settle();
    assert.equal(ui.stage.phase.id, stuck.id + 1, '재시도 = 새 phase id');
    assert.equal(ui.stage.phase.set, 2, '같은 세트');
    assert.equal(ui.stage.targetReps, 12, '같은 세트 목표 12회');
    assert.equal(ui.stage.currentReps, null, '재시도는 측정값을 새로 시작');
    await advance(5 * 1000);
    assert.equal(ui.stage.pause, 'none');
    await measure({ count: 10 });
    assert.equal(ui.stage.phase.kind, 'exercising');
    await measure({ count: 12 });
    assert.ok(ui.completeRenders > 0);
    assert.equal(await queuedSetCount(), 2, '세트 결과 = 1세트 + 재시도 2세트');
    assert.equal(await poseCount(), 2, 'AI 결과 = 1세트 + 재시도 2세트, 중복 없음');
    await unmount(root);
  });

  test('N10. 다음 세트로 넘어가면 이전 세트의 측정값이 남지 않음 (횟수·유지 시간)', async () => {
    let root = await startWith(routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 10 }, { reps: 12 }] }));
    await measure({ count: 10 });
    assert.equal(ui.stage.phase.kind, 'resting');
    assert.equal(ui.stage.currentReps, null, '휴식 단계에 1세트 횟수가 남지 않음');
    await untilExercising(2);
    assert.equal(ui.stage.currentReps, null, '2세트 시작 시 1세트 횟수(10)가 남지 않음');
    await unmount(root);

    root = await startWith(routine({ exerciseId: 'plank', measurementType: 'DURATION', sets: [{ seconds: 20 }, { seconds: 20 }] }));
    testMeasure.value = { count: null, holdSeconds: 8 }; feedFrames = true;
    await advance(20 * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'resting');
    await untilExercising(2);
    assert.equal(ui.stage.currentReps, null, '2세트 시작 시 1세트 유효 자세 시간(8초)이 남지 않음');
    await unmount(root);
  });

  test('3-1b 테스트에서도 네트워크 요청이 실제로 나가지 않는다', () => {
    assert.ok(network.attempts.every((a) => a.startsWith('apiFetch:')));
  });
});
