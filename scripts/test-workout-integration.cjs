const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');

function load(relative, deps) {
  const file = path.resolve(__dirname, '..', relative);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const fakeRequire = name => {
    if (Object.prototype.hasOwnProperty.call(deps, name)) return deps[name];
    throw new Error(`Unexpected dependency ${name}`);
  };
  new Function('require', 'module', 'exports', compiled)(fakeRequire, module, module.exports);
  return module.exports;
}
function create(initializer) {
  let state; const subscribers = new Set();
  const store = selector => selector(state);
  store.getState = () => state;
  store.subscribe = fn => { subscribers.add(fn); return () => subscribers.delete(fn); };
  const set = next => { state = { ...state, ...(typeof next === 'function' ? next(state) : next) }; for (const fn of subscribers) fn(state); };
  state = initializer(set, () => state);
  return store;
}
const spoken = [];
global.__DEV__ = false;
const players = [];
let audioGate = null;
class FakeWebSocket {
  static OPEN = 1;
  static latest;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWebSocket.latest = this; }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
global.WebSocket = FakeWebSocket;
const store = load('src/stores/useTtsStore.ts', {
  'zustand': { create },
  'expo-audio': { createAudioPlayer: () => {
    const player = { play() {}, pause() {}, remove() {}, addListener(_, fn) { this.update = fn; } };
    players.push(player); return player;
  }, setAudioModeAsync: async () => { if (audioGate) await audioGate; } },
  'expo-speech': { stop: async () => {}, speak: text => spoken.push(text) },
}).useTtsStore;
const calls = [];
const api = load('src/services/workoutSessionService.ts', {
  'expo-crypto': { randomUUID: () => 'test-uuid' },
  '@/services/api': { apiFetch: async (url, init) => { calls.push({ url, init }); return {}; } },
});
const { phaseAnnouncement } = load('src/services/sessionCoaching.ts', {});
const exercise = { name: '플랭크', introTtsText: '몸통을 곧게 유지하세요.' };
assert.equal(phaseAnnouncement({ id: 0, kind: 'countdown', exerciseIndex: 0, set: 1 }, exercise).type, 'EXERCISE_PREPARE');
const restAnnouncement = phaseAnnouncement({ id: 7, kind: 'countdown', exerciseIndex: 1, set: 1 }, exercise);
assert.equal(restAnnouncement.type, 'NEXT_EXERCISE');
assert.match(restAnnouncement.text, /다음 운동은 플랭크/);
assert.equal(phaseAnnouncement({ id: 8, kind: 'exercising', exerciseIndex: 1, set: 1 }, exercise).type, 'EXERCISE_START');
assert.equal(phaseAnnouncement({ id: 9, kind: 'resting', exerciseIndex: 1, completedSet: 1 }, exercise), null);
assert.equal(phaseAnnouncement({ id: 10, kind: 'countdown', exerciseIndex: 1, set: 2 }, exercise), null);
assert.equal(phaseAnnouncement({ id: 11, kind: 'exercising', exerciseIndex: 1, set: 2 }, exercise), null);
assert.equal(phaseAnnouncement({ id: 12, kind: 'completed' }, exercise), null);
(async () => {
  store.getState().connectWebSocket('wss://example/ws', { accessToken: 'test', sessionId: 'session' });
  const socket = FakeWebSocket.latest;
  socket.open();
  assert.deepEqual(socket.sent[0], { type: 'AUTH', accessToken: 'test', sessionId: 'session' });
  assert.equal(store.getState().socketStatus, 'connecting');
  assert.equal(store.getState().sendCoachEvent({ eventType: 'WORKOUT_START' }), false);
  socket.message({ type: 'AUTH_OK', text: 'connected' });
  assert.equal(store.getState().socketStatus, 'connected');
  store.getState().setCoachContext('session:1');
  assert.equal(store.getState().sendCoachEvent({ eventType: 'EXERCISE_START', exerciseId: 'squat' }), true);
  assert.deepEqual(socket.sent[1], { type: 'COACH_EVENT', eventType: 'EXERCISE_START', exerciseId: 'squat', requestId: socket.sent[1].requestId });
  assert.ok(socket.sent[1].requestId);
  socket.message({ type: 'EXERCISE_START', text: '준비 자세 안내', requestId: socket.sent[1].requestId });
  await Promise.resolve();
  assert.deepEqual(spoken, ['준비 자세 안내']);
  assert.equal(store.getState().lastMessage.text, '준비 자세 안내');
  // A delayed response for the previous exercise or a paused phase must not speak.
  store.getState().sendCoachEvent({ eventType: 'REP_FEEDBACK', exerciseId: 'squat' });
  const stale = socket.sent.at(-1).requestId;
  store.getState().setCoachContext('session:2');
  socket.message({ type: 'REP_FEEDBACK', text: '이전 종목 피드백', requestId: stale });
  store.getState().sendCoachEvent({ eventType: 'REP_FEEDBACK', exerciseId: 'plank' });
  const paused = socket.sent.at(-1).requestId;
  store.getState().setCoachContext(null);
  socket.message({ type: 'REP_FEEDBACK', text: '정지 중 피드백', requestId: paused });
  await Promise.resolve();
  assert.deepEqual(spoken, ['준비 자세 안내']);
  assert.equal(store.getState().sendCoachEvent({ eventType: 'REP_FEEDBACK' }), false);
  // stop() invalidates an audio start still awaiting native audio mode setup.
  let release;
  audioGate = new Promise(resolve => { release = resolve; });
  const oldAudio = store.getState().playAudio({ uri: 'old.mp3' }, 'old');
  store.getState().stop(); release(); await oldAudio; audioGate = null;
  assert.equal(players.length, 0);
  await store.getState().playAudio({ uri: 'first.mp3' }, 'first');
  const oldPlayer = players.at(-1);
  await store.getState().playAudio({ uri: 'second.mp3' }, 'second');
  oldPlayer.update({ currentTime: 1, duration: 1, didJustFinish: true });
  assert.equal(store.getState().currentText, 'second');
  assert.equal(store.getState().isPlaying, true);
  store.getState().disconnectWebSocket();
  assert.equal(store.getState().sendCoachEvent({ eventType: 'WORKOUT_START' }), false);
  const routine = { id: 'routine', type: 'TEMPLATE', exercises: [] };
  const draft = api.createWorkoutSessionDraft(routine, '2026-11-02T00:00:00Z');
  assert.equal(draft.sessionId, 'test-uuid');
  assert.equal(draft.session.routineSnapshot, routine);
  assert.equal(draft.session.status, 'ACTIVE');
  assert.deepEqual(draft.session.sets, []);
  await api.syncWorkoutSession(draft.sessionId, draft.session);
  assert.equal(calls[0].url, '/api/v1/workout-sessions/test-uuid');
  assert.equal(JSON.parse(calls[0].init.body).revision, 0);
  await api.uploadPoseSetResult('session', 'result', 'routine-set', '2026-11-02T00:00:00Z', { type: 'set.completed' });
  assert.equal(calls[1].init.headers['X-Routine-Set-Id'], 'routine-set');
  assert.equal(calls[1].init.headers['X-Workout-Performed-At'], '2026-11-02T00:00:00Z');
  const weekCalls = [];
  const planRoutine = { id: 'planned-routine', name: '테스트', exercises: [], type: 'TEMPLATE' };
  const fakeApi = {
    apiFetch: async (url, init) => {
      weekCalls.push({ url, init });
      if (url.startsWith('/api/v1/workout-plans?')) return { days: [
        { date: '2026-11-02', routine: planRoutine, estimatedMinutes: 12, estimatedKcal: null },
        { date: '2026-11-03', routine: null, estimatedMinutes: null, estimatedKcal: null },
      ] };
      return {};
    },
  };
  const routineService = load('src/services/routineService.ts', {
    '@/services/api': fakeApi,
  });
  const plans = load('src/services/weeklyPlanService.ts', {
    '@/services/api': fakeApi,
    '@/services/routineService': routineService,
    '@/services/tokenStorage': { tokenStorage: { getAccessToken: async () => 'test' } },
  });
  const items = await plans.fetchWeeklyPlanItems(new Date('2026-11-02T12:00:00'));
  assert.equal(items.length, 1);
  assert.equal(items[0].routineId, 'planned-routine');
  assert.equal(items[0].calories, null);
  assert.equal(weekCalls[0].url, '/api/v1/workout-plans?weekStart=2026-11-02');
  await plans.saveWeeklyPlanChanges(items, [{ ...items[0], date: '2026-11-03' }]);
  assert.equal(weekCalls[1].init.method, 'DELETE');
  assert.equal(weekCalls[2].init.method, 'PUT');
  assert.equal(JSON.parse(weekCalls[2].init.body).routineId, 'planned-routine');
  console.log('PASS: session request, original snapshot, WebSocket authentication, event speech fallback and weekly plan');
})().catch(error => { console.error(error); process.exitCode = 1; });
