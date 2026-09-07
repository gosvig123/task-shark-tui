import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadTasks } from '../src/tasks.js';
import { temporary } from './helpers.js';

const binary = process.env.TASK_SHARK_TEST_TASKS ?? join(homedir(), '.local/bin/tasks');
test('tasks-go: overdue reset is blocked without consent; allowed only in an isolated home',
  { skip: !existsSync(binary) }, async t => {
    const home = temporary(t), lists = join(home, 'tasks-lists');
    mkdirSync(lists);
    const today = join(lists, 'today.md'), reset = join(home, '.tasks-today-last-reset');
    writeFileSync(today, '# Today\n\n[x] Completed fixture @id:00000000-0000-4000-8000-000000000001\n'); writeFileSync(reset, '2000-01-01');
    const before = [readFileSync(today, 'utf8'), readFileSync(reset, 'utf8')];
    const wrapper = join(home, 'isolated-tasks');
    writeFileSync(wrapper, `#!${process.execPath}\nrequire('node:child_process').execFileSync(` +
      `${JSON.stringify(binary)},process.argv.slice(2),{stdio:'inherit',env:{...process.env,HOME:${JSON.stringify(home)}}});`);
    chmodSync(wrapper, 0o700);
    await assert.rejects(loadTasks(wrapper), /rewrite today.md/);
    assert.deepEqual([readFileSync(today, 'utf8'), readFileSync(reset, 'utf8')], before);
    await loadTasks(wrapper, true);
    assert.notEqual(readFileSync(reset, 'utf8'), before[1]);
    assert.notEqual(readFileSync(today, 'utf8'), before[0]);
  });
