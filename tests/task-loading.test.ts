import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration } from '../src/config.js';
import { refreshTasks } from '../src/ui/refresh.js';
import type { View } from '../src/ui/view.js';
import { temporary } from './helpers.js';

test('normal app loading uses the configuration root without reset consent or CLI', async t => {
  const config = { ...configuration(), demo: false, root: temporary(t) };
  const view = { refreshing: false, render() {} } as unknown as View;
  await refreshTasks(view, config);
  assert.equal(view.catalog.currentList, 'Inbox'); assert.deepEqual(view.catalog.tasks, []);
  assert.match(view.notice, /0 tasks/);
});
