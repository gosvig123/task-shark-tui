import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { temporary } from './helpers.js';
import { createTask, loadTaskSnapshot, taskCommand } from '../src/task-api.js';
import { editable, updateTask } from '../src/task-edit.js';
import { localDate } from '../src/ui/task-filters.js';
const binary = process.env.TASK_SHARK_TEST_TASKS ?? join(homedir(), '.local/bin/tasks');
function isolated(t: TestContext) {
  const home = temporary(t); mkdirSync(join(home, 'tasks-lists'));
  for (const name of ['today', 'Work']) writeFileSync(join(home, 'tasks-lists', name + '.md'), `# ${name}\n`);
  writeFileSync(join(home, '.current-tasks-list'), 'Work');
  const wrapper = join(home, 'isolated-tasks');
  writeFileSync(wrapper, `#!${process.execPath}\nrequire('node:child_process').execFileSync(${JSON.stringify(binary)},process.argv.slice(2),` +
    `{stdio:'inherit',env:{...process.env,HOME:${JSON.stringify(home)},TASKSHARK_BOARD_ROOT:${JSON.stringify(join(home, 'board'))}}});`, { mode: 0o700 });
  return { home, wrapper };
}
async function addToday(wrapper: string, id: string) {
  const snapshot = await loadTaskSnapshot(wrapper, 'Work', true);
  const response = JSON.parse(await taskCommand(wrapper, ['exec'], true, undefined, { schemaVersion: 1,
    requestId: crypto.randomUUID(), operation: 'task.addToToday', list: 'Work', taskId: id, expectedRevision: snapshot.revision, changes: {} }));
  assert.equal(response.success, true);
}
test('installed CLI removes a rescheduled Today reference even when new date is today; snapshots do not re-add it', { skip: !existsSync(binary) }, async t => {
  const { home, wrapper } = isolated(t);
  const created = await createTask(wrapper, { list: 'Work', title: 'Source fixture', description: '' }, true);
  const original = created.snapshot!.tasks[0]; await addToday(wrapper, original.id);
  const result = await updateTask(wrapper, original, { ...editable(original), dueDate: localDate() }, true);
  assert.equal(result.saved, true, result.notice); assert.equal(result.todayPending, false, result.notice);
  for (let i = 0; i < 2; i++) assert.equal((await loadTaskSnapshot(wrapper, 'today', true)).tasks.length, 0);
  const source = (await loadTaskSnapshot(wrapper, 'Work', true)).tasks[0]; assert.equal(source.id, original.id); assert.equal(source.dueDate, localDate());
  await addToday(wrapper, source.id);
  const cleared = await updateTask(wrapper, source, { ...editable(source), dueDate: '' }, true);
  assert.equal(cleared.saved, true); assert.equal(cleared.todayPending, false);
  assert.equal((await loadTaskSnapshot(wrapper, 'today', true)).tasks.length, 0);
  assert.equal(readFileSync(join(home, '.current-tasks-list'), 'utf8'), 'Work');
});
test('installed CLI keeps a directly owned Today task after date change', { skip: !existsSync(binary) }, async t => {
  const { wrapper } = isolated(t);
  const created = await createTask(wrapper, { list: 'today', title: 'Direct fixture', description: '' }, true);
  const original = created.snapshot!.tasks[0];
  const result = await updateTask(wrapper, original, { ...editable(original), dueDate: '' }, true);
  assert.equal(result.saved, true, result.notice); assert.match(result.notice, /directly in Today/);
  assert.equal((await loadTaskSnapshot(wrapper, 'today', true)).tasks[0].id, original.id);
});
