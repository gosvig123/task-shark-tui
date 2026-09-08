import { localDate } from '../src/task-today.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueDay, filterTasks, taskLabel, TaskFilter } from '../src/ui/task-filters.js';
import type { Task } from '../src/model.js';

const today = '2026-09-06';
function task(id: string, dueDate?: string, completed = false): Task {
  return { id, title: id, ownerList: 'Work', completed, dueDate, subtasks: [] };
}
const tasks = [task('undated'), task('later', '2026-09-10'), task('today', today),
  task('overdue', '2026-09-05'), task('done', '2026-09-04', true)];
const ids = (items: Task[]) => items.map(item => item.id);
test('tasks default to latest due date, undated last, without mutating catalog order', () => {
  assert.deepEqual(ids(filterTasks(tasks, TaskFilter.all)), ['later', 'today', 'overdue', 'done', 'undated']);
  assert.equal(tasks[0].id, 'undated');
  assert.equal(taskLabel(tasks[2]), '○ 2026-09-06 · today · Work');
  assert.match(taskLabel(tasks[0]), /No due date/);
});
test('quick filters combine with text search and exclude completed tasks from urgency filters', () => {
  assert.deepEqual(ids(filterTasks(tasks, TaskFilter.overdue, '', today)), ['overdue']);
  assert.deepEqual(ids(filterTasks(tasks, TaskFilter.today, '', today)), ['today']);
  assert.deepEqual(ids(filterTasks(tasks, TaskFilter.completed)), ['done']);
  assert.deepEqual(ids(filterTasks(tasks, TaskFilter.pending, 'LATER')), ['later']);
  assert.deepEqual(ids(filterTasks(tasks, TaskFilter.undated, 'work')), ['undated']);
  assert.deepEqual(filterTasks(tasks, TaskFilter.today, 'missing', today), []);
});
test('due dates accept date-only and timestamps; empty, zero and invalid dates sort last', () => {
  for (const due of ['', '0001-01-01T00:00:00Z', 'invalid', '2026-02-30']) assert.equal(dueDay(task('bad', due)), undefined);
  assert.equal(dueDay(task('timestamp', `${today}T00:00:00Z`)), today);
  assert.equal(localDate(new Date(2026, 8, 6, 23, 59)), today);
  assert.deepEqual(ids(filterTasks([task('bad', 'invalid'), task('valid', today)], TaskFilter.all)), ['valid', 'bad']);
});
