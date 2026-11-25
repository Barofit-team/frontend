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
  // 3-1a: 준비 화면 readiness 훅(실제 @barofit/pose CameraReadiness 사용)
  'hooks/useCameraReadiness',
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
const testMeasure = { value: null, summary: null };
for (const name of ['SquatAnalyzer', 'PlankAnalyzer', 'MountainClimberAnalyzer']) {
  const proto = poseModule[name].prototype;
  const original = proto.pushFrame;
  proto.pushFrame = function (...args) {
    const output = original.apply(this, args);
    return testMeasure.value ? { ...output, ...testMeasure.value } : output;
  };
  // 3-1c 테스트 전용: 세트 종료 요약(set.completed summary)의 count/holdSeconds만 지정 (null이면 실제 요약 그대로)
  const originalFinish = proto.finish;
  proto.finish = function (...args) {
    const events = originalFinish.apply(this, args);
    if (!testMeasure.summary) return events;
    return events.map((e) => (e.type === 'set.completed' ? { ...e, summary: { ...e.summary, ...testMeasure.summary } } : e));
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

  // 3-1a에서 마운틴 클라이머(conflict)는 분석기를 연결하지 않으므로, count를 주입한 DURATION 분석기(플랭크)로 같은 계약을 검증한다
  test('N2. DURATION: count가 목표 초를 넘어도 횟수로 종료하지 않고 시간으로 표시하지 않음', async () => {
    const root = await startWith(routine({ exerciseId: 'plank', measurementType: 'DURATION', sets: [{ seconds: 30 }, { seconds: 30 }] }));
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

// ---------------------------------------------------------------------
// 3-1a: 분석기 지원 상태 · 분석기 생성 fallback · readiness fallback
// ---------------------------------------------------------------------
describe('3-1a — 분석기 생성과 readiness fallback 정리', () => {
  const SUPPORTED_CLASSES = {
    'push-up': 'PushupAnalyzer', plank: 'PlankAnalyzer', squat: 'SquatAnalyzer', 'bird-dog': 'BirdDogAnalyzer',
    'jumping-jack': 'JumpingJackAnalyzer', 'leg-raise': 'LegRaiseAnalyzer', 'glute-bridge': 'GluteBridgeAnalyzer',
    'pike-push-up': 'PikePushupAnalyzer', superman: 'SupermanAnalyzer', lunge: 'LungeAnalyzer',
    'split-squat': 'SplitSquatAnalyzer', 'bulgarian-split-squat': 'BulgarianSplitSquatAnalyzer',
    'incline-push-up': 'InclinePushupAnalyzer', 'side-lying-leg-raise': 'SideLegRaiseAnalyzer',
    'standing-calf-raise': 'StandingCalfRaiseAnalyzer', 'dead-bug': 'DeadBugAnalyzer',
  };

  test('A1. 정상 지원 16종은 기존과 같은 분석기 클래스를 생성', () => {
    for (const [routineId, cls] of Object.entries(SUPPORTED_CLASSES)) {
      assert.ok(createExerciseAnalyzer(routineId) instanceof poseModule[cls], `${routineId} → ${cls}`);
    }
  });

  test('A2. 미완성·미구현·미확인 ID는 분석기를 만들지 않음 (ID 통과 fallback 제거)', () => {
    assert.equal(createExerciseAnalyzer('side-plank'), null, 'incomplete: SidePlankAnalyzer를 세션에 연결하지 않음');
    // 3-4c: 마운틴 클라이머는 V13 REPS snapshot만 연결. legacy DURATION·측정 유형 누락/오류 snapshot은 conflict로 연결하지 않음
    assert.equal(createExerciseAnalyzer('mountain-climber', 'DURATION'), null, 'conflict: legacy DURATION snapshot');
    for (const bad of [undefined, null, 'TIME', 'reps']) assert.equal(createExerciseAnalyzer('mountain-climber', bad), null, `conflict: 측정 유형 ${String(bad)}`);
    for (const id of ['jump-squat', 'reverse-crunch', 'flutter-kick', 'burpee', 'sit-up']) {
      assert.equal(createExerciseAnalyzer(id), null, `not_implemented ${id}`);
    }
    for (const id of ['forward-lunge', 'reverse-lunge', 'jumping-lunge', 'unknown-exercise', 'toString']) {
      assert.equal(createExerciseAnalyzer(id), null, `unknown ${id}`);
    }
    // 이전에는 Routine 매핑이 없으면 입력 문자열을 AI ID로 그대로 통과시켰다
    for (const aiId of ['pushup', 'bird_dog', 'pike_pushup', 'side_lying_leg_raise', 'side_plank']) {
      assert.equal(createExerciseAnalyzer(aiId), null, `AI ID를 Routine ID처럼 통과시키지 않음: ${aiId}`);
    }
  });

  test('A3. legacy DURATION 마운틴 클라이머 snapshot(conflict): 정상 결과를 만들지 않고 기존 M10 안내로 정지, 재시도 없음', async () => {
    const root = await startWith(routine({ exerciseId: 'mountain-climber', measurementType: 'DURATION', sets: [{ seconds: 20 }, { seconds: 20 }] }));
    feedFrames = true; // 카메라 프레임은 계속 들어옴
    await advance(10 * 1000);
    assert.equal(ui.stage.phase.kind, 'exercising', '운동 진입·타이머 진행은 유지');
    assert.equal(ui.stage.currentReps, null, '분석기를 연결하지 않아 측정값 없음');
    await advance(10 * 1000 + 500);
    const pose = (await storedQueue()).filter((i) => i.kind === 'pose').length;
    assert.equal(pose, 0, '충돌 운동의 AI 결과가 정상 결과로 저장되지 않음');
    assert.equal((await localSession()).sets.length, 0, 'Workout 세트 결과 없음');
    assert.equal(ui.completeRenders, 0);
    assert.equal(stallAlerts().length, 1, '기존 M10 안내 재사용');
    assert.equal(ui.stage.pause, 'paused');
    const stuck = ui.stage.phase;
    await advance(500);
    await act(async () => { ui.stage.onPressResume(); }); await settle();
    assert.equal(ui.stage.phase.id, stuck.id, '같은 충돌 세트로 재시도하지 않음');
    await advance(20 * 1000);
    assert.equal(stallAlerts().length, 1, '안내 반복 없음');
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 0);
    await unmount(root);
  });

  // ---- readiness 훅: 실제 CameraReadiness로 실행 ----
  const { useCameraReadiness } = src('hooks/useCameraReadiness.ts');
  const probe = { r: null, ready: 0 };
  function Probe(props) { probe.r = useCameraReadiness({ ...props, onReady: () => { probe.ready += 1; } }); return null; }
  const fullBody = (t) => ({ timestampMs: t, width: 480, height: 640, landmarks: Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1, 1]) });
  async function runReadiness(exercise, frameAt = fullBody) {
    probe.r = null; probe.ready = 0;
    const root = createRoot(makeContainer()); liveRoots.add(root);
    await act(async () => { root.render(React.createElement(Probe, { exercise, stableMs: 100 })); });
    await settle();
    const returned = [];
    for (let i = 0; i < 10; i += 1) {
      await act(async () => { returned.push(probe.r.pushFrame(frameAt(1000 + i * 50))); });
    }
    await settle();
    const snapshot = { ready: probe.ready, isReady: probe.r.isReady, required: probe.r.requiredJointCount, returned };
    await unmount(root);
    return snapshot;
  }

  test('R1. 정상 종목 readiness 유지: 스쿼트·푸시업은 자기 프로필로 준비 완료', async () => {
    const squat = await runReadiness('squat');
    assert.equal(squat.ready, 1); assert.equal(squat.isReady, true);
    assert.equal(squat.required, 4, '스쿼트 lower 프로필(한쪽 4관절)');
    const pushup = await runReadiness('pushup');
    assert.equal(pushup.ready, 1); assert.equal(pushup.required, 6, '푸시업 full 프로필(한쪽 6관절)');
  });

  // Pose 49762dd: READINESS_PROFILES.side_plank = either·full 6관절 + CameraReadiness가 반대쪽 어깨를 추가 검사.
  // 훅은 AI 프로필을 그대로 사용한다(FE 복사·푸시업 대체 없음). FE 준비 화면 차단은 incomplete 상태(P2)가 담당한다
  test('R2. 사이드 플랭크는 AI side_plank 프로필로 readiness 실행(푸시업 대체 아님): 반대쪽 어깨까지 보여야 준비 완료', async () => {
    const r = await runReadiness('side_plank');
    assert.equal(r.ready, 1, '전신 관절 → 준비 완료 1회');
    assert.equal(r.isReady, true);
    assert.equal(r.required, 6, 'FE 표시 관절 수 = AI 프로필 joints(한쪽 6). 반대쪽 어깨는 AI 내부 검사');
    assert.ok(r.returned.every((x) => x && x.exercise === 'side_plank'), 'AI side_plank readiness 결과');
    // 왼쪽 어깨(11)만 가린 프레임: 푸시업은 오른쪽 6관절로 준비 완료, 사이드 플랭크는 양쪽 어깨 조건으로 준비 안 됨
    const noLeftShoulder = (t) => { const f = fullBody(t); f.landmarks[11] = [0.5, 0.5, 0, 0, 0]; return f; };
    const pushup = await runReadiness('pushup', noLeftShoulder);
    assert.equal(pushup.ready, 1, '푸시업 프로필은 한쪽만 확인');
    const sp = await runReadiness('side_plank', noLeftShoulder);
    assert.equal(sp.ready, 0, '사이드 플랭크: 반대쪽 어깨 미인식 → 준비 완료 없음');
    assert.equal(sp.isReady, false);
    assert.ok(sp.returned.at(-1).missingLandmarks.includes('left_shoulder'), `반대쪽 어깨 누락 보고 (${sp.returned.at(-1).missingLandmarks})`);
  });

  test('R3. 운동 미지정(null)·미확인 ID도 준비 완료가 되지 않음', async () => {
    for (const exercise of [null, 'forward-lunge']) {
      const r = await runReadiness(exercise);
      assert.equal(r.ready, 0, String(exercise)); assert.equal(r.isReady, false); assert.equal(r.required, 0);
    }
  });

  test('R4. 계약 충돌(마운틴 클라이머)은 AI 프로필이 있어 기존 readiness 유지', async () => {
    const r = await runReadiness('mountain_climber');
    assert.equal(r.ready, 1); assert.equal(r.required, 6);
  });
});

// ---------------------------------------------------------------------
// 3-1c: SET_FEEDBACK 코치 이벤트의 주 측정값
// ---------------------------------------------------------------------
describe('3-1c — SET_FEEDBACK 주 측정값', () => {
  const events = [];
  beforeEach(() => {
    events.length = 0; testMeasure.value = null; testMeasure.summary = null;
    stores.tts.setState({ sendCoachEvent: (e) => { events.push(e); return false; } });
  });
  afterEach(() => { testMeasure.value = null; testMeasure.summary = null; stores.tts.setState({ sendCoachEvent: () => false }); });
  const setFeedback = () => events.filter((e) => e.eventType === 'SET_FEEDBACK');

  test('F1. REPS(스쿼트): actualReps = count, 보조 holdSeconds는 actualDurationSeconds로 보내지 않음', async () => {
    const root = await startWith(routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 7 }, { reps: 7 }] }));
    testMeasure.summary = { count: 7, holdSeconds: 4.2 };
    testMeasure.value = { count: 7, holdSeconds: 4.2 };
    await pushOneFrame(); await settle();
    assert.equal(ui.stage.phase.kind, 'resting');
    assert.equal(setFeedback().length, 1);
    assert.equal(setFeedback()[0].actualReps, 7);
    assert.equal(setFeedback()[0].actualDurationSeconds, undefined);
    assert.equal((await localSession()).sets[0].actualDurationSeconds, null, 'Workout 세트에도 보조 holdSeconds 미저장');
    await unmount(root);
  });

  test('F2. DURATION(플랭크): actualDurationSeconds = floor(holdSeconds), count는 actualReps로 보내지 않음', async () => {
    const root = await startWith(routine({ exerciseId: 'plank', measurementType: 'DURATION', sets: [{ seconds: 20 }, { seconds: 20 }] }));
    testMeasure.summary = { count: 3, holdSeconds: 18.9 };
    feedFrames = true;
    await advance(20 * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'resting', '기존 타이머 정책으로 종료');
    assert.equal(setFeedback().length, 1);
    assert.equal(setFeedback()[0].actualReps, undefined);
    assert.equal(setFeedback()[0].actualDurationSeconds, 18);
    const set = (await localSession()).sets[0];
    assert.deepEqual([set.actualReps, set.actualDurationSeconds], [null, 18], 'Workout 세트: count 미저장, AI 유지 시간 18초(타이머 20초 아님)');
    await unmount(root);
  });
});

// ---------------------------------------------------------------------
// 3-2: 대표 운동 실제 분석기 검증 (측정값 주입 없음)
// 프레임은 barofit-pose 자체 테스트(squat/plank/pushup_activity)의 합성 관절 생성 방식을 따른 것이며 실제 사람 관절 기록이 아니다.
// 검증 대상: 실제 분석기 출력 → 화면(HUD) → 세트 종료 → Workout 세트·AI 원본 저장의 FE 데이터 전달.
// ---------------------------------------------------------------------
describe('3-2 — 대표 운동 실제 분석기 연동 (스쿼트·플랭크·푸시업)', () => {
  const SIDE_IDS = { left: [11, 13, 15, 23, 25, 27], right: [12, 14, 16, 24, 26, 28] };
  const blank = () => Array.from({ length: 33 }, () => [0, 0, 0, 0, 0]);
  const squatFrame = (t, knee) => {
    const p = blank();
    for (const [side, q] of [['left', 0.9], ['right', 0.8]]) {
      const a = (knee * Math.PI) / 180;
      const pts = [[0.5, 0.15], [0.55, 0.25], [0.6, 0.35], [0.5, 0.35], [0.5, 0.6], [0.5 + 0.22 * Math.sin(a), 0.6 - 0.22 * Math.cos(a)]];
      SIDE_IDS[side].forEach((id, i) => { p[id] = [...pts[i], 0, q, q]; });
    }
    return { timestampMs: t, width: 1000, height: 1000, landmarks: p };
  };
  const plankFrame = (t) => {
    const p = blank();
    for (const [side, c] of [['left', 0.9], ['right', 0.8]]) {
      const xy = [[0.2, 0.3], [0.2, 0.5], [0.1, 0.5], [0.5, 0.3], [0.7, 0.3], [0.9, 0.3]];
      SIDE_IDS[side].forEach((id, i) => { p[id] = [...xy[i], 0, c, c]; });
    }
    return { timestampMs: t, width: 1000, height: 1000, landmarks: p };
  };
  const pushupFrame = (t, phase) => {
    const p = blank();
    const s = [0.25, 0.3 + 0.2 * phase], h = [0.55, 0.4 + 0.05 * phase], a = [0.85, 0.45];
    const k = [(h[0] + a[0]) / 2, (h[1] + a[1]) / 2];
    for (const [j, xy] of [[11, s], [13, [0.3, 0.5]], [15, [0.3, 0.7]], [23, h], [25, k], [27, a]]) p[j] = [...xy, 0, 0.9, 0.9];
    return { timestampMs: t, width: 640, height: 360, landmarks: p };
  };
  let clock = 0;
  /** 100ms마다 실제 관절 프레임을 넣으며 시계를 진행 (타이머·분석기가 같은 시간축) */
  async function feed(ms, make) {
    for (let t = 0; t < ms; t += 100) {
      await act(async () => { clock += 100; ui.camera.onPoseFrame(make(clock), { frameId: clock, inferenceMs: 1 }); mock.timers.tick(100); });
      if (t % 500 === 400) await settle();
    }
    await settle();
  }
  const poseItems = async () => (await storedQueue()).filter((i) => i.kind === 'pose');
  beforeEach(() => { clock = 0; testMeasure.value = null; testMeasure.summary = null; });

  test('S1. 스쿼트(REPS): AI 동작 완료 시 횟수 증가 → 횟수 링(목표 대비)·잔여 시간 표시 → 목표 3회에서 종료·저장', async () => {
    const root = await startWith(routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 3 }, { reps: 3 }] }));
    await feed(1000, (t) => squatFrame(t, 170)); // 서 있는 준비 자세
    assert.equal(ui.hud.kind, 'reps', '횟수형 HUD = 횟수 링');
    assert.equal(ui.hud.target, 3, '링 진행률 기준 = 현재 세트 목표 3회');
    const seen = [];
    for (let rep = 1; rep <= 3; rep += 1) {
      await feed(1000, (t) => squatFrame(t, 90)); // 앉기: 아직 동작 미완료
      if (rep < 3) assert.equal(ui.hud.reps ?? 0, rep - 1, `${rep}회차 하강 중에는 횟수 증가 없음`);
      await feed(1000, (t) => squatFrame(t, 170)); // 일어서기: AI가 1회 완료 판정
      if (rep < 3) { seen.push(ui.hud.reps); assert.equal(ui.hud.seconds, remaining(), '링 옆 잔여 시간 = PhaseTimer'); }
    }
    assert.deepEqual(seen, [1, 2], '실제 AI count가 링에 1→2로 표시');
    assert.equal(ui.stage.phase.kind, 'resting', '목표 3회 도달 → 기존 세트 완료 흐름');
    const set = (await localSession()).sets[0];
    assert.deepEqual([set.actualReps, set.actualDurationSeconds], [3, null], 'Workout: actualReps = AI count');
    const [item] = await poseItems();
    assert.equal(item.payload.exercise, 'squat');
    assert.equal(item.payload.summary.count, 3, 'AI 원본 summary 보존');
    await unmount(root);
  });

  test('S2. 플랭크(DURATION): 타이머·가로 진행률 바, 링 없음, 유효 자세 시간은 타이머와 분리, 타이머로 종료, AI 유지 시간 저장', async () => {
    const root = await startWith(routine({ exerciseId: 'plank', measurementType: 'DURATION', sets: [{ seconds: 20 }, { seconds: 20 }] }));
    await feed(10 * 1000, plankFrame);
    assert.equal(ui.hud.kind, 'duration', '시간형 HUD = 타이머 + 가로 진행률 바 (횟수 링 아님)');
    assert.equal(ui.hud.seconds, remaining(), '타이머 = PhaseTimer 잔여 시간');
    assert.equal(ui.hud.seconds, 10);
    assert.ok(Math.abs(ui.hud.progress - 0.5) < 1e-9, '진행률 = 경과/목표 시간');
    assert.equal(typeof ui.hud.holdSeconds, 'number', 'AI 유효 자세 유지 시간 별도 표시');
    assert.ok(ui.hud.holdSeconds >= 0 && ui.hud.holdSeconds < 10, `유효 자세 시간(${ui.hud.holdSeconds})은 경과 시간(10초)과 다른 AI 값`);
    await feed(9 * 1000, plankFrame);
    assert.equal(ui.stage.phase.kind, 'exercising', '유효 자세 시간과 무관하게 타이머 만료 전 진행');
    await feed(1500, plankFrame);
    assert.equal(ui.stage.phase.kind, 'resting', '기존 타이머 정책으로 종료');
    const [item] = await poseItems();
    const hold = item.payload.summary.holdSeconds;
    assert.equal(typeof hold, 'number');
    const set = (await localSession()).sets[0];
    assert.deepEqual([set.actualReps, set.actualDurationSeconds], [null, Math.floor(hold)], 'Workout: actualDurationSeconds = floor(AI holdSeconds)');
    assert.ok(set.actualDurationSeconds < 20, `저장값(${set.actualDurationSeconds})은 타이머 20초가 아닌 AI 유효 자세 시간`);
    await unmount(root);
  });

  test('S3. 푸시업(REPS): 실제 분석기 횟수 → 목표 2회 종료·저장', async () => {
    const root = await startWith(routine({ exerciseId: 'push-up', measurementType: 'REPS', sets: [{ reps: 2 }, { reps: 2 }] }));
    let i = 0;
    const next = (t) => { const ph = i < 30 ? 0 : (1 - Math.cos(((i - 30) * 2 * Math.PI) / 20)) / 2; i += 1; return pushupFrame(t, ph); };
    for (let guard = 0; guard < 40 && ui.stage.phase.kind === 'exercising'; guard += 1) await feed(500, next);
    assert.equal(ui.stage.phase.kind, 'resting', '목표 2회 도달로 종료');
    const set = (await localSession()).sets[0];
    assert.deepEqual([set.actualReps, set.actualDurationSeconds], [2, null]);
    assert.equal((await poseItems())[0].payload.exercise, 'pushup');
    await unmount(root);
  });
});

// ---------------------------------------------------------------------
// 실제 분석기 REPS 통합 검증 공통 (3-3a·3-3b). 3-3a 본문을 옮긴 것이며 단언은 동일하다.
// c: { routineId, poseId, cls, mode, view, make(t), mid, end, width?, height? }
// ---------------------------------------------------------------------
const { poseSupport, readinessAvailability, poseBodyView } = src('services/poseExerciseIds.ts');
const events = [];
let clock = 0;
function resetRealReps() {
  clock = 0; events.length = 0; testMeasure.value = null; testMeasure.summary = null;
  stores.tts.setState({ sendCoachEvent: (e) => { events.push(e); return false; } });
}
/** 동작 시작부터의 경과 시간(ms)으로 합성 관절을 만들고 100ms마다 실제 프레임 + 시계 진행 */
async function feedUntil(untilMs, make, width = 1000, height = 1000) {
  while (clock < untilMs) {
    await act(async () => {
      clock += 100;
      ui.camera.onPoseFrame({ timestampMs: 10000 + clock, width, height, landmarks: make(clock) }, { frameId: clock, inferenceMs: 1 });
      mock.timers.tick(100);
    });
    if (clock % 500 === 0) await settle();
  }
  await settle();
}
async function verifyRealRepsExercise(c) {
  const feedCase = (until) => feedUntil(until, c.make, c.width, c.height);
  // 분석기·readiness·촬영 방향 연결
  assert.deepEqual(poseSupport(c.routineId), { status: 'supported', poseId: c.poseId });
  assert.ok(createExerciseAnalyzer(c.routineId, 'REPS') instanceof poseModule[c.cls], `${c.routineId} → ${c.cls}`);
  const hasProfile = (id) => Object.prototype.hasOwnProperty.call(poseModule.READINESS_PROFILES, id);
  assert.deepEqual(readinessAvailability(c.routineId, hasProfile, 'REPS'), { availability: 'available', poseId: c.poseId });
  assert.equal(poseModule.READINESS_PROFILES[c.poseId].mode, c.mode, 'AI readiness 프로필 연결');
  assert.equal(poseBodyView(c.routineId), c.view);

  const fx = routine({ exerciseId: c.routineId, measurementType: 'REPS', sets: [{ reps: 3 }, { reps: 3 }] });
  const set1 = fx.exercise.sets[0].id;
  const root = await startWith(fx);
  await feedCase(c.mid);
  assert.equal(ui.hud.kind, 'reps', '횟수 링');
  assert.equal(ui.hud.target, 3, '링 진행률 기준 = 현재 세트 목표 3회');
  assert.equal(ui.hud.reps, 1, '두 번째 동작 도중: 완료된 1회만 표시(동작 완료 시에만 증가)');
  assert.equal(ui.hud.seconds, remaining(), '링 옆 잔여 시간 = PhaseTimer');
  assert.equal(ui.stage.phase.kind, 'exercising');

  // 목표 도달 후에도 프레임을 더 넣어 완료 처리 중 중복 종료·중복 저장이 없는지 확인
  await feedCase(c.end + 1500);
  assert.equal(ui.stage.phase.kind, 'resting', '목표 3회 도달 → 세트 종료');
  const feedback = events.filter((e) => e.eventType === 'SET_FEEDBACK');
  assert.equal(feedback.length, 1, 'SET_FEEDBACK 1회');
  assert.equal(feedback[0].exerciseId, c.routineId);
  assert.equal(feedback[0].actualReps, 3);
  assert.equal(feedback[0].actualDurationSeconds, undefined);
  const session = await localSession();
  assert.equal(session.sets.length, 1, 'Workout 세트 결과 1건(중복 없음)');
  assert.deepEqual([session.sets[0].routineSetId, session.sets[0].actualReps, session.sets[0].actualDurationSeconds], [set1, 3, null]);
  const pose = (await storedQueue()).filter((i) => i.kind === 'pose');
  assert.equal(pose.length, 1, 'AI 결과 큐 1건(중복 없음)');
  const payload = pose[0].payload;
  assert.deepEqual([payload.schemaVersion, payload.type, payload.exercise, payload.summary.exercise, payload.summary.count],
    ['2.0', 'set.completed', c.poseId, c.poseId, 3], 'AI 원본 set.completed 보존');
  assert.equal(typeof payload.engineVersion, 'string');
  assert.ok(payload.summary.items && Object.keys(payload.summary.items).length > 0, 'AI 항목별 집계(items) 원본 유지');
  assert.equal(pose[0].routineSetId, set1);
  await unmount(root);
}

// ---------------------------------------------------------------------
// 3-3a: 기존 안정 분석기 3종 실제 분석기 통합 (측정값·finish 주입 없음)
// 프레임은 barofit-pose 자체 테스트(jumping_jack/leg_raise/pike_pushup)의 시간 기반 합성 관절 생성 방식을 따른다.
// 실제 사람 관절 기록이 아니며 자세 인식 정확도·실기기 검증을 뜻하지 않는다.
// ---------------------------------------------------------------------
describe('3-3a — 점핑잭·레그 레이즈·파이크 푸시업 실제 분석기 연동', () => {
  const blank = (fill) => Array.from({ length: 33 }, () => (fill ? [...fill] : [null, null, null, null, null]));
  const jumpingJack = (t) => {
    const phase = (t % 1000) / 1000, w = 0.4 + (2.1 - 0.4) * (1 - Math.cos(2 * Math.PI * phase)) / 2;
    const h = (1 - Math.cos(2 * Math.PI * phase)) / 2, ang = ((10 + h * 165) * Math.PI) / 180;
    const a = blank([0.5, 0.2, 0, 1, 1]);
    a[11] = [0.4, 0.3, 0, 1, 1]; a[12] = [0.6, 0.3, 0, 1, 1]; a[23] = [0.43, 0.55, 0, 1, 1]; a[24] = [0.57, 0.55, 0, 1, 1];
    a[27] = [0.5 - w * 0.1, 0.9, 0, 1, 1]; a[28] = [0.5 + w * 0.1, 0.9, 0, 1, 1];
    a[15] = [a[11][0] - 0.23 * Math.sin(ang), 0.3 + 0.23 * Math.cos(ang), 0, 1, 1];
    a[16] = [a[12][0] + 0.23 * Math.sin(ang), 0.3 + 0.23 * Math.cos(ang), 0, 1, 1];
    return a;
  };
  const legRaise = (t) => {
    const angle = 5 + 80 * (1 - Math.cos((2 * Math.PI * t) / 4000)) / 2, r = (angle * Math.PI) / 180;
    const lm = blank();
    for (const [s, h, k, a, dy] of [[11, 23, 25, 27, 0], [12, 24, 26, 28, 0.015]]) {
      lm[s] = [0.2, 0.7 + dy, 0, 1, 1]; lm[h] = [0.45, 0.7 + dy, 0, 1, 1];
      lm[k] = [0.45 + 0.22 * Math.cos(r), 0.7 + dy - 0.22 * Math.sin(r), 0, 1, 1];
      lm[a] = [lm[k][0] + 0.22 * Math.cos(r), lm[k][1] - 0.22 * Math.sin(r), 0, 1, 1];
    }
    return lm;
  };
  const pikePushup = (t) => {
    const progress = (1 - Math.cos((2 * Math.PI * t) / 4000)) / 2;
    const top = [[350, 350], [275, 500], [200, 650], [500, 200], [650, 420], [800, 650], [300, 430]];
    const bottom = [[180, 500], [250, 580], [200, 650], [500, 250], [650, 450], [800, 650], [100, 600]];
    const pts = top.map((a, i) => a.map((v, j) => v + (bottom[i][j] - v) * progress));
    const lm = blank();
    for (const ids of [[11, 13, 15, 23, 25, 27], [12, 14, 16, 24, 26, 28]]) for (let j = 0; j < 6; j += 1) lm[ids[j]] = [pts[j][0] / 1000, pts[j][1] / 1000, 0, 1, 1];
    lm[0] = [pts[6][0] / 1000, pts[6][1] / 1000, 0, 1, 1];
    return lm;
  };

  const CASES = [
    { routineId: 'jumping-jack', poseId: 'jumping_jack', cls: 'JumpingJackAnalyzer', mode: 'both', view: 'front', make: jumpingJack, mid: 1500, end: 3300 },
    { routineId: 'leg-raise', poseId: 'leg_raise', cls: 'LegRaiseAnalyzer', mode: 'either', view: 'side', make: legRaise, mid: 6000, end: 12300 },
    { routineId: 'pike-push-up', poseId: 'pike_pushup', cls: 'PikePushupAnalyzer', mode: 'either', view: 'side', make: pikePushup, mid: 6000, end: 12500 },
  ];
  for (const c of CASES) {
    test(`${c.routineId}: 실제 분석기 → 횟수 링·목표 3회 종료 → SET_FEEDBACK·Workout·AI 원본 저장, 중복 없음`, () => verifyRealRepsExercise(c));
  }
  beforeEach(resetRealReps);
  afterEach(() => { stores.tts.setState({ sendCoachEvent: () => false }); });
});

// ---------------------------------------------------------------------
// 3-3b: 실험 분석기 5종 실제 분석기 통합 (측정값·finish 주입 없음)
// 프레임은 barofit-pose cycle_models.test.mjs의 합성 관절 생성 방식(동작 중/정지 자세)을 1초 주기로 반복한 것이다.
// experimental-0.1 분석기의 FE 연동 검증이며 실제 자세 판정 정확도·실기기 검증을 뜻하지 않는다.
// ---------------------------------------------------------------------
describe('3-3b — 실험 분석기 5종 실제 분석기 연동', () => {
  /** cycle_models.test.mjs frame(id, t, active) — 왼쪽 관절만 입력(분석기가 관측된 쪽을 선택) */
  const cycleLandmarks = (id, active) => {
    const points = Array.from({ length: 33 }, () => [null, null, null, null, null]);
    const put = (i, x, y) => { points[i] = [x, y, 0, 1, 1]; };
    put(11, 0.4, 0.2); put(23, 0.4, 0.4); put(25, 0.4, 0.6); put(27, active ? 0.62 : 0.4, active ? 0.6 : 0.85);
    if (id === 'standing_calf_raise') { put(29, 0.4, active ? 0.80 : 0.89); put(31, 0.46, 0.90); }
    if (id === 'incline_pushup') { put(11, 0.3, 0.3); put(13, 0.3, 0.5); put(15, active ? 0.5 : 0.3, active ? 0.5 : 0.70); put(23, 0.6, 0.5); }
    if (id === 'side_lying_leg_raise') { put(11, 0.2, 0.55); put(23, 0.5, 0.55); put(25, 0.66, active ? 0.40 : 0.55); put(27, 0.82, active ? 0.25 : 0.55); }
    return points;
  };
  /** 1초 주기: 0.4초 시작 자세 → 0.4초 동작 → 0.2초 복귀. AI는 복귀 시점(0.8·1.8·2.8초)에 1회 완료 */
  const cycle = (id) => (t) => { const p = t % 1000; return cycleLandmarks(id, p >= 400 && p < 800); };
  const CASES = [
    { routineId: 'split-squat', poseId: 'split_squat', cls: 'SplitSquatAnalyzer', view: null },
    { routineId: 'bulgarian-split-squat', poseId: 'bulgarian_split_squat', cls: 'BulgarianSplitSquatAnalyzer', view: null },
    { routineId: 'incline-push-up', poseId: 'incline_pushup', cls: 'InclinePushupAnalyzer', view: 'side' },
    { routineId: 'standing-calf-raise', poseId: 'standing_calf_raise', cls: 'StandingCalfRaiseAnalyzer', view: null },
    { routineId: 'side-lying-leg-raise', poseId: 'side_lying_leg_raise', cls: 'SideLegRaiseAnalyzer', view: null },
  ].map((c) => ({ ...c, mode: 'either', make: cycle(c.poseId), mid: 1600, end: 3000, width: 800, height: 800 }));

  beforeEach(resetRealReps);
  afterEach(() => { stores.tts.setState({ sendCoachEvent: () => false }); });
  for (const c of CASES) {
    test(`${c.routineId}: 실제 분석기 → 횟수 링·목표 3회 종료 → SET_FEEDBACK·Workout·AI 원본 저장, 중복 없음`, () => verifyRealRepsExercise(c));
  }

  test('readiness: 5종 모두 자기 AI 프로필로 준비 완료, 카프레이즈는 발뒤꿈치·발끝 관절이 필요', () => {
    for (const c of CASES) {
      const readiness = new poseModule.CameraReadiness({ exercise: c.poseId });
      let r;
      for (let t = 0; t <= 1500; t += 100) r = readiness.pushFrame({ timestampMs: t, width: 800, height: 800, landmarks: cycleLandmarks(c.poseId, false) });
      assert.equal(r.ready, true, `${c.poseId} 준비 완료`);
      assert.equal(r.exercise, c.poseId, '다른 운동 프로필로 대체하지 않음');
    }
    assert.deepEqual([...poseModule.READINESS_PROFILES.standing_calf_raise.joints], ['shoulder', 'hip', 'knee', 'ankle', 'heel', 'foot_index']);
    for (const [index, name] of [[29, 'left_heel'], [31, 'left_foot_index']]) {
      const readiness = new poseModule.CameraReadiness({ exercise: 'standing_calf_raise' });
      let r;
      for (let t = 0; t <= 1500; t += 100) {
        const landmarks = cycleLandmarks('standing_calf_raise', false);
        landmarks[index] = [null, null, null, null, null];
        r = readiness.pushFrame({ timestampMs: t, width: 800, height: 800, landmarks });
      }
      assert.equal(r.ready, false, `${name} 없으면 준비 완료 아님`);
      assert.deepEqual(r.missingLandmarks, [name]);
    }
  });

  test('명시적 분석기 ID 유지: 스플릿·불가리안 분리, 인클라인 푸시업은 일반 푸시업 분석기로 대체하지 않음', () => {
    assert.ok(createExerciseAnalyzer('split-squat') instanceof poseModule.SplitSquatAnalyzer);
    assert.ok(!(createExerciseAnalyzer('split-squat') instanceof poseModule.BulgarianSplitSquatAnalyzer));
    assert.ok(createExerciseAnalyzer('bulgarian-split-squat') instanceof poseModule.BulgarianSplitSquatAnalyzer);
    assert.ok(createExerciseAnalyzer('incline-push-up') instanceof poseModule.InclinePushupAnalyzer);
    assert.ok(!(createExerciseAnalyzer('incline-push-up') instanceof poseModule.PushupAnalyzer));
  });
});

// ---------------------------------------------------------------------
// 3-3c: 버드독·데드버그 실제 분석기 통합 (측정값·finish 주입 없음, 좌우 규칙은 AI 실제 동작을 따름)
//  - 버드독: barofit-pose bird-dog-v1-parity.json.gz 'normal' 합성 시퀀스(오른다리 1회). 왼쪽 동작은 MediaPipe 좌우 관절 쌍을 교환해 만든다
//  - 데드버그(experimental-0.1): cycle_models.test.mjs의 dead_bug 합성 관절(좌/우)
// 합성 관절 기반 FE 연동 검증이며 실제 자세 판정 정확도·실기기 검증을 뜻하지 않는다.
// ---------------------------------------------------------------------
describe('3-3c — 버드독·데드버그 실제 분석기 연동', () => {
  const zlib = require('node:zlib');
  const birdRows = zlib.gunzipSync(fs.readFileSync(nm('@barofit/pose/tests/js/fixtures/bird-dog-v1-parity.json.gz'))).toString('utf8').trim().split('\n').map((l) => JSON.parse(l));
  const birdNormal = birdRows.filter((r) => r.case === 'normal' && r.frame).map((r) => r.frame); // 0~5000ms, 50ms 간격, 1000x600
  const PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10]];
  for (let i = 11; i <= 31; i += 2) PAIRS.push([i, i + 1]);
  const swapSides = (landmarks) => { const l = landmarks.map((p) => [...p]); for (const [a, b] of PAIRS) [l[a], l[b]] = [l[b], l[a]]; return l; };
  const SEQ_MS = 5100;
  /** 오른다리 → 왼다리 → 오른다리 (각 5.1초). 시퀀스가 끝나면 마지막 자세 유지 */
  const birdDog = (t) => {
    const k = Math.min(2, Math.floor(t / SEQ_MS));
    const rel = Math.min(5000, t - k * SEQ_MS);
    const frame = birdNormal[Math.round(rel / 50)];
    return k === 1 ? swapSides(frame.landmarks) : frame.landmarks;
  };
  const deadBugLandmarks = (active, side) => {
    const points = Array.from({ length: 33 }, () => [null, null, null, null, null]);
    const off = side === 'left' ? 0 : 1;
    const put = (i, x, y) => { points[i + off] = [x, y, 0, 1, 1]; };
    put(11, 0.2, 0.55); put(23, 0.5, 0.55); put(25, active ? 0.7 : 0.5, active ? 0.5 : 0.32); put(27, active ? 0.62 : 0.4, active ? 0.6 : 0.85);
    return points;
  };
  /** 1초 주기 왼쪽 → 오른쪽 → 왼쪽 교대 (0.4초 동작). AI는 복귀 시점마다 쪽과 무관하게 1회 합산 */
  const deadBug = (t) => { const p = t % 1000; const side = Math.floor(t / 1000) % 2 === 0 ? 'left' : 'right'; return deadBugLandmarks(p >= 400 && p < 800, side); };

  beforeEach(resetRealReps);
  afterEach(() => { stores.tts.setState({ sendCoachEvent: () => false }); });
  const lastPose = async () => (await storedQueue()).filter((i) => i.kind === 'pose').at(-1);

  test('bird-dog: 좌우 각 1회씩 합산(R·L·R = 3), sideCounts·holdSeconds는 AI 원본에만, Workout은 count만', async () => {
    await verifyRealRepsExercise({ routineId: 'bird-dog', poseId: 'bird_dog', cls: 'BirdDogAnalyzer', mode: 'both', view: 'side',
      make: birdDog, mid: SEQ_MS + 3000, end: SEQ_MS * 2 + 4200, width: 1000, height: 600 });
    // mid(왼다리를 뻗어 유지 중): 1회만 표시 → 한쪽 동작 완료 전 증가 없음 (공통 함수에서 검증)
    const payload = (await lastPose()).payload;
    assert.deepEqual(payload.summary.details.sideCounts, { left: 1, right: 2 }, 'AI 실제 좌우 카운트 원본 보존');
    assert.deepEqual(payload.summary.details.repetitions.map((r) => r.side), ['right', 'left', 'right']);
    assert.equal(typeof payload.summary.holdSeconds, 'number');
    assert.ok(payload.summary.holdSeconds > 0, 'AI가 count와 holdSeconds를 함께 반환');
    const set = (await storedQueue()).filter((i) => i.kind !== 'pose').at(-1).session.sets[0];
    assert.deepEqual([set.actualReps, set.actualDurationSeconds], [3, null], 'Workout: count만 actualReps, 보조 holdSeconds 미저장');
    assert.equal(events.filter((e) => e.eventType === 'SET_FEEDBACK')[0].actualDurationSeconds, undefined);
  });

  test('dead-bug(experimental): 왼쪽·오른쪽 교대 동작을 AI가 쪽과 무관하게 1회씩 합산, FE는 count 그대로 사용', async () => {
    await verifyRealRepsExercise({ routineId: 'dead-bug', poseId: 'dead_bug', cls: 'DeadBugAnalyzer', mode: 'both', view: null,
      make: deadBug, mid: 1600, end: 3000, width: 800, height: 800 });
    const payload = (await lastPose()).payload;
    assert.deepEqual(payload.summary.details.repetitions.map((r) => r.metrics.side), ['left', 'right', 'left'], '좌·우·좌 각 1회');
    assert.equal(payload.summary.count, 3, 'count 3을 두 배·절반으로 변환하지 않음');
    const set = (await storedQueue()).filter((i) => i.kind !== 'pose').at(-1).session.sets[0];
    assert.equal(set.actualReps, 3);
  });

  test('both readiness: 양쪽 필수 관절이 보이면 준비 완료, 한쪽 관절 하나라도 없으면 미완료, 다른 프로필로 대체 없음', () => {
    const readyOf = (exercise, landmarks, width, height) => {
      const r0 = new poseModule.CameraReadiness({ exercise });
      let r;
      for (let t = 0; t <= 1500; t += 100) r = r0.pushFrame({ timestampMs: t, width, height, landmarks });
      return r;
    };
    assert.deepEqual([...poseModule.READINESS_PROFILES.bird_dog.joints], ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']);
    assert.equal(poseModule.READINESS_PROFILES.bird_dog.mode, 'both');
    assert.equal(poseModule.READINESS_PROFILES.dead_bug.mode, 'both');
    const birdStart = birdNormal[0].landmarks;
    let r = readyOf('bird_dog', birdStart, 1000, 600);
    assert.deepEqual([r.ready, r.exercise, r.selectedSide], [true, 'bird_dog', 'both'], '버드독 시작 자세(양쪽 관절) 준비 완료');
    const noLeftWrist = birdStart.map((p) => [...p]); noLeftWrist[15] = [null, null, null, null, null];
    r = readyOf('bird_dog', noLeftWrist, 1000, 600);
    assert.deepEqual([r.ready, r.missingLandmarks], [false, ['left_wrist']]);

    const deadBugStart = Array.from({ length: 33 }, () => [null, null, null, null, null]);
    for (const off of [0, 1]) {
      const put = (i, x, y) => { deadBugStart[i + off] = [x, y + off * 0.02, 0, 1, 1]; };
      put(11, 0.3, 0.6); put(13, 0.3, 0.4); put(15, 0.3, 0.25); put(23, 0.55, 0.6); put(25, 0.65, 0.4); put(27, 0.8, 0.42);
    }
    r = readyOf('dead_bug', deadBugStart, 800, 800);
    assert.deepEqual([r.ready, r.selectedSide], [true, 'both'], '데드버그 양쪽 관절 준비 완료');
    const noRightAnkle = deadBugStart.map((p) => [...p]); noRightAnkle[28] = [null, null, null, null, null];
    r = readyOf('dead_bug', noRightAnkle, 800, 800);
    assert.deepEqual([r.ready, r.missingLandmarks], [false, ['right_ankle']], '한쪽 발목 누락 → 미완료');
    assert.equal(readyOf('pushup', noRightAnkle, 800, 800).ready, true, '참고: 한쪽(either) 프로필이었다면 통과 → both 프로필이 대체되지 않았음을 확인');
  });
});

// ---------------------------------------------------------------------
// 3-3d: 런지·수퍼맨 실제 분석기 통합 (측정값·finish 주입 없음)
//  - 런지(experimental-0.1): cycle_models.test.mjs 합성 관절(기본 하체 분기), 좌·우 교대
//  - 수퍼맨: superman.test.mjs 합성 관절(엎드려 팔다리 들어 올렸다 내리기, 4초 주기)
// 합성 관절 기반 FE 연동 검증이며 실제 자세 판정 정확도·실기기 검증을 뜻하지 않는다.
// ---------------------------------------------------------------------
describe('3-3d — 런지·수퍼맨 실제 분석기 연동', () => {
  const lungeLandmarks = (active, side) => {
    const points = Array.from({ length: 33 }, () => [null, null, null, null, null]);
    const off = side === 'left' ? 0 : 1;
    const put = (i, x, y) => { points[i + off] = [x, y, 0, 1, 1]; };
    put(11, 0.4, 0.2); put(23, 0.4, 0.4); put(25, 0.4, 0.6); put(27, active ? 0.62 : 0.4, active ? 0.6 : 0.85);
    return points;
  };
  /** 1초 주기 왼쪽 → 오른쪽 → 왼쪽 교대 (0.4초 동작) */
  const lunge = (t) => { const p = t % 1000; const side = Math.floor(t / 1000) % 2 === 0 ? 'left' : 'right'; return lungeLandmarks(p >= 400 && p < 800, side); };
  const superman = (t) => {
    const r = ((25 * (1 - Math.cos((2 * Math.PI * t) / 4000))) / 2) * Math.PI / 360;
    const h = [500, 550], s = [500 - 220 * Math.cos(r), 550 - 220 * Math.sin(r)], k = [500 + 190 * Math.cos(r), 550 - 190 * Math.sin(r)];
    const a = [k[0] + 180 * Math.cos(r), k[1] - 180 * Math.sin(r)], e = [s[0] - 100 * Math.cos(r), s[1] - 100 * Math.sin(r)];
    const w = [e[0] - 100 * Math.cos(r), e[1] - 100 * Math.sin(r)];
    const lm = Array.from({ length: 33 }, () => [null, null, null, null, null]);
    for (const ids of [[11, 13, 15, 23, 25, 27], [12, 14, 16, 24, 26, 28]]) for (let j = 0; j < 6; j += 1) { const [x, y] = [s, e, w, h, k, a][j]; lm[ids[j]] = [x / 1000, y / 1000, 0, 1, 1]; }
    return lm;
  };
  beforeEach(resetRealReps);
  afterEach(() => { stores.tts.setState({ sendCoachEvent: () => false }); });
  const lastPose = async () => (await storedQueue()).filter((i) => i.kind === 'pose').at(-1);
  const lastSet = async () => (await storedQueue()).filter((i) => i.kind !== 'pose').at(-1).session.sets[0];

  test('lunge(experimental): 좌·우 교대 동작을 AI가 1회씩 합산, forward-lunge 등 별개 항목과 혼동 없음', async () => {
    assert.deepEqual(poseSupport('forward-lunge'), { status: 'unknown', poseId: null }, '별개 카탈로그 항목은 분석기 연결 안 함');
    assert.equal(createExerciseAnalyzer('forward-lunge'), null);
    await verifyRealRepsExercise({ routineId: 'lunge', poseId: 'lunge', cls: 'LungeAnalyzer', mode: 'either', view: 'side',
      make: lunge, mid: 1600, end: 3000, width: 800, height: 800 });
    const payload = (await lastPose()).payload;
    assert.deepEqual(payload.summary.details.repetitions.map((r) => r.metrics.side), ['left', 'right', 'left'], '좌·우·좌 각 1회');
    assert.equal(payload.summary.count, 3, 'AI count 그대로 (FE 변환 없음)');
    assert.equal((await lastSet()).actualReps, 3);
  });

  test('superman: count는 actualReps, 보조 holdSeconds·holdBasis는 AI 원본에만 (DURATION 처리 없음)', async () => {
    await verifyRealRepsExercise({ routineId: 'superman', poseId: 'superman', cls: 'SupermanAnalyzer', mode: 'either', view: 'side',
      make: superman, mid: 6000, end: 11400 });
    const payload = (await lastPose()).payload;
    assert.equal(typeof payload.summary.holdSeconds, 'number');
    assert.ok(payload.summary.holdSeconds > 0, 'AI가 count와 holdSeconds를 함께 반환');
    assert.ok('holdBasis' in payload.summary.details, 'AI 보조 측정 원본(holdBasis) 보존');
    assert.equal(payload.summary.details.repetitions.length, 3);
    const set = await lastSet();
    assert.deepEqual([set.actualReps, set.actualDurationSeconds], [3, null], 'Workout: count만, 유지 시간 미저장');
    const feedback = events.filter((e) => e.eventType === 'SET_FEEDBACK')[0];
    assert.deepEqual([feedback.actualReps, feedback.actualDurationSeconds], [3, undefined]);
  });
});

// ---------------------------------------------------------------------
// 3-4a: 글루트 브리지 실제 분석기 통합 (REPS 확정, 측정값·finish 주입 없음)
// 프레임은 barofit-pose glute_bridge.test.mjs의 합성 관절(엉덩이 들어 올렸다 내리기, 4초 주기)을 따른다.
// 합성 관절 기반 FE 연동 검증이며 실제 자세 판정 정확도·실기기 검증을 뜻하지 않는다.
// ---------------------------------------------------------------------
describe('3-4a — 글루트 브리지 실제 분석기 연동 (REPS)', () => {
  const gluteBridge = (t) => {
    const extension = 120 + 60 * (1 - Math.cos((2 * Math.PI * t) / 4000)) / 2;
    const s = [200, 700], k = [700, 400], sk = Math.hypot(500, 300), offset = (sk / 2) * Math.tan(((180 - extension) * Math.PI) / 360);
    const h = [450 + (300 / sk) * offset, 550 + (500 / sk) * offset], a = [780, 700];
    const lm = Array.from({ length: 33 }, () => [null, null, null, null, null]);
    for (const ids of [[11, 23, 25, 27], [12, 24, 26, 28]]) for (let j = 0; j < 4; j += 1) { const [x, y] = [s, h, k, a][j]; lm[ids[j]] = [x / 1000, y / 1000, 0, 1, 1]; }
    return lm;
  };
  beforeEach(resetRealReps);
  afterEach(() => { stores.tts.setState({ sendCoachEvent: () => false }); });

  test('glute-bridge: 들어 올렸다 시작 높이로 복귀 시 1회, 횟수형 HUD, holdSeconds null이어도 REPS 결과 저장', async () => {
    // mid 6000ms = 두 번째 동작의 최고점(들어 올린 상태): 완료된 1회만 표시 (공통 함수에서 검증)
    await verifyRealRepsExercise({ routineId: 'glute-bridge', poseId: 'glute_bridge', cls: 'GluteBridgeAnalyzer', mode: 'either', view: 'side',
      make: gluteBridge, mid: 6000, end: 11500 });
    const payload = (await storedQueue()).filter((i) => i.kind === 'pose').at(-1).payload;
    assert.equal(payload.summary.holdSeconds, null, 'AI는 반복 운동의 holdSeconds를 null로 반환');
    assert.equal(payload.summary.details.repetitions.length, 3);
    assert.ok(payload.summary.details.repetitions.every((r) => typeof r.metrics.tempo.topHoldMs === 'number'), '상단 정지 시간은 회차별 AI 원본(tempo.topHoldMs)에만');
    const set = (await storedQueue()).filter((i) => i.kind !== 'pose').at(-1).session.sets[0];
    assert.deepEqual([set.actualReps, set.actualDurationSeconds], [3, null], '유지 시간이 횟수·actualDurationSeconds로 저장되지 않음');
  });
});

// ---------------------------------------------------------------------
// 3-4c: 마운틴 클라이머 실제 분석기 통합 (Routine V13 REPS, 측정값·finish 주입 없음)
// 프레임은 barofit-pose mountain_climber.test.mjs의 합성 관절(높은 플랭크 측면, packet)을 따르며
// 1초 주기 중 400~800ms 동안 한쪽 무릎만 당겼다가(0.75 → 0.47) 복귀하고, 매 초 좌·우를 교대한다.
// 합성 관절 기반 FE 연동 검증이며 실제 자세 판정 정확도·실기기 검증을 뜻하지 않는다.
// legacy DURATION snapshot 차단은 A3(단일 운동)와 아래 L1~L3(이어하기·다음 운동)에서 검증한다.
// ---------------------------------------------------------------------
describe('3-4c — 마운틴 클라이머 실제 분석기 연동 (REPS)', () => {
  /** mode: 'cycle'(좌우 교대 왕복) | 'still'(높은 플랭크 정지) | 'hold'(왼쪽 무릎 당긴 채 유지) */
  const mcFrame = (t, mode = 'cycle') => {
    const p = t % 1000, side = Math.floor(t / 1000) % 2, active = mode === 'cycle' && p >= 400 && p < 800;
    const lm = Array.from({ length: 33 }, () => [null, null, null, null, null]);
    const place = (i, x, y) => { lm[i] = [x, y, 0, 1, 1]; };
    for (const j of [0, 1]) {
      place(11 + j, 0.3, 0.43); place(15 + j, 0.31, 0.76); place(23 + j, 0.6, 0.45);
      place(25 + j, (active && j === side) || (mode === 'hold' && j === 0) ? 0.47 : 0.75, 0.55); place(27 + j, 0.9, 0.69);
    }
    return lm;
  };
  /** 호출 시점부터의 경과 시간으로 프레임 생성(새 세트 분석기가 동작 처음부터 관측하도록) */
  async function feedMc(ms, mode = 'cycle') { const t0 = clock; await feedUntil(clock + ms, (t) => mcFrame(t - t0, mode), 800, 600); }
  /** 프레임 없이 시계만 진행해 지정 운동·세트의 운동 단계까지 이동 */
  async function untilPhase(exerciseIndex, set) {
    for (let i = 0; i < 600; i += 1) {
      const ph = ui.stage?.phase;
      if (ph?.kind === 'exercising' && ph.exerciseIndex === exerciseIndex && ph.set === set) return;
      await advance(250);
    }
    assert.fail(`HARNESS: ${exerciseIndex}번 운동 ${set}세트에 도달하지 않음`);
  }
  /** 여러 운동 snapshot (routine()과 같은 형식) */
  function multi(items) {
    const parts = items.map((it) => routine(it));
    const exercises = parts.map((part, i) => ({ ...part.exercise, order: i + 1 }));
    return { snapshot: { ...parts[0].snapshot, exercises }, sessions: parts.map((part) => part.sessions[0]), exercises };
  }
  const MC = (sets) => ({ exerciseId: 'mountain-climber', measurementType: 'REPS', sets: sets.map((reps) => ({ reps })) });
  const LEGACY_MC = { exerciseId: 'mountain-climber', measurementType: 'DURATION', sets: [{ seconds: 20 }] };
  const poseItems = async () => (await storedQueue()).filter((i) => i.kind === 'pose');
  /** 큐에 마지막으로 기록된 세션 (운동 완료 후 로컬 세션이 지워져도 확인 가능, report 항목 제외) */
  const lastSession = async () => (await storedQueue()).filter((i) => i.session).at(-1).session;
  const feedbacks = () => events.filter((e) => e.eventType === 'SET_FEEDBACK');
  beforeEach(resetRealReps);
  afterEach(() => { stores.tts.setState({ sendCoachEvent: () => false }); testMeasure.value = null; testMeasure.summary = null; });

  test('C1. 공통 하니스: 실제 분석기 → 횟수 링·목표 3회 종료 → SET_FEEDBACK·Workout·AI 원본 저장, 중복 없음', async () => {
    // mid 1500ms: 1회(왼쪽) 완료 후 두 번째 동작 전, end 2800ms: 3회(왼·오·왼) 완료
    await verifyRealRepsExercise({ routineId: 'mountain-climber', poseId: 'mountain_climber', cls: 'MountainClimberAnalyzer', mode: 'either', view: 'side',
      make: mcFrame, mid: 1500, end: 2800, width: 800, height: 600 });
    const payload = (await poseItems()).at(-1).payload;
    assert.equal(payload.engineVersion, 'mountain-climber-0.5');
    assert.deepEqual(payload.summary.details.repetitions.map((r) => r.metrics.side), ['left', 'right', 'left'], 'AI 반복 기록(좌우) 원본 유지');
    assert.equal(payload.summary.holdSeconds, null);
    assert.equal(typeof payload.summary.observedSeconds, 'number', '보조 observedSeconds는 원본에만');
  });

  test('C2. 한쪽 무릎 왕복 = 1회, 반대쪽 = +1회, 좌우 한 쌍 = 2회 (FE 변환 없음). 정지·당긴 채 유지는 횟수 아님', async () => {
    const root = await startWith(routine(MC([16, 16])));
    await feedMc(3000, 'still');
    assert.equal(ui.stage.currentReps, 0, '높은 플랭크 자세 진입만으로는 0회');
    await feedMc(3000, 'hold');
    assert.equal(ui.stage.currentReps, 0, '무릎을 당긴 채 복귀하지 않으면 0회(미완료 동작)');
    await feedMc(1000, 'still');
    const before = ui.stage.currentReps;
    assert.ok(before <= 1, `복귀 시점에 최대 1회만 인정: ${before}`);
    const start = before;
    await feedMc(900);
    assert.equal(ui.stage.currentReps, start + 1, '왼쪽 무릎 왕복 완료 → +1');
    await feedMc(1000);
    assert.equal(ui.stage.currentReps, start + 2, '오른쪽 왕복 완료 → +1 (좌우 한 쌍 = 2회)');
    assert.equal(ui.hud.reps, ui.stage.currentReps, 'HUD 횟수 = AI count 그대로');
    await feedMc(2000);
    assert.equal(ui.stage.currentReps, start + 4, '두 쌍 = 4회');
    assert.equal(ui.stage.phase.kind, 'exercising', '목표 16회 미만 → 세트 진행');
    await unmount(root);
  });

  test('C3. 세트 목표 16·20·24회(snapshot targets): 각 세트가 자기 목표에서 종료, 휴식 중 다음 세트 목표, 결과 actualReps = count', async () => {
    const fx = routine(MC([16, 20, 24]));
    const root = await startWith(fx);
    const targets = [16, 20, 24];
    for (let set = 1; set <= 3; set += 1) {
      if (set > 1) await untilPhase(0, set);
      const target = targets[set - 1];
      assert.equal(ui.stage.targetReps, target, `${set}세트 목표 ${target}회`);
      await feedMc((target - 2) * 1000 + 900);
      assert.deepEqual([ui.hud.kind, ui.hud.target, ui.hud.reps], ['reps', target, target - 1], `${set}세트 REPS 링: count / 현재 세트 목표`);
      assert.equal(ui.stage.currentReps, target - 1, `${set}세트 ${target - 1}회: 아직 진행`);
      assert.equal(ui.stage.phase.kind, 'exercising');
      assert.equal(ui.hud.seconds, remaining(), '링 옆 잔여 시간 = 기존 PhaseTimer');
      await feedMc(2500);
      if (set < 3) {
        assert.equal(ui.stage.phase.kind, 'resting', `${set}세트 ${target}회 도달 → 종료`);
        assert.equal(ui.stage.targetReps, targets[set], `휴식 중 표시 목표 = 다음(${set + 1})세트 ${targets[set]}회`);
      }
    }
    assert.ok(ui.completeRenders > 0, '마지막 세트 24회 → 운동 완료');
    const session = await lastSession();
    assert.deepEqual(session.sets.map((x) => [x.routineSetId, x.actualReps, x.actualDurationSeconds]),
      fx.exercise.sets.map((x, i) => [x.id, targets[i], null]), 'Workout 저장: actualReps = AI count, 시간 null');
    const pose = await poseItems();
    assert.deepEqual(pose.map((i) => [i.routineSetId, i.payload.summary.count]), fx.exercise.sets.map((x, i) => [x.id, targets[i]]), 'AI 결과 세트별 1건');
    assert.deepEqual(feedbacks().map((e) => [e.exerciseId, e.actualReps, e.actualDurationSeconds]),
      targets.map((n) => ['mountain-climber', n, undefined]), 'SET_FEEDBACK 주 측정값 count');
    await unmount(root);
  });

  test('C4. 기존 60초 타이머 만료 종료 유지: 목표 미달이면 실제 count로 저장', async () => {
    const fx = routine(MC([24, 24]));
    const root = await startWith(fx);
    await feedMc(4900); // 5회
    await feedMc(EXERCISE_DURATION_SECONDS * 1000 - 4900 + 1000, 'still');
    assert.equal(ui.stage.phase.kind, 'resting', '타이머 만료로 세트 종료');
    assert.equal(stallAlerts().length, 0, '측정 프레임이 있으므로 M10 정지 아님');
    const set = (await localSession()).sets[0];
    assert.deepEqual([set.routineSetId, set.actualReps, set.actualDurationSeconds], [fx.exercise.sets[0].id, 5, null]);
    assert.deepEqual(feedbacks().map((e) => e.actualReps), [5]);
    assert.equal((await poseItems()).length, 1);
    await unmount(root);
  });

  test('C5. 수동 일시정지·재개 후 누적 count 유지, 세트 결과 중복 없음', async () => {
    const root = await startWith(routine(MC([16, 16])));
    await feedMc(5900); // 6회
    assert.equal(ui.stage.currentReps, 6);
    await act(async () => { ui.stage.onPressMenu(); }); await settle();
    assert.equal(ui.stage.pause, 'paused');
    await feedMc(3000); // 일시정지 중 프레임은 측정하지 않음
    assert.equal(ui.stage.currentReps, 6, '일시정지 중 증가·손실 없음');
    await resumeLikeUser();
    assert.equal(ui.stage.currentReps, 6, '재개 후 누적 6회 유지');
    await feedMc(10900);
    assert.equal(ui.stage.phase.kind, 'resting', '16회 도달 → 종료');
    assert.deepEqual((await localSession()).sets.map((x) => x.actualReps), [16]);
    assert.equal((await poseItems()).length, 1);
    await unmount(root);
  });

  test('C6. REPS checkpoint·이어하기: 같은 세트·snapshot 목표로 실제 분석기 재연결, 결과 저장', async () => {
    const fx = routine(MC([16, 20]));
    let root = await startWith(fx);
    await feedMc(16 * 1000);
    await untilPhase(0, 2);
    await feedMc(3900);
    await act(async () => { ui.stage.onPressMenu(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onPressStop(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onConfirmStop(); }); await settle();
    const draft = useWorkoutDraftStore.getState().draft;
    assert.deepEqual([draft.exerciseId, draft.phase, draft.set, draft.targetReps], ['mountain-climber', 'exercising', 2, 20], 'checkpoint = 2세트 목표 20회');
    await unmount(root);

    root = await mount({ resume: '1' });
    assert.deepEqual([ui.stage.phase.set, ui.stage.targetReps], [2, 20], '이어하기: 2세트 목표 20회');
    await resumeLikeUser();
    await feedMc(1500);
    assert.deepEqual([ui.hud.kind, ui.hud.reps, ui.hud.target], ['reps', 1, 20], '이어하기 후 실제 분석기 count로 REPS 링');
    await feedMc(18 * 1000 + 400);
    assert.ok(ui.completeRenders > 0, '20회 → 마지막 세트 완료');
    const session = await lastSession();
    assert.deepEqual(session.sets.map((x) => [x.routineSetId, x.actualReps, x.actualDurationSeconds]),
      [[fx.exercise.sets[0].id, 16, null], [fx.exercise.sets[1].id, 20, null]]);
    assert.equal((await poseItems()).length, 2, 'AI 결과 중복 없음');
    await unmount(root);
  });

  test('C7. 루틴 내 다음 운동 전환: 스쿼트 → 마운틴 클라이머(REPS) 실제 분석기 연결', async () => {
    const fx = multi([{ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 2 }] }, MC([3])]);
    const root = await startWith(fx);
    // 앞 운동(스쿼트)은 기존 3-1b/3-1c 방식(실제 Squat 분석기 출력의 count만 지정)으로 2회 종료. 마운틴 클라이머는 주입 없이 실제 분석기
    testMeasure.value = { count: 2 }; testMeasure.summary = { count: 2 };
    await act(async () => { feedFrames = true; pushEmptyFrame(); feedFrames = false; }); await settle();
    testMeasure.value = null; testMeasure.summary = null;
    assert.notEqual(ui.stage.phase.kind, 'exercising', '스쿼트 세트 종료');
    await untilPhase(1, 1);
    assert.equal(ui.stage.targetReps, 3);
    await feedMc(1500);
    assert.deepEqual([ui.hud.kind, ui.hud.reps, ui.hud.target], ['reps', 1, 3], '다음 운동 REPS 링');
    await feedMc(1400);
    assert.ok(ui.completeRenders > 0, '마운틴 클라이머 3회 → 루틴 완료');
    const session = await lastSession();
    assert.deepEqual(session.sets.map((x) => [x.routineSetId, x.actualReps]), [[fx.exercises[0].sets[0].id, 2], [fx.exercises[1].sets[0].id, 3]]);
    assert.deepEqual((await poseItems()).map((i) => i.payload.exercise), ['squat', 'mountain_climber']);
    await unmount(root);
  });

  test('L1. legacy DURATION 마운틴 클라이머가 다음 운동으로 등장: 분석기 미연결·결과 없음·기존 M10 정지', async () => {
    const fx = multi([{ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 2 }] }, LEGACY_MC]);
    const root = await startWith(fx);
    testMeasure.value = { count: 2 }; testMeasure.summary = { count: 2 }; // 앞 운동 스쿼트만 기존 방식으로 2회 종료
    await act(async () => { feedFrames = true; pushEmptyFrame(); feedFrames = false; }); await settle();
    testMeasure.value = null; testMeasure.summary = null;
    await untilPhase(1, 1);
    await feedMc(3000); // 실제 동작 프레임이 들어와도
    assert.equal(ui.hud.kind, 'duration', 'legacy snapshot은 기존 DURATION 표시 유지(REPS로 강제 변경 없음)');
    await feedMc(17 * 1000 + 500);
    assert.equal(ui.stage.currentReps, null, '분석기 미연결 → 측정값 없음');
    assert.equal(stallAlerts().length, 1, '기존 M10 안내로 정지');
    const stuck = ui.stage.phase;
    await advance(500);
    await act(async () => { ui.stage.onPressResume(); }); await settle();
    assert.equal(ui.stage.phase.id, stuck.id, '같은 충돌 세트 재시도 없음');
    const session = await localSession();
    assert.deepEqual(session.sets.map((x) => x.routineSetId), [fx.exercises[0].sets[0].id], '스쿼트 결과만, 마운틴 클라이머 결과 없음');
    assert.deepEqual((await poseItems()).map((i) => i.payload.exercise), ['squat']);
    assert.equal(session.routineSnapshot.exercises[1].measurementType, 'DURATION', 'snapshot 미변경');
    assert.equal(session.routineSnapshot.exercises[1].sets[0].targetDurationSeconds, 20, '시간 목표를 횟수로 변환하지 않음');
    await unmount(root);
  });

  test('L2. legacy DURATION checkpoint를 V13 REPS 화면 snapshot으로 이어하기: 세션 snapshot 기준으로 차단(계약 우회 없음)', async () => {
    const legacy = routine(LEGACY_MC);
    let root = await startWith(legacy);
    await act(async () => { ui.stage.onPressMenu(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onPressStop(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onConfirmStop(); }); await settle();
    await unmount(root);
    const before = await offline.getLocalWorkout(owner);
    assert.equal(before.session.routineSnapshot.exercises[0].measurementType, 'DURATION');

    // 같은 루틴·세트 ID가 V13 이후 REPS 16회로 다시 내려온 상황(화면 store만 갱신, 진행 세션 snapshot은 그대로)
    const exercise = { ...legacy.exercise, measurementType: 'REPS', sets: legacy.exercise.sets.map((x) => ({ ...x, targetReps: 16, targetDurationSeconds: null })) };
    stores.today.setState({ routineSnapshot: { ...legacy.snapshot, exercises: [exercise] },
      sessions: [{ ...legacy.sessions[0], measurementType: 'REPS', reps: 16 }] });
    root = await mount({ resume: '1' });
    await resumeLikeUser();
    await feedMc(EXERCISE_DURATION_SECONDS * 1000 + 500);
    assert.equal(ui.stage.currentReps, null, '세션 snapshot(DURATION)과 다른 화면 계약으로 분석기를 만들지 않음');
    assert.equal(stallAlerts().length, 1, '기존 M10 정지 경로');
    assert.equal((await poseItems()).length, 0, 'AI 결과 없음');
    const after = await offline.getLocalWorkout(owner);
    assert.equal(after.session.sets.length, 0, 'Workout 결과 없음');
    assert.deepEqual(after.session.routineSnapshot, before.session.routineSnapshot, '진행 세션 snapshot·checkpoint 대상 미변경');
    await unmount(root);
  });

  test('L3. legacy DURATION checkpoint를 같은 DURATION snapshot으로 이어하기: 기존 conflict 차단 유지', async () => {
    let root = await startWith(routine(LEGACY_MC));
    await act(async () => { ui.stage.onPressMenu(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onPressStop(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onConfirmStop(); }); await settle();
    await unmount(root);
    root = await mount({ resume: '1' });
    await resumeLikeUser();
    await feedMc(3000);
    assert.equal(ui.hud.kind, 'duration', 'legacy DURATION 표시 유지');
    await feedMc(17 * 1000 + 500);
    assert.equal(ui.stage.currentReps, null);
    assert.equal(stallAlerts().length, 1);
    assert.equal((await poseItems()).length, 0);
    assert.equal((await offline.getLocalWorkout(owner)).session.sets.length, 0);
    await unmount(root);
  });

  test('L4. 잘못된 REPS 목표(snapshot targetReps 누락)는 보정하지 않고 기존 무효 목표 정지', async () => {
    const fx = routine({ exerciseId: 'mountain-climber', measurementType: 'REPS', sets: [{ reps: 16 }, { reps: null }] });
    fx.exercise.sets[1].targetReps = null;
    const root = await startWith(fx);
    await feedMc(16 * 1000);
    await untilPhase(0, 2);
    assert.equal(ui.stage.targetReps, 0, '누락 목표를 다른 세트 값(16)으로 대체하지 않음');
    await feedMc(EXERCISE_DURATION_SECONDS * 1000 + 500);
    assert.deepEqual((await localSession()).sets.map((x) => x.actualReps), [16], '무효 목표 세트 결과 저장 없음');
    assert.equal((await poseItems()).length, 1);
    await unmount(root);
  });
});

// ---------------------------------------------------------------------
// 3-4d: 사이드 플랭크 (DURATION, 주 측정값 holdSeconds)
// 합성 관절: 1000×1000 px 기준 전완 지지 사이드 플랭크. 아래쪽(지지) 어깨 11+d, 위쪽 어깨 11+(1−d)로 좌우를 만든다.
// mode: ok(정상) | drop(골반 처짐) | bent(무릎 굽힘). 실제 사람 관절 기록이 아니며 자세 정확도·실기기 검증을 뜻하지 않는다.
// Pose 49762dd부터 AI READINESS_PROFILES.side_plank가 있으나, FE 최종 연동(04단계) 전이므로 FE 지원 상태는 incomplete다.
//  - P1·P2: 지금 실행(실제 분석기·readiness 출력 계약, incomplete 상태의 FE 차단)
//  - D1~D4: supported가 된 뒤에만 실행(그 전에는 SKIP). FE DURATION 세션 연동 검증용
// ---------------------------------------------------------------------
describe('3-4d — 사이드 플랭크 (DURATION)', () => {
  const spLandmarks = (support = 'left', mode = 'ok') => {
    const lm = Array.from({ length: 33 }, () => [null, null, null, null, null]);
    const P = (i, x, y) => { lm[i] = [x / 1000, y / 1000, 0, 1, 1]; };
    const d = support === 'left' ? 0 : 1;
    P(11 + d, 300, 500); P(13 + d, 310, 580); P(15 + d, 200, 585);
    P(23 + d, ...(mode === 'drop' ? [550, 585] : [550, 560]));
    P(25 + d, ...(mode === 'bent' ? [660, 520] : [675, 590]));
    P(27 + d, 800, 620);
    P(11 + (1 - d), 300, 420);
    return lm;
  };
  async function feedSp(ms, support = 'left', mode = 'ok') { await feedUntil(clock + ms, () => spLandmarks(support, mode)); }
  async function untilPhase(exerciseIndex, set) {
    for (let i = 0; i < 600; i += 1) {
      const ph = ui.stage?.phase;
      if (ph?.kind === 'exercising' && ph.exerciseIndex === exerciseIndex && ph.set === set) return;
      await advance(250);
    }
    assert.fail(`HARNESS: ${exerciseIndex}번 운동 ${set}세트에 도달하지 않음`);
  }
  async function stopAndSaveDraft() {
    await act(async () => { ui.stage.onPressMenu(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onPressStop(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onConfirmStop(); }); await settle();
  }
  const SP = (seconds, measurementType = 'DURATION') => ({ exerciseId: 'side-plank', measurementType, sets: seconds.map((s) => ({ seconds: s })) });
  const poseItems = async () => (await storedQueue()).filter((i) => i.kind === 'pose');
  const lastSession = async () => (await storedQueue()).filter((i) => i.session).at(-1).session;
  const feedbacks = () => events.filter((e) => e.eventType === 'SET_FEEDBACK');
  const SP_SUPPORTED = poseSupport('side-plank').status === 'supported';
  const WHEN_SUPPORTED = { skip: !SP_SUPPORTED && 'side-plank incomplete: FE 최종 연동(04) 전 (supported 전환 후 실행)' };
  beforeEach(resetRealReps);
  afterEach(() => { stores.tts.setState({ sendCoachEvent: () => false }); });

  test('P1. 실제 SidePlankAnalyzer·readiness 계약(AI 단독, FE 연동 아님): 좌·우 정상 유지만 holdSeconds 누적, count null, side_plank 프로필', () => {
    const run = (support, mode) => {
      const a = new poseModule.SidePlankAnalyzer(); let r;
      for (let t = 100; t <= 5000; t += 100) r = a.pushFrame({ timestampMs: 10000 + t, width: 1000, height: 1000, landmarks: spLandmarks(support, mode) });
      return { r, s: a.finish()[0].summary };
    };
    for (const support of ['left', 'right']) {
      const { r, s } = run(support, 'ok');
      assert.equal(r.side, support, `${support} 지지 쪽 판정`);
      assert.equal(s.count, null);
      assert.ok(Math.abs(s.holdSeconds - 4.6) < 1e-6, `${support}: 4.9초 관측 중 확인 0.3초 제외 4.6초 (${s.holdSeconds})`);
      assert.ok(s.holdSeconds < s.observedSeconds, '유효 유지 시간 < 관측 시간');
      assert.deepEqual(s.details.sideHoldSeconds, support === 'left' ? { left: s.holdSeconds, right: 0 } : { left: 0, right: s.holdSeconds });
    }
    for (const [mode, code] of [['drop', 'HIP_DROP'], ['bent', 'KNEE_BENT']]) {
      const { r, s } = run('left', mode);
      assert.equal(s.holdSeconds, 0, `${mode}: 잘못된 자세는 유지 시간 0`);
      assert.deepEqual(r.codes, [code]);
    }
    // AI readiness 프로필(49762dd): either·full 6관절, 반대쪽 어깨 추가 검사
    assert.deepEqual(JSON.parse(JSON.stringify(poseModule.READINESS_PROFILES.side_plank)),
      { mode: 'either', joints: ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'] }, 'AI side_plank readiness 프로필');
    const ready = (support, dropUpperShoulder) => {
      const rd = new poseModule.CameraReadiness({ exercise: 'side_plank' }); let r;
      for (let t = 0; t <= 1500; t += 100) {
        const lm = spLandmarks(support, 'ok');
        if (dropUpperShoulder) lm[11 + (support === 'left' ? 1 : 0)] = [null, null, null, null, null];
        r = rd.pushFrame({ timestampMs: 20000 + t, width: 1000, height: 1000, landmarks: lm });
      }
      return r;
    };
    for (const support of ['left', 'right']) {
      const ok = ready(support, false);
      assert.equal(ok.ready, true, `${support} 지지: 지지쪽 6관절 + 위쪽 어깨 → 준비 완료`);
      assert.equal(ok.selectedSide, support);
      const other = support === 'left' ? 'right' : 'left';
      const ng = ready(support, true);
      assert.equal(ng.ready, false, `${support} 지지: 위쪽(반대쪽) 어깨 누락 → 준비 안 됨`);
      assert.ok(ng.missingLandmarks.includes(`${other}_shoulder`), `${other}_shoulder 누락 보고 (${ng.missingLandmarks})`);
    }
  });

  test('P2. incomplete 상태: DURATION·REPS snapshot 모두 분석기 미연결, 실제 정상 프레임이어도 결과 없음, 기존 M10 정지', async () => {
    assert.deepEqual(poseSupport('side-plank'), { status: 'incomplete', poseId: 'side_plank' });
    for (const type of ['DURATION', 'REPS', undefined]) assert.equal(createExerciseAnalyzer('side-plank', type), null, `analyzer ${type}`);
    const hasProfile = (id) => Object.prototype.hasOwnProperty.call(poseModule.READINESS_PROFILES, id);
    assert.deepEqual(readinessAvailability('side-plank', hasProfile, 'DURATION'), { availability: 'profile_unsupported', poseId: null }, '다른 운동 프로필로 대체하지 않음');
    assert.equal(poseBodyView('side-plank'), null, '촬영 방향 미확정');
    const root = await startWith(routine(SP([20])));
    await feedSp(20 * 1000 + 500, 'left');
    assert.equal(ui.stage.currentReps, null);
    assert.equal(stallAlerts().length, 1, '기존 M10 미지원 정지');
    assert.equal((await poseItems()).length, 0);
    assert.equal((await localSession()).sets.length, 0);
    await unmount(root);
  });

  test('D1. DURATION 세트 20·30초: 시간형 HUD, 타이머 만료 종료, holdSeconds ≠ 경과 시간, 좌·우 측정, 저장·SET_FEEDBACK', WHEN_SUPPORTED, async () => {
    const fx = routine(SP([20, 30]));
    const root = await startWith(fx);
    await feedSp(5000, 'left');
    assert.equal(ui.hud.kind, 'duration', '시간형 HUD(횟수 링 아님)');
    assert.equal(ui.hud.seconds, remaining());
    assert.equal(ui.hud.seconds, 15, '1세트 20초 목표 타이머');
    assert.ok(ui.hud.progress > 0.2 && ui.hud.progress < 0.3, `가로 진행 바 = 타이머 경과 (${ui.hud.progress})`);
    assert.equal(ui.hud.holdSeconds, 4, 'AI 유효 유지 4.x초 → 4 (타이머 경과 5초와 별개)');
    assert.equal(ui.stage.currentReps, 4, '표시 측정값 = 유효 유지 시간(DURATION), count 아님');
    await feedSp(15 * 1000 + 500, 'left');
    assert.equal(ui.stage.phase.kind, 'resting', '기존 PhaseTimer 만료로만 종료');
    await untilPhase(0, 2);
    assert.equal(ui.stage.remainingSeconds, 30, '2세트 30초 목표');
    await feedSp(10 * 1000, 'right', 'drop'); // 잘못된 자세 10초: 누적 없음
    assert.ok([null, 0].includes(ui.hud.holdSeconds), `골반 처짐 동안 유지 시간 0 (${ui.hud.holdSeconds})`);
    await feedSp(20 * 1000 + 500, 'right');
    assert.ok(ui.completeRenders > 0, '마지막 세트 타이머 만료 → 운동 완료');
    const pose = await poseItems();
    assert.equal(pose.length, 2, '세트별 AI 결과 1건(중복 없음)');
    const holds = pose.map((i) => i.payload.summary.holdSeconds);
    assert.deepEqual(pose.map((i) => i.payload.summary.details.sideHoldSeconds.left > 0), [true, false], '1세트 왼쪽');
    assert.deepEqual(pose.map((i) => i.payload.summary.details.sideHoldSeconds.right > 0), [false, true], '2세트 오른쪽');
    assert.ok(holds[1] < 21, `2세트 유효 유지(${holds[1]}) < 타이머 30초: 경과 시간으로 대체하지 않음`);
    assert.deepEqual(pose.map((i) => [i.payload.exercise, i.payload.summary.count]), [['side_plank', null], ['side_plank', null]], 'AI 원본 보존');
    const session = await lastSession();
    assert.deepEqual(session.sets.map((x) => [x.routineSetId, x.actualReps, x.actualDurationSeconds]),
      fx.exercise.sets.map((x, i) => [x.id, null, Math.floor(holds[i])]), 'actualReps null, actualDurationSeconds = floor(holdSeconds)');
    assert.deepEqual(feedbacks().map((e) => [e.exerciseId, e.actualReps, e.actualDurationSeconds]),
      holds.map((h) => ['side-plank', undefined, Math.floor(h)]), 'SET_FEEDBACK 주 측정값 = floor(holdSeconds)');
    await unmount(root);
  });

  test('D2. 수동 일시정지·재개 후 유효 유지 시간 보존, 결과 1건', WHEN_SUPPORTED, async () => {
    const root = await startWith(routine(SP([30, 30])));
    await feedSp(8000, 'left');
    const before = ui.hud.holdSeconds;
    assert.equal(before, 7);
    await act(async () => { ui.stage.onPressMenu(); }); await settle();
    await feedSp(3000, 'left'); // 일시정지 중 프레임은 측정하지 않음
    assert.equal(ui.hud.holdSeconds ?? before, before, '일시정지 중 증가 없음');
    await resumeLikeUser();
    await feedSp(1000, 'left');
    assert.ok(ui.hud.holdSeconds >= before, `재개 후 기존 유지 시간 보존 (${ui.hud.holdSeconds} ≥ ${before})`);
    await feedSp(22 * 1000 + 500, 'left');
    assert.equal(ui.stage.phase.kind, 'resting');
    const pose = await poseItems();
    assert.equal(pose.length, 1);
    assert.ok(pose[0].payload.summary.holdSeconds > before, '재개 전후 유지 시간 합산은 AI 누적값 그대로');
    assert.equal((await localSession()).sets[0].actualDurationSeconds, Math.floor(pose[0].payload.summary.holdSeconds));
    await unmount(root);
  });

  test('D3. REPS·측정 유형 누락 snapshot의 사이드 플랭크는 conflict: 분석기 미연결·결과 없음·M10 정지', WHEN_SUPPORTED, async () => {
    for (const type of ['REPS', undefined, 'TIME']) {
      assert.equal(createExerciseAnalyzer('side-plank', type), null, `conflict ${type}`);
    }
    assert.ok(createExerciseAnalyzer('side-plank', 'DURATION') instanceof poseModule.SidePlankAnalyzer);
    const fx = routine({ exerciseId: 'side-plank', measurementType: 'REPS', sets: [{ reps: 20 }] });
    const root = await startWith(fx);
    await feedSp(60 * 1000 + 500, 'left');
    assert.equal(stallAlerts().length, 1);
    assert.equal((await poseItems()).length, 0);
    assert.equal((await localSession()).sets.length, 0);
    await unmount(root);
  });

  test('D4. 다음 운동 전환(스쿼트 → 사이드 플랭크)·checkpoint 이어하기: 세션 snapshot 계약으로 재연결', WHEN_SUPPORTED, async () => {
    const parts = [routine({ exerciseId: 'squat', measurementType: 'REPS', sets: [{ reps: 2 }] }), routine(SP([20, 20]))];
    const exercises = parts.map((p, i) => ({ ...p.exercise, order: i + 1 }));
    const fx = { snapshot: { ...parts[0].snapshot, exercises }, sessions: parts.map((p) => p.sessions[0]) };
    let root = await startWith(fx);
    testMeasure.value = { count: 2 }; testMeasure.summary = { count: 2 }; // 앞 운동 스쿼트만 기존 방식으로 2회 종료
    await act(async () => { feedFrames = true; pushEmptyFrame(); feedFrames = false; }); await settle();
    testMeasure.value = null; testMeasure.summary = null;
    await untilPhase(1, 1);
    await feedSp(20 * 1000 + 500, 'right');
    await untilPhase(1, 2);
    await feedSp(4000, 'left');
    await stopAndSaveDraft();
    const draft = useWorkoutDraftStore.getState().draft;
    assert.deepEqual([draft.exerciseId, draft.phase, draft.set], ['side-plank', 'exercising', 2]);
    await unmount(root);
    root = await mount({ resume: '1' });
    await resumeLikeUser();
    await feedSp(25 * 1000, 'left');
    assert.ok(ui.completeRenders > 0);
    const pose = await poseItems();
    assert.deepEqual(pose.map((i) => i.payload.exercise), ['squat', 'side_plank', 'side_plank']);
    const session = await lastSession();
    assert.deepEqual(session.sets.map((x) => x.routineSetId), [exercises[0].sets[0].id, ...exercises[1].sets.map((x) => x.id)]);
    assert.deepEqual(session.sets.slice(1).map((x, i) => [x.actualReps, x.actualDurationSeconds]),
      pose.slice(1).map((i) => [null, Math.floor(i.payload.summary.holdSeconds)]));
    await unmount(root);
  });
});
