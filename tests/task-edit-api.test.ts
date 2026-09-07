import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { taskFixture } from './task-fixture.js';
import { loadTaskSnapshot } from '../src/task-api.js';
import { editable, updateTask } from '../src/task-edit.js';
test('task update uses canonical ID/source, latest revision, only changed fields, and reads source afterward', async t => {
  const f = taskFixture(t), original = (await loadTaskSnapshot(f.binary, 'Work', true)).tasks[0];
  const result = await updateTask(f.binary, original, { ...editable(original), description: 'New\nnotes', dueDate: '' }, true);
  assert.equal(result.saved, true, result.notice);
  const request = f.calls().find(c => c.input?.operation === 'task.update').input;
  assert.equal(request.taskId, 'calendar'); assert.equal(request.list, 'Work'); assert.equal(request.expectedRevision, 'revision-1');
  assert.deepEqual(request.changes, { description: 'New\nnotes', dueDate: '' });
  assert.equal(result.snapshot?.tasks[0].description, 'New\nnotes');
  assert.ok(f.calls().slice(f.calls().findIndex(c => c.input?.operation === 'task.update') + 1)
    .some(c => JSON.stringify(c.args) === JSON.stringify(['api', 'snapshot', '--list', 'Work'])));
  assert.equal(JSON.parse(readFileSync(join(f.root, 'state.json'), 'utf8')).currentList, 'Empty list');
});
test('no-op does not invoke CLI; external field changes preserve draft and block overwrite', async t => {
  const f = taskFixture(t), original = (await loadTaskSnapshot(f.binary, 'Work', true)).tasks[0];
  const count = f.calls().length;
  await updateTask(f.binary, original, editable(original), true); assert.equal(f.calls().length, count);
  const path = join(f.root, 'state.json'), state = JSON.parse(readFileSync(path, 'utf8'));
  state.byList.Work[0].title = 'External edit'; writeFileSync(path, JSON.stringify(state));
  const draft = { ...editable(original), title: 'My edit' }, result = await updateTask(f.binary, original, draft, true);
  assert.equal(result.blocked, true); assert.equal(draft.title, 'My edit');
  assert.equal(f.calls().filter(c => c.input?.operation === 'task.update').length, 0);
});
test('revision conflict and uncertain partial save are never automatically retried', async t => {
  for (const mode of ['conflict', 'partial-failure']) {
    const f = taskFixture(t), original = (await loadTaskSnapshot(f.binary, 'Work', true)).tasks[0];
    writeFileSync(join(f.root, 'mode'), mode);
    const result = await updateTask(f.binary, original, { ...editable(original), title: 'My edit' }, true);
    assert.equal(result.saved, false); assert.equal(result.blocked, true);
    assert.equal(f.calls().filter(c => c.input?.operation === 'task.update').length, 1);
    assert.equal(result.snapshot?.tasks[0].title, mode === 'partial-failure' ? 'My edit' : original.title);
  }
});
