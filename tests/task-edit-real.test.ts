import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { temporary } from './helpers.js';
import { createTask } from '../src/task-api.js';
import { editable, updateTask } from '../src/task-edit.js';
const binary = process.env.TASK_SHARK_TEST_TASKS ?? join(homedir(), '.local/bin/tasks');
test('installed tasks-go clears optional strings and preserves multiline notes in an isolated home', { skip: !existsSync(binary) }, async t => {
  const home = temporary(t); mkdirSync(join(home, 'tasks-lists'));
  for (const name of ['today', 'Work']) writeFileSync(join(home, 'tasks-lists', name + '.md'), `# ${name}\n`);
  writeFileSync(join(home, '.current-tasks-list'), 'Work');
  const wrapper = join(home, 'isolated-tasks');
  writeFileSync(wrapper, `#!${process.execPath}\nrequire('node:child_process').execFileSync(${JSON.stringify(binary)},process.argv.slice(2),` +
    `{stdio:'inherit',env:{...process.env,HOME:${JSON.stringify(home)}}});`, { mode: 0o700 });
  const created = await createTask(wrapper, { list: 'Work', title: 'Fixture', description: 'Before' }, true);
  const original = created.snapshot!.tasks[0];
  const changed = await updateTask(wrapper, original, { ...editable(original), description: 'First line\nSecond line', dueDate: '2027-02-28' }, true);
  assert.equal(changed.saved, true, changed.notice); assert.equal(changed.snapshot!.tasks[0].description, 'First line\nSecond line');
  const task = changed.snapshot!.tasks[0];
  const cleared = await updateTask(wrapper, task, { ...editable(task), description: '', dueDate: '' }, true);
  assert.equal(cleared.saved, true, cleared.notice); assert.equal(cleared.snapshot!.tasks[0].description ?? '', '');
  assert.equal(cleared.snapshot!.tasks[0].dueDate ?? '', ''); assert.equal(cleared.snapshot!.tasks[0].id, original.id);
});
