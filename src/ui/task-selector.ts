import { taskNavigationWidth } from './layout.js';
import blessed from 'blessed';
import type { Task } from '../model.js';
import { Tab, type View, type Row } from './view.js';
import { filterTasks, taskLabel, TaskFilter } from './task-filters.js';
import { snapshot, restore, taskKey } from './navigation-memory.js';
import { openWorkspace } from './workspace.js';
import { CursorEditor } from './cursor-editor.js';
import { editorLines } from './cursor-input.js';
import { safe } from './dialogs.js';

export function selectorState(view: View) { return view.workspaceReturn ?? view; }
export function taskRows(view: View): Row[] {
  const state = selectorState(view);
  return filterTasks(state.listFilter ? view.catalog.byList.get(state.listFilter) ?? [] : view.catalog.tasks,
    state.taskFilter, state.query).map(task => ({ key: `${task.ownerList}/${task.id}`, label: taskLabel(task), task }));
}
export function selectTask(view: View, key: string): void {
  const row = taskRows(view).find(row => row.key === key);
  if (!row?.task) return;
  const state = view.workspaceReturn ?? snapshot(view);
  state.tab = Tab.tasks; state.selected = key;
  if (!view.taskScope || taskKey(view.taskScope) !== taskKey(row.task)) {
    openWorkspace(view, row.task);
    view.workspaceReturn = state;
  } else view.taskScope = row.task;
}
export function reconcileTasks(view: View): void {
  if (view.taskScope && (!view.workspaceReturn || view.workspaceReturn.tab !== Tab.tasks)) {
    view.workspaceReturn = { ...snapshot(view), tab: Tab.tasks, query: '', listFilter: undefined,
      taskFilter: TaskFilter.all, selected: `${view.taskScope.ownerList}/${view.taskScope.id}` };
  }
  const state = selectorState(view), rows = taskRows(view);
  const row = rows.find(row => row.key === state.selected) ?? rows[0];
  if (row) { selectTask(view, row.key); return; }
  if (view.taskScope) {
    const focus = view.workspaceFocus;
    view.navigation.save(view); view.taskScope = undefined;
    if (view.workspaceReturn) restore(view, view.workspaceReturn);
    view.workspaceReturn = undefined; view.workspaceFocus = focus;
  }
  view.tab = Tab.tasks; view.selected = ''; view.workspaceSection = 'Details';
}
export function searchTasks(view: View): Promise<void> {
  return new Promise(resolve => {
    const state = selectorState(view), editor = new CursorEditor(state.query, false);
    const input = blessed.box({ parent: view.screen, top: 3, left: 1, width: '32%-2', height: 1 });
    const previous = view.screen.focused, grabbed = view.screen.grabKeys;
    const draw = () => drawSearch(view, input, editor);
    const finish = () => {
      view.screen.removeListener('resize', draw); input.destroy(); view.screen.grabKeys = grabbed;
      if (previous && !previous.detached) previous.focus(); resolve();
    };
    input.on('keypress', (ch, key = {}) => {
      if (key.name === 'escape' || key.name === 'enter') { finish(); return; }
      editor.key(safe(ch ?? ''), key); selectorState(view).query = editor.value;
      reconcileTasks(view); view.workspaceSection = 'Details'; view.workspaceFocus = 'left'; view.follow = true; view.render(); draw();
    });
    view.workspaceSection = 'Details'; view.workspaceFocus = 'left';
    view.screen.grabKeys = true; input.focus(); view.screen.on('resize', draw); draw();
  });
}

function drawSearch(view: View, input: blessed.Widgets.BoxElement, editor: CursorEditor): void {
  input.width = taskNavigationWidth(Number(view.screen.width)) - 2;
  const layout = editorLines(editor, Math.max(2, Number(input.width) - 2));
  input.setContent('/ ' + layout.lines[layout.row]); input.setFront();
  view.footer.setContent(' Search tasks · type to filter · ←/→ cursor · Ctrl-W word · Ctrl-U clear all\n Enter / Escape returns to task selector; query is kept.');
  view.screen.render();
}

export function conversationTask(view: View, task: Task) {
  const state = { ...(view.navigation.tabs.get(Tab.tasks) ?? snapshot(view)), tab: Tab.tasks };
  if (!view.navigation.tabs.has(Tab.tasks)) Object.assign(state, { query: '', listFilter: undefined, taskFilter: TaskFilter.all });
  const tasks = state.listFilter ? view.catalog.byList.get(state.listFilter) ?? [] : view.catalog.tasks;
  const current = filterTasks(tasks, state.taskFilter, state.query).find(candidate => taskKey(candidate) === taskKey(task));
  if (current) return { task: current, state: { ...state, selected: `${current.ownerList}/${current.id}` } };
}
