import type { View } from './view.js';
import type { Task } from '../model.js';
import type { Config } from '../config.js';
import { removeTodayReference, todayList } from '../task-today.js';
import { taskKey } from './navigation-memory.js';
import { choose } from './dialogs.js';
import { refreshTasks } from './refresh.js';
export function removeDemoToday(view: View, task: Task): string {
  const entries = view.catalog.byList.get(todayList) ?? [];
  if (view.catalog.byList.has(todayList)) view.catalog.byList.set(todayList, entries.filter(t => !(t.id === task.id && t.ownerList === task.ownerList && t.placement === 'reference')));
  return 'Demo date saved; any Today reference removed. Source task preserved.';
}
export async function recoverToday(view: View, config: Config, task: Task): Promise<void> {
  const choice = await choose(view.screen, 'Date already saved; Today removal is pending', ['Keep pending', 'Retry removal only'],
    view.notice + '\n\nThis checks fresh source/Today snapshots and retries only reference removal. It never rewrites the date or deletes the source. Pending recovery is remembered for this launch only.');
  if (choice !== 'Retry removal only') return;
  const result = await removeTodayReference(config.root, task);
  if (result.complete) view.todayRemovals.delete(taskKey(task));
  await refreshTasks(view, config); view.notice = result.notice;
}
