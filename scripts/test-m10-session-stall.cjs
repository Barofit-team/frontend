/**
 * M10 재현 테스트 — 분석기 미지원 종목 / 카메라 프레임 0개일 때 세트가 진행되지 않는 문제.
 *
 * 실제 코드로 실행하는 것
 *  - src/app/workout-session.tsx (화면 전체: onComplete 분기, requestPause, completePhase, saveAndExit, 이어하기)
 *  - PhaseTimer.tsx / useCountdown.ts / sessionFlow.ts / sessionConfig.ts / sessionProgress.ts
 *  - posePipeline.ts + @barofit/pose 실제 분석기, poseCoaching.ts, poseExerciseIds.ts
 *  - offlineWorkout.ts / workoutSessionService.ts (저장소는 메모리 AsyncStorage)
 *  - useWorkoutDraftStore.ts, React 19 + react-dom 실제 런타임(호스트 요소 없이 렌더)
 *
 * mock으로 대체하는 것 (판정·타이머·단계 전환 로직은 대체하지 않음)
 *  - react-native 기본 컴포넌트, expo-router, 상태바, safe-area
 *  - 표시 전용 컴포넌트: SessionStage(props 기록), ExerciseCameraArea(onPoseFrame 기록), WorkoutCompleteView
 *  - services/api: 모든 요청을 오프라인(ApiError 0)으로 거절 → 네트워크·서버 쓰기 없음
 *  - ttsService(코칭 WS 연결 실패), useAuthStore / useTtsStore / useTodayRoutineStore / useWorkoutResultStore 상태
 *
 * 제한
 *  - SessionStage는 stub이라 재개 5초 카운트다운은 실제 SessionStage처럼 5초 뒤 onFinishResume을 직접 호출해 재현한다.
 *  - 실제 카메라·MediaPipe는 실행하지 않는다. 프레임은 네이티브 계약과 같은 형식({timestampMs,width,height,landmarks:[]})으로 주입한다.
 *
 * 4단계(M10 수정) 이후:
 * 그룹 A: 0초 도달 시 동작 — 지원 종목은 '운동 재개'로 같은 세트 재시도, 미지원 종목은 재시도 없이 정지 유지(정책 미확정)
 * 그룹 B: 기대 동작·불변식. 남은 RED(B2, 미지원 종목)는 { todo } 로 표시해 실행은 하되 전체 결과를 실패로 만들지 않는다.
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
const ui = { stage: null, camera: null, completeRenders: 0 };
const alerts = [];
const nav = [];
let routeParams = {};
const disk = new Map();

const passthrough = ({ children }) => children ?? null;
const nothing = () => null;
const mocks = {
  'react-native': {
    View: passthrough, Text: nothing, Pressable: nothing,
    StyleSheet: { create: (s) => s, absoluteFill: {} },
    Alert: { alert: (title, message, buttons) => { alerts.push({ title, message, buttons }); } },
    AppState: { addEventListener: () => ({ remove() {} }) },
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
    default: { getItem: async (k) => disk.get(k) ?? null, setItem: async (k, v) => { disk.set(k, v); } },
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
  'components/workout-session/SessionStage': { SessionStage: (props) => { ui.stage = props; return null; } },
  'components/workout-session/ExerciseCameraArea': { ExerciseCameraArea: (props) => { ui.camera = props; return null; } },
  'components/workout-session/WorkoutCompleteView': { WorkoutCompleteView: () => { ui.completeRenders += 1; return null; } },
  // 자동 일시정지 3단계에서 화면이 import (표시 전용. M10 시나리오에서는 기본 어댑터가 'unknown'이라 렌더되지 않음)
  'components/workout-session/AutoPauseOverlay': { AutoPauseOverlay: () => null },
  'services/api': { ApiError, apiFetch: async (p) => { network.attempts.push(`apiFetch:${p}`); throw new ApiError(0); } },
  'services/ttsService': { connectSessionCoach: async () => { throw new Error('offline'); } },
  'stores/useAuthStore': { useAuthStore: stores.auth },
  'stores/useTtsStore': { useTtsStore: stores.tts },
  'stores/useTodayRoutineStore': { useTodayRoutineStore: stores.today },
  'stores/useWorkoutResultStore': { useWorkoutResultStore: stores.result },
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
  '@barofit/pose': () => require(nm('@barofit/pose/runtime/index.js')),
};

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
  await act(async () => { root.render(React.createElement(WorkoutSessionScreen)); });
  await settle();
  assert.ok(ui.stage, 'HARNESS: 세션 화면(SessionStage)이 준비되지 않았습니다');
  return root;
}
async function unmount(root) { await act(async () => { root.unmount(); }); await settle(); }
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
  await advance(RESUME_COUNTDOWN_SECONDS * 1000);
  await act(async () => { ui.stage.onFinishResume(); });
  await settle();
  assert.equal(ui.stage.pause, 'none', 'HARNESS: 재개 후 진행 상태가 아닙니다');
}
async function localSession() { return (await offline.getLocalWorkout(owner))?.session ?? null; }
async function storedQueue() { return JSON.parse(disk.get(`barofit.workout.v1.${owner}`) ?? '{"queue":[]}').queue; }

beforeEach(() => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: Date.parse('2026-11-23T03:00:00Z') });
  ownerSeq += 1; owner = `m10-user-${ownerSeq}`;
  stores.auth.setState({ user: { id: owner } });
  useWorkoutDraftStore.setState({ draft: null });
  alerts.length = 0; nav.length = 0; ui.completeRenders = 0; feedFrames = false; frameClock = 0;
});
afterEach(() => { mock.timers.reset(); });

const UNSUPPORTED = () => routine({ exerciseId: 'side-plank', measurementType: 'DURATION', sets: [{ seconds: 20 }] });
const SUPPORTED_REPS = (count = 1) => routine({ exerciseId: 'squat', measurementType: 'REPS', sets: Array.from({ length: count }, () => ({ reps: 12 })) });

// =====================================================================
// 4단계 이후: 지원 종목은 '운동 재개'(기존 PauseView 버튼)로 같은 세트를 처음부터 재시도. 미지원 종목은 별도 정책 대상(그대로 멈춤).
const sessionRevision = async () => (await localSession()).revision;
async function pressResumeOnce() { await advance(500); await act(async () => { ui.stage.onPressResume(); }); await settle(); }
/** 재개 5초 카운트다운 종료 (SessionStage stub이라 실제 화면처럼 5초 뒤 onFinishResume 호출) */
async function finishResumeCountdown() {
  assert.equal(ui.stage.pause, 'resuming', 'HARNESS: 재개 카운트다운 상태가 아닙니다');
  await advance(RESUME_COUNTDOWN_SECONDS * 1000);
  await act(async () => { ui.stage.onFinishResume(); }); await settle();
  assert.equal(ui.stage.pause, 'none', 'HARNESS: 재개 후 진행 상태가 아닙니다');
}

describe('그룹 A — 0초 도달 시 동작', () => {
  test('A. 분석기 미지원 종목: 재시도하지 않음(무의미한 반복 방지) — 0초 정지 유지, 별도 정책 대상', async () => {
    assert.equal(createExerciseAnalyzer('side-plank'), null, 'side-plank는 분석기 매핑이 없어야 합니다');
    const root = await startWith(UNSUPPORTED());
    const stuckPhaseId = ui.stage.phase.id;
    feedFrames = true;
    await advance(20 * 1000 + 250);
    assert.equal(stallAlerts().length, 1);
    assert.equal(ui.stage.pause, 'paused');
    assert.equal(ui.stage.remainingSeconds, 0);
    assert.equal((await localSession()).sets.length, 0);
    await resumeLikeUser();
    await advance(30 * 1000);
    for (let i = 0; i < 2; i += 1) { // 실제 화면처럼 메뉴(수동 일시정지) → 운동 재개 반복
      await advance(500);
      await act(async () => { ui.stage.onPressMenu(); }); await settle();
      assert.equal(ui.stage.pause, 'paused');
      await resumeLikeUser();
      await advance(30 * 1000);
    }
    assert.equal(ui.stage.phase.id, stuckPhaseId, '재개를 반복해도 새 세트를 만들지 않음');
    assert.equal(stallAlerts().length, 1, '안내 반복 없음');
    assert.equal(ui.stage.remainingSeconds, 0, '미지원 종목은 정책 확정 전까지 0초 정지 유지');
    await unmount(root);
  });

  test('B. 지원 종목 + 프레임 0개: 0초 → 일시정지, 재개 시 같은 세트를 처음부터 재시작(타이머·checkpoint 초기화)', async () => {
    assert.ok(createExerciseAnalyzer('squat'));
    const root = await startWith(SUPPORTED_REPS(2));
    const stuck = ui.stage.phase;
    await advance(EXERCISE_DURATION_SECONDS * 1000 - 1000);
    assert.equal(stallAlerts().length, 0);
    await advance(1250);
    assert.equal(stallAlerts().length, 1, '1. 프레임 0개 → 0초 도달, 측정 결과 없음 분기');
    assert.equal(ui.stage.pause, 'paused');
    assert.equal(ui.stage.remainingSeconds, 0);
    const rev = await sessionRevision();
    assert.equal((await localSession()).status, 'PAUSED');

    await pressResumeOnce();
    const retried = ui.stage.phase;
    assert.notEqual(retried.id, stuck.id, '새 phase id (PhaseTimer 재생성)');
    assert.deepEqual([retried.kind, retried.exerciseIndex, retried.set], ['exercising', stuck.exerciseIndex, stuck.set], '3. 같은 운동·세트');
    assert.equal(ui.stage.remainingSeconds, EXERCISE_DURATION_SECONDS, '2. 타이머가 목표 시간으로 초기화');
    assert.equal((await offline.getLocalWorkout(owner)).draft.remainingSeconds, EXERCISE_DURATION_SECONDS, 'checkpoint도 목표 시간');
    await advance(3 * 1000);
    assert.equal(ui.stage.remainingSeconds, EXERCISE_DURATION_SECONDS, '재개 카운트다운 동안 새 타이머 정지');
    await finishResumeCountdown();
    await advance(10 * 1000);
    assert.equal(ui.stage.remainingSeconds, EXERCISE_DURATION_SECONDS - 10, '4, 5. 재시도 후 정상 감소 (completedRef 고정 없음)');
    assert.equal((await offline.getLocalWorkout(owner)).draft.remainingSeconds, EXERCISE_DURATION_SECONDS - 10);
    assert.equal((await localSession()).status, 'ACTIVE');
    assert.equal(await sessionRevision(), rev + 1, '서버 상태 변경은 기존 재개 ACTIVE 1회뿐');
    assert.equal((await localSession()).sets.length, 0, '8. 측정 결과 없는 세트 결과 없음');
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 0, '8. AI 결과 없음');
    await unmount(root);
  });

  test('B-2. 시간 운동: 결과 없이 0초 → 재시도 후 프레임이 들어오면 정상 세트 완료', async () => {
    const fixture = routine({ exerciseId: 'plank', measurementType: 'DURATION', sets: [{ seconds: 20 }, { seconds: 20 }] });
    const root = await startWith(fixture);
    const stuck = ui.stage.phase;
    await advance(20 * 1000 + 250);
    assert.equal(stallAlerts().length, 1);
    await pressResumeOnce();
    assert.equal(ui.stage.remainingSeconds, 20, '목표 시간 20초 재적용');
    assert.equal(ui.stage.phase.set, stuck.set);
    await finishResumeCountdown();
    feedFrames = true; // 카메라가 뒤늦게 살아난 상황
    await advance(20 * 1000 + 500);
    assert.ok(frameClock > 0);
    assert.equal(ui.stage.phase.kind, 'resting', '재시도 세트가 정상 완료');
    assert.equal(ui.stage.phase.completedSet, 1);
    assert.equal((await localSession()).sets.length, 1, '세트 결과 1회');
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 1, 'AI 결과 1회 (실패한 시도 결과 없음)');
    await unmount(root);
  });

  test('C. 정상 회귀 기준: 지원 종목 + 프레임 수신 → 타이머 종료 시 세트 결과 저장 후 다음 단계', async () => {
    const root = await startWith(SUPPORTED_REPS(2));
    const firstSetId = ui.stage.phase.id;
    feedFrames = true;
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 500);
    assert.equal(stallAlerts().length, 0);
    assert.notEqual(ui.stage.phase.id, firstSetId);
    assert.equal(ui.stage.phase.kind, 'resting');
    assert.equal(ui.stage.phase.completedSet, 1);
    const session = await localSession();
    assert.equal(session.sets.length, 1);
    assert.equal(session.sets[0].actualReps, 0);
    assert.equal(typeof session.sets[0].modelVersion, 'string');
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 1);
    await advance(10 * 1000 + START_COUNTDOWN_SECONDS * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'exercising');
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 500);
    assert.ok(ui.completeRenders > 0);
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 2);
    await unmount(root);
  });

  test('D. 이어하기: 0초 임시저장 → 재진입 후 첫 재개에서 같은 세트를 처음부터 재시작', async () => {
    const fixture = SUPPORTED_REPS(2);
    let root = await startWith(fixture);
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 250);
    assert.equal(stallAlerts().length, 1);
    await advance(500);
    await act(async () => { ui.stage.onPressStop(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onConfirmStop(); }); await settle();
    const draft = useWorkoutDraftStore.getState().draft;
    assert.equal(draft.phase, 'exercising');
    assert.equal(draft.remainingSeconds, 0, 'HARNESS: 0초 임시저장');
    await unmount(root);

    root = await mount({ resume: '1' });
    assert.equal(ui.stage.pause, 'paused');
    assert.equal(ui.stage.remainingSeconds, 0);
    const resumed = ui.stage.phase;
    await pressResumeOnce();
    assert.notEqual(ui.stage.phase.id, resumed.id, '6. 0초 checkpoint에서 재진입 → 재시도');
    assert.equal(ui.stage.phase.set, draft.set);
    assert.equal(ui.stage.phase.exerciseIndex, draft.exerciseIndex);
    assert.equal(ui.stage.remainingSeconds, EXERCISE_DURATION_SECONDS);
    await finishResumeCountdown();
    await advance(5 * 1000);
    assert.equal(ui.stage.remainingSeconds, EXERCISE_DURATION_SECONDS - 5);
    assert.equal(stallAlerts().length, 1, '재진입 직후 같은 안내가 반복되지 않음');
    assert.equal((await offline.getLocalWorkout(owner)).draft.remainingSeconds, EXERCISE_DURATION_SECONDS - 5);
    await unmount(root);
  });

  test('7. 완료된 세트 기록 보존: 1세트 정상 완료 → 2세트 프레임 0개로 0초 → 재시도 후 1세트 결과 유지', async () => {
    const root = await startWith(SUPPORTED_REPS(2));
    feedFrames = true;
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'resting');
    feedFrames = false;
    await advance(10 * 1000 + START_COUNTDOWN_SECONDS * 1000 + 500);
    assert.equal(ui.stage.phase.kind, 'exercising');
    assert.equal(ui.stage.phase.set, 2);
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 250);
    assert.equal(stallAlerts().length, 1);
    const before = await localSession();
    await pressResumeOnce();
    assert.equal(ui.stage.phase.set, 2, '2세트 재시도');
    await finishResumeCountdown();
    const after = await localSession();
    assert.equal(after.sets.length, 1, '1세트 결과 보존, 실패한 2세트 결과 없음');
    assert.deepEqual(after.sets[0], before.sets[0]);
    assert.equal((await storedQueue()).filter((i) => i.kind === 'pose').length, 1);
    await unmount(root);
  });

  test('9. 재개 연속 입력·늦은 callback: 재시도 1회만, 이전 타이머가 새 세트를 바꾸지 않음, 자동 재시도 없음', async () => {
    const root = await startWith(SUPPORTED_REPS(2));
    const stuck = ui.stage.phase;
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 250);
    assert.equal(stallAlerts().length, 1);
    await advance(500);
    const press = ui.stage.onPressResume;
    await act(async () => { press(); press(); press(); }); await settle();
    assert.equal(ui.stage.phase.id, stuck.id + 1, '연속 입력에도 재시도 1회 (id +1)');
    await advance(500);
    await act(async () => { ui.stage.onPressResume(); }); await settle(); // 재개 카운트다운 중 추가 입력
    assert.equal(ui.stage.phase.id, stuck.id + 1);
    await finishResumeCountdown();
    // 다시 프레임 0개로 0초: 새 세트 타이머만 1번 완료 → 안내 1회 추가, 이전 phase로 돌아가거나 건너뛰지 않음
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 250);
    assert.equal(stallAlerts().length, 2);
    assert.equal(ui.stage.phase.id, stuck.id + 1);
    assert.equal(ui.stage.pause, 'paused');
    // 사용자 입력 없이 오래 기다려도 자동 재시도하지 않음
    await advance(3 * 60 * 1000);
    assert.equal(ui.stage.phase.id, stuck.id + 1, '자동 재시도 없음 (무한 루프 없음)');
    assert.equal(stallAlerts().length, 2);
    assert.equal((await localSession()).sets.length, 0);
    await unmount(root);
  });
});

// =====================================================================
describe('그룹 B — 기대 동작 / 불변식', () => {
  const RED = { todo: 'M10 RED — 정책 미확정으로 현재 코드에서 실패가 예상되는 기대 동작' };

  test('B1 (GREEN) 지원 종목 + 프레임 0개: 재개 후 세트가 다시 진행된다', async () => {
    const root = await startWith(SUPPORTED_REPS(2));
    const stuckPhaseId = ui.stage.phase.id;
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 250);
    assert.equal(stallAlerts().length, 1, 'HARNESS: 측정 결과 없음 분기에 도달하지 못했습니다');
    await resumeLikeUser();
    await advance(1000);
    const progressed = ui.stage.phase.id !== stuckPhaseId || ui.stage.remainingSeconds > 0;
    await unmount(root);
    assert.ok(progressed, `M10: 재개 후에도 phase ${stuckPhaseId}에서 0초 고정`);
  });

  test('B2 (RED) 분석기 미지원 종목: 재개 후 0초에 고정되지 않아야 한다 — 미지원 종목 정책(노출 제외/건너뛰기/대체 측정) 미확정', RED, async () => {
    const root = await startWith(UNSUPPORTED());
    const stuckPhaseId = ui.stage.phase.id;
    feedFrames = true;
    await advance(20 * 1000 + 250);
    assert.equal(stallAlerts().length, 1, 'HARNESS: 측정 결과 없음 분기에 도달하지 못했습니다');
    await resumeLikeUser();
    await advance(1000);
    const progressed = ui.stage.phase.id !== stuckPhaseId || ui.stage.remainingSeconds > 0;
    await unmount(root);
    assert.ok(progressed, `M10: 미지원 종목 phase ${stuckPhaseId}에서 0초 고정`);
  });

  test('B3 (GREEN) 이어하기 남은 시간 0초: 재진입 후 진행 가능', async () => {
    let root = await startWith(SUPPORTED_REPS(2));
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 250);
    await advance(500);
    await act(async () => { ui.stage.onPressStop(); }); await settle();
    await advance(500);
    await act(async () => { ui.stage.onConfirmStop(); }); await settle();
    assert.equal(useWorkoutDraftStore.getState().draft?.remainingSeconds, 0, 'HARNESS: 0초 임시저장 상태가 아닙니다');
    await unmount(root);
    root = await mount({ resume: '1' });
    const resumedPhaseId = ui.stage.phase.id;
    await resumeLikeUser();
    await advance(1000);
    const progressed = ui.stage.phase.id !== resumedPhaseId || ui.stage.remainingSeconds > 0;
    await unmount(root);
    assert.ok(progressed, 'M10: 이어하기 후 같은 세트 0초에서 빠져나오지 못함');
  });

  test('B4 (불변식) 측정 불가 세트에는 AI 결과·세트 결과를 만들지 않는다 (재시도 후에도)', async () => {
    const root = await startWith(SUPPORTED_REPS(2));
    await advance(EXERCISE_DURATION_SECONDS * 1000 + 250);
    await resumeLikeUser();
    await advance(10 * 1000);
    const session = await localSession();
    const queue = await storedQueue();
    await unmount(root);
    assert.equal(session.sets.length, 0);
    assert.equal(queue.filter((i) => i.kind === 'pose').length, 0);
  });

  test('B5 (불변식) 테스트 전체에서 네트워크 요청이 실제로 나가지 않는다', () => {
    assert.ok(network.attempts.every((a) => a.startsWith('apiFetch:')), `fetch/WebSocket 직접 호출: ${network.attempts.filter((a) => !a.startsWith('apiFetch:')).join(', ')}`);
  });

  test.todo('B6 0초 재시도 UI 확정 — 현재 기존 PauseView "운동 재개"를 재시도로 재사용(새 버튼·문구 없음). 디자인팀 확인 후 전용 문구/버튼 결정 시 갱신');
  test.todo('B7 건너뛰기 시 AI 결과 없이 다음 단계 이동 — 제품 정책 미확정 (B4 불변식 유지)');
  test.todo('B8 미지원 종목 UX(노출 제외/건너뛰기/대체 측정) — 정책 확정 후 작성. 현재는 재시도 미제공으로 무의미한 반복만 방지(그룹 A-A)');
  test.skip('B9 목표 횟수 도달로 세트 종료(정상 경로) — 실제 스쿼트 관절 프레임 fixture가 저장소에 없어 보류');
});
