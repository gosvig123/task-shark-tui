import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, updateStatus } from '../src/events.js';
import { liveState, Status } from '../src/model.js';
import { Store } from '../src/store.js';
import { conversationDetails } from '../src/ui/content.js';
import { temporary } from './helpers.js';

const failed = 'Failed';
test('errors are Failed, not unanswered Pi Requests', t => {
  const store = new Store(temporary(t), true), c = store.create('Failure', '', '');
  const live = liveState();
  c.error = 'Run stopped.';
  updateStatus(c, live);
  assert.equal(c.status, failed);
  assert.match(conversationDetails(c, live), /Failed\nRun stopped/);
  assert.doesNotMatch(conversationDetails(c, live), /Needs Input/);
});
test('only a pending Pi dialog needs input; settling clears unanswered dialogs', t => {
  const store = new Store(temporary(t), true), c = store.create('Question', '', '');
  const live = liveState();
  applyEvent(c, live, { type: 'agent_start' });
  applyEvent(c, live, { type: 'extension_ui_request', method: 'notify' });
  assert.equal(c.status, Status.running);
  applyEvent(c, live, { type: 'extension_ui_request', id: 'question', method: 'input' });
  assert.equal(c.status, Status.needsInput);
  applyEvent(c, live, { type: 'agent_settled' });
  assert.equal(c.status, Status.review);
  assert.deepEqual(live.requests, []);
});
test('restart removes stale Needs Input and preserves the original failure', t => {
  const root = temporary(t), store = new Store(root, true);
  const c = store.create('Stale question', '', '');
  c.status = Status.needsInput; c.error = 'Provider unavailable'; store.save();
  const restored = new Store(root, true).conversations[0];
  assert.equal(restored.status, failed);
  assert.equal(restored.error, c.error);
});
for (const stopReason of ['error', 'aborted']) {
  test(`assistant ${stopReason} settles as Failed and successful retry needs review`, t => {
    const store = new Store(temporary(t), true), c = store.create('Retry', '', '');
    const live = liveState();
    applyEvent(c, live, { type: 'agent_start' });
    applyEvent(c, live, { type: 'message_end', message: { role: 'assistant', content: 'Stopped', stopReason } });
    applyEvent(c, live, { type: 'agent_settled' });
    assert.equal(c.status, failed);
    applyEvent(c, live, { type: 'agent_start' });
    applyEvent(c, live, { type: 'message_end', message: { role: 'assistant', content: 'Done', stopReason: 'stop' } });
    applyEvent(c, live, { type: 'agent_settled' });
    assert.equal(c.status, Status.review);
  });
}
