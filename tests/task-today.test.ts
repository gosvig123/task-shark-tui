import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { taskFixture } from './task-fixture.js';
import { loadTaskSnapshot } from '../src/task-api.js';
import { editable, updateTask } from '../src/task-edit.js';
import { removeDemoToday } from '../src/ui/task-today.js';
import { replaceCatalogTask } from '../src/ui/task-edit.js';
import type { View } from '../src/ui/view.js';
import { removeTodayReference } from '../src/task-today.js';
const today = new Date().toISOString().slice(0, 10);
function fixture(t: TestContext) {
  const f = taskFixture(t), path = join(f.root, 'state.json'), state = JSON.parse(readFileSync(path, 'utf8'));
  state.byList.Work[0].dueDate = ''; writeFileSync(path, JSON.stringify(state));
  return f;
}
test('changing a source/Today alias date to today removes only the reference', async t => {
  const f = fixture(t), original = (await loadTaskSnapshot(f.binary, 'Work', true)).tasks[0];
  const result = await updateTask(f.binary, { ...original, placement: 'reference' }, { ...editable(original), dueDate: today }, true);
  assert.equal(result.saved, true); assert.equal(result.todayPending, false);
  assert.equal((await loadTaskSnapshot(f.binary, 'today', true)).tasks.length, 0);
  assert.equal(result.snapshot!.tasks[0].dueDate, today);
  const calls = f.calls().filter(c => c.input);
  assert.deepEqual(calls.map(c => c.input.operation), ['task.update', 'task.removeFromToday']);
  assert.equal(calls[1].input.taskId, original.id); assert.equal(calls[1].input.list, 'today');
  assert.equal(calls[1].input.expectedRevision, 'revision-2');
});
test('date change on a task absent from Today does not issue a removal', async t => {
  const f = fixture(t), path = join(f.root, 'state.json'), state = JSON.parse(readFileSync(path, 'utf8'));
  state.byList.today = []; writeFileSync(path, JSON.stringify(state));
  const original = (await loadTaskSnapshot(f.binary, 'Work', true)).tasks[0];
  const result = await updateTask(f.binary, original, { ...editable(original), dueDate: today }, true);
  assert.equal(result.todayPending, false); assert.equal(result.snapshot!.tasks[0].id, original.id);
  assert.equal(f.calls().filter(c => c.input?.operation === 'task.removeFromToday').length, 0);
});
test('title-only, unchanged date and failed date updates never request reference removal', async t => {
  for (const mode of ['', 'conflict']) {
    const f = fixture(t), original = (await loadTaskSnapshot(f.binary, 'Work', true)).tasks[0];
    writeFileSync(join(f.root, 'mode'), mode);
    await updateTask(f.binary, original, { ...editable(original), title: 'New', ...(mode ? { dueDate: today } : {}) }, true);
    assert.equal(f.calls().filter(c => c.input?.operation === 'task.removeFromToday').length, 0);
  }
});
test('removal conflict or uncertain delivery preserves saved date; recovery retries removal only', async t => {
  for (const mode of ['remove-conflict', 'remove-uncertain']) {
    const f = fixture(t), original = (await loadTaskSnapshot(f.binary, 'Work', true)).tasks[0];
    writeFileSync(join(f.root, 'mode'), mode);
    const result = await updateTask(f.binary, original, { ...editable(original), dueDate: today }, true);
    assert.equal(result.saved, true); assert.equal(result.todayPending, true); assert.equal(result.snapshot!.tasks[0].dueDate, today);
    writeFileSync(join(f.root, 'mode'), '');
    assert.equal((await removeTodayReference(f.binary, original, true)).complete, true);
    assert.equal(f.calls().filter(c => c.input?.operation === 'task.update').length, 1);
  }
});
test('demo drops only Today references and keeps the source task and Active Task List', () => {
  const task = { id: 'task', title: 'Task', ownerList: 'Work', completed: false, subtasks: [] };
  const direct = { ...task, id: 'direct', ownerList: 'today', placement: 'direct' };
  const view = { taskScope: task, catalog: { currentList: 'Work', byList: new Map([
    ['Work', [task]], ['today', [{ ...task, placement: 'reference' }, direct]]]), tasks: [task, direct] } } as unknown as View;
  removeDemoToday(view, task); replaceCatalogTask(view, { ...task, dueDate: today });
  assert.equal(view.catalog.byList.get('today')!.length, 1); assert.equal(view.catalog.byList.get('Work')!.length, 1);
  removeDemoToday(view, direct); assert.equal(view.catalog.byList.get('today')![0].id, 'direct');
  assert.equal(view.catalog.currentList, 'Work'); assert.equal(view.taskScope?.id, task.id);
});
test('direct Today task keeps its changed date and is never removed or deleted', async t => {
  const f = fixture(t), path = join(f.root, 'state.json'), state = JSON.parse(readFileSync(path, 'utf8'));
  state.byList.today = [{ ...state.byList.Work[0], id: 'direct', ownerList: 'today', placement: 'direct' }];
  writeFileSync(path, JSON.stringify(state));
  const original = (await loadTaskSnapshot(f.binary, 'today', true)).tasks[0];
  const result = await updateTask(f.binary, original, { ...editable(original), dueDate: '2099-01-01' }, true);
  assert.equal(result.saved, true); assert.match(result.notice, /directly in Today/);
  assert.equal(result.snapshot!.tasks[0].id, 'direct');
  assert.deepEqual(f.calls().filter(c => c.input).map(c => c.input.operation), ['task.update']);
});
