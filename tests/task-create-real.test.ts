import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createTask, loadLists, loadTaskSnapshot, taskCommand } from '../src/task-api.js';
import { temporary } from './helpers.js';

const binary = process.env.TASK_SHARK_TEST_TASKS ?? join(homedir(), '.local/bin/tasks');
function isolatedTasks(home: string): string {
  mkdirSync(join(home, 'tasks-lists'));
  for (const name of ['today', 'Existing empty']) writeFileSync(join(home, 'tasks-lists', name + '.md'), `# ${name}\n`);
  writeFileSync(join(home, '.current-tasks-list'), 'Existing empty');
  const wrapper = join(home, 'isolated-tasks');
  writeFileSync(wrapper, `#!${process.execPath}\nrequire('node:child_process').execFileSync(` +
    `${JSON.stringify(binary)},process.argv.slice(2),{stdio:'inherit',env:{...process.env,HOME:${JSON.stringify(home)}}});`);
  chmodSync(wrapper, 0o700);
  return wrapper;
}
test('installed tasks-go creates a Pending task in existing empty active list using isolated HOME',
  { skip: !existsSync(binary) }, async t => {
    const home = temporary(t), wrapper = isolatedTasks(home);
    const lists = await loadLists(wrapper, true);
    assert.equal(lists.currentList, 'Existing empty');
    assert.deepEqual(lists.lists, ['Existing empty', 'today']);
    const result = await createTask(wrapper, { list: lists.currentList, title: 'Isolated fixture', description: 'Fixture notes' }, true);
    assert.equal(result.confirmed, true, result.notice);
    const task = result.snapshot!.tasks[0];
    assert.equal(task.title, 'Isolated fixture');
    assert.equal(task.completed, false);
    assert.equal(task.description, 'Fixture notes');
    assert.equal(task.ownerList, 'Existing empty');
    assert.equal((await loadTaskSnapshot(wrapper, 'today', true)).tasks.length, 0);
    assert.equal(readFileSync(join(home, '.current-tasks-list'), 'utf8'), 'Existing empty');
  });
test('installed tasks-go checks stale creation revisions before writing (isolated HOME)',
  { skip: !existsSync(binary) }, async t => {
    const wrapper = isolatedTasks(temporary(t));
    const before = await loadTaskSnapshot(wrapper, 'Existing empty', true);
    await createTask(wrapper, { list: 'Existing empty', title: 'First', description: '' }, true);
    const response = JSON.parse(await taskCommand(wrapper, ['exec'], true, undefined, {
      schemaVersion: 1, requestId: 'stale-fixture', operation: 'task.create', list: 'Existing empty',
      expectedRevision: before.revision, changes: { title: 'Must not be created' },
    }));
    assert.equal(response.success, false);
    assert.equal(response.error.code, 'revision_conflict');
    assert.equal((await loadTaskSnapshot(wrapper, 'Existing empty', true)).tasks.length, 1);
  });
