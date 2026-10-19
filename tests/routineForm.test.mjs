import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
runInNewContext(ts.transpileModule(readFileSync('src/utils/routineForm.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const { initialDraft, createPayload, updatePayload } = context.exports;
const routine = { id: 'template-id', exercises: [
  { id: 'pushup-item', measurementType: 'REPS', name: '푸시업', sets: [{ targetReps: 10 }, { targetReps: 10 }] },
  { id: 'plank-item', measurementType: 'DURATION', name: '플랭크', sets: [{ targetDurationSeconds: 30 }] },
] };
const plain = value => JSON.parse(JSON.stringify(value));
test('기본 운동량을 읽고 생성 요청에 템플릿 종목 ID와 올바른 목표만 전달한다', () => {
  assert.deepEqual(plain(createPayload(routine, initialDraft(routine))), {
    templateId: 'template-id', exercises: [
      { templateExerciseId: 'pushup-item', setCount: 2, targetReps: 10 },
      { templateExerciseId: 'plank-item', setCount: 1, targetDurationSeconds: 30 },
    ],
  });
});
test('수정 요청은 사용자 루틴 종목 ID를 사용한다', () => {
  const saved = { ...routine, id: 'user-routine', exercises: routine.exercises.map(e => ({ ...e, id: `saved-${e.id}` })) };
  const draft = initialDraft(saved); draft['saved-plank-item'] = { sets: '3', target: '45' };
  const result = plain(updatePayload(saved, draft));
  assert.deepEqual(result.exercises[1], { routineExerciseId: 'saved-plank-item', setCount: 3, targetDurationSeconds: 45 });
  assert.equal('templateId' in result, false);
});
test('빈 값, 소수, 음수, 0, 지수, 범위 초과 세트 수를 거부한다', () => {
  for (const sets of ['', '1.5', '-1', '0', '1e1', '21']) {
    const draft = initialDraft(routine); draft['pushup-item'].sets = sets;
    assert.throws(() => createPayload(routine, draft), /세트 수/);
  }
});
test('시간 목표는 양의 정수이며 서버 int 범위 이내여야 한다', () => {
  for (const target of ['', '0', '2.5', '-3', '2147483648']) {
    const draft = initialDraft(routine); draft['plank-item'].target = target;
    assert.throws(() => createPayload(routine, draft), /목표/);
  }
});
