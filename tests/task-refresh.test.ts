import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTask } from '../src/task-api.js';
import { loadTaskCatalog } from '../src/tasks.js';
import { localDate } from '../src/task-today.js';
import { taskRevision, watchTaskChanges } from '../src/ui/task-refresh.js';
import { database } from '../src/task-database.js';
import type { View } from '../src/ui/view.js';
import type { Config } from '../src/config.js';
import { temporary } from './helpers.js';

test('watcher refreshes external date edits, local midnight, and stops with the screen', async t => {
  const root = temporary(t), now = new Date(2026, 8, 8, 23, 59, 58);
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: now.getTime() });
  await createTask(root, { list: 'Inbox', title: 'Task', description: '' });
  const screen = new EventEmitter(), config = { root, demo: false } as Config;
  const view = { screen, catalog: await loadTaskCatalog(root), notice: 'Keep notice', render() {} } as unknown as View;
  watchTaskChanges(view, config);
  const task = { ...view.catalog.tasks[0], dueDate: localDate() };
  database(root, db => db.prepare('UPDATE tasks SET data = ? WHERE id = ?').run(JSON.stringify(task), task.id));
  t.mock.timers.tick(1000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.catalog.byList.get('today')!.length, 1); assert.equal(view.notice, 'Keep notice');
  t.mock.timers.tick(1000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.catalog.byList.get('today')!.length, 0);
  screen.emit('destroy');
  const catalog = view.catalog;
  t.mock.timers.tick(86400000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.catalog, catalog);
});
test('revision uses local calendar date for demo and detects database appearance', async t => {
  const root = temporary(t), config = { root, demo: false } as Config;
  const now = new Date(2026, 8, 8, 23), next = new Date(2026, 8, 9);
  assert.notEqual(taskRevision({ ...config, demo: true }, now), taskRevision({ ...config, demo: true }, next));
  const before = taskRevision(config, now);
  await createTask(root, { list: 'Inbox', title: 'Task', description: '' });
  assert.notEqual(taskRevision(config, now), before);
});
