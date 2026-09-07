import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { ConversationSection, sidebarSection, Status } from '../src/model.js';
import { temporary } from './helpers.js';

test('only explicit pinning puts a conversation in Pinned and persists across restart', t => {
  const root = temporary(t), store = new Store(root, false);
  const c = store.create('Conversation', root, '');
  assert.equal(sidebarSection(c), ConversationSection.today);
  const updatedAt = c.updatedAt;
  store.togglePin(c);
  for (const status of Object.values(Status)) {
    c.status = status;
    assert.equal(sidebarSection(c), ConversationSection.pinned);
  }
  c.status = Status.review;
  store.save();
  const loaded = new Store(root, false).conversations[0];
  assert.equal(loaded.pinned, true);
  assert.equal(loaded.updatedAt, updatedAt);
  store.togglePin(c);
  assert.equal(sidebarSection(c), Status.review);
  assert.equal(new Store(root, false).conversations[0].pinned, false);
});

test('old conversations stay unpinned and return to Recent after unpinning', t => {
  const root = temporary(t), store = new Store(root, false);
  const c = store.create('Old conversation', root, '');
  c.updatedAt = '2020-01-01T12:00:00Z';
  store.save();
  assert.equal(new Store(root, false).conversations[0].pinned, undefined);
  assert.equal(sidebarSection(c), ConversationSection.recent);
  store.togglePin(c);
  store.togglePin(c);
  assert.equal(sidebarSection(c), ConversationSection.recent);
});
