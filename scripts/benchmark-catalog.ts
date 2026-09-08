import { localDate } from '../src/task-today.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { database } from '../src/task-database.js';
import { loadTaskCatalog } from '../src/tasks.js';
import { readBoard } from '../src/board-storage.js';
import { temporary } from '../tests/helpers.js';

function seed(root: string, lists: number, tasks: number): void {
  database(root, db => {
    const list = db.prepare('INSERT INTO task_lists VALUES (?, 0)');
    const task = db.prepare('INSERT INTO tasks VALUES (?, ?, ?)');
    for (let i = 0; i < lists; i++) list.run(`List ${i}`);
    for (let i = 0; i < tasks; i++) {
      const ownerList = `List ${i % lists}`, id = String(i);
      task.run(id, ownerList, JSON.stringify({ id, ownerList, title: `Task ${i}`,
        description: 'Task notes '.repeat(30), dueDate: i % 4 === 0 ? localDate() : undefined, completed: false, subtasks: [] }));
    }
  });
}
test('large local catalog refresh benchmark', async t => {
  const root = temporary(t); seed(root, 100, 10000);
  await loadTaskCatalog(root);
  const start = performance.now();
  for (let i = 0; i < 10; i++) {
    const catalog = await loadTaskCatalog(root);
    assert.equal(catalog.tasks.length, 10000);
    assert.equal(catalog.byList.get('today')?.length, 2500);
  }
  t.diagnostic(`100 lists / 10000 tasks / 2500 Today references: refresh ${((performance.now() - start) / 10).toFixed(2)}ms`);
  const board = performance.now();
  for (let i = 0; i < 100; i++) readBoard(root, String(i));
  t.diagnostic(`Empty Board Updates read ${( (performance.now() - board) / 100).toFixed(2)}ms`);
});
