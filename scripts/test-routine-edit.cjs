// 운동 중 세트 수정(routineEdit) 순수 로직 테스트 — 화면·저장 없음
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../node_modules/typescript');
const dir = path.join(__dirname, '../src/components/workout-session');
function load(file) {
  const source = fs.readFileSync(path.join(dir, file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name.startsWith('./')) return load(`${name.slice(2)}.ts`);
    throw Error(name);
  }, module, module.exports);
  return module.exports;
}
const E = load('routineEdit.ts');
const { nextPhase, phaseDurationSeconds } = load('sessionFlow.ts');

const squat = { exerciseId: 'squat', sets: 3, targets: [1, 2, 3].map(() => ({ targetDurationSeconds: 60, restSeconds: 30, targetReps: 20 })) };
const plank = { exerciseId: 'plank', sets: 2, targets: [1, 2].map(() => ({ targetDurationSeconds: 45, restSeconds: 20 })) };
const routine = [squat, plank];
const frozen = JSON.stringify(routine);

// 잠금: 완료·진행 중 세트
assert.equal(E.lockedSetCount({ id: 0, kind: 'countdown', exerciseIndex: 0, set: 1 }, 0, 3), 0);
assert.equal(E.lockedSetCount({ id: 1, kind: 'exercising', exerciseIndex: 0, set: 2 }, 0, 3), 2);
assert.equal(E.lockedSetCount({ id: 2, kind: 'resting', exerciseIndex: 0, completedSet: 1 }, 0, 3), 1);
assert.equal(E.lockedSetCount({ id: 3, kind: 'exercising', exerciseIndex: 1, set: 1 }, 0, 3), 3);
assert.equal(E.lockedSetCount({ id: 3, kind: 'exercising', exerciseIndex: 0, set: 1 }, 1, 2), 0);

// 초안 생성
let draft = E.createEditDraft(squat, 0, 'REPS', 1, 10);
assert.deepEqual(draft.sets.map(s => [s.reps, s.seconds, s.locked]), [[20, 60, true], [20, 60, false], [20, 60, false]]);
assert.equal(draft.restSeconds, 30);
const original = draft;

// 증감·직접 입력·범위
draft = E.adjustSet(draft, 1, 'reps', 5);
assert.equal(draft.sets[1].reps, 25);
draft = E.adjustSet(draft, 0, 'reps', 5); // 잠긴 세트는 변경 불가
assert.equal(draft.sets[0].reps, 20);
draft = E.setSetValue(draft, 2, 'reps', 999);
assert.equal(draft.sets[2].reps, E.EDIT_LIMITS.repsMax);
draft = E.setSetValue(draft, 2, 'reps', 0);
assert.equal(draft.sets[2].reps, E.EDIT_LIMITS.repsMin);
draft = E.setSetValue(draft, 2, 'reps', NaN);
assert.equal(draft.sets[2].reps, E.EDIT_LIMITS.repsMin);
draft = E.adjustSet(draft, 1, 'seconds', -1000);
assert.equal(draft.sets[1].seconds, E.EDIT_LIMITS.secondsMin);
draft = E.adjustRest(draft, 10000);
assert.equal(draft.restSeconds, E.EDIT_LIMITS.restMax);
assert.equal(E.isDraftChanged(original, original), false);
assert.equal(E.isDraftChanged(original, draft), true);
assert.equal(original.sets[1].reps, 20, '원본 초안 불변');

// 시간 운동: 횟수 필드 무시
let pd = E.createEditDraft(plank, 1, 'DURATION', 0, 30);
assert.deepEqual(pd.sets.map(s => [s.reps, s.seconds]), [[null, 45], [null, 45]]);
assert.equal(E.setSetValue(pd, 0, 'reps', 10), pd);
pd = E.setSetValue(pd, 0, 'seconds', 90);
assert.equal(pd.sets[0].seconds, 90);

// 전부 잠긴 종목은 휴식도 변경 불가
const allLocked = E.createEditDraft(squat, 0, 'REPS', 3, 10);
assert.equal(E.adjustRest(allLocked, 10), allLocked);

// 키패드
assert.equal(E.pressKey('', '2', 'reps'), '2');
assert.equal(E.pressKey('25', '0', 'reps'), '250');
assert.equal(E.pressKey('250', '1', 'reps'), '250', '횟수 3자리 제한');
assert.equal(E.pressKey('25', 'back', 'reps'), '2');
assert.equal(E.pressKey('0', '7', 'reps'), '7');
assert.equal(E.pressKey('12', 'x', 'reps'), '12');
assert.equal(E.bufferToValue('', 'reps'), null);
assert.equal(E.bufferToValue('25', 'reps'), 25);
assert.equal(E.bufferToValue('130', 'seconds'), 90);
assert.equal(E.bufferToValue('45', 'seconds'), 45);
assert.equal(E.pressKey('1300', '5', 'seconds'), '1300', '시간 4자리 제한');

// 저장 반영: 잠긴 세트·다른 종목·원본 루틴 불변
const saved = E.applyEditToRoutine(routine, draft);
assert.equal(JSON.stringify(routine), frozen, '원본 루틴 불변');
assert.deepEqual(saved[0].targets[0], { targetDurationSeconds: 60, restSeconds: 30, targetReps: 20 });
assert.deepEqual(saved[0].targets[1], { targetDurationSeconds: 10, restSeconds: 300, targetReps: 25 });
assert.deepEqual(saved[0].targets[2], { targetDurationSeconds: 60, restSeconds: 300, targetReps: 1 });
assert.equal(saved[1], routine[1]);

// 단계 시간 계산에 반영(다음 세트부터)
assert.equal(phaseDurationSeconds({ id: 0, kind: 'exercising', exerciseIndex: 0, set: 2 }, saved), 10);
assert.equal(phaseDurationSeconds({ id: 0, kind: 'resting', exerciseIndex: 0, completedSet: 2 }, saved), 300);
assert.equal(phaseDurationSeconds({ id: 0, kind: 'resting', exerciseIndex: 0, completedSet: 1 }, saved), 30, '완료된 세트 뒤 휴식은 유지');
assert.deepEqual(nextPhase({ id: 4, kind: 'exercising', exerciseIndex: 0, set: 3 }, saved), { id: 5, kind: 'countdown', exerciseIndex: 1, set: 1 });

// 목록 표시
assert.equal(E.describeTargets(squat, 'REPS', 10), '3세트 · 20개');
assert.equal(E.describeTargets(saved[0], 'REPS', 10), '3세트 · 1~25개');
assert.equal(E.describeTargets(plank, 'DURATION', 30), '2세트 · 45초');

console.log('PASS: routine edit draft, locks, limits, keypad and apply');
