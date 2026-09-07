import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { temporary } from './helpers.js';
import { Boards } from '../src/board-state.js';
import { NavigationMemory } from '../src/ui/navigation-memory.js';
import { TaskPreferences, taskPreferencesFile } from '../src/ui/task-preferences.js';
import { TaskFilter } from '../src/ui/task-filters.js';
import { reconcileTasks, selectorState } from '../src/ui/task-selector.js';
import { Tab, type View } from '../src/ui/view.js';
import { workspaceKey } from '../src/ui/workspace-keys.js';

const work = 'Work', empty = 'Empty';
function fixture(root: string): View {
  const tasks = [{ id: 'one', title: 'One', ownerList: work, completed: false, subtasks: [] }];
  const view = { navigation: new NavigationMemory(root), tab: Tab.conversations, query: '', selected: '',
    taskFilter: TaskFilter.all, workspaceSection: 'Details', follow: true, detail: { childBase: 0 },
    catalog: { tasks, lists: [work, empty], currentList: work, byList: new Map([[work, tasks], [empty, []]]) },
    boards: new Boards(() => {}, true), notice: '' } as unknown as View;
  view.navigation.tab(view, Tab.tasks); reconcileTasks(view);
  return view;
}

test('list and status save immediately, survive navigation and restore after restart', t => {
  const root = temporary(t), view = fixture(root);
  Object.assign(selectorState(view), { listFilter: work, taskFilter: TaskFilter.pending, query: 'One' });
  view.navigation.persistFilters(view);
  const saved = new TaskPreferences(root).value;
  assert.equal(saved.listFilter, work); assert.equal(saved.taskFilter, TaskFilter.pending);
  view.navigation.tab(view, Tab.conversations);
  view.taskFilter = TaskFilter.completed; view.listFilter = empty;
  view.navigation.persistFilters(view);
  view.navigation.tab(view, Tab.tasks); reconcileTasks(view);
  assert.equal(selectorState(view).listFilter, work); assert.equal(selectorState(view).taskFilter, TaskFilter.pending);
  const restarted = fixture(root);
  assert.equal(selectorState(restarted).listFilter, work); assert.equal(selectorState(restarted).taskFilter, TaskFilter.pending);
  assert.equal(selectorState(restarted).query, ''); assert.equal(restarted.catalog.currentList, work);
});

test('Escape retains list and status from both panes and with no matching tasks', async t => {
  const root = temporary(t), view = fixture(root);
  Object.assign(selectorState(view), { listFilter: work, taskFilter: TaskFilter.pending, query: 'One' });
  view.workspaceFocus = 'right';
  await workspaceKey(view, 'escape'); assert.equal(view.workspaceFocus, 'left');
  assert.equal(selectorState(view).query, 'One');
  await workspaceKey(view, 'escape'); assert.equal(selectorState(view).query, '');
  assert.equal(selectorState(view).listFilter, work); assert.equal(selectorState(view).taskFilter, TaskFilter.pending);
  Object.assign(selectorState(view), { listFilter: empty, taskFilter: TaskFilter.completed });
  reconcileTasks(view); assert.equal(view.taskScope, undefined);
  await workspaceKey(view, 'escape'); view.navigation.persistFilters(view);
  const restarted = fixture(root);
  assert.equal(restarted.taskScope, undefined); assert.equal(restarted.listFilter, empty);
  assert.equal(restarted.taskFilter, TaskFilter.completed);
});

test('explicit All Lists and All tasks replace saved filters', t => {
  const root = temporary(t), view = fixture(root);
  Object.assign(selectorState(view), { listFilter: work, taskFilter: TaskFilter.pending });
  view.navigation.persistFilters(view);
  Object.assign(selectorState(view), { listFilter: undefined, taskFilter: TaskFilter.all });
  view.navigation.persistFilters(view);
  const restarted = fixture(root);
  assert.equal(selectorState(restarted).listFilter, undefined); assert.equal(selectorState(restarted).taskFilter, TaskFilter.all);
});

test('removed lists fall back to All Lists without losing status', t => {
  const root = temporary(t), preferences = new TaskPreferences(root);
  preferences.save({ listFilter: work, taskFilter: TaskFilter.pending });
  const navigation = new NavigationMemory(root);
  navigation.invalidateLists([empty]);
  const view = fixture(root);
  view.navigation.tab(view, Tab.conversations);
  Object.assign(view, { navigation, catalog: { tasks: [], lists: [empty], currentList: empty, byList: new Map([[empty, []]]) } });
  navigation.tab(view, Tab.tasks); reconcileTasks(view); navigation.persistFilters(view);
  assert.equal(view.listFilter, undefined); assert.equal(view.taskFilter, TaskFilter.pending);
  assert.equal(new TaskPreferences(root).value.listFilter, undefined);
});

test('missing, malformed and unsupported preferences use safe defaults', t => {
  const root = temporary(t), path = join(root, taskPreferencesFile);
  assert.equal(new TaskPreferences(root).value.taskFilter, TaskFilter.all);
  assert.equal(existsSync(path), false);
  for (const text of ['{', 'null', '{"version":2,"taskFilter":"Pending"}', '{"version":1,"taskFilter":"invalid"}']) {
    writeFileSync(path, text);
    const preferences = new TaskPreferences(root);
    assert.equal(preferences.value.taskFilter, TaskFilter.all); assert.match(preferences.notice, /Cannot load task filters/);
    preferences.save({ taskFilter: TaskFilter.pending });
    assert.equal(new TaskPreferences(root).value.taskFilter, TaskFilter.pending);
  }
});

test('writes are private, skip unchanged values, and keep the previous file on failure', t => {
  const root = temporary(t), preferences = new TaskPreferences(root);
  preferences.save({ listFilter: work, taskFilter: TaskFilter.pending });
  const before = readFileSync(preferences.path, 'utf8'), modified = statSync(preferences.path).mtimeMs;
  preferences.save(preferences.value);
  assert.equal(statSync(preferences.path).mtimeMs, modified);
  assert.equal(statSync(preferences.path).mode & 0o777, 0o600);
  mkdirSync(`${preferences.path}.tmp`);
  const view = fixture(root); selectorState(view).taskFilter = TaskFilter.completed;
  view.navigation.persistFilters(view);
  assert.match(view.notice, /Cannot save task filters.*Check directory permissions/);
  assert.equal(readFileSync(preferences.path, 'utf8'), before);
  rmSync(`${preferences.path}.tmp`, { recursive: true });
  view.navigation.persistFilters(view);
  assert.equal(new TaskPreferences(root).value.taskFilter, TaskFilter.completed);
});
