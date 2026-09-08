import type { Config } from '../config.js';
import { manageTaskList, taskListName, type ListAction } from '../task-lists.js';
import { deduplicate } from '../tasks.js';
import { choose, textInput } from './dialogs.js';
import { chooseSearchable } from './list-search.js';
import { refreshTasks } from './refresh.js';
import type { View } from './view.js';

export async function taskListActions(view: View, config: Config): Promise<void> {
  const action = await choose(view.screen, `Manage Task Lists · Active: ${view.catalog.currentList}`,
    ['Create Task List', 'Rename Task List', 'Set Active Task List', 'Delete empty Task List']);
  if (!action) return;
  const kind: ListAction = action.startsWith('Create') ? 'create' : action.startsWith('Rename') ? 'rename' : action.startsWith('Set') ? 'activate' : 'delete';
  const name = kind === 'create' ? await textInput(view.screen, 'New Task List name') :
    await chooseSearchable(view.screen, 'Choose source Task List · Today is reserved', view.catalog.lists.filter(list => list !== 'today'), String);
  if (name === undefined) return;
  const replacement = kind === 'rename' ? await textInput(view.screen, 'New Task List name', name) : undefined;
  if (kind === 'rename' && replacement === undefined) return;
  if (kind === 'delete' && await choose(view.screen, `Delete empty Task List: ${name}?`, ['Keep list', 'Delete list']) !== 'Delete list') return;
  if (config.demo) demoListAction(view, kind, taskListName(name), replacement === undefined ? undefined : taskListName(replacement));
  else manageTaskList(config.root, kind, name, replacement);
  await refreshTasks(view, config);
  view.notice = `Task List ${kind} saved. Active: ${view.catalog.currentList}.`;
}
function demoListAction(view: View, action: ListAction, name: string, replacement?: string): void {
  const catalog = view.catalog, next = replacement ?? name;
  if ((action === 'create' || action === 'rename' && next !== name) && catalog.lists.includes(next)) throw new Error('Task List already exists. Choose another name.');
  if (action === 'activate') { catalog.currentList = name; return; }
  if (action === 'delete') {
    if (catalog.currentList === name) throw new Error('Set another Active Task List before deleting this list.');
    if (catalog.byList.get(name)?.length) throw new Error('Delete tasks first. Only empty Task Lists can be deleted.');
    catalog.byList.delete(name); catalog.lists = catalog.lists.filter(list => list !== name); return;
  }
  if (action === 'create') { catalog.lists.push(name); catalog.byList.set(name, []); return; }
  catalog.lists = catalog.lists.map(list => list === name ? next : list);
  const tasks = catalog.byList.get(name) ?? []; catalog.byList.delete(name); catalog.byList.set(next, tasks);
  for (const [list, items] of catalog.byList) catalog.byList.set(list, items.map(task => task.ownerList === name ? { ...task, ownerList: next } : task));
  catalog.tasks = deduplicate([...catalog.byList.values()].flat());
  if (catalog.currentList === name) catalog.currentList = next;
  if (view.taskScope?.ownerList === name) view.taskScope = { ...view.taskScope, ownerList: next };
}
