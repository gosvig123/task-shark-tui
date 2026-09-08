import { taskSchema, type Task } from './model.js';
import { database } from './task-database.js';

export function deduplicate(tasks: Task[]): Task[] {
  const items = new Map<string, Task>();
  for (const task of tasks) {
    if (!items.has(task.id) || task.placement === 'direct') items.set(task.id, task);
  }
  return [...items.values()].sort((a, b) => a.ownerList.localeCompare(b.ownerList));
}
export interface TaskCatalog {
  lists: string[]; currentList: string; tasks: Task[]; byList: Map<string, Task[]>;
}
export async function loadTaskCatalog(root: string, signal?: AbortSignal): Promise<TaskCatalog> {
  signal?.throwIfAborted();
  return database(root, db => {
    const rows = db.prepare('SELECT name, active FROM task_lists ORDER BY name').all();
    const lists = [...rows.map(row => String(row.name)), 'today'];
    const currentList = String(rows.find(row => row.active === 1)!.name);
    const byList = new Map<string, Task[]>(lists.map(list => [list, []]));
    const today = new Set(db.prepare('SELECT task_id FROM today').all().map(row => String(row.task_id)));
    const tasks = db.prepare('SELECT data FROM tasks ORDER BY rowid').all().map(row => {
      const task: Task = { ...taskSchema.parse(JSON.parse(String(row.data))), placement: 'direct' };
      byList.get(task.ownerList)!.push(task);
      if (today.has(task.id)) byList.get('today')!.push({ ...task, placement: 'reference' });
      return task;
    });
    tasks.sort((a, b) => a.ownerList.localeCompare(b.ownerList));
    return { lists, currentList, byList, tasks };
  });
}
export async function loadTasks(root: string, signal?: AbortSignal): Promise<Task[]> {
  return (await loadTaskCatalog(root, signal)).tasks;
}
