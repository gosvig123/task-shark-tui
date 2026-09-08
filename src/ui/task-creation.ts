import { todayList } from '../task-today.js';
import { taskListActions } from './task-list-controls.js';
import { selectorState } from './task-selector.js';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import { createTask, type TaskDraft } from '../task-api.js';
import { deduplicate } from '../tasks.js';
import { choose, textInput } from './dialogs.js';
import { refreshTasks } from './refresh.js';
import { chooseSourceList } from './list-search.js';
import { Tab, type View } from './view.js';
import { localDate, TaskFilter } from './task-filters.js';

async function taskListsReady(view: View, config: Config): Promise<boolean> {
  if (view.refreshing) { view.notice = 'Task Lists are loading. Try again when the refresh finishes.'; return false; }
  await refreshTasks(view, config);
  return view.catalog.lists.length > 0 && !view.notice.startsWith('Tasks unavailable:');
}
export async function selectTaskList(view: View, config: Config): Promise<void> {
  if (!await taskListsReady(view, config)) return;
  const options = ['All Lists', ...view.catalog.lists.map(name => `List: ${name}`), 'Manage Task Lists'];
  const selected = await chooseSourceList(view.screen, 'Task List filter · does not change Active Task List', options);
  if (selected === undefined) return;
  if (selected === 'Manage Task Lists') { await taskListActions(view, config); return; }
  if (!view.taskScope && view.tab !== Tab.tasks) view.switchTab(Tab.tasks);
  selectorState(view).listFilter = selected === options[0] ? undefined : selected.slice(6); view.follow = true;
}
export async function createTaskFromView(view: View, config: Config): Promise<void> {
  if (!await taskListsReady(view, config)) return;
  const draft = await taskDraft(view);
  if (!draft) { view.notice = 'Task draft discarded. Nothing created.'; return; }
  const result = config.demo ? createDemoTask(view, draft) : await createTask(config.root, draft);
  if (result.snapshot) view.catalog.byList.set(draft.list, result.snapshot.tasks);
  view.catalog.tasks = deduplicate([...view.catalog.byList.values()].flat());
  view.switchTab(Tab.tasks); Object.assign(selectorState(view), { listFilter: draft.list, taskFilter: TaskFilter.all, query: '' });
  view.workspaceSection = 'Details';
  view.notice = result.notice;
}
async function taskDraft(view: View): Promise<TaskDraft | undefined> {
  const filter = selectorState(view).listFilter;
  const preferred = filter && filter !== 'today' ? filter : view.catalog.currentList;
  const lists = [...view.catalog.lists].sort((a, b) => Number(b === preferred) - Number(a === preferred));
  const list = await chooseSourceList(view.screen, `New Task · source list (default: ${preferred})`, lists);
  if (list === undefined) return;
  const title = await textInput(view.screen, 'New Task · title (required)');
  if (!title?.trim()) return;
  const description = await textInput(view.screen, 'New Task · notes (optional)', '', true);
  if (description === undefined) return;
  const dueDate = localDate();
  const confirmed = await choose(view.screen, 'Save new Pending task?', ['Cancel', 'Create pending task'],
    `Task List: ${list}\nTitle: ${title.trim()}\nDue date: ${dueDate}\n\n${description || 'No notes.'}`);
  if (confirmed !== 'Create pending task') return;
  return { list, title: title.trim(), description, dueDate };
}
export function createDemoTask(view: View, draft: TaskDraft) {
  const source = draft.list === todayList ? view.catalog.currentList : draft.list;
  const task = { id: randomUUID(), title: draft.title, description: draft.description,
    ownerList: source, dueDate: draft.dueDate, completed: false, subtasks: [] };
  view.catalog.byList.get(source)!.push(task);
  if (draft.list === todayList) view.catalog.byList.get(todayList)!.push({ ...task, placement: 'reference' });
  return { confirmed: true, snapshot: undefined, notice: `Created Pending demo task in ${draft.list}; kept in memory only.` };
}
