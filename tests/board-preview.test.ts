import test from 'node:test';
import assert from 'node:assert/strict';
import { Boards } from '../src/board-state.js';
import { allProgress, boardRows, normalizeBoardSelection } from '../src/ui/board-preview.js';
import { openWorkspace, workspaceContent } from '../src/ui/workspace.js';
import { workspaceKey } from '../src/ui/workspace-keys.js';
import { NavigationMemory } from '../src/ui/navigation-memory.js';
import type { View } from '../src/ui/view.js';
import type { BoardClient } from '../src/board.js';

function fixture() {
  const task = { id: 'one', title: 'One', ownerList: 'Work', completed: false, subtasks: [] };
  const view = { navigation: new NavigationMemory(), boards: new Boards(() => {}, true), tab: 'Tasks', query: '', selected: '',
    detail: { childBase: 0 }, rows: () => [], runtime: { store: { conversations: [] } } } as unknown as View;
  openWorkspace(view, task); view.workspaceSection = 'Board Updates';
  return { view, task, state: view.boards.state(task.id) };
}
test('fresh Board selection defaults to All progress with full chronological bodies across kinds', async () => {
  const { view, task, state } = fixture();
  await view.boards.post(task.id, 'note', 'First body\nFull second line');
  await view.boards.post(task.id, 'progress', 'Second body');
  await view.boards.post(task.id, 'decision', 'Third body');
  normalizeBoardSelection(view); assert.equal(view.boardSequence, allProgress);
  const content = workspaceContent(view);
  assert.match(content, /All progress · 3 loaded updates · all kinds/);
  assert.match(content, /First body\nFull second line/); assert.match(content, /Human/);
  assert.ok(content.indexOf('First body') < content.indexOf('Second body'));
  assert.ok(content.indexOf('Second body') < content.indexOf('Third body'));
  assert.deepEqual(boardRows(state), ['All progress', '#1 Note', '#2 Progress', '#3 Decision']);
  assert.equal(state.reviewed, 0);
});
test('individual navigation, aggregate return, and task/tab memory keep deliberate selection without review', async () => {
  const { view, task, state } = fixture();
  await view.boards.post(task.id, 'blocker', 'Individual body');
  await view.boards.post(task.id, 'handoff', 'Other body');
  await workspaceKey(view, 'down'); assert.equal(view.boardSequence, 1);
  assert.doesNotMatch(workspaceContent(view), /Other body/);
  view.navigation.tab(view, 'Conversations'); openWorkspace(view, task);
  assert.equal(view.boardSequence, 1); assert.equal(view.workspaceFocus, 'left');
  openWorkspace(view, { ...task, id: 'two' }); assert.equal(view.boardSequence, allProgress);
  openWorkspace(view, task); assert.equal(view.boardSequence, 1);
  await workspaceKey(view, 'up'); assert.equal(view.boardSequence, allProgress);
  assert.match(workspaceContent(view), /Other body/); assert.equal(state.reviewed, 0);
  view.boardSequence = 500; normalizeBoardSelection(view); assert.equal(view.boardSequence, allProgress);
});
test('aggregate preserves loading, failure, empty states and hidden-unread review restrictions', async () => {
  const { view, task, state } = fixture();
  state.loading = true; assert.match(workspaceContent(view), /Loading shared updates/);
  state.loading = false; state.error = 'Unavailable'; assert.match(workspaceContent(view), /Unavailable/);
  assert.match(workspaceContent(view), /No Board Updates/); assert.deepEqual(boardRows(state), ['All progress']);
  state.error = undefined; await view.boards.post(task.id, 'note', 'Visible body');
  state.entries[0].sequence = 20; state.earlier = true;
  const content = workspaceContent(view); assert.match(content, /1\+ unread/);
  assert.match(content, /latest 100 entries/); assert.match(content, /Review disabled/);
  await workspaceKey(view, 'enter'); await workspaceKey(view, 'a'); assert.equal(state.reviewed, 0);
  await workspaceKey(view, 'escape'); assert.equal(view.workspaceFocus, 'left');
});
test('compact Board labels never include long bodies, multiline text, or actor metadata', async () => {
  const { view, task, state } = fixture();
  await view.boards.post(task.id, 'progress', 'Long body '.repeat(200) + '\nSecond paragraph');
  assert.deepEqual(boardRows(state), ['All progress', '#1 Progress']);
  assert.ok(boardRows(state).every(row => !row.includes('\n') && row.length < 20));
  assert.match(workspaceContent(view), /Second paragraph/);
});
test('delayed previous-task Board data does not change aggregate selection or the current preview', async () => {
  const { view, task } = fixture(); let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const client: BoardClient = { read: async () => { await wait; return { entries: [], hasMore: false }; },
    review: async () => 0, post: async () => {}, mark: async (_id, sequence) => sequence };
  const boards = new Boards(() => {}, false, client); Object.assign(view, { boards });
  const loading = boards.load(task.id); openWorkspace(view, { ...task, id: 'two' });
  view.workspaceSection = 'Board Updates'; normalizeBoardSelection(view);
  release(); await loading;
  assert.equal(view.taskScope?.id, 'two'); assert.equal(view.boardSequence, allProgress);
  assert.match(workspaceContent(view), /All progress/); assert.equal(boards.state(task.id).reviewed, 0);
});
