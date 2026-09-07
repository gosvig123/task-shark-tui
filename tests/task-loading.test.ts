import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { configuration } from '../src/config.js';
import { refreshTasks } from '../src/ui/refresh.js';
import type { View } from '../src/ui/view.js';
import { temporary } from './helpers.js';

test('normal app loading explicitly authorizes snapshots without a consent dialog', async () => {
  const config = { ...configuration(), demo: false, tasks: 'fixture-only' };
  const catalog = { tasks: [], lists: ['Existing'], currentList: 'Existing', byList: new Map([['Existing', []]]) };
  const view = { refreshing: false, render() {} } as unknown as View;
  let called = false;
  await refreshTasks(view, config, async (executable, allowed) => {
    assert.equal(executable, 'fixture-only'); assert.equal(allowed, true); called = true; return catalog;
  });
  assert.equal(called, true); assert.equal(view.catalog, catalog); assert.equal(view.busy, undefined);
});
test('standalone local check still skips task snapshots without its explicit safety flag', t => {
  const root = temporary(t), pi = join(root, 'pi'), tasks = join(root, 'tasks'), marker = join(root, 'task-called');
  const fakePi = pathToFileURL(resolve('tests/fixtures/fake-pi.mjs')).href;
  writeFileSync(pi, `#!/usr/bin/env node\nimport(${JSON.stringify(fakePi)});`, { mode: 0o700 });
  writeFileSync(tasks, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected'); process.exit(1);`, { mode: 0o700 });
  const output = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/check-local.ts'], {
    env: { ...process.env, HOME: root, TASK_SHARK_PI: pi, TASK_SHARK_TASKS: tasks,
      TASK_SHARK_DATA_DIR: root, TASKSHARK_BOARD_ROOT: join(root, 'board') }, encoding: 'utf8', timeout: 10_000,
  });
  assert.match(output, /Tasks skipped/); assert.match(output, /get_state \+ get_messages passed/);
  assert.equal(existsSync(marker), false);
});
