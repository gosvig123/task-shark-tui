import test from 'node:test';
import assert from 'node:assert/strict';
import type { View } from '../src/ui/view.js';
import { openWorkspace, workspaceContent, workspaceSection } from '../src/ui/workspace.js';
import { workspaceKey } from '../src/ui/workspace-keys.js';
import { conversationSchema, liveState } from '../src/model.js';
import { NavigationMemory } from '../src/ui/navigation-memory.js';
import { Boards } from '../src/board-state.js';
import { safe } from '../src/ui/dialogs.js';
function fixture() {
  const task = { id: 'task', title: 'Task', completed: false, ownerList: 'Source', subtasks: [] };
  const view = { navigation: new NavigationMemory(), tab: 'Tasks', selected: 'Source/task', query: 'Task', follow: false,
    catalog: { tasks: [task], byList: new Map([['Source', [task]]]), lists: ['Source'], currentList: 'Source' }, taskFilter: 'All tasks',
    boards: new Boards(() => {}, true), runtime: { store: { conversations: [] } },
    current: () => undefined, rows: () => [], detail: { width: 100, childBase: 0 }, workspaceSection: 'Details' } as unknown as View;
  return { task, view };
}
test('opening a task keeps selector selection and filters across Service Tabs', () => {
  const { task, view } = fixture();
  assert.equal(view.taskScope, undefined);
  openWorkspace(view, task);
  assert.equal(view.taskScope, task); assert.equal(view.workspaceSection, 'Details');
  assert.match(workspaceContent(view), /Task List: Source/);
  view.navigation.tab(view, 'Tasks');
  assert.equal(view.taskScope, undefined); assert.equal(view.tab, 'Tasks');
  assert.equal(view.selected, 'Source/task'); assert.equal(view.query, 'Task');
});
test('workspace keys keep board review separate and preserve literal untrusted content', async () => {
  const { task, view } = fixture(); openWorkspace(view, task);
  await view.boards.post(task.id, 'note', 'Literal {red-fg}markup{/red-fg}\x1b[90m');
  await workspaceKey(view, '2');
  assert.equal(view.workspaceSection, 'Board Updates');
  const content = workspaceContent(view);
  assert.match(content, /Literal \{red-fg\}markup/); assert.doesNotMatch(content, /\x1b\[90m/);
  assert.match(safe(content), /NEW/); assert.equal(view.boards.state(task.id).reviewed, 0);
  await workspaceKey(view, 'a'); assert.equal(view.boards.state(task.id).reviewed, 0);
  await workspaceKey(view, 'enter'); assert.equal(view.boards.state(task.id).reviewed, 0);
  assert.equal(view.workspaceFocus, 'right');
  await workspaceKey(view, 'a'); assert.equal(view.boards.state(task.id).reviewed, 1);
  await workspaceKey(view, 'escape'); assert.equal(view.workspaceFocus, 'left'); assert.equal(view.taskScope, task);
  await workspaceKey(view, '3'); assert.match(workspaceContent(view), /No conversations/);
  workspaceSection(view, 'Details'); assert.equal(await workspaceKey(view, 'i'), true);
  await workspaceKey(view, 'escape'); assert.equal(view.taskScope, task);
});
test('highlighting a conversation previews without review; Enter opens and Escape stays in workspace', async () => {
  const { task, view } = fixture();
  const c = conversationSchema.parse({ id: '5fc9504d-9f3c-411c-bd18-a594e6cc23f3', title: 'Unread reply',
    workspace: '/tmp', demo: true, status: 'For Review', updatedAt: '', task, messages: [{ role: 'assistant', text: 'Reply body' }] });
  view.current = () => ({ key: c.id, label: c.title, conversation: c });
  view.rows = () => [view.current()!];
  view.runtime.state = () => liveState();
  let acknowledged = 0;
  view.runtime.acknowledge = () => { acknowledged++; };
  openWorkspace(view, task); await workspaceKey(view, '3');
  assert.match(workspaceContent(view), /Reply body/); assert.equal(acknowledged, 0);
  assert.equal(await workspaceKey(view, 'm'), true); assert.equal(view.workspaceFocus, 'left');
  await workspaceKey(view, 'enter'); assert.equal(acknowledged, 1); assert.equal(view.workspaceFocus, 'right');
  assert.equal(await workspaceKey(view, 'm'), false);
  await workspaceKey(view, 'enter'); assert.equal(acknowledged, 1);
  await workspaceKey(view, 'escape'); assert.equal(view.workspaceFocus, 'left'); assert.equal(view.taskScope, task);
  await workspaceKey(view, 'escape'); assert.equal(view.taskScope, task); assert.equal(view.workspaceReturn?.query, '');
});
test('arrows cross stacked sections and select individual board entries without review', async () => {
  const { task, view } = fixture(); openWorkspace(view, task);
  await view.boards.post(task.id, 'note', 'First body'); await view.boards.post(task.id, 'decision', 'Second body');
  await workspaceKey(view, 'down'); assert.equal(view.workspaceSection, 'Board Updates');
  assert.match(workspaceContent(view), /First body/);
  assert.match(workspaceContent(view), /Second body/);
  await workspaceKey(view, 'down'); assert.match(workspaceContent(view), /First body/);
  assert.doesNotMatch(workspaceContent(view), /Second body/);
  await workspaceKey(view, 'down'); assert.match(workspaceContent(view), /Second body/);
  assert.doesNotMatch(workspaceContent(view), /First body/);
  await workspaceKey(view, 'down'); assert.equal(view.workspaceSection, 'Conversations');
  assert.equal(view.boards.state(task.id).reviewed, 0);
});
