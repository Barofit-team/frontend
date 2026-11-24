const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../node_modules/typescript');
function load(file, deps) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in deps)) throw new Error(`Unexpected dependency ${name}`);
    return deps[name];
  }, module, module.exports);
  return module.exports;
}
(async () => {
  const template = id => ({ id, name: id, category: 'CORE', exercises: [], difficulty: 'BEGINNER' });
  // 실제 서버가 사용하는 고정 ID도 보존한다.
  const allowed = template('00000000-0000-0000-0000-000000000001');
  const excluded = template('00000000-0000-0000-0000-000000000002');
  let mode = 'normal', token = 'test', catalogCalls = 0;
  class ApiError extends Error {}
  const service = load('src/services/routineService.ts', {
    '@/services/api': { apiFetch: async url => {
      if (url.endsWith('/recommendations')) {
        if (mode === 'error') throw new Error('Profile unavailable');
        return { recommendations: mode === 'empty' ? [] : [{ template: allowed }], notice: '' };
      }
      if (url.startsWith('/api/v1/workout-plans?')) return { days: [] };
      catalogCalls++;
      return [allowed, excluded];
    } },
  });
  const plans = load('src/services/weeklyPlanService.ts', {
    '@/services/routineService': service,
    '@/services/tokenStorage': { tokenStorage: { getAccessToken: async () => token } },
  });
  assert.deepEqual((await plans.fetchRecommendedRoutineItems()).map(x => x.id), [allowed.id]);
  assert.equal(catalogCalls, 0);
  assert.deepEqual((await plans.fetchAvailableRoutineItems()).map(x => x.id), [allowed.id, excluded.id]);
  mode = 'empty';
  assert.deepEqual(await plans.fetchRecommendedRoutineItems(), []);
  mode = 'error';
  await assert.rejects(plans.fetchRecommendedRoutineItems());
  function create(init) {
    let state;
    const store = select => select(state);
    store.getState = () => state;
    state = init(value => { state = { ...state, ...value }; }, () => state);
    return store;
  }
  const { useWeeklyPlanStore: store } = load('src/stores/useWeeklyPlanStore.ts', {
    zustand: { create }, '@/services/api': { ApiError }, '@/services/weeklyPlanService': plans,
  });
  await store.getState().loadWeeklyPlan();
  assert.deepEqual(store.getState().recommendedRoutines, []);
  assert.equal(store.getState().availableRoutines.length, 2);
  mode = 'normal';
  await store.getState().loadWeeklyPlan();
  assert.deepEqual(store.getState().recommendedRoutines.map(x => x.id), [allowed.id]);
  assert.deepEqual(store.getState().availableRoutines.map(x => x.id), [allowed.id, excluded.id]);
  store.getState().reset();
  assert.deepEqual(store.getState().availableRoutines, []);
  token = null;
  assert.deepEqual(await plans.fetchRecommendedRoutineItems(), []);
  assert.equal((await plans.fetchAvailableRoutineItems()).length, 2);
  console.log('PASS: ratio-excluded templates stay selectable; empty/failed recommendations never refill from catalog; store lists stay separate; server template IDs preserved.');
})().catch(error => { console.error(error); process.exitCode = 1; });
