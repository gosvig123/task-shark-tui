import test from 'node:test';
import { open } from '../src/ui/actions.js';
import assert from 'node:assert/strict';
import { View } from '../src/ui/view.js';
import { NavigationMemory } from '../src/ui/navigation-memory.js';
import { taskDisplayRows, reconcileTasks, selectTask, selectorState, taskRows } from '../src/ui/task-selector.js';
import { workspaceContent, openWorkspace } from '../src/ui/workspace.js';
import { toggleTaskCompletion } from '../src/ui/task-controls.js';
import type { Config } from '../src/config.js';
import { moveWorkspace } from '../src/ui/workspace-navigation.js';
import { workspaceKey } from '../src/ui/workspace-keys.js';
import { TaskFilter } from '../src/ui/task-filters.js';
import { Boards } from '../src/board-state.js';
import { conversationSchema, liveState } from '../src/model.js';
import type { BoardClient } from '../src/board.js';

function fixture() {
  const tasks = ['Alpha', 'Beta'].map((title, i) => ({ title, id: String(i), ownerList: 'Work', completed: false, subtasks: [] }));
  const conversations = tasks.map((task, i) => conversationSchema.parse({ id: `00000000-0000-4000-8000-00000000000${i}`,
    title: task.title + ' reply', workspace: '/tmp', status: 'For Review', task, updatedAt: '', demo: true, messages: [] }));
  const view = Object.assign(Object.create(View.prototype), { tab: 'Tasks', selected: '', query: '', taskFilter: TaskFilter.all,
    collapsedSections: new Set<string>(),
    catalog: { tasks, byList: new Map([['Work', tasks], ['Empty', []]]), lists: ['Work', 'Empty'], currentList: 'Work' },
    navigation: new NavigationMemory(), boards: new Boards(() => {}, true), workspaceSection: 'Details', follow: true,
    runtime: { store: { conversations }, state: () => liveState(), acknowledge: () => assert.fail('selection acknowledged work') },
    detail: { width: 70, childBase: 0 }, notice: '' }) as View;
  return { view, tasks, conversations };
}
test('Task List headings remove repeated list names and arrows skip headings', () => {
  const { view, tasks } = fixture(); tasks[1].ownerList = 'Personal'; reconcileTasks(view);
  const rows = taskDisplayRows(view);
  assert.deepEqual(rows.filter(r => r.section).map(r => r.section), ['Personal', 'Work']);
  assert.ok(rows.filter(r => r.task).every(r => !r.label.includes(r.task!.ownerList)));
  assert.equal(view.taskScope?.id, tasks[1].id);
  moveWorkspace(view, 1); assert.equal(view.taskScope?.id, tasks[0].id);
  moveWorkspace(view, -1); assert.equal(view.taskScope?.id, tasks[1].id);
  selectorState(view).query = 'Alpha'; reconcileTasks(view);
  assert.deepEqual(taskDisplayRows(view).filter(r => r.section).map(r => r.section), ['Work']);
});
test('completion toggles in task navigation and respects status filters', async () => {
  const { view, tasks } = fixture(); reconcileTasks(view);
  const config = { demo: true } as Config;
  await toggleTaskCompletion(view, config); assert.equal(view.taskScope?.completed, true);
  await toggleTaskCompletion(view, config); assert.equal(view.taskScope?.completed, false);
  selectorState(view).taskFilter = TaskFilter.pending;
  await toggleTaskCompletion(view, config); reconcileTasks(view);
  assert.equal(view.taskScope?.id, tasks[1].id);
  view.workspaceSection = 'Conversations'; await toggleTaskCompletion(view, config);
  assert.equal(view.taskScope?.completed, false);
});
test('Tasks immediately selects a visible task; changing it refreshes Details, Board, and Conversations', async () => {
  const { view, tasks, conversations } = fixture(); reconcileTasks(view);
  assert.equal(view.taskScope, tasks[0]); assert.match(workspaceContent(view), /Alpha/);
  await view.boards.post(tasks[0].id, 'note', 'Alpha-only board');
  selectTask(view, 'Work/1'); assert.equal(view.taskScope, tasks[1]);
  assert.match(workspaceContent(view), /Beta/); assert.deepEqual(view.rows().map(r => r.conversation), [conversations[1]]);
  view.workspaceSection = 'Details'; assert.doesNotMatch(workspaceContent(view), /Alpha-only/);
  assert.equal(view.boards.state(tasks[0].id).reviewed, 0);
});
test('inline query, empty lists, filters, and deleted tasks never leave stale task content', () => {
  const { view, tasks } = fixture(); reconcileTasks(view);
  selectorState(view).query = 'Beta'; reconcileTasks(view); assert.equal(view.taskScope, tasks[1]);
  selectorState(view).query = 'missing'; reconcileTasks(view);
  assert.equal(view.taskScope, undefined); assert.match(workspaceContent(view), /No tasks match/);
  view.query = ''; view.listFilter = 'Empty'; reconcileTasks(view); assert.equal(view.taskScope, undefined);
  view.listFilter = 'Work'; view.taskFilter = TaskFilter.completed; reconcileTasks(view); assert.equal(view.taskScope, undefined);
  view.taskFilter = TaskFilter.all; reconcileTasks(view); assert.equal(view.taskScope, tasks[0]);
  view.catalog.tasks = [tasks[1]]; view.catalog.byList.set('Work', [tasks[1]]); reconcileTasks(view);
  assert.equal(view.taskScope, tasks[1]); assert.equal(view.catalog.currentList, 'Work');
});
test('Service Tabs restore task query, selection, and task-local preview without acknowledgement', async () => {
  const { view, tasks } = fixture(); reconcileTasks(view); selectorState(view).query = 'Beta'; reconcileTasks(view);
  view.workspaceSection = 'Conversations'; view.selected = view.rows()[0].key;
  view.navigation.tab(view, 'Conversations'); view.query = 'global'; view.navigation.tab(view, 'Tasks'); reconcileTasks(view);
  assert.equal(view.taskScope, tasks[1]); assert.equal(selectorState(view).query, 'Beta');
  assert.equal(view.workspaceSection, 'Conversations'); assert.equal(view.workspaceFocus, 'left');
  await workspaceKey(view, 'escape'); assert.equal(view.taskScope, tasks[1]); assert.equal(selectorState(view).query, '');
});
test('opening a task-backed conversation from global search selects its task, not the first task', () => {
  const { view, tasks, conversations } = fixture(); view.tab = 'Conversations'; view.query = 'Beta'; view.selected = conversations[1].id;
  openWorkspace(view, tasks[1], true); reconcileTasks(view);
  assert.equal(view.taskScope, tasks[1]); assert.equal(view.current()?.conversation, conversations[1]);
  assert.equal(taskRows(view).length, 2); assert.equal(view.workspaceFocus, 'right');
});
test('a delayed Board response stays with its original task after selector navigation', async () => {
  const { view, tasks } = fixture(); let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const client: BoardClient = { read: async id => { if (id === tasks[0].id) await pending; return { entries: [], hasMore: false }; },
    review: async () => 0, post: async () => {}, mark: async (_id, sequence) => sequence };
  Object.assign(view, { boards: new Boards(() => {}, false, client) });
  reconcileTasks(view); assert.equal(view.boards.state(tasks[0].id).loading, true);
  selectTask(view, 'Work/1'); view.workspaceSection = 'Details'; release();
  await pending; await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.taskScope, tasks[1]); assert.equal(view.boards.state(tasks[0].id).loaded, true);
  assert.match(workspaceContent(view), /No Board Updates/); assert.equal(view.boards.state(tasks[1].id).reviewed, 0);
});

test('global Enter preserves Tasks memory for excluded and deleted task-backed conversations', () => {
  for (const exclusion of ['query', 'list', 'filter', 'deleted']) {
    const { view, conversations } = fixture(); reconcileTasks(view);
    const state = selectorState(view);
    if (exclusion === 'query') state.query = 'Alpha';
    if (exclusion === 'list') state.listFilter = 'Empty';
    if (exclusion === 'filter') state.taskFilter = TaskFilter.completed;
    if (exclusion === 'deleted') view.catalog.tasks = view.catalog.tasks.slice(0, 1);
    view.navigation.tab(view, 'Conversations'); view.selected = conversations[1].id;
    const before = structuredClone(view.navigation.tabs.get('Tasks')); let acknowledged = '';
    view.runtime.acknowledge = c => { acknowledged = c.id; };
    view.switchTab = tab => view.navigation.tab(view, tab);
    assert.equal(view.current()?.conversation, conversations[1]); assert.equal(acknowledged, '');
    open(view);
    assert.equal(view.taskScope, undefined); assert.equal(view.current()?.conversation, conversations[1]);
    assert.equal(acknowledged, conversations[1].id); assert.deepEqual(view.navigation.tabs.get('Tasks'), before);
  }
});
test('global Enter on a visible task retains Tasks filters and uses current details, not historical snapshot', () => {
  const { view, tasks, conversations } = fixture(); reconcileTasks(view); selectorState(view).query = 'Beta';
  view.navigation.tab(view, 'Conversations'); view.selected = conversations[1].id;
  conversations[1].task!.title = 'Historical'; let acknowledged = '';
  view.runtime.acknowledge = c => { acknowledged = c.id; };
  open(view); reconcileTasks(view);
  assert.equal(view.taskScope, tasks[1]); assert.equal(selectorState(view).query, 'Beta');
  assert.equal(view.current()?.conversation, conversations[1]); assert.equal(view.workspaceFocus, 'right');
  assert.equal(acknowledged, conversations[1].id); assert.equal(conversations[1].task!.title, 'Historical');
});
test('removing the final visible task keeps right focus until Escape, without clearing the Task List', async () => {
  const { view } = fixture(); reconcileTasks(view); selectorState(view).listFilter = 'Work';
  view.workspaceFocus = 'right'; view.catalog.byList.set('Work', []); reconcileTasks(view);
  assert.equal(view.taskScope, undefined); assert.equal(view.workspaceFocus, 'right');
  await workspaceKey(view, 'escape'); assert.equal(view.workspaceFocus, 'left');
  assert.equal(view.listFilter, 'Work'); assert.match(workspaceContent(view), /No tasks match/);
});
