import { type Config } from '../config.js';
import { demoTasks } from '../demo.js';
import { loadTaskCatalog } from '../tasks.js';
import type { View } from './view.js';

export async function refreshTasks(view: View, config: Config, load = loadTaskCatalog): Promise<void> {
  if (view.refreshing) return;
  view.refreshing = true;
  const controller = view.refreshAbort = new AbortController();
  try {
    view.notice = 'Loading Task Lists…'; view.render();
    view.catalog = config.demo ? demoCatalog(view) : await load(config.root, controller.signal);
    if (view.listFilter && !view.catalog.lists.includes(view.listFilter)) view.listFilter = undefined;
    view.navigation?.invalidateLists(view.catalog.lists);
    if (view.workspaceReturn?.listFilter && !view.catalog.lists.includes(view.workspaceReturn.listFilter)) view.workspaceReturn.listFilter = undefined;
    view.notice = `${view.catalog.tasks.length} tasks · ${view.catalog.lists.length} lists · Active: ${view.catalog.currentList}`;
  } catch (error) { view.notice = `Tasks unavailable: ${String(error)}`; }
  finally { view.refreshing = false; if (!controller.signal.aborted) view.render(); }
}
function demoCatalog(view: View) {
  if (view.catalog.lists.length) return view.catalog;
  const tasks = structuredClone(demoTasks), lists = [...new Set([...tasks.map(t => t.ownerList), 'Empty'])];
  return { tasks, lists, currentList: tasks[0].ownerList,
    byList: new Map(lists.map(list => [list, tasks.filter(t => t.ownerList === list)])) };
}
