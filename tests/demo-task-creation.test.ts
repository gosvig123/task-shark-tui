import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoTask } from '../src/ui/task-creation.js';
import { replaceCatalogTask } from '../src/ui/task-edit.js';
import { localDate } from '../src/task-today.js';
import type { View } from '../src/ui/view.js';

test('demo Today derives membership from source dates on creation and edits', () => {
  const view = { catalog: { currentList: 'Work', lists: ['Work', 'today'], tasks: [],
    byList: new Map([['Work', []], ['today', []]]) } } as unknown as View;
  createDemoTask(view, { list: 'today', title: 'New task', description: '' });
  const source = view.catalog.byList.get('Work')![0];
  assert.equal(source.ownerList, 'Work'); assert.equal(source.dueDate, localDate());
  assert.equal(view.catalog.byList.get('today')![0].placement, 'reference');
  replaceCatalogTask(view, { ...source, dueDate: '' });
  assert.equal(view.catalog.byList.get('today')!.length, 0);
  replaceCatalogTask(view, { ...source, dueDate: localDate() });
  assert.equal(view.catalog.byList.get('today')!.length, 1);
  createDemoTask(view, { list: 'today', title: 'Future task', description: '', dueDate: '9999-01-01' });
  assert.equal(view.catalog.byList.get('today')!.length, 1);
  assert.equal(view.catalog.byList.get('Work')!.length, 2);
});
