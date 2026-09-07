import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyDraft, submitDraft } from '../src/ui/conversation-draft.js';
import type { View } from '../src/ui/view.js';
import { Store } from '../src/store.js';
import { temporary } from './helpers.js';

const task = { id: 'task-1', title: 'Existing task', ownerList: 'Work', completed: false, subtasks: [] };
test('emptyDraft keeps task context without prefilling any input or touching storage', t => {
  const root = temporary(t), store = new Store(root, false);
  const draft = emptyDraft(task);
  assert.deepEqual(draft, { text: '', title: '', workspace: '', model: '', task });
  const view = { runtime: { store, send: () => assert.fail('must not send') } } as unknown as View;
  for (const text of ['', ' \n ']) {
    draft.text = text;
    assert.equal(submitDraft(view, draft), false);
  }
  assert.deepEqual(store.conversations, []);
  for (const path of ['conversations.json', 'workspaces', 'sessions']) assert.equal(existsSync(join(root, path)), false);
});
test('submitDraft saves task, optional settings, and exact input before delivery', t => {
  const root = temporary(t), store = new Store(root, false), draft = emptyDraft(task);
  Object.assign(draft, { text: 'nctgrq/m iaxf\nSecond line', title: 'Optional title', workspace: root, model: 'provider/model' });
  let sends = 0;
  const view = { runtime: { store, send: (_c: unknown, text: string) => {
    sends++;
    const saved = JSON.parse(readFileSync(store.index, 'utf8')).conversations[0];
    assert.equal(saved.inFlight, text);
    assert.deepEqual(saved.task, task);
    assert.equal(saved.model, draft.model);
    assert.equal(saved.workspace, root);
    return Promise.resolve();
  } } } as unknown as View;
  assert.equal(submitDraft(view, draft), true);
  assert.equal(sends, 1);
  assert.equal(view.selected, store.conversations[0].id);
});
test('failed draft save retains input for correction without delivery', t => {
  const store = new Store(temporary(t), false), draft = emptyDraft();
  draft.text = 'Keep this input';
  store.save = () => { throw new Error('disk full'); };
  const view = { runtime: { store, send: () => assert.fail('must not send') } } as unknown as View;
  assert.throws(() => submitDraft(view, draft), /disk full/);
  assert.equal(draft.text, 'Keep this input');
  assert.deepEqual(store.conversations, []);
});
