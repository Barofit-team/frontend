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
