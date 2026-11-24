const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name) => {
    assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

function create(initialize) {
  let state;
  const get = () => state;
  const set = (value) => { state = { ...state, ...(typeof value === 'function' ? value(state) : value) }; };
  state = initialize(set, get);
  return { getState: get };
}

const types = load('src/types/onboarding.ts');
const birthDate = load('src/utils/birthDate.ts');
const ageAt = (year, month, day, today) => birthDate.ageFromBirthDate(year, month, day, new Date(today));
assert.equal(ageAt('2000', '11', '20', '2026-11-19T12:00:00'), 25);
assert.equal(ageAt('2000', '11', '20', '2026-11-20T12:00:00'), 26);
assert.equal(ageAt('2000', '02', '29', '2026-02-28T12:00:00'), 25);
assert.equal(ageAt('2001', '02', '29', '2026-11-20T12:00:00'), null);
assert.equal(ageAt('2000', '13', '01', '2026-11-20T12:00:00'), null);
assert.equal(ageAt('2027', '01', '01', '2026-11-20T12:00:00'), null);
assert.equal(ageAt('', '01', '01', '2026-11-20T12:00:00'), null);
const { useOnboardingStore: store, TOTAL_ONBOARDING_STEPS: total } = load('src/stores/useOnboardingStore.ts', {
  zustand: { create },
  '@/utils/birthDate': birthDate,
  '@/types/onboarding': types,
});
const state = () => store.getState();
assert.equal(state().gender, null, 'Gender must require an explicit choice.');
assert.equal(state().toOnboardingRequest(), null);
state().setNickname('테스트닉네임');
state().nextStep();
assert.equal(state().step, 2);
state().setGender('FEMALE');
state().nextStep();
assert.equal(state().step, 3);
state().prevStep();
assert.equal(state().gender, 'FEMALE', 'Back navigation must retain the selected gender.');
state().setGender('MALE');
assert.equal(state().gender, 'MALE');
assert.equal(state().toOnboardingRequest(), null, 'Gender alone must not submit an incomplete profile.');
state().setBirthDatePart('birthYear', '2000');
state().setBirthDatePart('birthMonth', '02');
state().setBirthDatePart('birthDay', '30');
assert.equal(state().age, null);
state().setBirthDatePart('birthDay', '29');
const expectedAge = birthDate.ageFromBirthDate('2000', '02', '29');
assert.equal(state().age, expectedAge);
state().setHeightInput('175');
state().setWeightInput('70');
state().setGoal('POSTURE');
state().setWeeklyWorkoutDays(3);
state().setExperienceLevel('BEGINNER');
state().setDiscomfortSelections(['NONE']);
assert.equal(state().coachingStyle, 'FRIENDLY', 'Deferred coaching step must supply the required API default.');
assert.deepEqual(state().toOnboardingRequest(), {
  nickname: '테스트닉네임', gender: 'MALE', birthDate: '2000-02-29', heightCm: 175, weightKg: 70,
  goal: 'POSTURE', weeklyWorkoutDays: 3, experienceLevel: 'BEGINNER',
  discomfortAreas: [], coachingStyle: 'FRIENDLY',
});
state().setGoal('HABIT');
assert.equal(state().toOnboardingRequest().goal, 'HABIT');
assert.equal(Object.hasOwn(state().toOnboardingRequest(), 'age'), false);
assert.equal(state().toOnboardingRequest().birthDate, '2000-02-29');
state().toggleDiscomfortSelection('NECK_SHOULDER');
state().toggleDiscomfortSelection('ARM_WRIST');
assert.deepEqual(state().toOnboardingRequest().discomfortAreas, ['NECK_SHOULDER', 'ARM_WRIST']);
state().toggleDiscomfortSelection('NECK_SHOULDER');
assert.deepEqual(state().discomfortSelections, ['ARM_WRIST']);
state().toggleDiscomfortSelection('NONE');
assert.deepEqual(state().discomfortSelections, ['NONE']);
assert.deepEqual(state().toOnboardingRequest().discomfortAreas, []);
state().toggleDiscomfortSelection('NONE');
assert.deepEqual(state().discomfortSelections, []);
assert.equal(state().toOnboardingRequest(), null);
for (const area of ['NECK_SHOULDER', 'ARM_WRIST', 'BACK', 'LEG_ANKLE']) state().toggleDiscomfortSelection(area);
assert.equal(state().toOnboardingRequest().discomfortAreas.length, 4);
state().setStep(5);
state().prevStep();
state().nextStep();
assert.equal(state().discomfortSelections.length, 4);
for (let i = 0; i < total + 2; i++) state().nextStep();
assert.equal(state().step, total);
assert.equal(total, 8);
state().resetOnboarding();
assert.equal(state().step, 1);
assert.equal(state().gender, null, 'Starting onboarding again must clear the previous choice.');
assert.equal(state().nickname, '');
assert.equal(state().birthYear, '');
assert.equal(state().birthMonth, '');
assert.equal(state().birthDay, '');
assert.equal(state().toOnboardingRequest(), null);
console.log('PASS: explicit gender selection, back navigation, 8-step bounds and birthday validation, API payload, reset.');
