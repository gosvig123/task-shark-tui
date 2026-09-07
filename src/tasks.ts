import type { Task } from './model.js';
import { loadLists, loadTaskSnapshot, parseTaskSnapshot } from './task-api.js';
export { taskConsentFlag, taskSnapshotWarning } from './task-api.js';

export function parseSnapshot(text: string): Task[] { return parseTaskSnapshot(text).tasks; }
export function deduplicate(tasks: Task[]): Task[] {
  const items = new Map<string, Task>();
  for (const task of tasks) {
    const key = `${task.ownerList}\0${task.id}`;
    if (!items.has(key) || task.placement === 'direct') items.set(key, task);
  }
  return [...items.values()].sort((a, b) => a.ownerList.localeCompare(b.ownerList));
}
export interface TaskCatalog {
  lists: string[]; currentList: string; tasks: Task[]; byList: Map<string, Task[]>;
}
export async function loadTaskCatalog(binary: string, allowed = false, signal?: AbortSignal): Promise<TaskCatalog> {
  const { lists, currentList } = await loadLists(binary, allowed, signal);
  const byList = new Map<string, Task[]>();
  for (const list of lists) byList.set(list, (await loadTaskSnapshot(binary, list, allowed, signal)).tasks);
  return { lists, currentList, byList, tasks: deduplicate([...byList.values()].flat()) };
}
export async function loadTasks(binary: string, allowed = false, signal?: AbortSignal): Promise<Task[]> {
  return (await loadTaskCatalog(binary, allowed, signal)).tasks;
}
