import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoTask } from '../src/ui/task-creation.js';
import { removeDemoToday } from '../src/ui/task-today.js';
import { replaceCatalogTask } from '../src/ui/task-edit.js';
import { deduplicate } from '../src/tasks.js';
import type { View } from '../src/ui/view.js';

test('demo Today creation preserves its Active Task List source after removal and date editing', () => {
  const view = { catalog: { currentList: 'Work', lists: ['Work', 'today'], tasks: [],
    byList: new Map([['Work', []], ['today', []]]) } } as unknown as View;
  createDemoTask(view, { list: 'today', title: 'New task', description: '', dueDate: '2030-01-01' });
  const source = view.catalog.byList.get('Work')![0];
  assert.equal(source.ownerList, 'Work');
  assert.equal(view.catalog.byList.get('today')![0].placement, 'reference');
  removeDemoToday(view, source);
  view.catalog.tasks = deduplicate([...view.catalog.byList.values()].flat());
  assert.equal(view.catalog.tasks.length, 1);
  view.catalog.byList.set('today', [{ ...source, placement: 'reference' }]);
  const edited = { ...source, dueDate: '2030-01-02' };
  removeDemoToday(view, edited); replaceCatalogTask(view, edited);
  assert.equal(view.catalog.byList.get('today')!.length, 0);
  assert.equal(view.catalog.byList.get('Work')![0].dueDate, '2030-01-02');
  assert.equal(view.catalog.tasks.length, 1);
});
