import { localDate } from '../src/task-today.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { changesFor, editable, rebaseEdits } from '../src/task-edit.js';
import { replaceCatalogTask } from '../src/ui/task-edit.js';
import type { View } from '../src/ui/view.js';
const original = { id: 'task', title: 'Original', description: 'Notes\nSecond line', dueDate: localDate(),
  ownerList: 'Work', completed: false, subtasks: [{ id: 'subtask', title: 'Keep', completed: false }] };
test('task editor prefills fields, emits only changed fields and validates real dates/title', () => {
  assert.deepEqual(editable(original), { title: 'Original', description: 'Notes\nSecond line', dueDate: localDate() });
  assert.deepEqual(changesFor(original, editable(original)), {});
  assert.deepEqual(changesFor(original, { ...editable(original), description: '', dueDate: '' }), { description: '', dueDate: '' });
  assert.deepEqual(changesFor(original, { ...editable(original), title: ' New title ' }), { title: 'New title' });
  for (const dueDate of ['2026-02-29', '2026-13-01', '2026-2-01', '0000-01-01']) {
    assert.throws(() => changesFor(original, { ...editable(original), dueDate }), /real date/);
  }
  assert.throws(() => changesFor(original, { ...editable(original), title: '  ' }), /blank/);
});
test('explicit rebase keeps edited fields without reverting unrelated external changes', () => {
  const current = { ...original, title: 'External title', dueDate: '2027-01-01' };
  const rebased = rebaseEdits(original, { ...editable(original), description: 'My notes' }, current);
  assert.equal(rebased.title, 'External title'); assert.equal(rebased.dueDate, '2027-01-01');
  assert.deepEqual(changesFor(current, rebased), { description: 'My notes' });
});
test('catalog update reconciles Today aliases without mutating attached conversation snapshots', () => {
  const attached = structuredClone(original), ref = { ...original, title: 'Stale title', placement: 'reference' };
  const view = { taskScope: original, catalog: { byList: new Map([['Work', [original]], ['today', [ref]]]), tasks: [original], currentList: 'Work' },
    runtime: { store: { conversations: [{ task: attached }] } } } as unknown as View;
  replaceCatalogTask(view, { ...original, title: 'Edited', description: '' });
  assert.equal(view.taskScope?.title, 'Edited'); assert.equal(view.catalog.byList.get('today')![0].title, 'Edited');
  assert.equal(view.catalog.byList.get('today')![0].placement, 'reference');
  assert.equal(attached.title, 'Original'); assert.equal(original.title, 'Original');
  assert.equal(view.catalog.currentList, 'Work'); assert.deepEqual(view.taskScope?.subtasks, original.subtasks);
});
