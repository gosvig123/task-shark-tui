import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskFormState } from '../src/ui/task-edit-form.js';
import { editable } from '../src/task-edit.js';
const original = { id: 'a', title: 'Task', ownerList: 'Work', completed: false, subtasks: [] };
function state(): TaskFormState { return new TaskFormState({ original, draft: editable(original), blocked: false, notice: '' }); }
test('task form navigates fields and explicit actions without implicit submission', () => {
  const form = state();
  assert.equal(form.key('', { name: 'tab', shift: true }), undefined); assert.equal(form.focus, 4);
  assert.equal(form.key('', { name: 'enter' }), 'cancel');
  form.key('', { name: 'tab' }); assert.equal(form.focus, 0);
  form.key('', { name: 'enter' }); assert.equal(form.focus, 1);
  form.key('', { name: 'enter' }); assert.equal(form.focus, 2);
  form.key('🦈', {}); form.key('', { name: 'enter' }); form.key('é', {});
  assert.equal(form.editor.draft.description, '🦈\né');
  assert.equal(form.key('', { name: 's', ctrl: true }), 'save');
  assert.equal(form.key('', { name: 'escape' }), 'cancel');
});
test('task form validates and focuses the relevant field while keeping the draft', () => {
  const form = state(); form.key('', { name: 'u', ctrl: true });
  assert.equal(form.validate(), false); assert.equal(form.focus, 0); assert.match(form.error, /blank/);
  form.key('Retained', {}); form.key('', { name: 'tab' }); form.key('2026-02-30', {});
  assert.equal(form.validate(), false); assert.equal(form.focus, 1); assert.match(form.error, /real date/);
  assert.equal(form.editor.draft.title, 'Retained');
  form.key('', { name: 'u', ctrl: true }); assert.equal(form.validate(), true);
});
test('rebase preserves cursor for unchanged draft fields', () => {
  const form = state(); form.key('', { name: 'left' });
  form.editor.draft.description = 'Source notes'; form.rebase();
  assert.equal(form.editors[0].cursor, 3); assert.equal(form.editors[2].value, 'Source notes');
});
