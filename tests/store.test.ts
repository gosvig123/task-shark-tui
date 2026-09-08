import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { Status } from '../src/model.js';
import { lockStore } from '../src/lock.js';
import { temporary } from './helpers.js';
import { demoTasks } from '../src/demo.js';

test('store preserves identities, fixed workspace, review and task snapshot', t => {
  const root = temporary(t), store = new Store(root, false);
  const task = structuredClone(demoTasks[0]);
  const c = store.create('Calendar', root, 'provider/model', task);
  task.title = 'Changed elsewhere';
  c.status = Status.review; store.save();
  const loaded = new Store(root, false).conversations[0];
  assert.equal(loaded.workspace, root);
  assert.equal(loaded.id, c.id);
  assert.equal(loaded.task?.title, 'Fix calendar sync');
  assert.equal(loaded.status, Status.review);
  assert.throws(() => store.create('Bad', join(root, 'missing'), ''));
});
test('restart exposes interrupted runs and does not replay queued messages', t => {
  const root = temporary(t), store = new Store(root, false);
  const c = store.create('Interrupted', '', '');
  c.status = Status.running; c.queue = ['unsent']; store.save();
  const loaded = new Store(root, false).conversations[0];
  assert.equal(loaded.status, Status.failed);
  assert.deepEqual(loaded.queue, []);
  assert.equal(loaded.messages.at(-1)?.text, 'unsent');
  assert.match(loaded.error!, /not replayed/);
});
test('corrupt index and mode mismatch fail without overwriting evidence', t => {
  const root = temporary(t), index = join(root, 'conversations.json');
  writeFileSync(index, '{broken');
  assert.throws(() => new Store(root, false));
  assert.equal(readFileSync(index, 'utf8'), '{broken');
  writeFileSync(index, '{"version":1,"conversations":[]}');
  new Store(root, true).create('Demo', root, '');
  assert.throws(() => new Store(root, false), /mode mismatch/);
});
test('store lock excludes a second writer and releases cleanly', t => {
  const root = temporary(t), release = lockStore(root);
  assert.throws(() => lockStore(root), /locked/);
  release();
  lockStore(root)();
});
