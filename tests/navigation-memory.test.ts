import test from 'node:test';
import assert from 'node:assert/strict';
import { NavigationMemory, restoreScroll } from '../src/ui/navigation-memory.js';
import { openWorkspace } from '../src/ui/workspace.js';
import { Boards } from '../src/board-state.js';
import { TaskFilter } from '../src/ui/task-filters.js';
import type { View } from '../src/ui/view.js';
function fixture() {
  const scroll = { value: 17 };
  const view = { navigation: new NavigationMemory(), tab: 'Tasks', query: 'calendar', selected: 'Work/task',
    listFilter: 'Work', taskFilter: TaskFilter.pending, workspaceSection: 'Details', follow: false,
    detail: { childBase: scroll.value, resetScroll() {}, scroll: (value: number) => { scroll.value = value; } },
    boards: new Boards(() => {}, true) } as unknown as View;
  return { view, scroll };
}
test('Service Tabs retain independent query, selection, local filters and scroll', () => {
  const { view, scroll } = fixture();
  view.navigation.tab(view, 'Conversations'); assert.equal(view.query, ''); assert.equal(view.listFilter, undefined);
  view.query = 'reply'; view.selected = 'conversation'; view.follow = true;
  view.navigation.tab(view, 'For Review Inbox'); assert.equal(view.query, '');
  view.query = 'review'; view.navigation.tab(view, 'Tasks'); restoreScroll(view);
  assert.equal(view.query, 'calendar'); assert.equal(view.listFilter, 'Work'); assert.equal(view.selected, 'Work/task');
  assert.equal(view.follow, false); assert.equal(scroll.value, 17); assert.equal(view.taskFilter, TaskFilter.pending);
  view.navigation.tab(view, 'Conversations'); assert.equal(view.query, 'reply'); assert.equal(view.selected, 'conversation');
  view.query = ''; view.navigation.tab(view, 'For Review Inbox'); assert.equal(view.query, 'review');
  view.navigation.tab(view, 'Conversations'); assert.equal(view.query, '');
});
test('task workspace state restores as preview without invoking helper reads or review', () => {
  const { view } = fixture(), task = { id: 'task', ownerList: 'Work', title: 'Task', completed: false, subtasks: [] };
  openWorkspace(view, task); view.workspaceSection = 'Board Updates'; view.boardSequence = 7;
  view.selected = 'task-conversation'; view.workspaceFocus = 'right'; view.follow = false;
  view.navigation.tab(view, 'Conversations'); view.query = 'global';
  view.navigation.tab(view, 'Tasks'); assert.equal(view.query, 'calendar');
  view.boards.load = async () => { assert.fail('restoring must not load or write a board'); };
  openWorkspace(view, task);
  assert.equal(view.workspaceSection, 'Board Updates'); assert.equal(view.boardSequence, 7);
  assert.equal(view.workspaceFocus, 'left'); assert.equal(view.selected, 'task-conversation');
  view.navigation.tab(view, 'Tasks'); assert.equal(view.query, 'calendar'); assert.equal(view.listFilter, 'Work');
  assert.equal(view.selected, 'Work/task'); assert.equal(view.follow, false);
});
test('removed list filters are invalidated in inactive tab snapshots', () => {
  const { view } = fixture();
  view.navigation.tab(view, 'Conversations'); view.navigation.invalidateLists([]);
  view.navigation.tab(view, 'Tasks'); assert.equal(view.listFilter, undefined);
  assert.equal(view.query, 'calendar');
});
test('separate task workspaces do not leak their selected section or Board entry', () => {
  const { view } = fixture();
  const task = { id: 'task', ownerList: 'Work', title: 'Task', completed: false, subtasks: [] };
  openWorkspace(view, task); view.workspaceSection = 'Board Updates'; view.boardSequence = 8;
  view.navigation.tab(view, 'Tasks');
  const other = { ...task, id: 'other' };
  openWorkspace(view, other); assert.equal(view.workspaceSection, 'Details'); assert.equal(view.boardSequence, 0);
  view.workspaceSection = 'Conversations'; view.navigation.tab(view, 'Tasks');
  openWorkspace(view, task); assert.equal(view.workspaceSection, 'Board Updates'); assert.equal(view.boardSequence, 8);
});
