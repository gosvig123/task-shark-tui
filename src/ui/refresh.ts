import { type Config } from '../config.js';
import { demoTasks } from '../demo.js';
import { loadTaskCatalog } from '../tasks.js';
import { taskSnapshotWarning } from '../task-api.js';
import { choose } from './dialogs.js';
import type { View } from './view.js';

export async function allowTasks(view: View, config: Config): Promise<boolean> {
  if (config.demo || config.allowTaskReset) return true;
  const wasBusy = view.busy;
  view.busy = true;
  try {
    config.allowTaskReset = await choose(view.screen, 'Load existing Task Lists?',
      ['Not now', 'Allow for this launch'], taskSnapshotWarning) === 'Allow for this launch';
  } finally { view.busy = wasBusy; }
  if (!config.allowTaskReset) view.notice = 'Task loading declined. Press f, l, or n in Tasks to allow it later. Conversations work.';
  return config.allowTaskReset;
}
export async function refreshTasks(view: View, config: Config, load = loadTaskCatalog): Promise<void> {
  if (view.refreshing) return;
  view.refreshing = true;
  const controller = view.refreshAbort = new AbortController();
  try {
    if (!await allowTasks(view, config)) return;
    view.notice = 'Loading Task Lists…'; view.render();
    view.catalog = config.demo ? demoCatalog(view) : await load(config.tasks, true, controller.signal);
    if (view.listFilter && !view.catalog.lists.includes(view.listFilter)) view.listFilter = undefined;
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
