import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationSection, Status, type Conversation } from '../src/model.js';
import { conversationRows } from '../src/ui/conversation-sections.js';
import { View, Tab } from '../src/ui/view.js';
import { open } from '../src/ui/actions.js';

function conversation(id: string, changes: Partial<Conversation> = {}): Conversation {
  return { id, title: `Chat ${id}`, workspace: '/tmp', demo: true, status: Status.finished,
    updatedAt: new Date().toISOString(), messages: [], queue: [], ...changes };
}
const chats = [conversation('old', { updatedAt: '2020-01-01T00:00:00Z' }), conversation('today'),
  conversation('pin', { pinned: true }), conversation('review', { status: Status.review }),
  conversation('input', { status: Status.needsInput })];

test('categories appear once above their chats and start expanded', () => {
  const rows = conversationRows(chats, new Set());
  assert.deepEqual(rows.filter(r => r.section).map(r => r.label),
    ['▾ Pinned', '▾ Needs Input', '▾ For Review', '▾ Today', '▾ Recent']);
  assert.deepEqual(rows.filter(r => r.conversation).map(r => r.label),
    ['  Chat pin', '  Chat input', '  Chat review', '  Chat today', '  Chat old']);
  assert.equal(rows.length, 10);
  for (let i = 0; i < rows.length; i += 2) assert.ok(rows[i].section && rows[i + 1].conversation);
});

test('collapsed categories keep their heading and hide only their own chats', () => {
  const rows = conversationRows(chats, new Set([ConversationSection.pinned, ConversationSection.today]));
  assert.equal(rows[0].label, '▸ Pinned');
  assert.deepEqual(rows.filter(r => r.conversation).map(r => r.key), ['input', 'review', 'old']);
  assert.equal(rows.find(r => r.section === ConversationSection.today)?.label, '▸ Today');
});

test('empty groups are omitted, titles sort newest first, and running keeps its indicator', () => {
  const rows = conversationRows([conversation('first', { updatedAt: '2020-01-01' }),
    conversation('second', { updatedAt: '2020-01-02', status: Status.running })], new Set());
  assert.deepEqual(rows.map(r => r.label), ['▾ Recent', '  ▶ Chat second', '  Chat first']);
  assert.deepEqual(conversationRows([], new Set()), []);
});

test('Task Workspace stays flat and ignores collapsed categories', () => {
  const rows = conversationRows(chats, new Set([ConversationSection.pinned]), false);
  assert.equal(rows.length, chats.length);
  assert.ok(rows.every(r => r.conversation && !r.section));
});

test('Enter folds and unfolds a heading without acknowledging chats; movement skips hidden chats', () => {
  const view = Object.assign(Object.create(View.prototype), { tab: Tab.conversations, query: '',
    selected: 'section:Pinned', collapsedSections: new Set(), render() {},
    runtime: { store: { conversations: chats }, acknowledge() { assert.fail('Heading must not acknowledge'); } } });
  open(view);
  assert.equal(view.current().label, '▸ Pinned');
  view.move(1); assert.equal(view.current().section, Status.needsInput);
  view.move(-1); open(view);
  assert.equal(view.current().label, '▾ Pinned');
  view.move(1); assert.equal(view.current().conversation.id, 'pin');
  view.query = 'old';
  assert.deepEqual(view.rows().map((r: { key: string }) => r.key), ['section:Recent', 'old']);
});
